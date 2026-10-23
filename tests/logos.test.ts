import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {executePlatform} from "../src/domains/platform/service";
import {readSpaces} from "../src/domains/platform/spaces";
import {uploadLogo,readLogo,discardLogo} from "../src/domains/media/service";
import {validateLogoPng} from "../src/domains/media/png";
import {logoPng,pngChunk} from "./logo-fixture";

test("PNG: real bounded pixels and metadata removal",async()=>{
 const clean=logoPng(),tagged=logoPng({extra:[pngChunk("tEXt",Buffer.from("private\0original metadata"))]});
 const image=await validateLogoPng(tagged);assert.equal(image.width,2);assert.equal(image.height,2);assert.deepEqual(Buffer.from(image.data),clean);
 for(const invalid of [Buffer.from("<svg/>"),clean.subarray(0,-1),Buffer.concat([clean,Buffer.from([1])]),logoPng({width:513}),logoPng({raw:Buffer.alloc(5000)}),logoPng({raw:Buffer.from([5,0,0,0,0])}),logoPng({extra:[pngChunk("acTL",Buffer.alloc(8))]}),Buffer.alloc(262145)])await assert.rejects(validateLogoPng(invalid));
 const damaged=Buffer.from(clean);damaged[45]^=1;await assert.rejects(validateLogoPng(damaged));
});

test("PostgreSQL: owned persistent logos, tenant isolation and preserved history",async t=>{
 const tag=`logo-${randomUUID()}`,users:string[]=[],companies:string[]=[],servers:string[]=[],keys:string[]=[];const oldOwner=process.env.RPILOT_OWNER_DISCORD_ID;
 const person=async(name:string,n:number)=>{const u=await db.user.create({data:{name,email:`${tag}-${name}@example.test`}});users.push(u.id);await db.account.create({data:{id:randomUUID(),userId:u.id,providerId:"discord",accountId:`89000000000000000${n}`}});return u;};
 try{
  const owner=await person("owner",1),a=await person("director",2),b=await person("outsider",3),employee=await person("employee",4);process.env.RPILOT_OWNER_DISCORD_ID="890000000000000001";
  const image=await uploadLogo(a.id,{purpose:"company"},logoPng());let companyId="",serverId="";
  await t.test("drafts private to uploader; foreign attachment rejected",async()=>{
   assert.deepEqual(Buffer.from(await readLogo(a.id,image.id)),logoPng());await assert.rejects(readLogo(b.id,image.id),/introuvable/);
   await assert.rejects(execute(b,undefined,{action:"company.create",name:tag,sector:"Services",logoAssetId:image.id}),/appartient/);
   const c=await execute(a,undefined,{action:"company.create",name:tag,sector:"Services",logoAssetId:image.id}) as {id:string};companyId=c.id;companies.push(c.id);assert.ok((await db.logoAsset.findUniqueOrThrow({where:{id:image.id}})).attachedAt);
   assert.equal((await readSpaces(a.id)).companies[0].logoAssetId,image.id);assert.equal((await readSpaces(b.id)).companies.length,0);
  });
  await t.test("employees can view logo, cannot replace it without company.manage",async()=>{
   const role=await db.companyRole.findFirstOrThrow({where:{companyId,isOwner:false}});await db.companyMember.create({data:{companyId,userId:employee.id,roleId:role.id,characterName:"Employee"}});
   assert.deepEqual(Buffer.from(await readLogo(employee.id,image.id)),logoPng());await assert.rejects(uploadLogo(employee.id,{purpose:"company",entityId:companyId},logoPng()),/Gestion/);
   await db.companyMember.update({where:{companyId_userId:{companyId,userId:employee.id}},data:{status:"INACTIVE"}});await assert.rejects(readLogo(employee.id,image.id),/introuvable/);
  });
  await t.test("replacement and removal retain previous images and prevent reuse/deletion",async()=>{
   const next=await uploadLogo(a.id,{purpose:"company",entityId:companyId},logoPng());
   await execute(a,companyId,{action:"company.update",name:tag,description:"",expenseThreshold:50000,logoAssetId:next.id,logoUrl:""});
   await assert.rejects(discardLogo(a.id,image.id),/conservé/);await assert.rejects(discardLogo(a.id,next.id),/conservé/);
   await execute(a,companyId,{action:"company.update",name:tag,description:"",expenseThreshold:50000,logoAssetId:null,logoUrl:"https://example.test/logo.png"});
   await execute(a,companyId,{action:"company.update",name:tag,description:"",expenseThreshold:50000});assert.equal((await db.company.findUniqueOrThrow({where:{id:companyId}})).logoUrl,"https://example.test/logo.png");
   await assert.rejects(execute(a,companyId,{action:"company.update",name:tag,description:"",expenseThreshold:50000,logoAssetId:next.id,logoUrl:""}),/appartient/);assert.equal(await db.logoAsset.count({where:{ownerId:a.id}}),2);
  });
  await t.test("only platform managers can create server logos, purpose and visibility respected",async()=>{
   await assert.rejects(uploadLogo(b.id,{purpose:"server"},logoPng()),/interdite/);
   const logo=await uploadLogo(owner.id,{purpose:"server"},logoPng()),requestKey=randomUUID();keys.push(requestKey);
   await assert.rejects(execute(owner,undefined,{action:"company.create",name:tag,sector:"Services",logoAssetId:logo.id}),/appartient/);
   const s=await executePlatform(owner,{action:"server.create",name:tag,slug:tag,maxCompanies:10,maxUsers:10,logoAssetId:logo.id,visibility:"PRIVATE",reason:"Logo test",requestKey},new Date()) as {id:string};serverId=s.id;servers.push(s.id);
   await assert.rejects(readLogo(b.id,logo.id),/introuvable/);assert.deepEqual(Buffer.from(await readLogo(owner.id,logo.id)),logoPng());
   await db.rPServer.update({where:{id:serverId},data:{visibility:"PUBLIC"}});assert.deepEqual(Buffer.from(await readLogo(b.id,logo.id)),logoPng());
   await db.rPServer.update({where:{id:serverId},data:{status:"SUSPENDED"}});await assert.rejects(readLogo(b.id,logo.id),/introuvable/);
  });
  await t.test("draft cleanup requires uploader, malformed attempts consume bounded rate bucket",async()=>{
   const draft=await uploadLogo(b.id,{purpose:"company"},logoPng());await assert.rejects(discardLogo(a.id,draft.id),/introuvable/);await discardLogo(b.id,draft.id);await assert.rejects(readLogo(b.id,draft.id));
   await db.rateLimit.deleteMany({where:{key:`logo-upload:${b.id}`}});
   for(let i=0;i<10;i++)await assert.rejects(uploadLogo(b.id,{purpose:"company"},Buffer.from("invalid")),/PNG invalide/);
   await assert.rejects(uploadLogo(b.id,{purpose:"company"},logoPng()),/Trop/);assert.equal(await db.rateLimit.count({where:{key:`logo-upload:${b.id}`}}),1);
   await db.user.update({where:{id:b.id},data:{accessStatus:"SUSPENDED"}});await assert.rejects(uploadLogo(b.id,{purpose:"company"},logoPng()));
  });
 }finally{
  if(oldOwner===undefined)delete process.env.RPILOT_OWNER_DISCORD_ID;else process.env.RPILOT_OWNER_DISCORD_ID=oldOwner;
  await db.platformCommand.deleteMany({where:{requestKey:{in:keys}}});await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.rPServer.deleteMany({where:{id:{in:servers}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:`logo-upload:${id}`},{key:{startsWith:`app:${id}:`}},{key:{startsWith:`admin:${id}:`}}]}});
 }
});
