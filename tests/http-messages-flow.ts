import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
test("HTTP: private messaging persists, rejects CSRF and revokes group access",async()=>{
 const origin=process.env.BETTER_AUTH_URL!,users:string[]=[],companies:string[]=[];
 try{
  const person=async(name:string)=>{const u=await db.user.create({data:{name,email:`messages-http-${randomUUID()}@example.test`}});users.push(u.id);const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:u.id,token,expiresAt:new Date(Date.now()+600000)}});const c=getCookies(auth.options).sessionToken;return {u,headers:{Origin:origin,Cookie:(await serializeSignedCookie(c.name,token,process.env.BETTER_AUTH_SECRET!,c.attributes)).split(";")[0]}};};
  const owner=await person("Direction"),a=await person("Alice HTTP"),b=await person("Bob HTTP");
  const company=await execute(owner.u,undefined,{action:"company.create",name:`Messages HTTP ${randomUUID()}`,sector:"Services"}) as {id:string};companies.push(company.id);
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Messagerie",permissions:["messages.read","messages.send"]}}),am=await db.companyMember.create({data:{companyId:company.id,userId:a.u.id,roleId:role.id,characterName:a.u.name}}),bm=await db.companyMember.create({data:{companyId:company.id,userId:b.u.id,roleId:role.id,characterName:b.u.name}});
  const post=async(extra:Record<string,unknown>,headers=a.headers)=>{const r=await fetch(`${origin}/api/messages`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({companyId:company.id,requestKey:randomUUID(),...extra})});return {status:r.status,data:await r.json()};};
  const get=async(extra:Record<string,string>={},headers=a.headers)=>{const r=await fetch(`${origin}/api/messages?${new URLSearchParams({companyId:company.id,...extra})}`,{headers});return {status:r.status,headers:r.headers,data:await r.json()};};
  assert.equal((await get()).status,200);
  const anon=await fetch(`${origin}/api/messages?companyId=${company.id}`);assert.equal(anon.status,401);await anon.arrayBuffer();
  assert.equal((await post({action:"create",kind:"PRIVATE",memberIds:[bm.id]},{...a.headers,Origin:"https://foreign.test"})).status,403);
  assert.equal((await post({action:"create",kind:"PRIVATE",memberIds:[bm.id],unexpected:true})).status,400);
  const created=await post({action:"create",kind:"PRIVATE",memberIds:[bm.id]});assert.equal(created.status,200,JSON.stringify(created.data));const threadId=created.data.id;
  const payload={action:"send",threadId,body:"Message confidentiel HTTP <b>texte</b>",requestKey:randomUUID()};const [one,two]=await Promise.all([post(payload),post(payload)]);assert.equal(one.status,200);assert.equal(two.status,200);assert.equal(await db.chatMessage.count({where:{threadId}}),1);
  assert.equal((await post({...payload,body:"Intention changée"})).status,409);
  const history=await get({threadId},b.headers);assert.equal(history.status,200);assert.match(history.headers.get("cache-control")??"",/no-store/);assert.equal(history.headers.get("x-content-type-options"),"nosniff");assert.equal(history.data.messages[0].body,payload.body);assert.equal(history.data.unread,1);
  assert.equal((await get({threadId},owner.headers)).status,404);assert.equal((await get({},owner.headers)).data.total,0);
  assert.equal((await post({action:"read",threadId,through:1},b.headers)).status,200);assert.equal((await get({},b.headers)).data.unread,0);
  assert.equal((await post({action:"archive",threadId,archived:true},b.headers)).status,200);assert.equal((await get({archived:"true"},b.headers)).data.total,1);assert.equal((await get({},b.headers)).data.total,0);
  const group=await post({action:"create",kind:"GROUP",title:"Groupe HTTP",memberIds:[bm.id]});assert.equal(group.status,200);const groupId=group.data.id;
  const om=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:owner.u.id}}});
  assert.equal((await post({action:"group",threadId:groupId,revision:0,title:"Groupe restreint",memberIds:[om.id]})).status,200);assert.equal((await get({threadId:groupId},b.headers)).status,404);assert.equal((await post({action:"send",threadId:groupId,body:"Accès retiré"},b.headers)).status,404);
  await db.companyMember.update({where:{id:am.id},data:{status:"INACTIVE"}});assert.equal((await get({threadId})).status,403);
  await db.companyMember.update({where:{id:am.id},data:{status:"ACTIVE"}});await execute(owner.u,company.id,{action:"module.toggle",key:"messages",enabled:false});assert.equal((await get()).status,403);assert.equal((await post({action:"send",threadId,body:"Module fermé"})).status,403);assert.equal(await db.chatMessage.count({where:{threadId}}),1);
 }finally{await db.chatThread.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`messages:${id}:`}}});}
});
