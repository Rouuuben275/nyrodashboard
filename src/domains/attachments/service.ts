import {createHash,randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {AppError} from "@/domains/core/errors";
import {documentForViewer,documentLimit} from "@/domains/documents/service";
import {inspectDocument} from "@/domains/documents/files";
import {MAX_COMPANY_DOCUMENT_BYTES} from "@/domains/documents/validation";
import {attachmentAccess} from "./access";
import {attachmentAction,attachmentQuery,attachmentUpload} from "./validation";
export async function readAttachments(userId:string,raw:unknown){
 const q=attachmentQuery.parse(raw);
 return db.$transaction(async tx=>{
  const {writable}=await attachmentAccess(tx,userId,q);
  const where={companyId:q.companyId,targetType:q.targetType,targetId:q.targetId,archived:q.archived==="true"};
  const [rows,total]=await Promise.all([tx.document.findMany({where,select:{id:true,name:true,mimeType:true,size:true,revision:true,archived:true,createdAt:true,versions:{select:{id:true,number:true,fileName:true,authorName:true,note:true,createdAt:true},orderBy:{number:"desc"},take:50},events:{select:{id:true,action:true,actorName:true,details:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:10}},orderBy:[{createdAt:"desc"},{id:"asc"}],take:25,skip:(q.page-1)*25}),tx.document.count({where})]);
  return {rows,total,writable};
 },{isolationLevel:"RepeatableRead",timeout:20000});
}
export async function writeAttachment(actor:{id:string;name:string},raw:unknown,file?:{bytes:Uint8Array;type:string}){
 await documentLimit(actor.id);const input=file?attachmentUpload.parse(raw):attachmentAction.parse(raw);
 const upload=file?attachmentUpload.parse(input):null;
 const mime=file&&upload?inspectDocument(file.bytes,upload.fileName,file.type):"";
 const digest=file?createHash("sha256").update(file.bytes).digest("hex"):"";
 const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input,digest})).digest("hex");
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.companyId}))::text`;
  // Recheck parent access even for a replay after reassignment or status changes.
  await attachmentAccess(tx,actor.id,input);
  const previous=await tx.documentCommand.findUnique({where:{companyId_requestKey:{companyId:input.companyId,requestKey:input.requestKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour une autre opération.",409);return previous.result as {id:string;revision:number};}
  await attachmentAccess(tx,actor.id,input,true);
  const scope={companyId:input.companyId,targetType:input.targetType,targetId:input.targetId};let result:{id:string;revision:number};
  const event=(id:string,action:string,details:string)=>tx.documentEvent.create({data:{companyId:input.companyId,documentId:id,actorId:actor.id,actorName:actor.name,action,details}});
  if("action" in input&&input.action==="archive"){
   const old=await tx.document.findFirst({where:{...scope,id:input.documentId}});if(!old)throw new AppError("Pièce introuvable.",404);
   if(old.revision!==input.revision)throw new AppError("Cette pièce a changé. Actualisez.",409);
   result=await tx.document.update({where:{id:old.id},data:{archived:input.archived,revision:{increment:1}}});await event(old.id,input.archived?"ARCHIVE":"RESTORE",input.note);
  }else{
   const old=upload?.documentId?await tx.document.findFirst({where:{...scope,id:upload.documentId}}):null;
   if(upload?.documentId&&!old)throw new AppError("Pièce introuvable.",404);
   if(old&&(old.revision!==upload?.revision||old.archived))throw new AppError("Cette pièce a changé ou est archivée. Actualisez.",409);
   if(!old&&upload?.revision!==undefined)throw new AppError("Révision sans document.",400);
   const count=old?await tx.documentVersion.count({where:{companyId:input.companyId,documentId:old.id}}):0;
   if(count>=50)throw new AppError("Limite de 50 versions atteinte.",409);
   if(!old&&await tx.document.count({where:scope})>=100)throw new AppError("Limite de 100 pièces par dossier, archives comprises.",409);
   let bytes=file?.bytes,type=mime,fileName=upload?.fileName,hash=digest;
   if("action" in input){
    const source=await documentForViewer(tx,input.companyId,actor.id,input.sourceId);
    if(source.targetType||source.archived||source.audience!=="MANAGERS")throw new AppError("Choisissez un document privé actif de la bibliothèque.",400);
    const version=await tx.documentVersion.findFirst({where:{companyId:input.companyId,documentId:source.id,id:input.versionId}});
    if(!version)throw new AppError("Version source introuvable.",404);
    bytes=version.data;type=version.mimeType;fileName=version.fileName;hash=version.digest;
   }
   if(!bytes||!fileName)throw new AppError("Fichier requis.");
   const used=(await tx.documentVersion.aggregate({where:{companyId:input.companyId},_sum:{size:true}}))._sum.size??0;
   if(used+bytes.length>MAX_COMPANY_DOCUMENT_BYTES)throw new AppError("Stockage documentaire limité à 100 Mo, archives et versions comprises.",413);
   const doc=old?await tx.document.update({where:{id:old.id},data:{size:bytes.length,mimeType:type,revision:{increment:1}}}):await tx.document.create({data:{...scope,name:input.name,audience:"RECORD",size:bytes.length,mimeType:type,storageKey:`private:${randomUUID()}`}});
   await tx.documentVersion.create({data:{companyId:input.companyId,documentId:doc.id,number:count+1,fileName,mimeType:type,size:bytes.length,digest:hash,data:new Uint8Array(bytes),authorId:actor.id,authorName:actor.name,note:input.note}});
   await event(doc.id,count?"VERSION":("action" in input?"LINK":"CREATE"),input.note);result=doc;
  }
  await tx.auditLog.create({data:{companyId:input.companyId,actorId:actor.id,actorName:actor.name,action:"Pièce privée du dossier actualisée",entityId:input.targetId,details:{module:input.targetType}}});
  const response={id:result.id,revision:result.revision};await tx.documentCommand.create({data:{companyId:input.companyId,requestKey:input.requestKey,fingerprint,result:response}});return response;
 },{timeout:20000});
}
export type AttachmentsData=Awaited<ReturnType<typeof readAttachments>>;
