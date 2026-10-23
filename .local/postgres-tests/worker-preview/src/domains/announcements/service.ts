import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import type {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import type {AnnouncementAction} from "./validation";
type Tx=Prisma.TransactionClient;
type Member=Awaited<ReturnType<typeof membership>>;
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function announcementAccess(member:Member){
  if(!member.company.modules.some(m=>m.key==="announcements"&&m.enabled))throw new AppError("Module Annonces désactivé.",403);
  if(!member.role.permissions.includes("dashboard.read"))throw new AppError("Lecture des annonces refusée.",403);
}
export function announcementVisibility(viewer:Member,manage:boolean,now:Date):Prisma.AnnouncementWhereInput{
  return manage?{companyId:viewer.companyId}:{companyId:viewer.companyId,status:{in:["PUBLISHED","ARCHIVED"]},startsAt:{lte:now},OR:[{scope:"ALL"},{scope:"DEPARTMENT",department:viewer.department}]};
}
export async function executeAnnouncement(tx:Tx,companyId:string,viewer:Member,actor:{id:string;name:string},input:AnnouncementAction){
  announcementAccess(viewer);const manage=viewer.role.permissions.includes("company.manage");
  if(input.action!=="announcement.read"&&!manage)throw new AppError("Administration de l’entreprise requise pour publier des annonces.",403);
  const now=new Date(),fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
  const previous=await tx.announcementCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour une autre annonce.",409);return previous.result;}
  const audit=(action:string,id:string)=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId:id,details:{module:"announcements"}}});
  const event=(announcementId:string,action:string,reason:string,snapshot:unknown)=>tx.announcementEvent.create({data:{companyId,announcementId,actorId:actor.id,actorName:actor.name,action,reason,snapshot:json(snapshot)}});
  const old=input.id?await tx.announcement.findFirst({where:{...announcementVisibility(viewer,manage,now),id:input.id}}):null;
  if(input.id&&!old)throw new AppError("Annonce introuvable.",404);
  if(input.action!=="announcement.read"&&(old?old.revision!==input.revision:input.revision!==undefined))throw new AppError("Cette annonce a changé. Actualisez avant de continuer.",409);
  let result:{id:string;revision?:number;readAt?:string};
  if(input.action==="announcement.save"){
    if(old&&old.status!=="DRAFT")throw new AppError("Seul un brouillon peut être modifié. Le texte publié reste conservé.",409);
    if(input.scope==="DEPARTMENT"&&(!input.department||!await tx.companyMember.findFirst({where:{companyId,status:"ACTIVE",department:input.department}})))throw new AppError("Département actif de cette entreprise introuvable.");
    if(input.scope==="ALL"&&input.department)throw new AppError("Une annonce générale ne cible pas un département.");
    const data={title:input.title,body:input.body,priority:input.priority,scope:input.scope,department:input.department};
    const saved=old?await tx.announcement.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.announcement.create({data:{companyId,createdBy:actor.id,authorName:actor.name,...data}});
    result={id:saved.id,revision:saved.revision};await event(saved.id,old?"UPDATE":"CREATE","Brouillon enregistré",{before:old,after:saved});await audit("Brouillon d’annonce enregistré",saved.id);
  }else{
    if(!old)throw new AppError("Annonce introuvable.",404);
    if(input.action==="announcement.read"){
      if(!["PUBLISHED","ARCHIVED"].includes(old.status)||!old.startsAt||old.startsAt>now)throw new AppError("Cette annonce n’est pas encore publiée.",409);
      const receipt=await tx.announcementRead.upsert({where:{companyId_announcementId_memberId:{companyId,announcementId:old.id,memberId:viewer.id}},create:{companyId,announcementId:old.id,memberId:viewer.id,memberName:viewer.characterName,department:viewer.department},update:{}});
      result={id:old.id,readAt:receipt.readAt.toISOString()};
    }else{
      let action="",reason="";let data:Prisma.AnnouncementUpdateInput={revision:{increment:1}};
      if(input.action==="announcement.publish"){
        if(old.status!=="DRAFT")throw new AppError("Seul un brouillon peut être publié.",409);
        const startsAt=input.startsAt?new Date(input.startsAt):now,expiresAt=input.expiresAt?new Date(input.expiresAt):null;
        if(startsAt<new Date(+now-5*60000)||startsAt>new Date(+now+366*86400000))throw new AppError("Choisissez une publication immédiate ou une date dans les 366 prochains jours.");
        if(expiresAt&&(expiresAt<=startsAt||expiresAt<=now))throw new AppError("L’expiration doit suivre la publication et être future.");
        if(old.scope==="DEPARTMENT"&&!await tx.companyMember.findFirst({where:{companyId,status:"ACTIVE",department:old.department!}}))throw new AppError("Le département ciblé n’a plus de membre actif.",409);
        data={...data,status:"PUBLISHED",startsAt,expiresAt,publishedAt:now,publishedBy:actor.id,publisherName:actor.name};action="PUBLISH";reason=startsAt>now?"Publication programmée autorisée":"Publication immédiate";
        if(startsAt<=now){
          const recipients=await tx.companyMember.findMany({where:{companyId,status:"ACTIVE",userId:{not:actor.id},role:{permissions:{has:"dashboard.read"}},...(old.scope==="DEPARTMENT"?{department:old.department!}:{})},select:{userId:true}});
          if(recipients.length)await notifyUsers(tx,recipients.map(r=>({userId:r.userId,title:"Nouvelle annonce interne",body:`Une annonce de ${viewer.company.name} est disponible dans Annonces internes.`,category:"ANNOUNCEMENTS",targetUrl:companyNotificationUrl(companyId,"announcements")})));
        }
      }else if(input.action==="announcement.pin"){
        if(old.status!=="PUBLISHED")throw new AppError("Seule une annonce publiée peut être épinglée.",409);
        data.pinned=input.pinned;action="PIN";reason=input.pinned?"Annonce épinglée":"Annonce désépinglée";
      }else if(input.action==="announcement.transition"){
        reason=input.reason;
        if(input.decision==="ARCHIVE"){
          if(old.status==="ARCHIVED")throw new AppError("Annonce déjà archivée.",409);
          data.status="ARCHIVED";data.pinned=false;action="ARCHIVE";
        }else if(input.decision==="RESTORE"){
          if(old.status!=="ARCHIVED")throw new AppError("Cette annonce n’est pas archivée.",409);
          data.status=old.startsAt?"PUBLISHED":"DRAFT";action="RESTORE";
        }else{
          if(old.status!=="PUBLISHED"||!old.startsAt||old.startsAt<=now)throw new AppError("Seule une publication encore future peut revenir en brouillon.",409);
          data={...data,status:"DRAFT",startsAt:null,expiresAt:null,publishedAt:null,publishedBy:null,publisherName:null,pinned:false};action="UNSCHEDULE";
        }
      }
      const saved=await tx.announcement.update({where:{id:old.id},data});result={id:saved.id,revision:saved.revision};
      await event(old.id,action,reason,{before:old,after:saved});await audit("Annonce actualisée",old.id);
    }
  }
  await tx.announcementCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,result:json(result)}});return result;
}
