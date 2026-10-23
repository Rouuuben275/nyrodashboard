import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import type {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {criterionSchema,goalSchema,type Criterion,type Goal,type PeopleAction} from "./validation";
import {peopleKinds} from "./constants";
type Tx=Prisma.TransactionClient;
export type PeopleMember=Awaited<ReturnType<typeof membership>>;
export function peopleAccess(member:PeopleMember,kind:"REVIEW"|"SANCTION"){
  if(!member.company.modules.some(m=>m.key===peopleKinds[kind].module&&m.enabled)||!member.company.modules.some(m=>m.key==="employees"&&m.enabled))throw new AppError("Module RH désactivé.",403);
  if(!member.role.permissions.includes("employees.read")&&!member.role.permissions.includes("employees.manage"))throw new AppError("Accès au dossier RH refusé.",403);
}
export const criteria=(value:Prisma.JsonValue)=>criterionSchema.array().max(12).parse(value);
export const goals=(value:Prisma.JsonValue)=>goalSchema.array().max(10).parse(value);
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function assessmentScore(cards:Criterion[]){
  if(!cards.length||cards.some(c=>c.score===null))return null;
  const weights=cards.reduce((sum,c)=>sum+c.weight,0),weighted=cards.reduce((sum,c)=>sum+c.weight*c.score!,0);
  return Math.round(weighted*10000/(weights*5));
}
function checkRevision(current:{revision:number}|null,revision:number|undefined){if(current?current.revision!==revision:revision!==undefined)throw new AppError("Cet élément a changé. Actualisez avant de continuer.",409);}
function dateRange(from:string,to:string){if(from<"2000-01-01"||to<from||+new Date(to)-+new Date(from)>366*86400000)throw new AppError("Campagne : période positive de 367 jours maximum, à partir de 2000.");}
const parisDay=(d:Date)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris"}).format(d);
export async function executePeople(tx:Tx,companyId:string,viewer:PeopleMember,actor:{id:string;name:string},input:PeopleAction){
  peopleAccess(viewer,input.kind);
  const manage=viewer.role.permissions.includes("employees.manage");
  if(input.action!=="hr.record.ack"&&!manage)throw new AppError("Gestion RH requise.",403);
  const fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
  const previous=await tx.hrCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour une autre action RH.",409);return previous.result;}
  const audit=(action:string,id:string)=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId:id,details:{module:peopleKinds[input.kind].module}}});
  const event=(recordId:string,action:string,reason:string,snapshot:unknown)=>tx.hrRecordEvent.create({data:{companyId,recordId,action,reason,actorId:actor.id,actorName:actor.name,snapshot:json(snapshot)}});
  let result:{id:string;revision:number};
  if(input.action==="hr.template.save"){
    const old=input.id?await tx.hrTemplate.findFirst({where:{companyId,id:input.id,kind:input.kind}}):null;
    if(input.id&&!old)throw new AppError("Modèle introuvable.",404);checkRevision(old,input.revision);
    if(input.kind==="REVIEW"&&!input.criteria.length)throw new AppError("Ajoutez au moins un critère d’évaluation.");
    if(input.kind==="SANCTION"&&input.criteria.length)throw new AppError("Un type de sanction ne contient pas de notation.");
    if(new Set(input.criteria.map(c=>c.label.toLocaleLowerCase("fr"))).size!==input.criteria.length)throw new AppError("Les libellés des critères doivent être distincts.");
    const cards:Criterion[]=input.criteria.map(c=>({...c,key:randomUUID(),score:null,comment:""}));
    const data={name:input.name,instructions:input.instructions,criteria:json(cards),archived:input.archived};
    result=old?await tx.hrTemplate.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.hrTemplate.create({data:{companyId,kind:input.kind,...data}});
    await audit("Modèle RH enregistré",result.id);
  }else if(input.action==="hr.campaign.save"){
    dateRange(input.from,input.to);
    const old=input.id?await tx.hrCampaign.findFirst({where:{companyId,id:input.id},include:{_count:{select:{records:true}}}}):null;
    if(input.id&&!old)throw new AppError("Campagne introuvable.",404);checkRevision(old,input.revision);
    if(old&&old.templateId!==input.templateId)throw new AppError("Le modèle d’une campagne ne peut pas changer.");
    if(old?._count.records&&(old.from.toISOString().slice(0,10)!==input.from||old.to.toISOString().slice(0,10)!==input.to))throw new AppError("Les dates sont figées dès qu’un dossier utilise la campagne.");
    const template=await tx.hrTemplate.findFirst({where:{companyId,id:input.templateId,kind:"REVIEW"}});
    if(!template||template.archived&&!old)throw new AppError("Modèle d’évaluation actif introuvable.",404);
    const data={name:input.name,from:new Date(input.from),to:new Date(input.to),status:input.status};
    // An existing campaign keeps its original criteria even if its template changes later.
    result=old?await tx.hrCampaign.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.hrCampaign.create({data:{companyId,templateId:template.id,templateName:template.name,criteria:template.criteria as Prisma.InputJsonValue,createdBy:actor.id,...data}});
    await audit("Campagne d’évaluation enregistrée",result.id);
  }else if(input.action==="hr.record.save"){
    const old=input.id?await tx.hrRecord.findFirst({where:{companyId,id:input.id,kind:input.kind}}):null;
    if(input.id&&!old)throw new AppError("Dossier introuvable.",404);checkRevision(old,input.revision);
    if(old&&old.status!=="DRAFT")throw new AppError("Seul un brouillon peut être modifié. Révoquez une décision publiée pour conserver son original.");
    if(old&&(old.memberId!==input.memberId||old.campaignId!==(input.campaignId??null)))throw new AppError("L’employé et la campagne du dossier ne peuvent pas changer.");
    const person=await tx.companyMember.findFirst({where:{companyId,id:input.memberId}});if(!person)throw new AppError("Employé introuvable.",404);
    let baseCards:Criterion[]=[],templateName=old?.templateName??"";
    const campaignId=old?.campaignId??input.campaignId??null;
    if(input.kind==="SANCTION"&&campaignId)throw new AppError("Une sanction ne relève pas d’une campagne d’évaluation.");
    if(campaignId){
      const campaign=await tx.hrCampaign.findFirst({where:{companyId,id:campaignId,status:"OPEN"}});if(!campaign)throw new AppError("Campagne ouverte introuvable.",404);
      if(!old&&await tx.hrRecord.findUnique({where:{companyId_campaignId_memberId:{companyId,campaignId,memberId:person.id}}}))throw new AppError("Cet employé dispose déjà d’un dossier dans cette campagne.",409);
      const date=parisDay(new Date(input.occurredAt));if(date<campaign.from.toISOString().slice(0,10)||date>campaign.to.toISOString().slice(0,10))throw new AppError("La date de l’entretien doit appartenir à la campagne (heure de Paris).");
      baseCards=criteria(campaign.criteria);templateName=campaign.templateName;
    }else if(!old){
      const template=input.templateId?await tx.hrTemplate.findFirst({where:{companyId,id:input.templateId,kind:input.kind,archived:false}}):null;
      if(!template)throw new AppError("Choisissez un modèle ou type actif de cette entreprise.");
      baseCards=criteria(template.criteria);templateName=template.name;
    }
    if(old)baseCards=criteria(old.criteria);
    if(input.kind==="SANCTION"&&(input.scores.length||input.goals.length))throw new AppError("Une sanction ne contient ni notation ni objectif d’évaluation.");
    if(input.scores.length!==baseCards.length||new Set(input.scores.map(s=>s.key)).size!==input.scores.length||input.scores.some(s=>!baseCards.some(c=>c.key===s.key)))throw new AppError("Les critères ont changé ou ne correspondent pas au modèle. Rechargez le formulaire.",409);
    const cards=baseCards.map(c=>({...c,...input.scores.find(s=>s.key===c.key)!}));
    const oldGoals=old?goals(old.goals):[];
    if(input.goals.some(g=>g.key&&!oldGoals.some(o=>o.key===g.key))||new Set(input.goals.filter(g=>g.key).map(g=>g.key)).size!==input.goals.filter(g=>g.key).length)throw new AppError("Objectifs invalides.");
    const targets:Goal[]=input.goals.map(g=>({key:g.key??randomUUID(),title:g.title,due:g.due,status:"OPEN",note:""}));
    if(new Date(input.occurredAt)<new Date("2000-01-01"))throw new AppError("Date du dossier invalide.");
    const data={title:input.title,occurredAt:new Date(input.occurredAt),content:input.content,conclusion:input.conclusion,privateNote:input.privateNote,criteria:json(cards),goals:json(targets),scoreBps:assessmentScore(cards)};
    const saved=old?await tx.hrRecord.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.hrRecord.create({data:{...data,companyId,kind:input.kind,memberId:person.id,employeeName:person.characterName,department:person.department,templateName,campaignId,createdBy:actor.id}});
    await event(saved.id,old?"UPDATE":"CREATE","Brouillon RH enregistré",{before:old,after:saved});result=saved;await audit("Dossier RH enregistré",saved.id);
  }else{
    const record=await tx.hrRecord.findFirst({where:{companyId,id:input.id,kind:input.kind},include:{campaign:true}});
    if(!record||!manage&&(record.memberId!==viewer.id||!record.publishedAt))throw new AppError("Dossier introuvable.",404);
    checkRevision(record,input.revision);
    let data:Prisma.HrRecordUpdateInput={},action="",reason="";
    if(input.action==="hr.record.ack"){
      if(record.memberId!==viewer.id)throw new AppError("Seul l’employé concerné peut accuser réception.",403);
      if(record.status!=="PUBLISHED"||record.acknowledgedAt)throw new AppError("Ce dossier ne peut plus recevoir d’accusé de lecture.",409);
      data={acknowledgedAt:new Date(),employeeComment:input.comment};action="ACK";reason=input.comment||"Dossier lu par l’employé";
    }else if(input.action==="hr.record.note"){
      data={privateNote:input.note};action="NOTE";reason="Note RH privée mise à jour";
    }else if(input.action==="hr.goal"){
      if(!["PUBLISHED","ARCHIVED"].includes(record.status))throw new AppError("Publiez l’évaluation avant de suivre ses objectifs.");
      const targets=goals(record.goals);if(!targets.some(g=>g.key===input.goalKey))throw new AppError("Objectif introuvable.",404);
      data={goals:json(targets.map(g=>g.key===input.goalKey?{...g,status:input.status,note:input.note}:g))};action="GOAL";reason=input.note;
    }else{
      reason=input.reason;action=input.decision;
      if(input.decision==="PUBLISH"){
        if(record.status!=="DRAFT")throw new AppError("Seul un brouillon peut être publié.",409);
        if(record.memberId===viewer.id)throw new AppError("Un autre responsable doit publier votre propre dossier.",403);
        if(record.occurredAt>new Date())throw new AppError("Une décision ou un entretien futur ne peut pas être publié.");
        if(record.content.length<3||record.conclusion.length<3)throw new AppError("Renseignez les faits/commentaires et la conclusion/décision avant publication.");
        if(record.kind==="REVIEW"&&assessmentScore(criteria(record.criteria))===null)throw new AppError("Notez chaque critère avant publication.");
        if(record.campaign&&record.campaign.status!=="OPEN")throw new AppError("La campagne est fermée.");
        data={status:"PUBLISHED",publishedAt:new Date(),publishedBy:actor.id};
      }else if(input.decision==="ARCHIVE"){
        if(!["DRAFT","PUBLISHED"].includes(record.status))throw new AppError("Ce dossier ne peut pas être archivé.",409);
        data={status:"ARCHIVED"};
      }else{
        if(!record.publishedAt||record.status==="REVOKED")throw new AppError("Seul un dossier publié peut être révoqué.",409);
        data={status:"REVOKED"};
      }
    }
    const saved=await tx.hrRecord.update({where:{id:record.id},data:{...data,revision:{increment:1}}});
    await event(record.id,action,reason,{before:record,after:saved});result=saved;
    // Neither decisions nor their private text are copied into public audit/career feeds.
    await audit("Dossier RH mis à jour",record.id);
    if(action==="PUBLISH"){
      const target=await tx.companyMember.findUniqueOrThrow({where:{id:record.memberId},select:{userId:true}});
      await notifyUser(tx,{userId:target.userId,title:"Dossier RH mis à jour",body:`Un document ${peopleKinds[record.kind as keyof typeof peopleKinds].singular.toLocaleLowerCase("fr")} est consultable dans votre espace RH.`,category:"HR",targetUrl:companyNotificationUrl(companyId,record.kind==="REVIEW"?"reviews":"sanctions")});
    }
  }
  const response={id:result.id,revision:result.revision};await tx.hrCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,result:response}});return response;
}
