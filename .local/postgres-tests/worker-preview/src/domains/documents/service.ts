import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {assertActiveUser} from "@/domains/platform/access";
import {documentAction,documentUpload,MAX_COMPANY_DOCUMENT_BYTES} from "./validation";
import {inspectDocument} from "./files";
import {attachmentAccess} from "@/domains/attachments/access";
import {attachmentTarget} from "@/domains/attachments/validation";
type Tx=Prisma.TransactionClient;
type Member=Awaited<ReturnType<typeof membership>>;
export function documentAccess(member:Member,write=false){
 if(!member.company.modules.some(m=>m.key==="documents"&&m.enabled))throw new AppError("Module Documents désactivé.",403);
 const manage=member.role.permissions.includes("documents.manage");
 if(write?!manage:!manage&&!member.role.permissions.includes("documents.read"))throw new AppError("Accès aux documents refusé.",403);return manage;
}
export async function documentForViewer(tx:Tx,companyId:string,userId:string,id:string){
 const doc=await tx.document.findFirst({where:{id,companyId}});
 if(!doc)throw new AppError("Document introuvable ou inaccessible.",404);
 if(doc.targetType){await attachmentAccess(tx,userId,attachmentTarget.parse({companyId,targetType:doc.targetType,targetId:doc.targetId}));}
 else {const manage=documentAccess(await membership(tx,companyId,userId));if(!manage&&doc.audience!=="TEAM")throw new AppError("Document introuvable ou inaccessible.",404);}
 return doc;
}
export async function documentLimit(userId:string){
 await assertActiveUser(db,userId);const key=`documents:${userId}:${Math.floor(Date.now()/60000)}`;
 const row=await db.rateLimit.upsert({where:{key},create:{key,count:1,lastRequest:BigInt(Date.now())},update:{count:{increment:1},lastRequest:BigInt(Date.now())}});
 if(row.count>30)throw new AppError("Trop d’actions documentaires. Réessayez dans une minute.",429);
}
async function folder(tx:Tx,companyId:string,id?:string|null){if(id&&!await tx.documentFolder.findFirst({where:{id,companyId,archived:false}}))throw new AppError("Dossier actif introuvable.",404);}
function revision(old:{revision:number}|null,value:number|undefined){if(old?old.revision!==value:value!==undefined)throw new AppError("Cet élément a changé. Actualisez avant de continuer.",409);}
export async function writeDocument(actor:{id:string;name:string},raw:unknown,file?:{bytes:Uint8Array;type:string}){
 await documentLimit(actor.id);const input=file?documentUpload.parse(raw):documentAction.parse(raw);
 const mimeType=file?inspectDocument(file.bytes,(input as ReturnType<typeof documentUpload.parse>).fileName,file.type):"";
 const digest=file?createHash("sha256").update(file.bytes).digest("hex"):"";
 const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input,digest})).digest("hex");
 return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.companyId}))::text`;
   documentAccess(await membership(tx,input.companyId,actor.id),true);
   const oldCommand=await tx.documentCommand.findUnique({where:{companyId_requestKey:{companyId:input.companyId,requestKey:input.requestKey}}});
   if(oldCommand){if(oldCommand.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour une autre opération.",409);return oldCommand.result as {id:string;revision:number};}
   const companyId=input.companyId;let result:{id:string;revision:number};
   const audit=(action:string,id:string)=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId:id,details:{module:"documents"}}});
   const event=(documentId:string,action:string,details:string)=>tx.documentEvent.create({data:{companyId,documentId,actorId:actor.id,actorName:actor.name,action,details}});
   if(!("action" in input)){
     if(!file)throw new AppError("Fichier requis.");await folder(tx,companyId,input.folderId);
     const old=input.documentId?await tx.document.findFirst({where:{id:input.documentId,companyId,targetType:null}}):null;
     if(input.documentId&&!old)throw new AppError("Document introuvable.",404);revision(old,input.revision);
     if(old?.archived)throw new AppError("Restaurez le document avant de déposer une version.",409);
     const count=old?await tx.documentVersion.count({where:{companyId,documentId:old.id}}):0;
     if(count>=50)throw new AppError("Limite de 50 versions par document atteinte.",409);
     const used=(await tx.documentVersion.aggregate({where:{companyId},_sum:{size:true}}))._sum.size??0;
     if(used+file.bytes.length>MAX_COMPANY_DOCUMENT_BYTES)throw new AppError("Stockage documentaire limité à 100 Mo par entreprise, archives et anciennes versions comprises.",413);
     if(old&&(old.name!==input.name||old.audience!==input.audience||old.folderId!==(input.folderId??null)))throw new AppError("Les informations du document ont changé. Rechargez sa fiche.",409);
     const doc=old?await tx.document.update({where:{id:old.id},data:{mimeType,size:file.bytes.length,revision:{increment:1}}}):await tx.document.create({data:{companyId,name:input.name,folderId:input.folderId,audience:input.audience,mimeType,size:file.bytes.length,storageKey:`private:${randomUUID()}`}});
     await tx.documentVersion.create({data:{companyId,documentId:doc.id,number:count+1,fileName:input.fileName,mimeType,size:file.bytes.length,digest,data:new Uint8Array(file.bytes),authorId:actor.id,authorName:actor.name,note:input.note}});
     await event(doc.id,count?"VERSION":"CREATE",`Version ${count+1} : ${input.note}`);await audit(count?"Version documentaire ajoutée":"Document privé créé",doc.id);result=doc;
   }else if(input.action==="folder.save"){
     const old=input.id?await tx.documentFolder.findFirst({where:{companyId,id:input.id}}):null;if(input.id&&!old)throw new AppError("Dossier introuvable.",404);revision(old,input.revision);
     if(old?.archived)throw new AppError("Restaurez le dossier avant de le renommer.",409);
     const existing=await tx.documentFolder.findMany({where:{companyId,...(old?{id:{not:old.id}}:{})},select:{name:true},take:101});
     if(existing.some(f=>f.name.normalize("NFC").toLocaleLowerCase("fr")===input.name.normalize("NFC").toLocaleLowerCase("fr")))throw new AppError("Ce dossier existe déjà.",409);
     if(!old&&await tx.documentFolder.count({where:{companyId}})>=100)throw new AppError("Limite de 100 dossiers atteinte.",409);
     result=old?await tx.documentFolder.update({where:{id:old.id},data:{name:input.name,revision:{increment:1}}}):await tx.documentFolder.create({data:{companyId,name:input.name}});await audit("Dossier documentaire enregistré",result.id);
   }else if(input.action==="folder.archive"){
     const old=await tx.documentFolder.findFirst({where:{companyId,id:input.id}});if(!old)throw new AppError("Dossier introuvable.",404);revision(old,input.revision);
     if(input.archived&&await tx.document.count({where:{companyId,folderId:old.id,archived:false}}))throw new AppError("Déplacez ou archivez les documents actifs de ce dossier.",409);
     result=await tx.documentFolder.update({where:{id:old.id},data:{archived:input.archived,revision:{increment:1}}});await audit(input.archived?"Dossier archivé":"Dossier restauré",old.id);
   }else{
     const old=await tx.document.findFirst({where:{companyId,id:input.id,targetType:null}});if(!old)throw new AppError("Document introuvable.",404);revision(old,input.revision);
     if(input.action==="document.update"){
       if(old.archived)throw new AppError("Restaurez le document avant de le modifier.",409);await folder(tx,companyId,input.folderId);
       result=await tx.document.update({where:{id:old.id},data:{name:input.name,folderId:input.folderId,audience:input.audience,revision:{increment:1}}});
       await event(old.id,"UPDATE",`Informations actualisées ; accès ${input.audience==="TEAM"?"équipe":"responsables documentaires"}.`);await audit("Document actualisé",old.id);
     }else{
       if(!input.archived)await folder(tx,companyId,old.folderId);
       result=await tx.document.update({where:{id:old.id},data:{archived:input.archived,revision:{increment:1}}});await event(old.id,input.archived?"ARCHIVE":"RESTORE",input.reason);await audit(input.archived?"Document archivé":"Document restauré",old.id);
     }
   }
   const response={id:result.id,revision:result.revision};await tx.documentCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,result:response}});return response;
 },{timeout:20000});
}
