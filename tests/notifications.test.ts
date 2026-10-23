import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {readNotifications,writeNotification} from "../src/domains/notifications/service";
import {notifyUsers} from "../src/domains/notifications/delivery";
import {notificationUrl,companyNotificationUrl} from "../src/domains/notifications/constants";
test("Notification links only use known local destinations",()=>{
 for(const url of ["https://evil.test/app?company=a&view=tasks","//evil.test","javascript:alert(1)","/admin","/app?company=a&view=tasks&token=secret","/app?company=a&view=unknown"])assert.equal(notificationUrl(url),null);
 assert.equal(notificationUrl(companyNotificationUrl("company-id","tasks")),"/app?company=company-id&view=tasks");assert.equal(notificationUrl("/candidatures"),"/candidatures");
});
test("PostgreSQL: complete private notification history, preferences and transaction delivery",async t=>{
 const users:string[]=[],tag=randomUUID();try{
  const a=await db.user.create({data:{name:"Notice A",email:`notice-a-${tag}@example.test`}}),b=await db.user.create({data:{name:"Notice B",email:`notice-b-${tag}@example.test`}});users.push(a.id,b.id);
  await db.notification.createMany({data:Array.from({length:57},(_,i)=>({userId:a.id,title:`Avis ${i}`,body:`Corps historique ${i}`,category:i%2?"TASKS":"GENERAL",createdAt:new Date(+new Date("2026-10-22T00:00:00Z")+i*1000)}))});
  const foreign=await db.notification.create({data:{userId:b.id,title:"Confidentiel autre compte",body:"Jamais exposer"}});
  await t.test("server pagination, full unread counter, search, category and inclusive Paris dates",async()=>{
   const page=await readNotifications(a.id,{page:3});assert.equal(page.total,57);assert.equal(page.rows.length,7);assert.equal(page.unread,57);assert.ok(!JSON.stringify(page).includes("Jamais exposer"));
   assert.equal((await readNotifications(a.id,{category:"TASKS"})).total,28);assert.equal((await readNotifications(a.id,{q:"historique 56"})).total,1);
   assert.equal((await readNotifications(a.id,{from:"2026-10-22",to:"2026-10-22"})).total,57);assert.equal((await readNotifications(a.id,{from:"2026-10-21",to:"2026-10-21"})).total,0);
   await assert.rejects(readNotifications(a.id,{from:"2026-10-23",to:"2026-10-21"}));
  });
  await t.test("read and unread are scoped and replay does not rewrite first read time",async()=>{
   const first=(await readNotifications(a.id,{})).rows[0];await writeNotification(a.id,{action:"read",id:first.id,read:true});const date=(await db.notification.findUniqueOrThrow({where:{id:first.id}})).readAt;
   await writeNotification(a.id,{action:"read",id:first.id,read:true});assert.deepEqual((await db.notification.findUniqueOrThrow({where:{id:first.id}})).readAt,date);
   await assert.rejects(writeNotification(a.id,{action:"read",id:foreign.id,read:true}),/introuvable/);
   await writeNotification(a.id,{action:"read",id:first.id,read:false});assert.equal((await readNotifications(a.id,{})).unread,57);
   const result=await writeNotification(a.id,{action:"readAll",filter:{category:"TASKS",state:"unread"}});assert.equal("count" in result&&result.count,28);assert.equal((await readNotifications(a.id,{state:"unread"})).total,29);
   const noop=await writeNotification(a.id,{action:"readAll",filter:{state:"read"}});assert.equal("count" in noop&&noop.count,0);assert.equal((await readNotifications(a.id,{})).unread,29);
  });
  await t.test("preferences suppress future categories and never hide historical records",async()=>{
   await writeNotification(a.id,{action:"preferences",muted:["TASKS"]});assert.deepEqual((await readNotifications(a.id,{})).muted,["TASKS"]);
   await assert.rejects(writeNotification(a.id,{action:"preferences",muted:["TASKS","TASKS"]}));
   const notices=[{userId:a.id,title:"Tâche ignorée",body:"Ignorée",category:"TASKS" as const},{userId:b.id,title:"Tâche reçue",body:"Reçue",category:"TASKS" as const,targetUrl:"javascript:alert(1)"},{userId:a.id,title:"Paie reçue",body:"Reçue",category:"PAYROLL" as const,targetUrl:companyNotificationUrl("company-id","payroll")}];
   const sent=await db.$transaction(tx=>notifyUsers(tx,notices));assert.equal(sent.count,2);assert.equal(await db.notification.count({where:{userId:a.id,category:"TASKS"}}),28);assert.equal((await readNotifications(a.id,{})).total,58);
   assert.equal((await db.notification.findFirstOrThrow({where:{userId:b.id,title:"Tâche reçue"}})).targetUrl,null);
   await assert.rejects(db.$transaction(async tx=>{await notifyUsers(tx,[{userId:a.id,title:"Rollback",body:"Jamais livré",category:"GENERAL"}]);throw new Error("rollback fixture");}),/rollback/);assert.equal(await db.notification.count({where:{userId:a.id,title:"Rollback"}}),0);
   await db.user.update({where:{id:a.id},data:{accessStatus:"SUSPENDED"}});await assert.rejects(readNotifications(a.id,{}),/suspendu/);await assert.rejects(writeNotification(a.id,{action:"preferences",muted:[]}),/suspendu/);
  });
 }finally{await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`notifications:${id}:`}}});await db.$disconnect();}
});
