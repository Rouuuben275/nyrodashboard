import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readAttachments,writeAttachment} from "../src/domains/attachments/service";
import {writeDocument} from "../src/domains/documents/service";
import {readDocuments,downloadDocument} from "../src/domains/documents/queries";
import {readExpenses,writeClaim} from "../src/domains/expenses/service";
test("PostgreSQL: parent-scoped documents and complete RP expense claim workflow",async t=>{
 const users:string[]=[],companies:string[]=[],tag=`proof-${randomUUID()}`;
 try{
  const make=async(name:string)=>{const u=await db.user.create({data:{name,email:`${tag}-${name}@example.test`}});users.push(u.id);return u;};
  const owner=await make("Direction"),employee=await make("Employe"),coworker=await make("Collegue"),librarian=await make("Documentaliste"),outsider=await make("Externe");
  const company=await execute(owner,undefined,{action:"company.create",name:tag,sector:"Services"}) as {id:string};companies.push(company.id);
  await db.companyModule.updateMany({where:{companyId:company.id,key:{in:["documents","expenses","employees","tasks","leaves","finance"]}},data:{enabled:true}});
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Employés",permissions:["employees.read","leaves.read","tasks.read","expenses.read","expenses.create"]}}),docRole=await db.companyRole.create({data:{companyId:company.id,name:"Documents seulement",permissions:["documents.read","documents.manage"]}});
  const member=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:employee.name}});
  await db.companyMember.createMany({data:[{companyId:company.id,userId:coworker.id,roleId:role.id,characterName:coworker.name},{companyId:company.id,userId:librarian.id,roleId:docRole.id,characterName:librarian.name}]});
  const leave=await db.leaveRequest.create({data:{companyId:company.id,memberId:member.id,start:new Date("2026-01-01"),end:new Date("2026-01-02"),reason:"Raison confidentielle"}}),task=await db.task.create({data:{companyId:company.id,title:"Mission",assigneeId:member.id}}),expense=await db.expense.create({data:{companyId:company.id,label:"Achat existant",amount:1200,category:"Autre",actorId:employee.id,status:"APPROVED"}});
  const target=(targetType:string,targetId:string)=>({companyId:company.id,targetType,targetId});
  const file={bytes:Buffer.from("Justificatif privé original"),type:"text/plain"};
  const upload=(scope:ReturnType<typeof target>,actor=employee,extra:Record<string,unknown>={})=>writeAttachment(actor,{...scope,requestKey:randomUUID(),name:"Pièce confidentielle",fileName:"preuve.txt",note:"Justificatif original",...extra},file);
  const clear=()=>db.rateLimit.deleteMany({where:{OR:users.flatMap(id=>[{key:{startsWith:`documents:${id}:`}},{key:{startsWith:`utility:${id}:`}}])}});
  let employeeDoc="",taskDoc="",claimId="",claimDoc="";
  await t.test("employee, leave, expense and task uploads persist real bytes without library disclosure",async()=>{
   for(const [kind,id] of [["EMPLOYEE",member.id],["LEAVE",leave.id],["EXPENSE",expense.id],["TASK",task.id]]){
    const d=await upload(target(kind,id));assert.equal((await readAttachments(employee.id,target(kind,id))).total,1);assert.equal(Buffer.from((await downloadDocument(employee.id,company.id,d.id)).data).toString(),file.bytes.toString());if(kind==="EMPLOYEE")employeeDoc=d.id;if(kind==="TASK")taskDoc=d.id;
   }
   assert.equal((await readDocuments(owner.id,{companyId:company.id})).total,0);
   await assert.rejects(readDocuments(owner.id,{companyId:company.id,documentId:employeeDoc}),/inaccessible/);
   await assert.rejects(writeDocument(owner,{companyId:company.id,requestKey:randomUUID(),action:"document.update",id:employeeDoc,revision:0,name:"Publier",folderId:null,audience:"TEAM"}),/introuvable/);
   await assert.rejects(writeDocument(owner,{companyId:company.id,requestKey:randomUUID(),documentId:employeeDoc,revision:0,name:"Fuite",audience:"TEAM",fileName:"preuve.txt",note:"Ne jamais publier"},file),/introuvable/);
  });
  await t.test("parent permissions and tenant boundaries override document administration",async()=>{
   for(const u of [coworker,librarian,outsider])await assert.rejects(downloadDocument(u.id,company.id,employeeDoc),/privé|inaccessible/);
   for(const scope of [target("LEAVE",leave.id),target("EXPENSE",expense.id),target("EMPLOYEE",member.id)])await assert.rejects(readAttachments(coworker.id,scope),/privé/);
   assert.equal((await readAttachments(coworker.id,target("TASK",task.id))).total,1);await assert.rejects(upload(target("TASK",task.id),coworker),/verrouillées/);
   await assert.rejects(readAttachments(owner.id,{...target("TASK",task.id),companyId:"foreign-company"}),/inaccessible/);
  });
  await t.test("linking snapshots a library version and never widens the original access",async()=>{
   const source=await writeDocument(owner,{companyId:company.id,requestKey:randomUUID(),name:"Archive privée",audience:"MANAGERS",fileName:"source.txt",note:"Document source privé"},file);
   const original=await db.documentVersion.findFirstOrThrow({where:{documentId:source.id}});
   const payload={...target("EMPLOYEE",member.id),requestKey:randomUUID(),action:"link",sourceId:source.id,versionId:original.id,name:"Copie du dossier",note:"Version rattachée au dossier"};
   const [a,b]=await Promise.all([writeAttachment(owner,payload),writeAttachment(owner,payload)]);assert.equal(a.id,b.id);
   assert.equal((await readDocuments(owner.id,{companyId:company.id})).total,1);assert.equal((await readAttachments(employee.id,target("EMPLOYEE",member.id))).total,2);
   await assert.rejects(downloadDocument(employee.id,company.id,source.id),/refusé|inaccessible/);assert.equal(Buffer.from((await downloadDocument(employee.id,company.id,a.id)).data).toString(),file.bytes.toString());
   await assert.rejects(writeAttachment(owner,{...payload,requestKey:randomUUID(),sourceId:employeeDoc}),/bibliothèque/);
  });
  await t.test("new versions and archives preserve historical bytes and reject stale revisions",async()=>{
   const payload={...target("EMPLOYEE",member.id),documentId:employeeDoc,revision:0,requestKey:randomUUID(),name:"Pièce confidentielle",fileName:"preuve.txt",note:"Version rectifiée"};
   await writeAttachment(employee,payload,{bytes:Buffer.from("Version corrigée"),type:"text/plain"});await assert.rejects(upload(target("EMPLOYEE",member.id),employee,{documentId:employeeDoc,revision:0}),/changé/);
   const versions=await db.documentVersion.findMany({where:{documentId:employeeDoc},orderBy:{number:"asc"}});assert.equal(versions.length,2);assert.equal(Buffer.from((await downloadDocument(employee.id,company.id,employeeDoc,versions[0].id)).data).toString(),file.bytes.toString());
   await writeAttachment(employee,{...target("EMPLOYEE",member.id),requestKey:randomUUID(),action:"archive",documentId:employeeDoc,revision:1,archived:true,note:"Ancienne pièce conservée"});assert.equal((await readAttachments(employee.id,{...target("EMPLOYEE",member.id),archived:"true"})).total,1);
   assert.equal(Buffer.from((await downloadDocument(owner.id,company.id,employeeDoc)).data).toString(),"Version corrigée");
   await db.leaveRequest.update({where:{id:leave.id},data:{status:"APPROVED"}});await assert.rejects(upload(target("LEAVE",leave.id)),/verrouillées/);
   await db.task.update({where:{id:task.id},data:{archived:true}});await assert.rejects(upload(target("TASK",task.id)),/verrouillées/);
  });
  await clear();
  const save=(extra:Record<string,unknown>={})=>({companyId:company.id,requestKey:randomUUID(),action:"save",label:"Pièces avancées",category:"Équipement",description:"Achat avancé pour l’atelier",amount:14500,spentOn:"2026-01-15",...extra});
  const action=(name:string,revision:number,extra:Record<string,unknown>={})=>({companyId:company.id,requestKey:randomUUID(),action:name,id:claimId,revision,reason:"Motif de l’opération RP",...extra});
  await t.test("claims require evidence and an independent decision, without posting on submission",async()=>{
   const payload=save(),[a,b]=await Promise.all([writeClaim(employee,payload),writeClaim(employee,payload)]);assert.equal(a.id,b.id);claimId=a.id;
   await assert.rejects(writeClaim(employee,action("submit",0)),/justificatif/);assert.equal(await db.expenseClaimEvent.count({where:{claimId,action:"submit"}}),0);
   await assert.rejects(readExpenses(coworker.id,{companyId:company.id,id:claimId}),/privée/);
   claimDoc=(await upload(target("CLAIM",claimId))).id;await writeClaim(employee,action("submit",0));
   assert.equal(await db.financialEntry.count({where:{companyId:company.id,kind:"EXPENSE"}}),0);
   await assert.rejects(upload(target("CLAIM",claimId)),/verrouillées/);
   await db.companyRole.update({where:{id:role.id},data:{permissions:{push:"expenses.approve"}}});await assert.rejects(writeClaim(employee,action("decide",1,{approve:true})),/propre note/);await db.companyRole.update({where:{id:role.id},data:{permissions:{set:["employees.read","leaves.read","tasks.read","expenses.read","expenses.create"]}}});
   await writeClaim(owner,action("decide",1,{approve:true}));assert.equal(await db.expense.count({where:{companyId:company.id}}),1);
  });
  await t.test("reimbursement is atomic, idempotent, fully linked and counted exactly once",async()=>{
   const payload={companyId:company.id,requestKey:randomUUID(),action:"pay",id:claimId,revision:2,reference:"Virement RP NF-001"};
   await db.companyModule.updateMany({where:{companyId:company.id,key:"finance"},data:{enabled:false}});
   await assert.rejects(writeClaim(owner,payload),/désactivé/);assert.equal(await db.financialEntry.count({where:{companyId:company.id}}),0);assert.equal((await db.expenseClaim.findUniqueOrThrow({where:{id:claimId}})).status,"APPROVED");
   await db.companyModule.updateMany({where:{companyId:company.id,key:"finance"},data:{enabled:true}});
   const [a,b]=await Promise.all([writeClaim(owner,payload),writeClaim(owner,payload)]);assert.equal(a.id,b.id);
   const c=await db.expenseClaim.findUniqueOrThrow({where:{id:claimId},include:{expense:true}});assert.equal(c.status,"PAID");assert.equal(c.expense?.actorId,employee.id);assert.equal(c.expense?.amount,14500);
   const ledger=await db.financialEntry.findMany({where:{companyId:company.id,kind:"EXPENSE"}});assert.equal(ledger.length,1);assert.equal(ledger[0].amount,-14500);assert.equal(ledger[0].sourceId,c.expenseId);
   await assert.rejects(writeClaim(owner,{...payload,requestKey:randomUUID()}),/changé/);await assert.rejects(upload(target("EXPENSE",c.expenseId!)),/verrouillées/);
   assert.equal((await readExpenses(employee.id,{companyId:company.id,id:claimId})).events.filter(e=>e.action==="pay").length,1);
  });
  await t.test("withdrawal preserves each submission snapshot, decline and cancellation post nothing",async()=>{
   const draft=await writeClaim(employee,save({label:"Seconde note"}));const previous=claimId;claimId=draft.id;
   const doc=await upload(target("CLAIM",claimId));await writeClaim(employee,action("submit",0));await writeClaim(employee,action("withdraw",1));
   await upload(target("CLAIM",claimId),employee,{documentId:doc.id,revision:0,note:"Preuve corrigée"});await writeClaim(employee,action("submit",2));
   const submissions=await db.expenseClaimEvent.findMany({where:{claimId,action:"submit"},orderBy:{createdAt:"asc"}});assert.equal(submissions.length,2);assert.notDeepEqual(submissions[0].evidence,submissions[1].evidence);
   await writeClaim(owner,action("decide",3,{approve:false,reason:"Frais non acceptés"}));await assert.rejects(writeClaim(employee,save({id:claimId,revision:4})),/brouillons/);
   const cancelled=await writeClaim(employee,save({label:"Brouillon annulé"}));await writeClaim(employee,{...action("cancel",0),id:cancelled.id});assert.equal(await db.financialEntry.count({where:{companyId:company.id,kind:"EXPENSE"}}),1);claimId=previous;
  });
  await clear();
  await t.test("permission, membership and module revocation apply to every old file version",async()=>{
   await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(downloadDocument(employee.id,company.id,claimDoc),/inaccessible/);await db.companyMember.update({where:{id:member.id},data:{status:"ACTIVE"}});
   await db.companyRole.update({where:{id:role.id},data:{permissions:["documents.manage"]}});await assert.rejects(downloadDocument(employee.id,company.id,claimDoc),/inaccessible/);
   await db.companyModule.updateMany({where:{companyId:company.id,key:"documents"},data:{enabled:false}});await assert.rejects(downloadDocument(owner.id,company.id,employeeDoc),/désactivé/);
   await db.companyModule.updateMany({where:{companyId:company.id,key:"documents"},data:{enabled:true}});
   assert.equal((await downloadDocument(owner.id,company.id,taskDoc)).mimeType,"text/plain");
  });
 }finally{
  await db.task.deleteMany({where:{companyId:{in:companies}}});await db.expenseClaim.deleteMany({where:{companyId:{in:companies}}});await db.leaveRequest.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`documents:${id}:`}},{key:{startsWith:`utility:${id}:`}},{key:{startsWith:`app:${id}:`}}]}});await db.$disconnect();
 }
});
