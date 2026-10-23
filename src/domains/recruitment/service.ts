import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import type {membership} from "@/domains/core/service";
import {readLimits} from "@/domains/core/limits";
import {AppError} from "@/domains/core/errors";
import type {RecruitmentAction,CandidateAction} from "./validation";
import {activeCompanyWhere} from "@/domains/platform/access";
import {assertServerCapacity} from "@/domains/servers/capacity";
type Member=Awaited<ReturnType<typeof membership>>;
type Actor={id:string;name:string;email:string};
export const recruitingCompany=():Prisma.CompanyWhereInput=>({AND:[activeCompanyWhere(),{modules:{some:{key:"recruitment",enabled:true}}},{modules:{some:{key:"employees",enabled:true}}}]});
export function recruitmentAccess(member:Member){if(!member.role.permissions.includes("employees.manage")||!["recruitment","employees"].every(key=>member.company.modules.some(m=>m.key===key&&m.enabled)))throw new AppError("Recrutement inaccessible ou module désactivé.",403);}
function fingerprint(actor:Actor,input:unknown){return createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");}
async function replay(tx:Prisma.TransactionClient,companyId:string,requestKey:string,hash:string){const previous=await tx.recruitmentCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey}}});if(previous&&previous.fingerprint!==hash)throw new AppError("Cette clé a déjà servi pour une autre action de recrutement.",409);return previous?{id:previous.resultId,revision:previous.revision}:null;}
async function remember(tx:Prisma.TransactionClient,companyId:string,requestKey:string,hash:string,result:{id:string;revision:number}){await tx.recruitmentCommand.create({data:{companyId,requestKey,fingerprint:hash,resultId:result.id,revision:result.revision}});return {id:result.id,revision:result.revision};}
function audit(tx:Prisma.TransactionClient,companyId:string,actor:Actor,action:string,entityId:string,details:Prisma.InputJsonValue={}){return tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId,details}});}
async function grantableRole(tx:Prisma.TransactionClient,companyId:string,roleId:string,permissions:string[]){const role=await tx.companyRole.findFirst({where:{id:roleId,companyId,isOwner:false}});if(!role)throw new AppError("Grade d’embauche invalide. La direction ne peut pas être attribuée ici.");if(role.permissions.some(p=>!permissions.includes(p)))throw new AppError("Vous ne pouvez pas déléguer des permissions que vous ne possédez pas.",403);return role;}
export async function executeRecruitment(tx:Prisma.TransactionClient,companyId:string,member:Member,actor:Actor,input:RecruitmentAction){
  recruitmentAccess(member);const hash=fingerprint(actor,input),previous=await replay(tx,companyId,input.requestKey,hash);if(previous)return previous;
  if(input.action==="recruitment.job.save"){
    const before=input.jobId?await tx.recruitmentJob.findFirst({where:{companyId,id:input.jobId}}):null;if(input.jobId&&!before)throw new AppError("Offre introuvable.",404);
    if(before&&before.revision!==input.revision)throw new AppError("Cette offre a changé. Actualisez.",409);
    if(!before&&await tx.recruitmentJob.count({where:{companyId}})>=100)throw new AppError("Limite de 100 offres atteinte.");
    if(before&&before.status!=="DRAFT"&&input.status==="DRAFT")throw new AppError("Une offre déjà publiée peut être fermée, pas remise en brouillon.");
    const hired=before?await tx.jobApplication.count({where:{companyId,jobId:before.id,status:"HIRED"}}):0;
    if(hired>input.positions)throw new AppError("Le nombre de postes ne peut pas être inférieur aux embauches déjà acceptées.");
    if(input.status==="PUBLISHED"&&hired>=input.positions)throw new AppError("Ajoutez des postes disponibles avant de republier cette offre.");
    const data={title:input.title,description:input.description,requirements:input.requirements,location:input.location,contractType:input.contractType,positions:input.positions,status:input.status};
    const result=before?await tx.recruitmentJob.update({where:{id:before.id},data:{...data,revision:{increment:1}}}):await tx.recruitmentJob.create({data:{companyId,...data}});
    await audit(tx,companyId,actor,input.status==="PUBLISHED"?"Offre de recrutement publiée":"Offre de recrutement enregistrée",result.id,{status:result.status});return remember(tx,companyId,input.requestKey,hash,result);
  }
  const app=await tx.jobApplication.findFirst({where:{companyId,id:input.applicationId}});if(!app)throw new AppError("Candidature introuvable.",404);
  if(input.action!=="recruitment.note"&&app.revision!==input.revision)throw new AppError("Cette candidature a changé. Actualisez.",409);
  if(input.action==="recruitment.note"){
    await tx.recruitmentEvent.create({data:{companyId,applicationId:app.id,kind:"NOTE",content:input.content,actorId:actor.id,actorName:actor.name}});
    await audit(tx,companyId,actor,"Note interne de recrutement ajoutée",app.id);return remember(tx,companyId,input.requestKey,hash,app);
  }
  if(["HIRED","REJECTED","WITHDRAWN"].includes(app.status))throw new AppError("Cette candidature est déjà terminée.");
  let result;
  if(input.action==="recruitment.stage"){
    if(app.status==="OFFERED"&&input.status!=="REJECTED")throw new AppError("Une proposition attend la réponse du candidat. Modifiez-la ou refusez la candidature.");
    const interviewAt=input.status==="INTERVIEW"&&input.interviewAt?new Date(input.interviewAt):null;
    if(input.status==="INTERVIEW"&&(!interviewAt||interviewAt<=new Date()))throw new AppError("Choisissez une date future pour l’entretien.");
    result=await tx.jobApplication.update({where:{id:app.id},data:{status:input.status,decisionReason:input.reason,...(input.status==="INTERVIEW"?{interviewAt,interviewDetails:input.interviewDetails}:{}),revision:{increment:1}}});
    await tx.recruitmentEvent.create({data:{companyId,applicationId:app.id,kind:input.status,content:input.reason,visibleToCandidate:true,actorId:actor.id,actorName:actor.name,details:interviewAt?{interviewAt:interviewAt.toISOString(),instructions:input.interviewDetails}:{}}});
  }else{
    if(!await tx.recruitmentJob.findFirst({where:{id:app.jobId,companyId,status:"PUBLISHED"}}))throw new AppError("Rouvrez l’offre avant de proposer une embauche.");
    const role=await grantableRole(tx,companyId,input.roleId,member.role.permissions);
    result=await tx.jobApplication.update({where:{id:app.id},data:{status:"OFFERED",offeredRoleId:role.id,offeredRoleName:role.name,offeredDepartment:input.department,offeredSalary:input.salary,offeredBy:actor.id,revision:{increment:1}}});
    await tx.recruitmentEvent.create({data:{companyId,applicationId:app.id,kind:"OFFERED",content:input.message,visibleToCandidate:true,actorId:actor.id,actorName:actor.name,details:{grade:role.name,department:input.department,salary:input.salary}}});
  }
  await notifyUser(tx,{userId:app.userId,title:"Votre candidature RP a évolué",body:`${app.jobTitle} · Consultez Mes candidatures pour le détail.`,category:"RECRUITMENT",targetUrl:"/candidatures"});
  await audit(tx,companyId,actor,"Candidature de recrutement mise à jour",app.id,{status:result.status});return remember(tx,companyId,input.requestKey,hash,result);
}

export async function executeCandidate(tx:Prisma.TransactionClient,actor:Actor,input:CandidateAction){
  const initial=input.action==="recruitment.apply"?await tx.recruitmentJob.findUnique({where:{id:input.jobId},select:{companyId:true}}):await tx.jobApplication.findFirst({where:{id:input.applicationId,userId:actor.id},select:{companyId:true}});
  if(!initial)throw new AppError("Offre ou candidature introuvable.",404);
  const companyId=initial.companyId;await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))::text`;
  const company=await tx.company.findFirst({where:{id:companyId,...recruitingCompany()},include:{subscription:{select:{plan:{select:{limits:true}}}}}});if(!company)throw new AppError("Le recrutement de cette entreprise est désactivé ou son accès est suspendu.",403);
  const hash=fingerprint(actor,input),previous=await replay(tx,companyId,input.requestKey,hash);if(previous)return previous;
  let result;
  if(input.action==="recruitment.apply"){
    const job=await tx.recruitmentJob.findFirst({where:{id:input.jobId,companyId,status:"PUBLISHED"}});if(!job)throw new AppError("Cette offre n’accepte plus de candidatures.");
    if(await tx.companyMember.findUnique({where:{companyId_userId:{companyId,userId:actor.id}}}))throw new AppError("Vous avez déjà un lien avec cette entreprise. Adressez-vous à sa direction.");
    if(await tx.jobApplication.findUnique({where:{jobId_userId:{jobId:job.id,userId:actor.id}}}))throw new AppError("Vous avez déjà candidaté à cette offre. Consultez Mes candidatures.",409);
    if(await tx.jobApplication.count({where:{companyId,jobId:job.id,status:"HIRED"}})>=job.positions)throw new AppError("Tous les postes de cette offre sont pourvus.");
    const day=new Date();day.setUTCHours(0,0,0,0);if(await tx.jobApplication.count({where:{userId:actor.id,createdAt:{gte:day}}})>=10)throw new AppError("Limite de 10 candidatures par jour atteinte.",429);
    result=await tx.jobApplication.create({data:{companyId,jobId:job.id,userId:actor.id,jobTitle:job.title,characterName:input.characterName,phone:input.phone,motivation:input.motivation,availability:input.availability}});
    await tx.recruitmentEvent.create({data:{companyId,applicationId:result.id,kind:"SUBMITTED",content:"Candidature déposée.",visibleToCandidate:true,actorId:actor.id,actorName:actor.name}});
    await audit(tx,companyId,actor,"Candidature reçue",result.id);
  }else{
    const app=await tx.jobApplication.findFirst({where:{companyId,id:input.applicationId,userId:actor.id}});if(!app)throw new AppError("Candidature introuvable.",404);
    if(app.revision!==input.revision)throw new AppError("Cette candidature a changé. Actualisez avant de répondre.",409);
    if(input.action==="recruitment.withdraw"){
      if(["HIRED","REJECTED","WITHDRAWN"].includes(app.status))throw new AppError("Cette candidature est déjà terminée.");
      result=await tx.jobApplication.update({where:{id:app.id},data:{status:"WITHDRAWN",decisionReason:input.reason,revision:{increment:1}}});
      await tx.recruitmentEvent.create({data:{companyId,applicationId:app.id,kind:"WITHDRAWN",content:input.reason,visibleToCandidate:true,actorId:actor.id,actorName:actor.name}});await audit(tx,companyId,actor,"Candidature retirée",app.id);
    }else{
      if(app.status!=="OFFERED"||!app.offeredRoleId||!app.offeredBy||app.offeredSalary===null||!app.offeredDepartment)throw new AppError("Aucune proposition d’embauche à accepter.");
      const issuer=await tx.companyMember.findUnique({where:{companyId_userId:{companyId,userId:app.offeredBy}},include:{role:true}});
      if(!issuer||issuer.status!=="ACTIVE"||!issuer.role.permissions.includes("employees.manage"))throw new AppError("Le responsable doit renouveler cette proposition.",403);
      const role=await grantableRole(tx,companyId,app.offeredRoleId,issuer.role.permissions);
      if(await tx.companyMember.findUnique({where:{companyId_userId:{companyId,userId:actor.id}}}))throw new AppError("Vous avez déjà un lien avec cette entreprise.");
      if(await tx.companyMember.count({where:{companyId,status:"ACTIVE"}})>=readLimits(company.subscription?.plan.limits).employees)throw new AppError("Le quota d’employés de cette entreprise est atteint.");
      const job=await tx.recruitmentJob.findUniqueOrThrow({where:{id:app.jobId}});const hired=await tx.jobApplication.count({where:{companyId,jobId:app.jobId,status:"HIRED"}});if(hired>=job.positions)throw new AppError("Tous les postes sont déjà pourvus.");if(job.status!=="PUBLISHED")throw new AppError("L’offre est fermée. Contactez l’entreprise avant d’accepter.");
      if(company.serverId){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;await assertServerCapacity(tx,company.serverId,actor.id);}
      const hiredMember=await tx.companyMember.create({data:{companyId,userId:actor.id,roleId:role.id,characterName:app.characterName,department:app.offeredDepartment,salary:app.offeredSalary}});
      await tx.employeeEvent.create({data:{companyId,memberId:hiredMember.id,kind:"HIRE",title:"Embauche après recrutement",content:`${app.jobTitle} · ${role.name}`,actorId:actor.id,actorName:actor.name}});
      result=await tx.jobApplication.update({where:{id:app.id},data:{status:"HIRED",revision:{increment:1}}});
      if(hired+1>=job.positions)await tx.recruitmentJob.update({where:{id:job.id},data:{status:"CLOSED",revision:{increment:1}}});
      await tx.recruitmentEvent.create({data:{companyId,applicationId:app.id,kind:"HIRED",content:"Proposition acceptée. Votre accès à l’entreprise est créé.",visibleToCandidate:true,actorId:actor.id,actorName:actor.name}});
      await audit(tx,companyId,actor,"Embauche acceptée par le candidat",hiredMember.id,{applicationId:app.id,roleId:role.id});
      await notifyUser(tx,{userId:app.offeredBy,title:"Proposition d’embauche acceptée",body:`${app.characterName} a rejoint ${company.name}.`,category:"RECRUITMENT",targetUrl:companyNotificationUrl(company.id,"recruitment")});
    }
  }
  return remember(tx,companyId,input.requestKey,hash,result);
}
