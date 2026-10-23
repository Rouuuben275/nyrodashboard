import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {transferCommand,transferPart,TRANSFER_PART_BYTES} from "../src/domains/documents/transfers";
import {downloadDocument,readDocuments} from "../src/domains/documents/queries";
import {streamResponse} from "../src/lib/stream-response";
test("PostgreSQL: Vercel-sized private chunks retain the full existing 5 MiB file limit",async t=>{
 const users:string[]=[],companies:string[]=[];
 try{
  const make=async(name:string)=>{const u=await db.user.create({data:{name,email:`transfer-${randomUUID()}@example.test`}});users.push(u.id);return u;};
  const owner=await make("Direction transfert"),reader=await make("Employé transfert"),foreign=await make("Autre utilisateur");
  const company=await execute(owner,undefined,{action:"company.create",name:`Transfert ${randomUUID()}`,sector:"Services"}) as {id:string};companies.push(company.id);
  await db.companyModule.updateMany({where:{companyId:company.id,key:"documents"},data:{enabled:true}});
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Transferts privés",permissions:["employees.read"]}}),member=await db.companyMember.create({data:{companyId:company.id,userId:reader.id,roleId:role.id,characterName:reader.name}});
  const bytes=Buffer.alloc(5*TRANSFER_PART_BYTES,120),hash=createHash("sha256").update(bytes).digest("hex"),meta={companyId:company.id,requestKey:randomUUID(),name:"Justificatif volumineux",audience:"MANAGERS",fileName:"preuve.txt",note:"Fichier privé de cinq mégaoctets"};
  const begin={action:"start",kind:"LIBRARY",metadata:meta,size:bytes.length,digest:hash,mimeType:"text/plain"};let id="",docId="";
  await t.test("start persists only a private resumable transfer and binds intent",async()=>{
   const row=await transferCommand(owner,begin);assert.ok("id" in row);id=String(row.id);assert.equal((await transferCommand(owner,begin) as {id:string}).id,id);
   await assert.rejects(transferCommand(owner,{...begin,digest:"0".repeat(64)}),/autre fichier/);
   await assert.rejects(transferPart(foreign,{id,index:0},bytes.subarray(0,TRANSFER_PART_BYTES)),/introuvable/);
   assert.equal((await readDocuments(owner.id,{companyId:company.id})).total,0);
  });
  await t.test("ordered chunks are idempotent, immutable and never create a partial document",async()=>{
   await assert.rejects(transferPart(owner,{id,index:1},bytes.subarray(0,TRANSFER_PART_BYTES)),/ordre/);
   await transferPart(owner,{id,index:0},bytes.subarray(0,TRANSFER_PART_BYTES));await transferPart(owner,{id,index:0},bytes.subarray(0,TRANSFER_PART_BYTES));
   await assert.rejects(transferPart(owner,{id,index:0},Buffer.alloc(TRANSFER_PART_BYTES,121)),/autres octets/);
   await assert.rejects(transferCommand(owner,{action:"finish",id}),/incomplet/);
   for(let index=1;index<5;index++)await transferPart(owner,{id,index},bytes.subarray(index*TRANSFER_PART_BYTES,(index+1)*TRANSFER_PART_BYTES));
   assert.equal(await db.documentVersion.count({where:{companyId:company.id}}),0);
  });
  await t.test("concurrent finalization creates exactly one full immutable version and releases staging bytes",async()=>{
   const [a,b]=await Promise.all([transferCommand(owner,{action:"finish",id}),transferCommand(owner,{action:"finish",id})]);assert.ok("result" in a&&"result" in b);docId=(a as {result:{id:string}}).result.id;assert.equal((b as {result:{id:string}}).result.id,docId);
   const file=await downloadDocument(owner.id,company.id,docId);assert.deepEqual(Buffer.from(file.data),bytes);assert.equal(await db.documentVersion.count({where:{companyId:company.id}}),1);
   const staging=await db.uploadTransfer.findUniqueOrThrow({where:{id}});assert.equal(staging.data.length,0);assert.ok(staging.completedAt);
   const response=streamResponse(file.data,{headers:{"Content-Type":file.mimeType,"Content-Length":String(file.size)}});assert.equal(response.headers.has("content-length"),false);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  });
  await db.rateLimit.deleteMany({where:{key:{startsWith:`documents:${owner.id}:`}}});
  await t.test("complete hash mismatch cannot persist a file; abort removes staging only",async()=>{
   const row=await transferCommand(owner,{...begin,metadata:{...meta,requestKey:randomUUID()},size:3,digest:"0".repeat(64)});const badId=String((row as {id:string}).id);
   await transferPart(owner,{id:badId,index:0},Buffer.from("abc"));await assert.rejects(transferCommand(owner,{action:"finish",id:badId}),/Empreinte/);
   await transferCommand(owner,{action:"abort",id:badId});assert.equal(await db.uploadTransfer.findUnique({where:{id:badId}}),null);assert.equal(await db.documentVersion.count({where:{companyId:company.id}}),1);
  });
  await t.test("parent-bound uploads keep their privacy and revoked membership blocks every transfer operation",async()=>{
   const data=Buffer.alloc(TRANSFER_PART_BYTES+3,97),payload={action:"start",kind:"RECORD",metadata:{companyId:company.id,targetType:"EMPLOYEE",targetId:member.id,requestKey:randomUUID(),name:"Dossier salarié",fileName:"dossier.txt",note:"Pièce confidentielle du salarié"},size:data.length,digest:createHash("sha256").update(data).digest("hex"),mimeType:"text/plain"};
   const row=await transferCommand(reader,payload),recordId=String((row as {id:string}).id);await transferPart(reader,{id:recordId,index:0},data.subarray(0,TRANSFER_PART_BYTES));
   await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(transferPart(reader,{id:recordId,index:1},data.subarray(TRANSFER_PART_BYTES)),/inaccessible/);await db.companyMember.update({where:{id:member.id},data:{status:"ACTIVE"}});
   await transferPart(reader,{id:recordId,index:1},data.subarray(TRANSFER_PART_BYTES));const result=await transferCommand(reader,{action:"finish",id:recordId});assert.ok("result" in result);const privateId=(result as {result:{id:string}}).result.id;
   assert.deepEqual(Buffer.from((await downloadDocument(reader.id,company.id,privateId)).data),data);await assert.rejects(downloadDocument(foreign.id,company.id,privateId),/inaccessible/);
   assert.equal((await readDocuments(owner.id,{companyId:company.id})).total,1);
  });
  await t.test("temporary reservations are bounded and expired bytes are cleared on the next start",async()=>{
   const first=await transferCommand(owner,{...begin,metadata:{...meta,requestKey:randomUUID()}}),second=await transferCommand(owner,{...begin,metadata:{...meta,requestKey:randomUUID()}});
   await assert.rejects(transferCommand(owner,{...begin,metadata:{...meta,requestKey:randomUUID()}}),/attente/);
   const expired=String((first as {id:string}).id);await db.uploadTransfer.update({where:{id:expired},data:{expiresAt:new Date(0)}});await assert.rejects(transferCommand(owner,{action:"finish",id:expired}),/expiré/);
   await transferCommand(owner,{...begin,metadata:{...meta,requestKey:randomUUID()}});assert.equal(await db.uploadTransfer.findUnique({where:{id:expired}}),null);await transferCommand(owner,{action:"abort",id:String((second as {id:string}).id)});
  });
 }finally{await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`documents:${id}:`}},{key:{startsWith:`app:${id}:`}}]}});await db.$disconnect();}
});
