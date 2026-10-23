import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {documentAccess,documentLimit,writeDocument} from "./service";
import {documentUpload,documentTypes,MAX_DOCUMENT_BYTES,MAX_COMPANY_DOCUMENT_BYTES} from "./validation";
import {attachmentUpload} from "@/domains/attachments/validation";
import {attachmentAccess} from "@/domains/attachments/access";
import {writeAttachment} from "@/domains/attachments/service";
export const TRANSFER_PART_BYTES=1024*1024;
const digest=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const begin=z.object({action:z.literal("start"),kind:z.enum(["LIBRARY","RECORD"]),metadata:z.unknown(),size:z.number().int().min(1).max(MAX_DOCUMENT_BYTES),digest:z.string().regex(/^[a-f0-9]{64}$/),mimeType:z.enum(documentTypes)}).strict();
const finish=z.object({action:z.enum(["finish","abort"]),id:z.string().uuid()}).strict();
const summary={id:true,companyId:true,actorId:true,requestKey:true,kind:true,metadata:true,fingerprint:true,mimeType:true,totalSize:true,digest:true,nextPart:true,partDigests:true,expiresAt:true,completedAt:true,result:true} satisfies Prisma.UploadTransferSelect;
type Transfer=Prisma.UploadTransferGetPayload<{select:typeof summary}>;
function metadata(kind:string,raw:unknown){return kind==="LIBRARY"?documentUpload.parse(raw):attachmentUpload.parse(raw);}
async function access(tx:Prisma.TransactionClient,userId:string,row:Pick<Transfer,"kind"|"metadata">,write:boolean){
 const input=metadata(row.kind,row.metadata);
 if(row.kind==="LIBRARY")documentAccess(await membership(tx,input.companyId,userId),write);
 else await attachmentAccess(tx,userId,attachmentUpload.parse(input),write);
 return input;
}
function receipt(row:Transfer){return {id:row.id,nextPart:row.nextPart,...(row.completedAt?{result:row.result as {id:string;revision:number}}:{})};}
async function owned(tx:Prisma.TransactionClient,userId:string,id:string){
 const row=await tx.uploadTransfer.findFirst({where:{id,actorId:userId},select:summary});
 if(!row||row.expiresAt<=new Date())throw new AppError("Transfert privé introuvable ou expiré. Recommencez le dépôt.",404);
 await access(tx,userId,row,false);return row;
}
export async function transferCommand(actor:{id:string;name:string},raw:unknown){
 await documentLimit(actor.id);
 if((raw as {action?:string})?.action==="start"){
  const q=begin.parse(raw),input=metadata(q.kind,q.metadata),fingerprint=digest(new TextEncoder().encode(JSON.stringify({...q,metadata:input})));
  return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.companyId}))::text`;
   await access(tx,actor.id,{kind:q.kind,metadata:input},false);
   const old=await tx.uploadTransfer.findUnique({where:{companyId_actorId_requestKey:{companyId:input.companyId,actorId:actor.id,requestKey:input.requestKey}},select:summary});
   if(old&&old.expiresAt>new Date()){if(old.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour un autre fichier.",409);return receipt(old);}
   await access(tx,actor.id,{kind:q.kind,metadata:input},true);
   // Only transient transfers created by this module are expired. Business files
   // and immutable versions are never deleted by cleanup.
   await tx.$executeRaw`DELETE FROM "UploadTransfer" WHERE id IN (SELECT id FROM "UploadTransfer" WHERE "expiresAt" < (NOW() AT TIME ZONE 'UTC') ORDER BY "expiresAt" LIMIT 20)`;
   if(old)await tx.uploadTransfer.deleteMany({where:{id:old.id,expiresAt:{lte:new Date()}}});
   const pending={companyId:input.companyId,completedAt:null,expiresAt:{gt:new Date()}};
   const [used,staging,ownStaging]=await Promise.all([tx.documentVersion.aggregate({where:{companyId:input.companyId},_sum:{size:true}}),tx.uploadTransfer.aggregate({where:pending,_sum:{totalSize:true}}),tx.uploadTransfer.aggregate({where:{...pending,actorId:actor.id},_sum:{totalSize:true}})]);
   if((ownStaging._sum.totalSize??0)+q.size>2*MAX_DOCUMENT_BYTES||(staging._sum.totalSize??0)+q.size>4*MAX_DOCUMENT_BYTES)throw new AppError("Des dépôts sont déjà en attente. Terminez-les ou attendez leur expiration dans une heure.",429);
   if((used._sum.size??0)+(staging._sum.totalSize??0)+q.size>MAX_COMPANY_DOCUMENT_BYTES)throw new AppError("Stockage documentaire limité à 100 Mo, dépôts en cours compris.",413);
   const row=await tx.uploadTransfer.create({data:{companyId:input.companyId,actorId:actor.id,requestKey:input.requestKey,kind:q.kind,metadata:input,fingerprint,mimeType:q.mimeType,totalSize:q.size,digest:q.digest,data:new Uint8Array(),expiresAt:new Date(Date.now()+3600000)},select:summary});return receipt(row);
  },{timeout:20000});
 }
 const q=finish.parse(raw);
 const row=await db.$transaction(async tx=>{
  const row=await owned(tx,actor.id,q.id);
  if(q.action==="abort"){if(row.completedAt)throw new AppError("Ce dépôt est déjà enregistré.",409);await tx.uploadTransfer.delete({where:{id:row.id}});return null;}
  if(row.completedAt)return {...row,data:null};
  await access(tx,actor.id,row,true);const stored=await tx.uploadTransfer.findUniqueOrThrow({where:{id:row.id},select:{data:true}});return {...row,...stored};
 });
 if(!row)return {aborted:true};if(row.completedAt)return receipt(row);
 if(!row.data||row.nextPart!==Math.ceil(row.totalSize/TRANSFER_PART_BYTES)||row.data.length!==row.totalSize)throw new AppError("Transfert incomplet.",409);
 if(digest(row.data)!==row.digest)throw new AppError("Empreinte du fichier incorrecte. Recommencez le dépôt.",409);
 // Existing domain transactions recheck permissions, signature, revisions, quotas
 // and idempotency. Two concurrent finishes cannot create two business files.
 const result=row.kind==="LIBRARY"?await writeDocument(actor,row.metadata,{bytes:row.data,type:row.mimeType}):await writeAttachment(actor,row.metadata,{bytes:row.data,type:row.mimeType});
 await db.uploadTransfer.update({where:{id:row.id},data:{completedAt:new Date(),result,data:new Uint8Array()},select:{id:true}});
 return {id:row.id,nextPart:row.nextPart,result};
}
export async function transferPart(actor:{id:string;name:string},raw:unknown,bytes:Uint8Array){
 await documentLimit(actor.id);const q=z.object({id:z.string().uuid(),index:z.coerce.number().int().min(0).max(4)}).strict().parse(raw),hash=digest(bytes);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`upload:${q.id}`}))::text`;
  const row=await owned(tx,actor.id,q.id);if(row.completedAt)throw new AppError("Transfert déjà terminé.",409);await access(tx,actor.id,row,true);
  const size=Math.min(TRANSFER_PART_BYTES,row.totalSize-q.index*TRANSFER_PART_BYTES);
  if(size<=0||bytes.length!==size)throw new AppError("Fragment invalide ou taille incorrecte.",400);
  if(q.index<row.nextPart){if(row.partDigests[q.index]!==hash)throw new AppError("Ce fragment contient déjà d’autres octets.",409);return receipt(row);}
  if(q.index!==row.nextPart)throw new AppError("Envoyez les fragments dans l’ordre.",409);
  await tx.$executeRaw`UPDATE "UploadTransfer" SET data = data || ${bytes}, "nextPart"="nextPart"+1, "partDigests"=array_append("partDigests",${hash}) WHERE id=${row.id}`;
  return {id:row.id,nextPart:row.nextPart+1};
 },{timeout:20000});
}
