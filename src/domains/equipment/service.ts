import {Prisma} from "@prisma/client";
import {AppError} from "@/domains/core/errors";
import {utilityWrite} from "@/domains/utilities/write";
import {notifyUser} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {equipmentAction} from "./validation";
export function equipmentStaff(companyId:string):Prisma.CompanyMemberWhereInput{return {companyId,status:"ACTIVE",role:{OR:[{isOwner:true},{permissions:{hasSome:["equipment.read","equipment.manage"]}}]},user:{OR:[{accessStatus:"ACTIVE"},{accessStatus:"SUSPENDED",suspendedUntil:{lte:new Date()}}]}};}
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function writeEquipment(actor:{id:string;name:string},raw:unknown){
 const input=equipmentAction.parse(raw);
 return utilityWrite(actor,"equipment","equipment.manage",input,async(tx,member)=>{
  const companyId=input.companyId;
  const old=input.itemId?await tx.equipmentItem.findFirst({where:{companyId,id:input.itemId}}):null;
  if(input.itemId&&!old)throw new AppError("Équipement introuvable.",404);
  if(old?old.revision!==input.revision:input.revision!==undefined)throw new AppError("La fiche a changé. Rouvrez-la avant de continuer.",409);
  if(old?.archived&&input.action!=="archive")throw new AppError("Restaurez la fiche avant de la modifier.",409);
  let action="",reason="",result:{id:string;revision:number};
  const blockers=(except?:string)=>tx.equipmentWork.count({where:{companyId,itemId:old!.id,status:"OPEN",blocking:true,...(except?{id:{not:except}}:{})}});
  if(input.action==="save"){
   if(old&&old.kind!==input.kind)throw new AppError("Le type d’un bien enregistré ne peut pas changer.");
   if(input.kind==="EQUIPMENT"&&(input.mileage!==null||input.registration))throw new AppError("Compteur et immatriculation sont réservés aux véhicules.");
   if(old?.mileage!==null&&old?.mileage!==undefined&&(input.mileage===null||input.mileage<old.mileage))throw new AppError("Le compteur ne peut pas diminuer ni être effacé.");
   if(await tx.equipmentItem.findFirst({where:{companyId,...(old?{id:{not:old.id}}:{}),OR:[{code:input.code},...(input.kind==="VEHICLE"&&input.registration?[{kind:"VEHICLE",registration:input.registration}]:[])]}}))throw new AppError("Ce code ou cette immatriculation existe déjà, archives comprises.",409);
   const data={code:input.code,kind:input.kind,name:input.name,registration:input.registration,serial:input.serial,location:input.location,notes:input.notes,mileage:input.mileage,acquiredOn:input.acquiredOn,nextServiceOn:input.nextServiceOn};
   result=old?await tx.equipmentItem.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.equipmentItem.create({data:{companyId,...data}});action=old?"UPDATED":"CREATED";reason=input.reason;
  }else{
   if(!old)throw new AppError("Équipement introuvable.",404);
   let data:Prisma.EquipmentItemUncheckedUpdateInput={revision:{increment:1}};
   if(input.action==="assign"){
    const target=input.memberId?await tx.companyMember.findFirst({where:{...equipmentStaff(companyId),id:input.memberId},select:{id:true,userId:true,characterName:true}}):null;
    if(input.memberId&&!target)throw new AppError("Responsable actif avec accès au module introuvable.",403);
    data.custodianId=target?.id??null;action="ASSIGNED";reason=`Responsable : ${target?.characterName??"Non affecté"} · ${input.reason}`;
    if(target&&target.id!==old.custodianId&&target.userId!==actor.id)await notifyUser(tx,{userId:target.userId,title:"Un bien RP vous est confié",body:`Consultez le registre des véhicules et équipements de ${member.company.name}.`,category:"EQUIPMENT",targetUrl:companyNotificationUrl(companyId,"equipment")});
   }else if(input.action==="state"){
    if(input.state==="READY"&&await blockers())throw new AppError("Clôturez les interventions bloquantes avant la remise en service.",409);
    data.state=input.state;action="STATE";reason=input.reason;
   }else if(input.action==="work.open"){
    const blocking=input.kind==="MAINTENANCE"||input.blocking;
    await tx.equipmentWork.create({data:{companyId,itemId:old.id,kind:input.kind,title:input.title,details:input.details,dueOn:input.dueOn,blocking,authorName:member.characterName}});
    if(blocking)data.state=input.kind==="INCIDENT"?"OUT_OF_SERVICE":old.state==="OUT_OF_SERVICE"?"OUT_OF_SERVICE":"MAINTENANCE";
    action="WORK_OPEN";reason=input.kind==="INCIDENT"?"Incident enregistré":"Entretien ouvert";
   }else if(input.action==="work.close"){
    const work=await tx.equipmentWork.findFirst({where:{id:input.workId,companyId,itemId:old.id,status:"OPEN"}});if(!work)throw new AppError("Intervention ouverte introuvable.",404);
    if(input.restoreReady&&await blockers(work.id))throw new AppError("D’autres interventions bloquent encore la remise en service.",409);
    await tx.equipmentWork.update({where:{id:work.id},data:{status:"CLOSED",resolution:input.resolution,closedBy:member.characterName,closedAt:new Date()}});
    if(input.restoreReady)data.state="READY";
    if(input.nextServiceOn!==undefined){if(work.kind!=="MAINTENANCE")throw new AppError("La prochaine révision se règle lors d’un entretien.");data.nextServiceOn=input.nextServiceOn;}
    action="WORK_CLOSED";reason="Intervention clôturée";
   }else if(input.action==="archive"){
    if(input.archived&&(old.custodianId||await tx.equipmentWork.count({where:{companyId,itemId:old.id,status:"OPEN"}})))throw new AppError("Retirez l’affectation et clôturez les interventions avant d’archiver.",409);
    data.archived=input.archived;action=input.archived?"ARCHIVED":"RESTORED";reason=input.reason;
   }
   result=await tx.equipmentItem.update({where:{id:old.id},data});
  }
  const after=await tx.equipmentItem.findUniqueOrThrow({where:{id:result.id}});
  await tx.equipmentEvent.create({data:{companyId,itemId:result.id,action,actorName:member.characterName,reason,snapshot:json({before:old,after,...(input.action==="work.open"||input.action==="work.close"?{intervention:input}: {})})}});
  await tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action:`Registre des biens : ${action}`,entityId:result.id,details:{module:"equipment"}}});
  return {id:result.id,revision:result.revision};
 });
}
