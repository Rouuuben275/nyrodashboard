import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {writeDocument} from "../src/domains/documents/service";
import {readDocuments,downloadDocument} from "../src/domains/documents/queries";
import {inspectDocument,documentBytes} from "../src/domains/documents/files";
import {MAX_DOCUMENT_BYTES} from "../src/domains/documents/validation";
import {logoPng} from "./logo-fixture";
test("Document formats: signatures, extension, UTF-8, bounded streams and active formats",async()=>{
 assert.equal(inspectDocument(logoPng(),"image.png","image/png"),"image/png");
 assert.equal(inspectDocument(Buffer.from("Bonjour é\n<script>text only</script>"),"note.txt","text/plain;charset=utf-8"),"text/plain");
 for(const [file,type,bytes] of [["bad.png","image/png",Buffer.from("<html/>")],["image.txt","image/png",logoPng()],["code.svg","image/svg+xml",Buffer.from("<svg/>")],["bad.txt","text/plain",Buffer.from([255,255])],["bad.txt","text/plain",Buffer.from([0,1,2])]] as const)assert.throws(()=>inspectDocument(bytes,file,type),/invalide|autorisé/);
 assert.throws(()=>inspectDocument(new Uint8Array(),"empty.txt","text/plain"),/5 Mo/);
 const bytes=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_DOCUMENT_BYTES));c.enqueue(new Uint8Array(1));c.close();}});
 await assert.rejects(documentBytes(new Request("https://test.test",{method:"POST",body:bytes,duplex:"half"} as RequestInit)),/5 Mo/);
});
test("PostgreSQL: private documents, immutable versions, folders, archives, tenant and membership guards",async t=>{
 const users:string[]=[],companies:string[]=[],tag=`document-${randomUUID()}`;
 try{
  const make=async(name:string)=>{const u=await db.user.create({data:{name,email:`${tag}-${name}@example.test`}});users.push(u.id);return u;};
  const owner=await make("owner"),reader=await make("reader"),stranger=await make("other");
  const company=await execute(owner,undefined,{action:"company.create",name:tag,sector:"Services"}) as {id:string},foreign=await execute(stranger,undefined,{action:"company.create",name:`${tag}-foreign`,sector:"Services"}) as {id:string};companies.push(company.id,foreign.id);
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Lecteur documentaire",permissions:["documents.read"]}});
  const member=await db.companyMember.create({data:{companyId:company.id,userId:reader.id,roleId:role.id,characterName:"Lecteur"}});
  const read=(extra:Record<string,unknown>={},actor=owner)=>readDocuments(actor.id,{companyId:company.id,...extra});
  const act=(extra:Record<string,unknown>,actor=owner)=>writeDocument(actor,{companyId:company.id,requestKey:randomUUID(),...extra});
  const upload=(extra:Record<string,unknown>={},text="Première version privée",actor=owner)=>writeDocument(actor,{companyId:company.id,requestKey:randomUUID(),name:"Procédure atelier",audience:"TEAM",fileName:"procedure.txt",note:"Version initiale",...extra},{bytes:Buffer.from(text),type:"text/plain"});
  const originalRole=await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:true}});
  let documentId="",folderId="",rev=0;
  await t.test("preserves historical grants; module disable blocks reads and writes",async()=>{
   await execute(owner,company.id,{action:"module.toggle",key:"documents",enabled:false});await assert.rejects(read(),/désactivé/);await assert.rejects(upload(),/désactivé/);
   await execute(owner,company.id,{action:"module.toggle",key:"documents",enabled:true});assert.deepEqual((await db.companyRole.findUniqueOrThrow({where:{id:originalRole.id}})).permissions,originalRole.permissions);
   await assert.rejects(read({},stranger),/inaccessible/);await assert.rejects(upload({},"Refusé",reader),/refusé/);
  });
  await t.test("concurrent upload retries persist exactly one file and event",async()=>{
   folderId=(await act({action:"folder.save",name:"Procédures"})).id;
   const key=randomUUID(),payload={companyId:company.id,requestKey:key,name:"Procédure atelier",folderId,audience:"TEAM",fileName:"procedure.txt",note:"Création du dossier"};
   const [a,b]=await Promise.all([writeDocument(owner,payload,{bytes:Buffer.from("Première version privée"),type:"text/plain"}),writeDocument(owner,payload,{bytes:Buffer.from("Première version privée"),type:"text/plain"})]);assert.deepEqual(a,b);documentId=a.id;rev=a.revision;
   assert.equal(await db.documentVersion.count({where:{documentId}}),1);assert.equal(await db.documentEvent.count({where:{documentId}}),1);
   await assert.rejects(writeDocument(owner,{...payload,name:"Autre"},{bytes:Buffer.from("Première version privée"),type:"text/plain"}),/Clé déjà/);
   const data=await read({documentId},reader);assert.equal(data.selected?.name,payload.name);assert.ok(!JSON.stringify(data).includes("Première version privée"));assert.ok(!JSON.stringify(data).includes("storageKey"));assert.equal(data.usedBytes,null);
  });
  await t.test("versions are immutable and stale or cross-tenant writes are refused",async()=>{
   const before=await downloadDocument(reader.id,company.id,documentId);assert.equal(Buffer.from(before.data).toString(),"Première version privée");
   rev=(await upload({documentId,revision:rev,folderId,note:"Deuxième version"},"Deuxième contenu")).revision;
   const data=await read({documentId});assert.equal(data.versions.length,2);assert.equal(Buffer.from((await downloadDocument(owner.id,company.id,documentId,data.versions[1].id)).data).toString(),"Première version privée");
   await assert.rejects(upload({documentId,revision:rev-1,folderId}),/changé/);
   const foreignDoc=await writeDocument(stranger,{companyId:foreign.id,requestKey:randomUUID(),name:"Secret étranger",audience:"TEAM",fileName:"secret.txt",note:"Privé autre entreprise"},{bytes:Buffer.from("NE JAMAIS LIRE"),type:"text/plain"});
   const foreignVersion=await db.documentVersion.findFirstOrThrow({where:{documentId:foreignDoc.id}});
   await assert.rejects(downloadDocument(owner.id,company.id,documentId,foreignVersion.id),/Aucun fichier/);
   await assert.rejects(downloadDocument(owner.id,company.id,foreignDoc.id),/introuvable/);
   const foreignFolder=await writeDocument(stranger,{companyId:foreign.id,requestKey:randomUUID(),action:"folder.save",name:"Autre dossier"});
   await assert.rejects(act({action:"document.update",id:documentId,revision:rev,name:"Procédure atelier",folderId:foreignFolder.id,audience:"TEAM"}),/Dossier actif/);
  });
  await t.test("restricted files disappear from lists, metadata, folders and downloads immediately",async()=>{
   rev=(await act({action:"document.update",id:documentId,revision:rev,name:"Procédure atelier",folderId,audience:"MANAGERS"})).revision;
   const data=await read({},reader);assert.equal(data.total,0);assert.equal(data.folders.length,0);
   await assert.rejects(read({documentId},reader),/inaccessible/);await assert.rejects(downloadDocument(reader.id,company.id,documentId),/inaccessible/);await assert.rejects(read({audience:"MANAGERS"},reader),/confidentiel/);
   await db.companyRole.update({where:{id:role.id},data:{permissions:["documents.manage"]}});
   assert.ok((await getWorkspace(reader.id,company.id)).current?.permissions.includes("documents.read"));assert.equal((await read({},reader)).manage,true);
   await db.companyRole.update({where:{id:role.id},data:{permissions:["documents.read"]}});
   await assert.rejects(act({action:"folder.archive",id:folderId,revision:0,archived:true}),/documents actifs/);
  });
  await t.test("archive and restore preserve every byte; archived folders cannot acquire active files",async()=>{
   rev=(await act({action:"document.archive",id:documentId,revision:rev,archived:true,reason:"Ancienne procédure conservée"})).revision;
   assert.equal((await read()).total,0);assert.equal((await read({archived:"true"})).total,1);await assert.rejects(upload({documentId,revision:rev,folderId,audience:"MANAGERS"}),/Restaurez/);
   await act({action:"folder.archive",id:folderId,revision:0,archived:true});await assert.rejects(act({action:"document.archive",id:documentId,revision:rev,archived:false,reason:"Réutiliser cette procédure"}),/Dossier actif/);
   await act({action:"folder.archive",id:folderId,revision:1,archived:false});rev=(await act({action:"document.archive",id:documentId,revision:rev,archived:false,reason:"Réutiliser cette procédure"})).revision;
   assert.equal(Buffer.from((await downloadDocument(owner.id,company.id,documentId)).data).toString(),"Deuxième contenu");
   await assert.rejects(act({action:"folder.save",name:"PROCÉDURES"}),/existe/);
  });
  await t.test("real pagination and immutable 50-version limit",async()=>{
   await db.document.createMany({data:Array.from({length:27},(_,i)=>({companyId:company.id,name:`Pagination document ${i}`,storageKey:randomUUID(),mimeType:"text/plain",size:1}))});
   const data=await read({q:"Pagination",page:2});assert.equal(data.total,27);assert.equal(data.rows.length,2);
   await db.documentVersion.createMany({data:Array.from({length:48},(_,i)=>({companyId:company.id,documentId,number:i+3,fileName:"old.txt",mimeType:"text/plain",size:1,data:Buffer.from("x"),digest:"fixture",authorId:owner.id,authorName:owner.name,note:"Ancienne version fixture"}))});
   await assert.rejects(upload({documentId,revision:rev,folderId,audience:"MANAGERS"}),/50 versions/);
  });
  await t.test("current membership, role, company and server restrictions protect all file versions",async()=>{
   await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(read({},reader),/inaccessible/);
   await db.company.update({where:{id:company.id},data:{accessStatus:"SUSPENDED"}});await assert.rejects(downloadDocument(owner.id,company.id,documentId),/suspendue/);await db.company.update({where:{id:company.id},data:{accessStatus:"ACTIVE"}});
  });
  await t.test("archived bytes and all historical versions count towards the real PostgreSQL quota",async()=>{
   const quota=await db.document.create({data:{companyId:company.id,name:"Archive de recette quota",storageKey:randomUUID(),mimeType:"text/plain",size:MAX_DOCUMENT_BYTES,archived:true}});
   // PostgreSQL generates the actual bytea payload: no forged metadata or mocked sum.
   await db.$executeRaw`INSERT INTO "DocumentVersion" ("id","companyId","documentId","number","fileName","mimeType","size","digest","data","authorId","authorName","note") SELECT ${tag} || '-' || n,${company.id},${quota.id},n,'archive.txt','text/plain',5242880,'fixture',convert_to(repeat('a',5242880),'UTF8'),${owner.id},'Recette','Ancienne version archivée' FROM generate_series(1,20) n`;
   await assert.rejects(upload({name:"Nouveau document au-delà du quota"}),/100 Mo/);
   assert.equal(await db.document.count({where:{companyId:company.id,name:"Nouveau document au-delà du quota"}}),0);
  });
 }finally{await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`app:${id}:`}},{key:{startsWith:`documents:${id}:`}}]}});await db.$disconnect();}
});
