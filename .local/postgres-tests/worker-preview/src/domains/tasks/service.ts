import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import type {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {taskBuiltins} from "./constants";
import type {TaskAction} from "./validation";
type Tx=Prisma.TransactionClient;
export function taskAccess(member:Awaited<ReturnType<typeof membership>>){
  if(!member.company.modules.some(m=>m.key==="tasks"&&m.enabled))throw new AppError("Module Tâches désactivé.",403);
  if(!member.role.permissions.includes("tasks.read")&&!member.role.permissions.includes("tasks.manage"))throw new AppError("Lecture des tâches refusée.",403);
}
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function executeTask(tx:Tx,companyId:string,viewer:Awaited<ReturnType<typeof membership>>,actor:{id:string;name:string},input:TaskAction){
  taskAccess(viewer);const manage=viewer.role.permissions.includes("tasks.manage");
  const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
  if(input.requestKey){const old=await tx.taskCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});if(old){if(old.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour une autre action.",409);return old.result;}}
  const audit=(action:string,id:string)=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId:id,details:{module:"tasks"}}});
  const notify=async(userId:string|null|undefined,title:string)=>{if(!userId||userId===actor.id)return;const member=await tx.companyMember.findFirst({where:{companyId,userId,status:"ACTIVE",role:{permissions:{has:"tasks.read"}}}});if(member)await notifyUser(tx,{userId,title,body:`Une tâche de ${viewer.company.name} a été actualisée. Consultez le module Tâches.`,category:"TASKS",targetUrl:companyNotificationUrl(companyId,"tasks")});};
  const event=(taskId:string,action:string,reason:string,snapshot:unknown)=>tx.taskEvent.create({data:{companyId,taskId,actorId:actor.id,actorName:actor.name,action,reason,snapshot:json(snapshot)}});
  const checkRevision=(old:{revision:number}|null,revision:number|undefined)=>{if(old?old.revision!==revision:revision!==undefined)throw new AppError("Cet élément a changé. Actualisez avant de continuer.",409);};
  let result:{id:string;revision:number};
  if(input.action==="task.column"){
    if(!manage)throw new AppError("Gestion des tâches requise.",403);
    if(taskBuiltins.some(s=>s.name.toLocaleLowerCase("fr")===input.name.toLocaleLowerCase("fr")))throw new AppError("Ce nom est réservé à un état standard.");
    const old=input.id?await tx.taskStatus.findFirst({where:{companyId,id:input.id}}):null;if(input.id&&!old)throw new AppError("Statut introuvable.",404);checkRevision(old,input.revision);
    if(!input.archived&&await tx.taskStatus.count({where:{companyId,archived:false,...(old?{id:{not:old.id}}:{})}})>=10)throw new AppError("Dix statuts personnalisés actifs maximum.");
    if((await tx.taskStatus.findMany({where:{companyId,...(old?{id:{not:old.id}}:{})},select:{name:true}})).some(s=>s.name.normalize("NFC").toLocaleLowerCase("fr")===input.name.normalize("NFC").toLocaleLowerCase("fr")))throw new AppError("Ce statut existe déjà.",409);
    if(old&&input.archived&&await tx.task.count({where:{companyId,status:old.id,archived:false}}))throw new AppError("Déplacez les tâches actives avant d’archiver ce statut.",409);
    const data={name:input.name,position:input.position,archived:input.archived};
    result=old?await tx.taskStatus.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.taskStatus.create({data:{companyId,...data}});
    await audit("Statut de tâche enregistré",result.id);
  }else if(input.action==="task.create"){
    if(!manage)throw new AppError("Gestion des tâches requise.",403);
    const assignee=input.assigneeId?await tx.companyMember.findFirst({where:{companyId,id:input.assigneeId,status:"ACTIVE",role:{permissions:{has:"tasks.read"}}}}):null;
    if(input.assigneeId&&!assignee)throw new AppError("Employé actif avec accès aux tâches introuvable.",404);
    if(input.dueAt&&new Date(input.dueAt)<new Date("2000-01-01"))throw new AppError("Échéance invalide.");
    const task=await tx.task.create({data:{companyId,title:input.title,description:input.description,priority:input.priority,dueAt:input.dueAt?new Date(input.dueAt):null,assigneeId:assignee?.id,createdBy:actor.id,checklist:{create:input.checklist.map((title,position)=>({title,position}))}},include:{checklist:true}});
    result=task;await event(task.id,"CREATE","Tâche créée",{after:task});await audit("Tâche créée",task.id);await notify(assignee?.userId,"Une tâche vous a été assignée");
  }else{
    const old=await tx.task.findFirst({where:{companyId,id:input.taskId},include:{checklist:{orderBy:{position:"asc"}},assignee:{select:{userId:true}}}});if(!old)throw new AppError("Tâche introuvable.",404);
    const participant=old.assigneeId===viewer.id;
    if(!manage&&(!participant||["task.update","task.archive","task.toggle"].includes(input.action)))throw new AppError("Gestion des tâches ou assignation requise.",403);
    if(input.action!=="task.toggle"||input.revision!==undefined)checkRevision(old,input.revision);
    if(old.archived&&input.action!=="task.archive")throw new AppError("Restaurez la tâche avant de la modifier.",409);
    let action="",reason="",data:Prisma.TaskUncheckedUpdateInput={revision:{increment:1}};
    if(input.action==="task.update"){
      const assignee=input.assigneeId?await tx.companyMember.findFirst({where:{companyId,id:input.assigneeId,status:"ACTIVE",role:{permissions:{has:"tasks.read"}}}}):null;
      // Keeping a former assignee is allowed, assigning a new inactive member is not.
      if(input.assigneeId&&!assignee&&input.assigneeId!==old.assigneeId)throw new AppError("Employé actif avec accès aux tâches introuvable.",404);
      if(input.dueAt&&new Date(input.dueAt)<new Date("2000-01-01"))throw new AppError("Échéance invalide.");
      const ids=input.checklist.flatMap(i=>i.id?[i.id]:[]);if(new Set(ids).size!==ids.length||ids.some(id=>!old.checklist.some(i=>i.id===id)))throw new AppError("Checklist étrangère ou obsolète.",409);
      if(old.status==="DONE"&&input.checklist.some(i=>!i.id||!old.checklist.find(o=>o.id===i.id)?.done))throw new AppError("Rouvrez la tâche avant d’ajouter des étapes non terminées.",409);
      await tx.taskChecklistItem.deleteMany({where:{companyId,taskId:old.id,id:{notIn:ids}}});
      for(const [position,item] of input.checklist.entries())if(item.id)await tx.taskChecklistItem.update({where:{id:item.id},data:{title:item.title,position}});else await tx.taskChecklistItem.create({data:{companyId,taskId:old.id,title:item.title,position}});
      data={...data,title:input.title,description:input.description,priority:input.priority,dueAt:input.dueAt?new Date(input.dueAt):null,assigneeId:input.assigneeId??null};action="UPDATE";reason="Informations et checklist actualisées";
      if(input.assigneeId!==old.assigneeId)await notify(assignee?.userId,"Une tâche vous a été assignée");
    }else if(input.action==="task.status"||input.action==="task.toggle"){
      const status=input.action==="task.toggle"?(old.status==="DONE"?"TODO":"DONE"):input.status;
      if(!taskBuiltins.some(s=>s.id===status)&&!await tx.taskStatus.findFirst({where:{companyId,id:status,archived:false}}))throw new AppError("Statut actif introuvable.",404);
      if(status==="DONE"&&old.checklist.some(i=>!i.done))throw new AppError("Terminez la checklist avant de terminer la tâche.",409);
      data.status=status;action="STATUS";const name=taskBuiltins.find(s=>s.id===status)?.name??(await tx.taskStatus.findUniqueOrThrow({where:{id:status}})).name;reason=`État : ${name}`;
      if(old.status!==status)await notify(old.createdBy,status==="DONE"?"Une tâche a été terminée":"Une tâche a changé d’état");
    }else if(input.action==="task.check"){
      if(old.status==="DONE")throw new AppError("Rouvrez la tâche avant de modifier sa checklist.",409);
      const item=old.checklist.find(i=>i.id===input.itemId);if(!item)throw new AppError("Étape introuvable.",404);
      await tx.taskChecklistItem.update({where:{id:item.id},data:{done:input.done}});action="CHECK";reason=input.done?"Étape cochée":"Étape rouverte";
    }else if(input.action==="task.comment"){
      await tx.taskComment.create({data:{companyId,taskId:old.id,authorId:actor.id,authorName:actor.name,body:input.body}});action="COMMENT";reason="Commentaire ajouté";
      for(const userId of new Set([old.createdBy,old.assignee?.userId]))await notify(userId,"Nouveau commentaire sur une tâche");
    }else if(input.action==="task.archive"){
      if(!input.archived&&!taskBuiltins.some(s=>s.id===old.status)&&!await tx.taskStatus.findFirst({where:{companyId,id:old.status,archived:false}}))throw new AppError("Réactivez le statut avant de restaurer cette tâche.",409);
      data.archived=input.archived;action=input.archived?"ARCHIVE":"RESTORE";reason=input.reason;
    }
    const updated=await tx.task.update({where:{id:old.id},data,include:{checklist:{orderBy:{position:"asc"}}}});result=updated;
    await event(old.id,action,reason,{before:old,after:updated});await audit("Tâche actualisée",old.id);
  }
  const answer={id:result.id,revision:result.revision};
  if(input.requestKey)await tx.taskCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,result:answer}});
  return answer;
}
