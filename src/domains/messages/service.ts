import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {assertActiveUser} from "@/domains/platform/access";
import {notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {messageAction} from "./validation";
type Tx=Prisma.TransactionClient;
export function messageAccess(member:Awaited<ReturnType<typeof membership>>,send=false){
 if(!member.company.modules.some(m=>m.key==="messages"&&m.enabled))throw new AppError("Module Messagerie désactivé.",403);
 if(!member.role.permissions.includes("messages.read")||(send&&!member.role.permissions.includes("messages.send")))throw new AppError("Accès à la messagerie refusé.",403);
}
// This predicate is shared by recipient selection and notification delivery.
export function eligibleMembers(companyId:string):Prisma.CompanyMemberWhereInput{return {companyId,status:"ACTIVE",role:{OR:[{isOwner:true},{permissions:{has:"messages.read"}}]},user:{OR:[{accessStatus:"ACTIVE"},{accessStatus:"SUSPENDED",suspendedUntil:{lte:new Date()}}]}};}
export async function threadForViewer(tx:Tx,companyId:string,memberId:string,id:string){
 const thread=await tx.chatThread.findFirst({where:{id,companyId,participants:{some:{memberId,active:true}}},include:{participants:{where:{active:true},select:{memberId:true,lastReadSequence:true,archived:true,member:{select:{characterName:true,status:true}}}}}});
 if(!thread)throw new AppError("Conversation introuvable ou inaccessible.",404);return thread;
}
export async function writeMessage(actor:{id:string;name:string},raw:unknown){
 const input=messageAction.parse(raw);await assertActiveUser(db,actor.id);
 const key=`messages:${actor.id}:${Math.floor(Date.now()/60000)}`;
 const rate=await db.rateLimit.upsert({where:{key},create:{key,count:1,lastRequest:BigInt(Date.now())},update:{count:{increment:1},lastRequest:BigInt(Date.now())}});
 if(rate.count>60)throw new AppError("Trop d’actions de messagerie. Réessayez dans une minute.",429);
 const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.companyId}))::text`;
  const viewer=await membership(tx,input.companyId,actor.id);messageAccess(viewer,["create","send","group"].includes(input.action));
  // Check current participant access before replaying a previous command.
  const thread="threadId" in input?await threadForViewer(tx,input.companyId,viewer.id,input.threadId):null;
  const old=await tx.chatCommand.findUnique({where:{companyId_requestKey:{companyId:input.companyId,requestKey:input.requestKey}}});
  if(old){if(old.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour une autre action.",409);const answer=old.result as {id:string};if(input.action==="create")await threadForViewer(tx,input.companyId,viewer.id,answer.id);return answer;}
  const companyId=input.companyId;let result:{id:string};
  const validateMembers=async(ids:string[])=>{
   if(ids.includes(viewer.id))throw new AppError("Votre compte participe déjà à la conversation.");
   const members=await tx.companyMember.findMany({where:{...eligibleMembers(companyId),id:{in:ids}},select:{id:true}});
   if(members.length!==ids.length)throw new AppError("Un participant n’a plus accès à la messagerie de cette entreprise.",403);
  };
  if(input.action==="create"){
   if(input.kind==="PRIVATE"&&input.memberIds.length!==1)throw new AppError("Une conversation privée comporte exactement deux participants.");
   if(input.kind==="GROUP"&&!input.title)throw new AppError("Nommez le groupe.");await validateMembers(input.memberIds);
   // Reopening a private conversation preserves its original history.
   const existing=input.kind==="PRIVATE"?await tx.chatThread.findFirst({where:{companyId,kind:"PRIVATE",AND:[{participants:{some:{memberId:viewer.id,active:true}}},{participants:{some:{memberId:input.memberIds[0],active:true}}}]},select:{id:true}}):null;
   if(existing){await tx.chatParticipant.update({where:{threadId_memberId:{threadId:existing.id,memberId:viewer.id}},data:{archived:false}});result=existing;}
   else {
    const created=await tx.chatThread.create({data:{companyId,kind:input.kind,title:input.kind==="GROUP"?input.title:"Conversation privée",ownerMemberId:viewer.id}});
    await tx.chatParticipant.createMany({data:[viewer.id,...input.memberIds].map(memberId=>({companyId,threadId:created.id,memberId}))});result={id:created.id};
   }
  }else if(thread){
   const participant=thread.participants.find(p=>p.memberId===viewer.id)!;
   if(input.action==="send"){
    if(thread.kind==="PRIVATE"&&await tx.companyMember.count({where:{...eligibleMembers(companyId),id:{in:thread.participants.map(p=>p.memberId).filter(id=>id!==viewer.id)}}})!==1)throw new AppError("Le destinataire n’a plus accès à la messagerie.",403);
    const sequence=thread.lastSequence+1;
    await tx.chatMessage.create({data:{companyId,threadId:thread.id,sequence,senderMemberId:viewer.id,senderName:viewer.characterName,body:input.body}});
    await tx.chatThread.update({where:{id:thread.id},data:{lastSequence:sequence,updatedAt:new Date()}});
    // Incoming messages restore the conversation in its recipients’ inboxes.
    await tx.chatParticipant.updateMany({where:{companyId,threadId:thread.id,active:true},data:{archived:false}});
    const recipients=await tx.companyMember.findMany({where:{...eligibleMembers(companyId),id:{in:thread.participants.map(p=>p.memberId).filter(id=>id!==viewer.id)}},select:{userId:true}});
    await notifyUsers(tx,recipients.map(p=>({userId:p.userId,title:"Nouveau message interne",body:`Un message vous attend dans la messagerie de ${viewer.company.name}.`,category:"MESSAGES",targetUrl:companyNotificationUrl(companyId,"messages")})));
   }else if(input.action==="group"){
    if(thread.kind!=="GROUP"||thread.ownerMemberId!==viewer.id)throw new AppError("Seul le créateur peut gérer ce groupe.",403);
    if(thread.revision!==input.revision)throw new AppError("Le groupe a changé. Actualisez avant de continuer.",409);
    await validateMembers(input.memberIds);const ids=[viewer.id,...input.memberIds];
    await tx.chatParticipant.updateMany({where:{companyId,threadId:thread.id,memberId:{notIn:ids}},data:{active:false}});
    for(const memberId of ids)await tx.chatParticipant.upsert({where:{threadId_memberId:{threadId:thread.id,memberId}},create:{companyId,threadId:thread.id,memberId},update:{active:true}});
    await tx.chatThread.update({where:{id:thread.id},data:{title:input.title,revision:{increment:1},updatedAt:new Date()}});
   }else if(input.action==="archive")await tx.chatParticipant.update({where:{threadId_memberId:{threadId:thread.id,memberId:viewer.id}},data:{archived:input.archived}});
   else if(input.action==="read"){
    if(input.through>thread.lastSequence)throw new AppError("Position de lecture invalide.",409);
    if(input.through>participant.lastReadSequence)await tx.chatParticipant.update({where:{threadId_memberId:{threadId:thread.id,memberId:viewer.id}},data:{lastReadSequence:input.through}});
   }
   result={id:thread.id};
  }else throw new AppError("Action invalide.");
  await tx.chatCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,result}});
  // Private text and participant lists never enter the company-wide audit log.
  return result;
 },{timeout:20000});
}
