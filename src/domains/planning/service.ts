import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import type {membership} from "@/domains/core/service";
import type {Action} from "@/domains/core/validation";
import {AppError} from "@/domains/core/errors";
import type {ScheduleAction} from "./validation";
import {recurringDates} from "./recurrence";
type Member=Awaited<ReturnType<typeof membership>>;
type Actor={id:string;name:string};
export function scheduleAccess(member:Member,module:string,permission:string){if(!member.role.permissions.includes(permission)||!member.company.modules.some(m=>m.key===module&&m.enabled))throw new AppError("Accès insuffisant ou module désactivé.",403);}
function range(start:Date,end:Date){if(start<new Date("2000-01-01T00:00:00Z")||end<=start||+end-+start>90*86400000)throw new AppError("La période doit être positive et inférieure à 90 jours.");}
export async function assertShift(tx:Prisma.TransactionClient,companyId:string,memberId:string,start:Date,end:Date,excludeId?:string){
  if(await tx.shift.count({where:{companyId,memberId,status:"SCHEDULED",...(excludeId?{id:{not:excludeId}}:{}),start:{lt:end},end:{gt:start}}}))throw new AppError("Ce service chevauche un service existant.");
  if(await tx.leaveRequest.count({where:{companyId,memberId,status:"APPROVED",start:{lt:end},end:{gt:start}}}))throw new AppError("Ce service chevauche une absence validée.");
  if(await tx.memberAvailability.count({where:{companyId,memberId,active:true,kind:"UNAVAILABLE",start:{lt:end},end:{gt:start}}}))throw new AppError("Ce service chevauche une indisponibilité déclarée.");
}
const logger=(tx:Prisma.TransactionClient,companyId:string,actor:Actor)=>(action:string,entityId:string,details:Prisma.InputJsonValue={})=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId,details}});
export async function executeSchedule(tx:Prisma.TransactionClient,companyId:string,member:Member,actor:Actor,input:ScheduleAction){
  const leave=input.action.startsWith("leave.");scheduleAccess(member,leave?"leaves":"planning",leave?(input.action==="leave.cancel"?"leaves.read":"leaves.manage"):(input.action.startsWith("availability.")?"planning.read":"planning.manage"));
  const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
  const previous=await tx.scheduleCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Cette clé a déjà servi pour une autre opération de planning.",409);return {id:previous.resultId,revision:previous.revision};}
  const log=logger(tx,companyId,actor);let result:{id:string;revision?:number};
  if(input.action==="shift.repeat"){
    const target=await tx.companyMember.findFirst({where:{companyId,id:input.memberId,status:"ACTIVE"}});if(!target)throw new AppError("Employé actif introuvable.",404);
    const dates=recurringDates(input.start,input.end,input.occurrences,input.intervalWeeks);
    for(const date of dates)await assertShift(tx,companyId,target.id,date.start,date.end);
    const series=await tx.shiftSeries.create({data:{companyId,title:input.title,actorId:actor.id}});
    await tx.shift.createMany({data:dates.map(date=>({...date,companyId,memberId:target.id,title:input.title,seriesId:series.id}))});
    await notifyUser(tx,{userId:target.userId,title:"Services récurrents planifiés",body:`${dates.length} services · ${member.company.name}`,category:"PLANNING",targetUrl:companyNotificationUrl(companyId,"planning")});
    await log("Série de services planifiée",series.id,{occurrences:dates.length,timeZone:"Europe/Paris",memberId:target.id});result=series;
  }else if(input.action==="shift.cancel"){
    const shift=await tx.shift.findFirst({where:{companyId,id:input.shiftId}});if(!shift)throw new AppError("Service introuvable.",404);
    if(shift.revision!==input.revision)throw new AppError("Ce service a changé. Actualisez.",409);
    if(shift.status!=="SCHEDULED")throw new AppError("Ce service est déjà annulé.");
    result=await tx.shift.update({where:{id:shift.id},data:{status:"CANCELLED",cancelReason:input.reason,cancelledBy:actor.id,revision:{increment:1}}});
    await log("Service annulé sans suppression",shift.id,{reason:input.reason});
  }else if(input.action==="shift.series.cancel"){
    const series=await tx.shiftSeries.findFirst({where:{companyId,id:input.seriesId}});if(!series)throw new AppError("Série introuvable.",404);
    const from=new Date(input.from);if(from<new Date())throw new AppError("Choisissez une date future pour annuler le reste d’une série.");
    const changed=await tx.shift.updateMany({where:{companyId,seriesId:series.id,status:"SCHEDULED",start:{gte:from}},data:{status:"CANCELLED",cancelReason:input.reason,cancelledBy:actor.id,revision:{increment:1}}});
    if(!changed.count)throw new AppError("Aucun service à annuler après cette date.");await log("Fin de série annulée",series.id,{count:changed.count,from:input.from,reason:input.reason});result=series;
  }else if(input.action==="availability.save"){
    if(input.memberId!==member.id&&!member.role.permissions.includes("planning.manage"))throw new AppError("Vous pouvez seulement déclarer vos disponibilités.",403);
    const target=await tx.companyMember.findFirst({where:{companyId,id:input.memberId,status:"ACTIVE"}});if(!target)throw new AppError("Employé actif introuvable.",404);
    const before=input.availabilityId?await tx.memberAvailability.findFirst({where:{companyId,id:input.availabilityId}}):null;
    if(input.availabilityId&&(!before||before.memberId!==target.id||!before.active))throw new AppError("Disponibilité active introuvable.",404);
    if(before&&before.revision!==input.revision)throw new AppError("Cette disponibilité a changé. Actualisez.",409);
    const start=new Date(input.start),end=new Date(input.end);range(start,end);
    if(await tx.memberAvailability.count({where:{companyId,memberId:target.id,active:true,...(before?{id:{not:before.id}}:{}),start:{lt:end},end:{gt:start}}}))throw new AppError("Ces disponibilités se chevauchent.");
    if(input.kind==="UNAVAILABLE"&&await tx.shift.count({where:{companyId,memberId:target.id,status:"SCHEDULED",start:{lt:end},end:{gt:start}}}))throw new AppError("Un service est déjà planifié sur cette période. Faites-le déplacer ou annuler avant de déclarer l’indisponibilité.");
    const data={start,end,kind:input.kind,notes:input.notes};result=before?await tx.memberAvailability.update({where:{id:before.id},data:{...data,revision:{increment:1}}}):await tx.memberAvailability.create({data:{...data,companyId,memberId:target.id}});
    await log("Disponibilité enregistrée",result.id,{memberId:target.id,kind:input.kind,start:input.start,end:input.end});
  }else if(input.action==="availability.cancel"){
    const before=await tx.memberAvailability.findFirst({where:{companyId,id:input.availabilityId}});if(!before)throw new AppError("Disponibilité introuvable.",404);
    if(before.memberId!==member.id&&!member.role.permissions.includes("planning.manage"))throw new AppError("Vous pouvez seulement retirer vos disponibilités.",403);
    if(!before.active||before.revision!==input.revision)throw new AppError("Cette disponibilité a changé. Actualisez.",409);
    result=await tx.memberAvailability.update({where:{id:before.id},data:{active:false,cancelReason:input.reason,revision:{increment:1}}});await log("Disponibilité retirée",before.id);
  }else if(input.action==="leave.type.save"){
    const before=input.typeId?await tx.leaveType.findFirst({where:{companyId,id:input.typeId}}):null;if(input.typeId&&!before)throw new AppError("Type d’absence introuvable.",404);
    if(!before&&await tx.leaveType.count({where:{companyId}})>=30)throw new AppError("Limite de 30 types atteinte.");
    if(await tx.leaveType.findFirst({where:{companyId,code:input.code,...(before?{id:{not:before.id}}:{})}}))throw new AppError("Ce code de type existe déjà.",409);
    const data={code:input.code,name:input.name,archived:input.archived};result=before?await tx.leaveType.update({where:{id:before.id},data}):await tx.leaveType.create({data:{companyId,...data}});await log("Type d’absence enregistré",result.id);
  }else{
    const before=await tx.leaveRequest.findFirst({where:{companyId,id:input.leaveId}});if(!before)throw new AppError("Absence introuvable.",404);
    if(before.memberId!==member.id&&!member.role.permissions.includes("leaves.manage"))throw new AppError("Cette absence est privée.",403);
    if(before.revision!==input.revision||!["PENDING","APPROVED"].includes(before.status))throw new AppError("Cette absence a déjà changé.",409);
    if(before.end<=new Date())throw new AppError("Une absence terminée ne peut pas être retirée.");
    result=await tx.leaveRequest.update({where:{id:before.id},data:{status:"CANCELLED",cancelReason:input.reason,cancelledAt:new Date(),revision:{increment:1}}});await log("Absence retirée",before.id,{previousStatus:before.status});
  }
  await tx.scheduleCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,resultId:result.id,revision:result.revision??0}});return result;
}

export async function executeLeave(tx:Prisma.TransactionClient,companyId:string,member:Member,actor:Actor,input:Extract<Action,{action:"leave.create"|"leave.decide"}>){
  scheduleAccess(member,"leaves",input.action==="leave.create"?"leaves.read":"leaves.manage");const log=logger(tx,companyId,actor);
  const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
  if(input.requestKey){const previous=await tx.scheduleCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Cette clé a déjà servi pour une autre absence.",409);return {id:previous.resultId,revision:previous.revision};}}
  let result;
  if(input.action==="leave.create"){
    const start=new Date(input.start),end=new Date(input.end);range(start,end);
    if(await tx.leaveRequest.count({where:{companyId,memberId:member.id,status:{in:["PENDING","APPROVED"]},start:{lt:end},end:{gt:start}}}))throw new AppError("Une demande d’absence chevauche déjà cette période.");
    const type=input.typeId?await tx.leaveType.findFirst({where:{companyId,id:input.typeId,archived:false}}):null;if(input.typeId&&!type)throw new AppError("Type d’absence actif introuvable.");
    result=await tx.leaveRequest.create({data:{companyId,memberId:member.id,start,end,reason:input.reason,typeId:type?.id,typeName:type?.name}});await log("Absence demandée",result.id);
  }else{
    const leave=await tx.leaveRequest.findFirst({where:{companyId,id:input.leaveId},include:{member:{select:{userId:true}}}});if(!leave)throw new AppError("Demande introuvable.",404);
    if(leave.memberId===member.id)throw new AppError("Un autre responsable doit traiter votre demande.",403);
    if(leave.status!=="PENDING")throw new AppError("Demande déjà traitée.",409);
    if(input.revision!==undefined&&input.revision!==leave.revision)throw new AppError("Cette demande a changé. Actualisez.",409);
    if(input.approve){
      if(await tx.leaveRequest.count({where:{companyId,memberId:leave.memberId,id:{not:leave.id},status:"APPROVED",start:{lt:leave.end},end:{gt:leave.start}}}))throw new AppError("Une absence validée chevauche déjà cette période.");
      const conflicts=await tx.shift.count({where:{companyId,memberId:leave.memberId,status:"SCHEDULED",start:{lt:leave.end},end:{gt:leave.start}}});
      if(conflicts){
        if(!input.cancelConflictingShifts)throw new AppError(`${conflicts} service(s) planifié(s) chevauchent cette absence. Confirmez leur annulation ou faites modifier le planning.`,409);
        scheduleAccess(member,"planning","planning.manage");
        await tx.shift.updateMany({where:{companyId,memberId:leave.memberId,status:"SCHEDULED",start:{lt:leave.end},end:{gt:leave.start}},data:{status:"CANCELLED",cancelReason:"Absence validée",cancelledBy:actor.id,revision:{increment:1}}});
        await log("Services annulés pour absence validée",leave.id,{count:conflicts});
      }
    }
    result=await tx.leaveRequest.update({where:{id:leave.id},data:{status:input.approve?"APPROVED":"DECLINED",decisionReason:input.reason,decidedBy:actor.id,decidedAt:new Date(),revision:{increment:1}}});
    await notifyUser(tx,{userId:leave.member.userId,title:input.approve?"Absence acceptée":"Absence refusée",body:input.reason,category:"LEAVES",targetUrl:companyNotificationUrl(companyId,"leaves")});await log("Demande d’absence traitée",leave.id,{status:result.status});
  }
  if(input.requestKey)await tx.scheduleCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,resultId:result.id,revision:result.revision}});return result;
}
