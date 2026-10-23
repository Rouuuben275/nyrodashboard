import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {writeMessage} from "../src/domains/messages/service";
import {readMessages} from "../src/domains/messages/queries";
test("PostgreSQL: private messages, groups, durable history and revocation",async t=>{
 const users:string[]=[],companies:string[]=[];
 try{
  const person=async(name:string)=>{const u=await db.user.create({data:{name,email:`messages-${randomUUID()}@example.test`}});users.push(u.id);return u;};
  const owner=await person("Direction"),alice=await person("Alice"),bob=await person("Bob"),outsider=await person("Autre entreprise");
  const company=await execute(owner,undefined,{action:"company.create",name:`Messages ${randomUUID()}`,sector:"Services"}) as {id:string};companies.push(company.id);
  const other=await execute(outsider,undefined,{action:"company.create",name:`Foreign ${randomUUID()}`,sector:"Services"}) as {id:string};companies.push(other.id);
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Messagerie",permissions:["messages.read","messages.send"]}});
  const am=await db.companyMember.create({data:{companyId:company.id,userId:alice.id,roleId:role.id,characterName:"Alice Atelier"}}),bm=await db.companyMember.create({data:{companyId:company.id,userId:bob.id,roleId:role.id,characterName:"Bob Atelier"}}),om=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:owner.id}}}),fm=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:other.id,userId:outsider.id}}});
  const act=(extra:Record<string,unknown>,actor=alice)=>writeMessage(actor,{companyId:company.id,requestKey:randomUUID(),...extra});
  const read=(extra:Record<string,unknown>={},actor=alice)=>readMessages(actor.id,{companyId:company.id,...extra});
  let threadId="",groupId="";
  await t.test("module and explicit read/send rights are enforced; stored direction rights stay unchanged",async()=>{
   const grants=(await db.companyRole.findUniqueOrThrow({where:{id:om.roleId}})).permissions;
   await execute(owner,company.id,{action:"module.toggle",key:"messages",enabled:false});await assert.rejects(read(),/désactivé/);
   await execute(owner,company.id,{action:"module.toggle",key:"messages",enabled:true});assert.deepEqual((await db.companyRole.findUniqueOrThrow({where:{id:om.roleId}})).permissions,grants);
   await db.companyRole.update({where:{id:role.id},data:{permissions:["messages.read"]}});await assert.rejects(act({action:"create",kind:"PRIVATE",memberIds:[bm.id]}),/refusé/);await read();
   await db.companyRole.update({where:{id:role.id},data:{permissions:["messages.read","messages.send"]}});
  });
  await t.test("private creation is idempotent and reopens the same two-person history",async()=>{
   const payload={action:"create",kind:"PRIVATE",memberIds:[bm.id],requestKey:randomUUID()};const [a,b]=await Promise.all([act(payload),act(payload)]);assert.equal(a.id,b.id);threadId=a.id;
   assert.equal((await act({...payload,requestKey:randomUUID()})).id,threadId);
  });
  // Verify the real pair in both directions; never require a new private thread.
  if(!threadId)throw new Error("Private fixture was not created");
  assert.equal((await act({action:"create",kind:"PRIVATE",memberIds:[am.id]},bob)).id,threadId);
  await t.test("foreign identifiers, guessed threads and nonparticipating direction cannot read private text",async()=>{
   await assert.rejects(act({action:"create",kind:"PRIVATE",memberIds:[fm.id]}),/participant/);
   await assert.rejects(act({action:"create",kind:"PRIVATE",memberIds:[am.id]}),/déjà/);
   await assert.rejects(read({threadId},owner),/inaccessible/);assert.equal((await read({},owner)).total,0);
   await assert.rejects(read({threadId},outsider),/inaccessible/);
  });
  await t.test("same send retried concurrently creates one message and one generic notification",async()=>{
   const input={action:"send",threadId,body:"Confidentiel <script>alert(1)</script>",requestKey:randomUUID()};
   const [a,b]=await Promise.all([act(input),act(input)]);assert.equal(a.id,b.id);assert.equal(await db.chatMessage.count({where:{threadId}}),1);
   await assert.rejects(act({...input,body:"Autre intention"}),/Clé/);
   const notice=await db.notification.findMany({where:{userId:bob.id,category:"MESSAGES"}});assert.equal(notice.length,1);assert.ok(!notice[0].body.includes("Confidentiel"));assert.match(notice[0].targetUrl!,/view=messages/);
   assert.equal((await read({},bob)).unread,1);assert.equal((await read()).unread,0);
   const audit=await db.auditLog.findMany({where:{companyId:company.id}});assert.ok(!JSON.stringify(audit).includes("Confidentiel"));
  });
  await t.test("read position is monotonic and cannot acknowledge future messages; archives are personal",async()=>{
   await act({action:"read",threadId,through:1},bob);await act({action:"read",threadId,through:0},bob);assert.equal((await read({},bob)).unread,0);
   await assert.rejects(act({action:"read",threadId,through:2},bob),/invalide/);
   await act({action:"archive",threadId,archived:true},bob);assert.equal((await read({},bob)).total,0);assert.equal((await read({archived:"true"},bob)).total,1);assert.equal((await read()).total,1);
   await db.user.update({where:{id:bob.id},data:{notificationMutedCategories:["MESSAGES"]}});await act({action:"send",threadId,body:"Suite conservée"});assert.equal((await read({},bob)).total,1);assert.equal(await db.notification.count({where:{userId:bob.id,category:"MESSAGES"}}),1);
  });
  await t.test("group creator controls participants with revisions and removal revokes historical reads and replay",async()=>{
   groupId=(await act({action:"create",kind:"GROUP",title:"Atelier",memberIds:[bm.id,om.id]})).id;
   const sent={action:"send",threadId:groupId,body:"Message avant retrait",requestKey:randomUUID()};await act(sent,bob);
   await assert.rejects(act({action:"group",threadId:groupId,revision:0,title:"Intrusion",memberIds:[am.id]},bob),/créateur/);
   await act({action:"group",threadId:groupId,revision:0,title:"Atelier restreint",memberIds:[om.id]});await assert.rejects(read({threadId:groupId},bob),/inaccessible/);await assert.rejects(act(sent,bob),/inaccessible/);
   await assert.rejects(act({action:"group",threadId:groupId,revision:0,title:"Obsolète",memberIds:[bm.id]}),/changé/);
   await act({action:"group",threadId:groupId,revision:1,title:"Atelier élargi",memberIds:[om.id,bm.id]});assert.equal((await read({threadId:groupId},bob)).messageCount,1);
  });
  await t.test("history and inbox are searched and paginated beyond the first 25 without exposing foreign text",async()=>{
   await db.chatMessage.createMany({data:Array.from({length:30},(_,i)=>({companyId:company.id,threadId,sequence:i+3,senderMemberId:am.id,senderName:"Alice Atelier",body:`Historique paginé ${i}`}))});await db.chatThread.update({where:{id:threadId},data:{lastSequence:32}});
   const first=await read({threadId}),second=await read({threadId,messagePage:2});assert.equal(first.messages.length,25);assert.equal(second.messages.length,7);assert.equal(first.messages[24].sequence,32);assert.equal(second.messages[0].sequence,1);
   assert.equal((await read({threadId,messageSearch:"paginé 29"})).messageCount,1);assert.equal((await read({q:"Confidentiel"})).total,1);assert.equal((await read({q:"Confidentiel"},owner)).total,0);
   assert.equal((await read({view:"staff",q:"Bob"})).staff[0].id,bm.id);
   const ids=Array.from({length:30},()=>randomUUID());await db.chatThread.createMany({data:ids.map(id=>({id,companyId:company.id,kind:"GROUP",title:"Pagination boîte",ownerMemberId:am.id}))});await db.chatParticipant.createMany({data:ids.flatMap(threadId=>[am.id,bm.id].map(memberId=>({companyId:company.id,threadId,memberId})))});
   assert.equal((await read({q:"Pagination boîte"})).rows.length,25);assert.equal((await read({q:"Pagination boîte",page:2})).rows.length,5);
  });
  await t.test("per-account rate limiting refuses additional writes without bypassing security",async()=>{
   const key=`messages:${owner.id}:${Math.floor(Date.now()/60000)}`;await db.rateLimit.upsert({where:{key},create:{key,count:60,lastRequest:BigInt(Date.now())},update:{count:60}});
   await assert.rejects(act({action:"archive",threadId:groupId,archived:true},owner),e=>(e as {status:number}).status===429);
  });
  await t.test("employment, account, permission and module revocations block reads and sends without deleting history",async()=>{
   const count=await db.chatMessage.count({where:{threadId}});
   await db.companyMember.update({where:{id:bm.id},data:{status:"INACTIVE"}});await assert.rejects(read({},bob),/inaccessible/);await assert.rejects(act({action:"send",threadId,body:"Destinataire inactif"}),/destinataire/);
   await db.companyMember.update({where:{id:bm.id},data:{status:"ACTIVE"}});await db.user.update({where:{id:bob.id},data:{accessStatus:"SUSPENDED"}});await assert.rejects(read({},bob),/suspendu/);await assert.rejects(act({action:"create",kind:"GROUP",title:"Groupe refusé",memberIds:[bm.id]}),/participant/);
   await db.user.update({where:{id:bob.id},data:{accessStatus:"ACTIVE"}});await db.companyRole.update({where:{id:role.id},data:{permissions:[]}});await assert.rejects(read(),/refusé/);
   await execute(owner,company.id,{action:"module.toggle",key:"messages",enabled:false});await assert.rejects(read({},owner),/désactivé/);assert.equal(await db.chatMessage.count({where:{threadId}}),count);
  });
 }finally{await db.chatThread.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`messages:${id}:`}}});}
});
