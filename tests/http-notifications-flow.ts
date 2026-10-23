import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import {notifyUsers} from "../src/domains/notifications/delivery";
test("HTTP: notification pagination, personal preferences, read states and session revocation",async()=>{
 const origin=process.env.BETTER_AUTH_URL!,users:string[]=[];try{
  const person=async()=>{const u=await db.user.create({data:{name:"Notifications HTTP",email:`http-notice-${randomUUID()}@example.test`}});users.push(u.id);const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:u.id,token,expiresAt:new Date(Date.now()+600000)}});const c=getCookies(auth.options).sessionToken;return {u,headers:{Origin:origin,Cookie:(await serializeSignedCookie(c.name,token,process.env.BETTER_AUTH_SECRET!,c.attributes)).split(";")[0]}};};
  const a=await person(),b=await person();
  await db.notification.createMany({data:Array.from({length:32},(_,i)=>({userId:a.u.id,title:`Avis ${i}`,body:"Notification personnelle",category:"TASKS"}))});
  const get=(query="",headers:Record<string,string>=a.headers)=>fetch(`${origin}/api/notifications${query}`,{headers});
  const post=(body:unknown,headers=a.headers)=>fetch(`${origin}/api/notifications`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal((await get("",{})).status,401);assert.equal((await get("?companyId=foreign")).status,400);
  const page=await get("?page=2");assert.equal(page.status,200);assert.match(page.headers.get("cache-control")??"",/no-store/);const data=await page.json();assert.equal(data.rows.length,7);assert.equal(data.unread,32);
  assert.equal((await get("",b.headers).then(r=>r.json())).total,0);
  assert.equal((await post({action:"read",id:data.rows[0].id,read:true},{...a.headers,Origin:"https://evil.test"})).status,403);
  assert.equal((await post({action:"read",id:data.rows[0].id,read:true},b.headers)).status,404);
  assert.equal((await post({action:"read",id:data.rows[0].id,read:true})).status,200);assert.equal((await get("?state=read").then(r=>r.json())).total,1);
  assert.equal((await post({action:"preferences",muted:["TASKS"]})).status,200);assert.deepEqual((await get().then(r=>r.json())).muted,["TASKS"]);
  await db.$transaction(tx=>notifyUsers(tx,[{userId:a.u.id,title:"Pas livré",body:"Muet",category:"TASKS"},{userId:a.u.id,title:"Accès candidature",body:"Consultez la page",category:"RECRUITMENT",targetUrl:"/candidatures"}]));
  assert.equal((await get("?category=TASKS").then(r=>r.json())).total,32);assert.equal((await get("?category=RECRUITMENT").then(r=>r.json())).rows[0].targetUrl,"/candidatures");
  assert.equal((await post({action:"readAll",filter:{category:"TASKS"}})).status,200);assert.equal((await get().then(r=>r.json())).unread,1);
  await db.session.deleteMany({where:{userId:a.u.id}});
  // Consume rejected responses just as the browser does. Leaving them unread
  // races the Windows Miniflare keep-alive connection with the next scenario.
  const revokedRead=await get();assert.equal(revokedRead.status,401);await revokedRead.arrayBuffer();
  const revokedWrite=await post({action:"preferences",muted:[]});assert.equal(revokedWrite.status,401);await revokedWrite.arrayBuffer();
 }finally{await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`notifications:${id}:`}}});}
});
