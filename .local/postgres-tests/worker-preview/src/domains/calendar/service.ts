import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import type {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {recurringDates} from "@/domains/planning/recurrence";
import type {CalendarAction} from "./validation";
type Tx=Prisma.TransactionClient;
type Member=Awaited<ReturnType<typeof membership>>;
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function calendarAccess(member:Member){
  if(!member.company.modules.some(m=>m.key==="calendar"&&m.enabled))throw new AppError("Module Calendrier désactivé.",403);
  if(!member.role.permissions.includes("dashboard.read"))throw new AppError("Lecture du calendrier refusée.",403);
}
export function calendarVisibility(viewer:Member,manage:boolean):Prisma.CalendarEventWhereInput{return {companyId:viewer.companyId,...(manage?{}:{OR:[{visibility:"ALL"},{invites:{some:{memberId:viewer.id,active:true}}}]})};}
export async function executeCalendar(tx:Tx,companyId:string,viewer:Member,actor:{id:string;name:string},input:CalendarAction){
  calendarAccess(viewer);const manage=viewer.role.permissions.includes("company.manage"),now=new Date();
  if(input.action!=="calendar.reply"&&!manage)throw new AppError("Administration de l’entreprise requise pour gérer le calendrier.",403);
  const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
  const previous=await tx.calendarCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour une autre action du calendrier.",409);return previous.result;}
  const audit=(action:string,id:string)=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId:id,details:{module:"calendar"}}});
  const history=(eventId:string,action:string,reason:string,snapshot:unknown)=>tx.calendarHistory.create({data:{companyId,eventId,actorId:actor.id,actorName:actor.name,action,reason,snapshot:json(snapshot)}});
  const notify=async(memberIds:string[],title:string)=>{
    const people=await tx.companyMember.findMany({where:{companyId,id:{in:memberIds},status:"ACTIVE",userId:{not:actor.id},role:{permissions:{has:"dashboard.read"}}},select:{userId:true}});
    if(people.length)await notifyUsers(tx,people.map(p=>({userId:p.userId,title,body:`Le calendrier de ${viewer.company.name} a été actualisé. Consultez les événements autorisés.`,category:"CALENDAR",targetUrl:companyNotificationUrl(companyId,"calendar")})));
  };
  const validateMembers=async(ids:string[],retained:string[]=[])=>{
    if(new Set(ids).size!==ids.length)throw new AppError("Les invités doivent être distincts.");
    const people=await tx.companyMember.findMany({where:{companyId,id:{in:ids},OR:[{status:"ACTIVE",role:{permissions:{has:"dashboard.read"}}},{id:{in:retained}}]},select:{id:true,characterName:true}});
    if(people.length!==ids.length)throw new AppError("Invité actif avec accès au calendrier introuvable dans cette entreprise.",404);return people;
  };
  let result:{id:string;revision:number;seriesId?:string|null;count?:number};
  if(input.action==="calendar.create"){
    if(input.visibility==="INVITEES"&&!input.memberIds.length)throw new AppError("Ajoutez au moins un invité pour un événement privé.");
    if(input.memberIds.length*input.occurrences>500)throw new AppError("Une série ne peut pas dépasser 500 invitations. Réduisez les invités ou les occurrences.");
    const dates=recurringDates(input.start,input.end,input.occurrences,input.intervalWeeks),people=await validateMembers(input.memberIds);
    if(dates.some(d=>+d.end-+d.start>86400000||d.end<=d.start))throw new AppError("Une occurrence dépasse 24 heures lors du changement d’heure de Paris.");
    const series=input.occurrences>1?await tx.calendarSeries.create({data:{companyId,occurrences:input.occurrences,intervalWeeks:input.intervalWeeks,createdBy:actor.id}}):null;
    const events=dates.map(range=>({id:randomUUID(),companyId,seriesId:series?.id??null,title:input.title,description:input.description,location:input.location,kind:input.kind,visibility:input.visibility,...range,createdBy:actor.id}));
    await tx.calendarEvent.createMany({data:events});
    if(people.length)await tx.calendarInvite.createMany({data:events.flatMap(e=>people.map(p=>({companyId,eventId:e.id,memberId:p.id,memberName:p.characterName})))});
    await tx.calendarHistory.createMany({data:events.map(event=>({companyId,eventId:event.id,actorId:actor.id,actorName:actor.name,action:"CREATE",reason:series?"Événement récurrent créé, horaires de Paris":"Événement créé",snapshot:json({after:event,memberIds:input.memberIds})}))});
    await audit("Événement de calendrier créé",events[0].id);await notify(input.memberIds,series?"Invitation à une série d’événements":"Nouvelle invitation au calendrier");
    result={id:events[0].id,revision:0,seriesId:series?.id??null,count:events.length};
  }else{
    const old=await tx.calendarEvent.findFirst({where:{AND:[calendarVisibility(viewer,manage),{id:input.id}]},include:{invites:true,series:true}});if(!old)throw new AppError("Événement introuvable.",404);
    if(old.revision!==input.revision)throw new AppError("Cet événement a changé. Actualisez avant de continuer.",409);
    if(old.status!=="SCHEDULED")throw new AppError("Cet événement est annulé et reste conservé.",409);
    if(input.action==="calendar.update"){
      const [dates]=recurringDates(input.start,input.end,1,1),changed=+old.start!==+dates.start||+old.end!==+dates.end;
      if(changed&&old.start<=now)throw new AppError("Un événement commencé ne peut plus être déplacé. Conservez son historique et créez-en un nouveau.",409);
      if(input.visibility==="INVITEES"&&!input.memberIds.length)throw new AppError("Ajoutez au moins un invité pour un événement privé.");
      const people=await validateMembers(input.memberIds,old.invites.filter(i=>i.active).map(i=>i.memberId));
      if(old.invites.some(i=>i.active&&!input.memberIds.includes(i.memberId)&&i.attendance!=="UNKNOWN"))throw new AppError("Une participation constatée ne peut pas être retirée.",409);
      await tx.calendarInvite.updateMany({where:{companyId,eventId:old.id,active:true,memberId:{notIn:input.memberIds}},data:{active:false,revision:{increment:1}}});
      for(const person of people){const existing=old.invites.find(i=>i.memberId===person.id);const reset=changed||!existing?.active;
        if(existing)await tx.calendarInvite.update({where:{id:existing.id},data:{active:true,...(reset?{response:"PENDING",responseNote:"",respondedAt:null,revision:{increment:1}}:{})}});
        else await tx.calendarInvite.create({data:{companyId,eventId:old.id,memberId:person.id,memberName:person.characterName}});
      }
      const saved=await tx.calendarEvent.update({where:{id:old.id},data:{title:input.title,description:input.description,location:input.location,kind:input.kind,visibility:input.visibility,...dates,revision:{increment:1}},include:{invites:true}});
      await history(old.id,"UPDATE",changed?"Horaires modifiés, réponses à reconfirmer":"Événement et invités actualisés",{before:old,after:saved});await audit("Événement de calendrier actualisé",old.id);
      await notify([...new Set([...input.memberIds,...old.invites.filter(i=>i.active).map(i=>i.memberId)])],"Événement du calendrier modifié");result={id:saved.id,revision:saved.revision};
    }else if(input.action==="calendar.cancel"){
      if(input.series){if(!old.series||old.series.revision!==input.seriesRevision)throw new AppError("Cette série a changé ou est introuvable.",409);await tx.calendarSeries.update({where:{id:old.series.id},data:{revision:{increment:1}}});}
      const targets=input.series?await tx.calendarEvent.findMany({where:{companyId,seriesId:old.seriesId,start:{gte:old.start},status:"SCHEDULED"},include:{invites:true}}):[old];
      for(const target of targets){await tx.calendarEvent.update({where:{id:target.id},data:{status:"CANCELLED",revision:{increment:1}}});await history(target.id,"CANCEL",input.reason,{before:target,after:{status:"CANCELLED"}});}
      await audit(input.series?"Suite de série du calendrier annulée":"Événement du calendrier annulé",old.id);await notify([...new Set(targets.flatMap(t=>t.invites.filter(i=>i.active).map(i=>i.memberId)))],"Annulation dans le calendrier");result={id:old.id,revision:old.revision+1,count:targets.length};
    }else{
      const invite=old.invites.find(i=>i.active&&(input.action==="calendar.reply"?i.memberId===viewer.id:i.id===input.inviteId));
      if(!invite)throw new AppError("Invitation personnelle active introuvable.",404);if(invite.revision!==input.inviteRevision)throw new AppError("Cette invitation a changé. Actualisez avant de répondre.",409);
      if(input.action==="calendar.reply"){
        if(old.start<=now)throw new AppError("Les réponses sont closes après le début de l’événement.",409);
        const saved=await tx.calendarInvite.update({where:{id:invite.id},data:{response:input.response,responseNote:input.note,respondedAt:now,revision:{increment:1}}});
        await history(old.id,"REPLY","Réponse à une invitation",{before:invite,after:saved});
        const creator=await tx.companyMember.findFirst({where:{companyId,userId:old.createdBy,status:"ACTIVE",role:{permissions:{has:"company.manage"}}}});if(creator)await notify([creator.id],"Réponse à une invitation du calendrier");
      }else{
        if(old.end>now)throw new AppError("La participation se constate après la fin de l’événement.",409);
        const saved=await tx.calendarInvite.update({where:{id:invite.id},data:{attendance:input.attendance,attendanceNote:input.note,attendanceAt:now,revision:{increment:1}}});await history(old.id,"ATTENDANCE",input.note,{before:invite,after:saved});await audit("Participation au calendrier enregistrée",old.id);
      }
      result={id:old.id,revision:old.revision};
    }
  }
  await tx.calendarCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,result:json(result)}});return result;
}
