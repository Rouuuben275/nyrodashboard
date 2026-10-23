import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {createHash} from "node:crypto";
import {Prisma,type PayrollRun} from "@prisma/client";
import type {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {calculatePay} from "./calculation";
import type {PayrollAction} from "./validation";
type Member=Awaited<ReturnType<typeof membership>>;
type Tx=Prisma.TransactionClient;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function payrollAccess(member:Member){if(!member.company.modules.some(m=>m.key==="payroll"&&m.enabled))throw new AppError("Module Paie désactivé.",403);}
export function canManagePay(member:Member){return member.role.permissions.includes("employees.manage");}
export function canPay(member:Member){return canManagePay(member)&&["company.manage","finance.read","expenses.approve"].every(p=>member.role.permissions.includes(p))&&member.company.modules.some(m=>m.key==="finance"&&m.enabled);}
const day=(value:Date)=>value.toISOString().slice(0,10);

export async function payrollSnapshot(tx:Tx,companyId:string,run:PayrollRun,memberId:string,bonus:number,deduction:number){
  const person=await tx.companyMember.findFirst({where:{companyId,id:memberId},include:{role:true}});
  if(!person)throw new AppError("Employé introuvable.",404);
  const policies=await tx.payrollPolicy.findMany({where:{companyId,targetKey:{in:[`MEMBER:${memberId}`,`ROLE:${person.roleId}`]}}});
  const selected=policies.find(p=>p.memberId===memberId)??policies.find(p=>p.roleId===person.roleId);
  const policy=selected?{mode:selected.mode,rate:selected.rate,regularMinutes:selected.regularMinutes,overtimeBps:selected.overtimeBps,commissionBps:selected.commissionBps}:{mode:"FIXED",rate:person.salary,regularMinutes:2100,overtimeBps:12500,commissionBps:0};
  const enabled=await tx.companyModule.findMany({where:{companyId,enabled:true,key:{in:["time","sales"]}},select:{key:true}});
  if(policy.mode==="HOURLY"&&!enabled.some(m=>m.key==="time"))throw new AppError("Activez le pointage pour calculer un salaire horaire.");
  if(policy.commissionBps>0&&!enabled.some(m=>m.key==="sales"))throw new AppError("Activez les ventes pour calculer les commissions.");
  const times=await tx.$queryRaw<{entryId:string;reviewId:string;revision:number;minutes:number;endDay:string}[]>(Prisma.sql`
    SELECT t.id AS "entryId",r.id AS "reviewId",t.revision,r."workedMinutes" AS minutes,
      (((r."end" - interval '1 millisecond') AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date::text AS "endDay"
    FROM "TimeEntry" t JOIN "TimeReview" r ON r."companyId"=t."companyId" AND r."entryId"=t.id AND r.revision=t.revision
    WHERE t."companyId"=${companyId} AND t."memberId"=${memberId} AND t."end" IS NOT NULL AND r.status='APPROVED'
      AND ((r.start AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date BETWEEN ${day(run.from)}::date AND ${day(run.to)}::date
    ORDER BY t.id`);
  if(times.length>5000)throw new AppError("Plus de 5 000 pointages : réduisez la période de paie.");
  if(times.some(t=>t.endDay>day(run.to)))throw new AppError("Un service validé traverse la fin de période. Choisissez une période qui le contient entièrement.");
  const claimed=times.length?await tx.payrollTime.findFirst({where:{companyId,entryId:{in:times.map(t=>t.entryId)},slip:{companyRun:{status:"OPEN"},NOT:{runId:run.id}}}}):null;
  if(claimed)throw new AppError("Un pointage est déjà réservé à une autre période de paie.",409);
  const sales=policy.commissionBps?await tx.$queryRaw<{amount:bigint;fingerprint:string|null}[]>(Prisma.sql`
    SELECT COALESCE(SUM(total),0)::bigint AS amount,md5(string_agg(id||':'||total::text,',' ORDER BY id)) AS fingerprint FROM "Sale"
    WHERE "companyId"=${companyId} AND "sellerId"=${person.userId} AND status='COMPLETED'
      AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date BETWEEN ${day(run.from)}::date AND ${day(run.to)}::date`):[{amount:0n,fingerprint:null}];
  const calculated=calculatePay(policy,times.reduce((sum,t)=>sum+t.minutes,0),Number(sales[0].amount),bonus,deduction);
  const employee={employeeName:person.characterName,department:person.department,roleName:person.role.name};
  const data={...policy,...calculated,...employee,bonus,deduction};
  return {data,times,sourceHash:digest({data,times,policyRevision:selected?.revision??null,sales:sales[0].fingerprint}),userId:person.userId};
}

export async function executePayroll(tx:Tx,companyId:string,member:Member,actor:{id:string;name:string},input:PayrollAction){
  payrollAccess(member);
  if(!canManagePay(member))throw new AppError("Gestion RH requise pour préparer la paie.",403);
  if(input.action==="payroll.pay"&&!canPay(member))throw new AppError("Gestion RH, administration entreprise, lecture finance et validation des dépenses requises pour verser la paie RP.",403);
  const fingerprint=digest({actorId:actor.id,input});
  const previous=await tx.payrollCommand.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Clé de paie déjà utilisée pour une autre opération.",409);return previous.result;}
  const audit=(action:string,id:string)=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId:id}});
  let result:{id:string;revision?:number};
  if(input.action==="payroll.policy"){
    const target=input.target==="MEMBER"?await tx.companyMember.findFirst({where:{companyId,id:input.targetId}}):await tx.companyRole.findFirst({where:{companyId,id:input.targetId}});
    if(!target)throw new AppError("Employé ou grade introuvable.",404);
    const targetKey=`${input.target}:${input.targetId}`,where={companyId_targetKey:{companyId,targetKey}};
    const current=await tx.payrollPolicy.findUnique({where});
    if(current?current.revision!==input.revision:input.revision!==undefined)throw new AppError("La règle salariale a changé. Actualisez.",409);
    const data={mode:input.mode,rate:input.rate,regularMinutes:input.regularMinutes,overtimeBps:input.overtimeBps,commissionBps:input.commissionBps};
    result=current?await tx.payrollPolicy.update({where:{id:current.id},data:{...data,revision:{increment:1}}}):await tx.payrollPolicy.create({data:{companyId,targetKey,memberId:input.target==="MEMBER"?input.targetId:null,roleId:input.target==="ROLE"?input.targetId:null,...data}});
    await audit("Règle de rémunération RP enregistrée",result.id);
  }else if(input.action==="payroll.run"){
    const from=new Date(`${input.from}T00:00:00Z`),to=new Date(`${input.to}T00:00:00Z`);
    if(input.from<"2000-01-01"||to<from||+to-+from>61*86400000)throw new AppError("La période doit comporter de 1 à 62 jours.");
    if(await tx.payrollRun.findFirst({where:{companyId,status:"OPEN",from:{lte:to},to:{gte:from}}}))throw new AppError("Une période de paie existante chevauche ces dates.",409);
    result=await tx.payrollRun.create({data:{companyId,label:input.label,from,to,createdBy:actor.id}});await audit("Période de paie RP créée",result.id);
  }else if(input.action==="payroll.prepare"){
    if((input.bonus||input.deduction)&&input.note.length<3)throw new AppError("Un motif est requis pour les primes et retenues RP.");
    const run=await tx.payrollRun.findFirst({where:{companyId,id:input.runId,status:"OPEN"}});if(!run)throw new AppError("Période de paie ouverte introuvable.",404);
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris"}).format(new Date());
    if(day(run.to)>today)throw new AppError("La période doit être terminée avant le calcul des bulletins.");
    const old=await tx.payrollSlip.findUnique({where:{companyId_runId_memberId:{companyId,runId:run.id,memberId:input.memberId}}});
    if(old&&old.status!=="DRAFT")throw new AppError("Rouvrez le bulletin avant de le recalculer.",409);
    if(old?old.revision!==input.revision:input.revision!==undefined)throw new AppError("Le bulletin a changé. Actualisez.",409);
    const snap=await payrollSnapshot(tx,companyId,run,input.memberId,input.bonus,input.deduction);
    const data={...snap.data,sourceHash:snap.sourceHash,note:input.note,preparedBy:actor.id};
    const slip=old?await tx.payrollSlip.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.payrollSlip.create({data:{companyId,runId:run.id,memberId:input.memberId,...data}});
    // Only the current draft's source links are replaced; each old calculation remains in its private event snapshot.
    await tx.payrollTime.deleteMany({where:{companyId,slipId:slip.id}});
    if(snap.times.length)await tx.payrollTime.createMany({data:snap.times.map(({endDay:_,...t})=>({...t,companyId,slipId:slip.id}))});
    await tx.payrollEvent.create({data:{companyId,slipId:slip.id,action:"PREPARE",actorId:actor.id,reason:input.note,snapshot:{...data,times:snap.times}}});
    result={id:slip.id,revision:slip.revision};await audit("Bulletin RP calculé",slip.id);
  }else if(input.action==="payroll.cancel"){
    const run=await tx.payrollRun.findFirst({where:{companyId,id:input.runId,status:"OPEN"}});if(!run)throw new AppError("Période ouverte introuvable.",404);
    if(await tx.payrollSlip.count({where:{companyId,runId:run.id,status:"PAID"}}))throw new AppError("Une période comportant un versement ne peut pas être annulée.");
    const slips=await tx.payrollSlip.findMany({where:{companyId,runId:run.id},select:{id:true,status:true,revision:true}});
    for(const slip of slips)await tx.payrollEvent.create({data:{companyId,slipId:slip.id,action:"CANCEL",actorId:actor.id,reason:input.reason,snapshot:{status:slip.status,revision:slip.revision}}});
    await tx.payrollSlip.updateMany({where:{companyId,runId:run.id},data:{status:"CANCELLED",revision:{increment:1}}});
    await tx.payrollRun.update({where:{id:run.id},data:{status:"CANCELLED"}});result={id:run.id};await audit("Période de paie RP annulée",run.id);
  }else{
    const slip=await tx.payrollSlip.findFirst({where:{companyId,id:input.slipId},include:{companyRun:true,member:{select:{userId:true}}}});
    if(!slip)throw new AppError("Bulletin introuvable.",404);
    if(slip.companyRun.status!=="OPEN"||slip.status==="CANCELLED")throw new AppError("Période annulée.");
    if(input.action==="payroll.pay"&&slip.status==="PAID"){
      const entry=await tx.financialEntry.findUnique({where:{companyId_kind_sourceId:{companyId,kind:"PAYROLL",sourceId:slip.id}}});
      if(entry?.accountId!==input.accountId)throw new AppError("Ce bulletin est déjà versé depuis un autre compte RP.",409);
      result={id:slip.id,revision:slip.revision};
    }
    else{
      if(slip.revision!==input.revision)throw new AppError("Le bulletin a changé. Actualisez.",409);
      if(slip.status==="PAID")throw new AppError("Un bulletin versé est immuable.");
      if(input.action==="payroll.review"&&input.decision==="REOPEN"){
        if(slip.status!=="APPROVED")throw new AppError("Ce bulletin n’est pas validé.");
        result=await tx.payrollSlip.update({where:{id:slip.id},data:{status:"DRAFT",approvedBy:null,revision:{increment:1}}});
        await tx.payrollEvent.create({data:{companyId,slipId:slip.id,action:"REOPEN",actorId:actor.id,reason:input.reason,snapshot:{revision:slip.revision,total:slip.total}}});
        await audit("Bulletin RP rouvert",slip.id);
      }else{
        const snap=await payrollSnapshot(tx,companyId,slip.companyRun,slip.memberId,slip.bonus,slip.deduction);
        if(snap.sourceHash!==slip.sourceHash)throw new AppError("Les sources du bulletin ont changé. Rouvrez puis recalculez avant de continuer.",409);
        if(input.action==="payroll.review"){
          if(slip.status!=="DRAFT")throw new AppError("Ce bulletin a déjà été validé.",409);
          if(slip.member.userId===actor.id)throw new AppError("Un autre responsable doit valider votre propre bulletin.",403);
          result=await tx.payrollSlip.update({where:{id:slip.id},data:{status:"APPROVED",approvedBy:actor.id,revision:{increment:1}}});
          await tx.payrollEvent.create({data:{companyId,slipId:slip.id,action:"APPROVE",actorId:actor.id,reason:input.reason,snapshot:{revision:slip.revision,total:slip.total}}});
          await audit("Bulletin RP validé",slip.id);
        }else{
          if(slip.status!=="APPROVED")throw new AppError("Validez le bulletin avant le versement.");
          const account=await tx.financeAccount.findFirst({where:{companyId,id:input.accountId,archived:false}});if(!account)throw new AppError("Compte RP actif introuvable.",404);
          const balance=await tx.financialEntry.aggregate({where:{companyId,accountId:account.id},_sum:{amount:true}});
          if((balance._sum.amount??0)<slip.total)throw new AppError("Solde du compte RP insuffisant.");
          const paidAt=new Date();
          await tx.financialEntry.create({data:{companyId,amount:-slip.total,kind:"PAYROLL",effect:"EXPENSE",label:`Paie RP · ${slip.companyRun.label} · ${slip.employeeName}`,sourceId:slip.id,actorId:actor.id,accountId:account.id,occurredAt:paidAt}});
          result=await tx.payrollSlip.update({where:{id:slip.id},data:{status:"PAID",paidAt,paidBy:actor.id,accountLabel:account.name,revision:{increment:1}}});
          await tx.payrollEvent.create({data:{companyId,slipId:slip.id,action:"PAY",actorId:actor.id,reason:"Versement RP interne",snapshot:{total:slip.total,accountId:account.id,accountLabel:account.name}}});
          await notifyUser(tx,{userId:slip.member.userId,title:"Bulletin RP versé",body:`${slip.companyRun.label} : votre bulletin est disponible dans Paie.`,category:"PAYROLL",targetUrl:companyNotificationUrl(companyId,"payroll")});
          await audit("Bulletin RP versé",slip.id);
        }
      }
    }
  }
  const response={id:result.id,...(typeof result.revision==="number"?{revision:result.revision}:{})};
  await tx.payrollCommand.create({data:{companyId,requestKey:input.requestKey,fingerprint,result:response}});return response;
}
