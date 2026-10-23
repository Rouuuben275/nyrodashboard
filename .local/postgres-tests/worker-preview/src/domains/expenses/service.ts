import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {utilityWrite,moduleAccess} from "@/domains/utilities/write";
import {postLedger} from "@/domains/finance/ledger";
import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {claimAction,expenseQuery} from "./validation";
export async function writeClaim(actor:{id:string;name:string},raw:unknown){
 const input=claimAction.parse(raw),approval=input.action==="decide"||input.action==="pay";
 return utilityWrite(actor,"expenses",approval?"expenses.approve":"expenses.create",input,async(tx,member)=>{
  moduleAccess(member,"expenses","expenses.read");
  const old=input.id?await tx.expenseClaim.findFirst({where:{id:input.id,companyId:input.companyId}}):null;
  if(input.id&&!old)throw new AppError("Note de frais introuvable.",404);
  if(old&&(approval?old.actorId===actor.id:old.actorId!==actor.id))throw new AppError(approval?"Vous ne pouvez pas approuver ou rembourser votre propre note.":"Cette note appartient à un autre employé.",403);
  if(old?old.revision!==input.revision:input.revision!==undefined)throw new AppError("Cette note a changé. Actualisez.",409);
  const companyId=input.companyId;let result:{id:string;revision:number};let reason="",evidence:Prisma.InputJsonValue=[];
  if(input.action==="save"){
   if(old&&old.status!=="DRAFT")throw new AppError("Seuls les brouillons sont modifiables.",409);
   const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris"}).format(new Date());if(input.spentOn>today)throw new AppError("La dépense ne peut pas être datée dans le futur.");
   const data={label:input.label,category:input.category,description:input.description,amount:input.amount,spentOn:new Date(`${input.spentOn}T00:00:00Z`)};
   result=old?await tx.expenseClaim.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.expenseClaim.create({data:{...data,companyId,actorId:actor.id,actorName:member.characterName}});reason=old?"Brouillon modifié":"Brouillon créé";
  }else{
   if(!old)throw new AppError("Note de frais introuvable.",404);
   const next=(()=>{switch(input.action){case "submit":return ["DRAFT","SUBMITTED"];case "withdraw":return ["SUBMITTED","DRAFT"];case "cancel":return ["DRAFT","CANCELLED"];case "decide":return ["SUBMITTED",input.approve?"APPROVED":"DECLINED"];case "pay":return ["APPROVED","PAID"];}})();
   if(old.status!==next[0])throw new AppError("Cette transition n’est pas autorisée dans l’état actuel.",409);
   const data:Prisma.ExpenseClaimUpdateInput={status:next[1],revision:{increment:1}};
   if(input.action==="submit"){
    if(!member.company.modules.some(m=>m.key==="documents"&&m.enabled))throw new AppError("Activez les Documents pour joindre les justificatifs.",403);
    const docs=await tx.document.findMany({where:{companyId,targetType:"CLAIM",targetId:old.id,archived:false},select:{id:true,versions:{select:{id:true,number:true,digest:true},orderBy:{number:"desc"},take:1}},take:100});
    if(!docs.length||docs.some(d=>!d.versions.length))throw new AppError("Ajoutez au moins un justificatif avant la soumission.");
    evidence=docs.map(d=>({documentId:d.id,versionId:d.versions[0].id,number:d.versions[0].number,digest:d.versions[0].digest}));data.submittedAt=new Date();
    const approvers=await tx.companyMember.findMany({where:{companyId,status:"ACTIVE",userId:{not:actor.id},role:{permissions:{hasEvery:["expenses.read","expenses.approve"]}}},select:{userId:true}});
    await notifyUsers(tx,approvers.map(a=>({userId:a.userId,title:"Note de frais à traiter",body:"Une note de frais a été soumise dans votre entreprise.",category:"GENERAL" as const,targetUrl:companyNotificationUrl(companyId,"expenses")})));
   }
   if(input.action==="decide"){data.decidedAt=new Date();data.decidedBy=actor.id;}
   if(input.action==="pay"){
    moduleAccess(member,"finance","finance.read");
    const expense=await tx.expense.create({data:{companyId,label:old.label,amount:old.amount,category:old.category,status:"APPROVED",actorId:old.actorId}});
    await postLedger(tx,{companyId,amount:-old.amount,kind:"EXPENSE",label:`Note de frais · ${old.label}`,sourceId:expense.id,actorId:actor.id});
    data.expense={connect:{id:expense.id}};data.paidAt=new Date();data.paymentReference=input.reference;
   }
   reason=input.action==="pay"?input.reference:input.reason;
   result=await tx.expenseClaim.update({where:{id:old.id},data});
   if(approval)await notifyUser(tx,{userId:old.actorId,title:"Note de frais actualisée",body:"Consultez la décision dans les dépenses de votre entreprise.",category:"GENERAL",targetUrl:companyNotificationUrl(companyId,"expenses")});
  }
  await tx.expenseClaimEvent.create({data:{companyId,claimId:result.id,action:input.action,reason,actorId:actor.id,actorName:member.characterName,evidence}});
  await tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action:"Note de frais actualisée",entityId:result.id,details:{action:input.action}}});
  return {id:result.id,revision:result.revision};
 });
}
export async function readExpenses(userId:string,raw:unknown){
 const q=expenseQuery.parse(raw);
 return db.$transaction(async tx=>{
  const member=await membership(tx,q.companyId,userId);moduleAccess(member,"expenses","expenses.read");const approve=member.role.permissions.includes("expenses.approve"),create=member.role.permissions.includes("expenses.create");
  const claimScope={companyId:q.companyId,...(!approve?{actorId:userId}:{})};
  const where:Prisma.ExpenseClaimWhereInput={...claimScope,...(q.q?{OR:[{label:{contains:q.q,mode:"insensitive"}},{actorName:{contains:q.q,mode:"insensitive"}}]}:{}),...(q.status?{status:q.status}:{})};
  const expenseWhere:Prisma.ExpenseWhereInput={companyId:q.companyId,...(q.q?{label:{contains:q.q,mode:"insensitive"}}:{}),...(q.status?{status:q.status}:{})};
  const select={id:true,label:true,amount:true,category:true,status:true,actorName:true,actorId:true,spentOn:true,revision:true,createdAt:true} satisfies Prisma.ExpenseClaimSelect;
  const [claims,total,expenses,expenseTotal,selected]=await Promise.all([
   q.view==="claims"?tx.expenseClaim.findMany({where,select,orderBy:[{createdAt:"desc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],q.view==="claims"?tx.expenseClaim.count({where}):0,
   q.view==="expenses"?tx.expense.findMany({where:expenseWhere,include:{claim:{select:{id:true}}},orderBy:[{createdAt:"desc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],q.view==="expenses"?tx.expense.count({where:expenseWhere}):0,
   q.id?tx.expenseClaim.findFirst({where:{...claimScope,id:q.id}}):null
  ]);
  if(q.id&&!selected)throw new AppError("Note de frais privée ou introuvable.",404);
  const [events,eventCount]=selected?await Promise.all([tx.expenseClaimEvent.findMany({where:{companyId:q.companyId,claimId:selected.id},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.eventPage-1)*25}),tx.expenseClaimEvent.count({where:{companyId:q.companyId,claimId:selected.id}})]):[[],0];
  return {claims,total,expenses,expenseTotal,selected,events,eventCount,approve,create,canPay:approve&&member.role.permissions.includes("finance.read")&&member.company.modules.some(m=>m.key==="finance"&&m.enabled),userId};
 },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type ExpensesData=Awaited<ReturnType<typeof readExpenses>>;
