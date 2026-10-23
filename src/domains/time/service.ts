import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {AppError} from "@/domains/core/errors";
import type {membership} from "@/domains/core/service";
import {effectiveTime,timeInclude} from "./calculation";
import type {TimeAction} from "./validation";
type Member=Awaited<ReturnType<typeof membership>>;
export function timeAccess(member:Member){if(!member.role.permissions.includes("time.use")||!member.company.modules.some(m=>m.key==="time"&&m.enabled))throw new AppError("Accès au pointage insuffisant ou module désactivé.",403);}
export async function executeTime(tx:Prisma.TransactionClient,companyId:string,member:Member,actor:{id:string;name:string},raw:TimeAction|{action:"time.toggle"}){
  timeAccess(member);
  const manager=member.role.permissions.includes("employees.manage");
  let input:TimeAction;
  if(raw.action==="time.toggle"){
    const current=await tx.timeEntry.findFirst({where:{companyId,memberId:member.id,end:null}});
    input=current?{action:"time.stop",entryId:current.id,revision:current.revision,requestKey:randomUUID(),reason:""}:{action:"time.start",requestKey:randomUUID()};
  }else input=raw;
  const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
  const previous=await tx.timeCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Cette clé a déjà servi pour une autre action de pointage.",409);return {id:previous.entryId,revision:previous.revision};}
  const log=(action:string,entryId:string,details:Prisma.InputJsonValue={})=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId:entryId,details}});
  let result:{id:string;revision:number};
  if(input.action==="time.start"){
    if(await tx.timeEntry.findFirst({where:{companyId,memberId:member.id,end:null}}))throw new AppError("Un service est déjà en cours.",409);
    result=await tx.timeEntry.create({data:{companyId,memberId:member.id}});await log("Prise de service",result.id);
  }else{
    const entry=await tx.timeEntry.findFirst({where:{companyId,id:input.entryId},include:timeInclude});
    if(!entry)throw new AppError("Pointage introuvable.",404);
    const own=entry.memberId===member.id;
    if(!own&&!manager)throw new AppError("Vous ne pouvez pas traiter ce pointage.",403);
    if(await tx.payrollTime.findFirst({where:{companyId,entryId:entry.id,slip:{status:{in:["APPROVED","PAID"]}}}}))throw new AppError("Ce pointage est figé par un bulletin validé ou versé. Rouvrez d’abord le bulletin non versé.",409);
    if(input.revision!==entry.revision)throw new AppError("Ce pointage a changé. Actualisez avant de continuer.",409);
    const effective=effectiveTime(entry);
    if(input.action==="time.pause"){
      if(!own)throw new AppError("Vous pouvez seulement gérer vos propres pauses.",403);
      if(entry.end)throw new AppError("Ce service est déjà terminé.");
      if(input.paused===effective.paused)throw new AppError("L’état de pause a déjà changé.",409);
      if(input.paused)await tx.timePause.create({data:{companyId,entryId:entry.id,actorId:actor.id}});
      else await tx.timePause.updateMany({where:{companyId,entryId:entry.id,end:null},data:{end:new Date()}});
      await log(input.paused?"Début de pause":"Reprise du service",entry.id);
    }else if(input.action==="time.stop"){
      if(entry.end)throw new AppError("Ce service est déjà terminé.");
      if(!own&&input.reason.length<3)throw new AppError("La clôture par un responsable nécessite un motif.");
      const end=new Date();await tx.timePause.updateMany({where:{companyId,entryId:entry.id,end:null},data:{end}});
      await tx.timeEntry.update({where:{id:entry.id},data:{end}});await log(own?"Fin de service":"Service clôturé par un responsable",entry.id,{reason:input.reason});
    }else{
      if(!manager)throw new AppError("Seul un responsable RH peut corriger ou valider des heures.",403);
      if(!entry.end)throw new AppError("Terminez le service avant de traiter ses heures.");
      if(input.action==="time.correct"){
        if(effective.status==="APPROVED")throw new AppError("Rouvrez ce pointage validé avant de le corriger.");
        const start=new Date(input.start),end=new Date(input.end),span=+end-+start;
        if(start<new Date("2000-01-01T00:00:00Z")||end>new Date()||span<=0||span>7*86400000||input.pauseMinutes*60000>span)throw new AppError("Horaires invalides : service passé de 7 jours maximum, pauses comprises dans sa durée.");
        const overlaps=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT t.id FROM "TimeEntry" t LEFT JOIN LATERAL (SELECT c.start,c."end" FROM "TimeCorrection" c WHERE c."companyId"=t."companyId" AND c."entryId"=t.id ORDER BY c.revision DESC LIMIT 1) c ON true WHERE t."companyId"=${companyId} AND t."memberId"=${entry.memberId} AND t.id<>${entry.id} AND COALESCE(c.start,t.start)<${end} AND COALESCE(c."end",t."end",NOW() AT TIME ZONE 'UTC')>${start} LIMIT 1`);
        if(overlaps.length)throw new AppError("Ces horaires chevauchent un autre service de cet employé.");
        await tx.timeCorrection.create({data:{companyId,entryId:entry.id,revision:entry.revision+1,start,end,pauseMinutes:input.pauseMinutes,reason:input.reason,actorId:actor.id}});
        await log("Pointage corrigé",entry.id,{before:{start:effective.start.toISOString(),end:effective.end!.toISOString(),pauseMinutes:effective.pauseMinutes},after:{start:input.start,end:input.end,pauseMinutes:input.pauseMinutes},reason:input.reason});
      }else if(input.action==="time.review"){
        if(own)throw new AppError("Un autre responsable doit traiter votre propre pointage.",403);
        if(effective.status!=="PENDING")throw new AppError("Cette version a déjà été traitée. Rouvrez-la avant une nouvelle décision.",409);
        await tx.timeReview.create({data:{companyId,entryId:entry.id,revision:entry.revision+1,status:input.status,reason:input.reason,actorId:actor.id,workedMinutes:effective.minutes,start:effective.start,end:effective.end!}});
        await log(input.status==="APPROVED"?"Heures validées":"Heures refusées",entry.id,{minutes:effective.minutes,reason:input.reason});
      }else{
        if(effective.status==="PENDING")throw new AppError("Ce pointage attend déjà une décision.");
        await log("Validation du pointage rouverte",entry.id,{previousStatus:effective.status,reason:input.reason});
      }
    }
    result=await tx.timeEntry.update({where:{id:entry.id},data:{revision:{increment:1}}});
  }
  await tx.timeCommand.create({data:{companyId,entryId:result.id,requestKey:input.requestKey,fingerprint,revision:result.revision}});
  return {id:result.id,revision:result.revision};
}
