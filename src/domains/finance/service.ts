import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AppError } from "@/domains/core/errors";
import type { FinanceAction } from "./validation";
import { accountAt } from "./reconciliation";
type Access = {role:{permissions:string[]};company:{expenseThreshold:number;modules:{key:string;enabled:boolean}[]}};
export function financeAccess(access: Access, permission = "finance.read") {
  if (!access.role.permissions.includes("finance.read") || !access.role.permissions.includes(permission) || !access.company.modules.some(m=>m.key==="finance"&&m.enabled)) throw new AppError("Accès comptable insuffisant ou module désactivé.",403);
}
export async function executeFinance(tx:Prisma.TransactionClient, companyId:string, access:Access, actor:{id:string;name:string}, input:FinanceAction) {
  financeAccess(access, input.action==="finance.operation.decide" ? "expenses.approve" : "company.manage");
  const log = (action:string, id:string, details:Prisma.InputJsonValue={}) => tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId:id,details}});
  const account = async (id:string|null) => { if (!id) return null; const result=await tx.financeAccount.findFirst({where:{companyId,id,archived:false}}); if(!result) throw new AppError("Compte actif introuvable dans cette entreprise.",404);return result; };
  if(input.action==="finance.reconcile"){
    const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous=await tx.financeReconciliation.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
    if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Cette clé a déjà servi pour un autre rapprochement.",409);return {id:previous.id};}
    await account(input.accountId);
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris"}).format(new Date());
    if(input.asOf>today)throw new AppError("Un rapprochement ne peut pas être daté dans le futur.");
    const snapshot=await accountAt(tx,companyId,input.accountId,input.asOf);
    const result=await tx.financeReconciliation.create({data:{companyId,accountId:input.accountId,requestKey:input.requestKey,fingerprint,asOf:new Date(`${input.asOf}T00:00:00Z`),observed:input.observed,ledgerBalance:snapshot.balance,entryCount:snapshot.count,note:input.note,actorId:actor.id}});
    await log("Compte RP rapproché",result.id,{accountId:input.accountId,asOf:input.asOf,observed:input.observed,ledgerBalance:String(snapshot.balance),difference:String(BigInt(input.observed)-snapshot.balance)});
    return {id:result.id};
  }
  if(input.action==="finance.account.save") {
    const before=input.accountId?await tx.financeAccount.findFirst({where:{companyId,id:input.accountId}}):null;
    if(input.accountId&&!before)throw new AppError("Compte introuvable.",404);
    if(input.archived && (await tx.financialEntry.aggregate({where:{companyId,accountId:before?.id||"missing"},_sum:{amount:true}}))._sum.amount)throw new AppError("Un compte doit être à zéro avant son archivage.");
    if(input.archived && before && await tx.financeOperation.count({where:{companyId,status:{in:["DRAFT","PENDING"]},OR:[{accountId:before.id},{targetAccountId:before.id}]}}))throw new AppError("Une opération en attente utilise ce compte.");
    if(input.archived&&input.isDefault)throw new AppError("Un compte archivé ne peut pas être le compte par défaut.");
    if(input.isDefault)await tx.financeAccount.updateMany({where:{companyId,isDefault:true},data:{isDefault:false}});
    const data={name:input.name,type:input.type,isDefault:input.isDefault,archived:input.archived};
    const result=before?await tx.financeAccount.update({where:{id:before.id},data}):await tx.financeAccount.create({data:{companyId,...data}});
    await log(before?"Compte RP modifié":"Compte RP créé",result.id,{...data});return result;
  }
  if(input.action==="finance.category.save") {
    const before=input.categoryId?await tx.financeCategory.findFirst({where:{companyId,id:input.categoryId}}):null;
    if(input.categoryId&&!before)throw new AppError("Catégorie introuvable.",404);
    if(before&&before.kind!==input.kind&&await tx.financialEntry.count({where:{companyId,categoryId:before.id}}))throw new AppError("Le type d’une catégorie utilisée ne peut pas changer.");
    const data={name:input.name,kind:input.kind,archived:input.archived};
    const result=before?await tx.financeCategory.update({where:{id:before.id},data}):await tx.financeCategory.create({data:{companyId,...data}});
    await log(before?"Catégorie RP modifiée":"Catégorie RP créée",result.id,data);return result;
  }
  if(input.action==="finance.operation.create"||input.action==="finance.operation.update") {
    const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
    if(input.action==="finance.operation.create"){
      const previous=await tx.financeOperation.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
      if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Cette clé a déjà servi pour une autre opération.",409);return previous;}
    }
    const before=input.action==="finance.operation.update"?await tx.financeOperation.findFirst({where:{companyId,id:input.operationId}}):null;
    if(input.action==="finance.operation.update"){
      if(!before)throw new AppError("Brouillon introuvable.",404);
      if(before.status!=="DRAFT")throw new AppError("Seul un brouillon peut être modifié.");
      if(before.revision!==input.revision)throw new AppError("Ce brouillon a changé. Actualisez avant de modifier.",409);
    }
    if(input.kind!=="OPENING"&&input.amount<0)throw new AppError("Le montant doit être positif.");
    await account(input.accountId);
    if(input.kind==="OPENING"&&!input.accountId)throw new AppError("Le solde d’ouverture nécessite un nouveau compte dédié.");
    if(input.kind==="TRANSFER"){await account(input.targetAccountId);if(input.accountId===input.targetAccountId)throw new AppError("Choisissez deux comptes distincts.");}
    else if(input.targetAccountId)throw new AppError("Un compte destinataire concerne uniquement les transferts.");
    if(input.categoryId){const category=await tx.financeCategory.findFirst({where:{companyId,id:input.categoryId,archived:false}});if(!category||![input.kind,"BOTH"].includes(category.kind)||!["INCOME","EXPENSE"].includes(input.kind))throw new AppError("Catégorie incompatible avec cette opération.");}
    const data={kind:input.kind,label:input.label,amount:input.amount,accountId:input.accountId,targetAccountId:input.targetAccountId,categoryId:input.categoryId,payment:input.payment,occurredAt:input.occurredAt};
    if(before){const result=await tx.financeOperation.update({where:{id:before.id},data:{...data,revision:{increment:1}}});await log("Brouillon comptable modifié",result.id,{before:{label:before.label,amount:before.amount,kind:before.kind,accountId:before.accountId,categoryId:before.categoryId,targetAccountId:before.targetAccountId,payment:before.payment,occurredAt:before.occurredAt.toISOString()},after:data});return result;}
    if(input.action!=="finance.operation.create")throw new AppError("Brouillon introuvable.",404);
    const result=await tx.financeOperation.create({data:{...data,requestKey:input.requestKey,companyId,fingerprint,createdBy:actor.id}});
    await log("Brouillon comptable créé",result.id,{kind:result.kind,amount:result.amount});return result;
  }
  const operation=await tx.financeOperation.findFirst({where:{companyId,id:input.operationId},include:{entries:true,reversedBy:{select:{id:true}}}});
  if(!operation)throw new AppError("Opération introuvable.",404);
  if(input.action==="finance.operation.cancel") {
    if(operation.status==="CANCELLED")return operation;
    if(!["DRAFT","PENDING"].includes(operation.status))throw new AppError("Seule une opération non comptabilisée peut être retirée.");
    const result=await tx.financeOperation.update({where:{id:operation.id},data:{status:"CANCELLED",reason:input.reason,decidedBy:actor.id}});await log("Brouillon comptable retiré",result.id,{reason:input.reason});return result;
  }
  if(input.action==="finance.operation.reverse") {
    if(operation.status!=="POSTED"||operation.kind==="REVERSAL")throw new AppError("Seule une opération comptabilisée d’origine peut être contrepassée.");
    if(operation.reversedBy.length)return {id:operation.reversedBy[0].id};
    if(operation.kind==="EXPENSE"&&!access.role.permissions.includes("expenses.approve"))throw new AppError("Validation des dépenses requise.",403);
    const reversed=await tx.financeOperation.create({data:{companyId,requestKey:input.requestKey,fingerprint:"reversal",kind:"REVERSAL",status:"POSTED",label:`Contre-écriture : ${operation.label}`.slice(0,160),amount:-operation.amount,accountId:operation.accountId,occurredAt:new Date(),payment:operation.payment,createdBy:actor.id,postedAt:new Date(),reason:input.reason,reversesId:operation.id}});
    for(const entry of operation.entries)await tx.financialEntry.create({data:{companyId,operationId:reversed.id,accountId:entry.accountId,categoryId:entry.categoryId,amount:-entry.amount,effect:entry.effect,kind:entry.effect==="INCOME"?"CORRECTION_INCOME":entry.effect==="EXPENSE"?"CORRECTION_EXPENSE":"CORRECTION_NEUTRAL",label:reversed.label,sourceId:entry.id,actorId:actor.id,reversalOfId:entry.id,occurredAt:new Date()}});
    await log("Opération comptable contrepassée",reversed.id,{operationId:operation.id,reason:input.reason});return reversed;
  }
  if(input.action==="finance.operation.decide") {
    if(operation.kind!=="EXPENSE")throw new AppError("Seules les dépenses requièrent cette validation.");
    if(operation.status!=="PENDING")throw new AppError("Cette demande n’est plus en attente.");
    if(!input.approve){const result=await tx.financeOperation.update({where:{id:operation.id},data:{status:"REJECTED",reason:input.reason,decidedBy:actor.id}});await log("Opération comptable refusée",result.id,{reason:input.reason});return result;}
  } else {
    if(operation.status==="POSTED"||operation.status==="PENDING")return operation;
    if(operation.status!=="DRAFT")throw new AppError("Ce brouillon ne peut plus être comptabilisé.");
    if(operation.kind==="EXPENSE"&&operation.amount>=access.company.expenseThreshold){const result=await tx.financeOperation.update({where:{id:operation.id},data:{status:"PENDING"}});await log("Dépense comptable soumise à validation",result.id);return result;}
  }
  if(operation.occurredAt>new Date())throw new AppError("Une opération future ne peut pas être comptabilisée maintenant.");
  await account(operation.accountId);
  if(operation.categoryId&&!await tx.financeCategory.findFirst({where:{id:operation.categoryId,companyId,archived:false,kind:{in:[operation.kind,"BOTH"]}}}))throw new AppError("La catégorie n’est plus disponible.");
  if(operation.kind==="OPENING"&&await tx.financialEntry.count({where:{companyId,accountId:operation.accountId}}))throw new AppError("Ce compte possède déjà des écritures : ouverture refusée pour éviter un doublon.");
  const entry={companyId,operationId:operation.id,accountId:operation.accountId,categoryId:operation.categoryId,occurredAt:operation.occurredAt,label:operation.label,sourceId:operation.id,actorId:actor.id};
  if(operation.kind==="TRANSFER"){
    await account(operation.targetAccountId);
    const balance=(await tx.financialEntry.aggregate({where:{companyId,accountId:operation.accountId},_sum:{amount:true}}))._sum.amount||0;
    if(balance<operation.amount)throw new AppError("Solde insuffisant pour ce transfert.");
    await tx.financialEntry.create({data:{...entry,kind:"TRANSFER_OUT",amount:-operation.amount,effect:"NEUTRAL"}});
    await tx.financialEntry.create({data:{...entry,accountId:operation.targetAccountId,kind:"TRANSFER_IN",amount:operation.amount,effect:"NEUTRAL"}});
  }else await tx.financialEntry.create({data:{...entry,kind:operation.kind==="INCOME"?"MANUAL_INCOME":operation.kind==="EXPENSE"?"MANUAL_EXPENSE":"OPENING",amount:operation.kind==="EXPENSE"?-operation.amount:operation.amount,effect:["INCOME","EXPENSE"].includes(operation.kind)?operation.kind:"NEUTRAL"}});
  const result=await tx.financeOperation.update({where:{id:operation.id},data:{status:"POSTED",postedAt:new Date(),decidedBy:actor.id,...(input.action==="finance.operation.decide"?{reason:input.reason}:{})}});
  await log("Opération comptable comptabilisée",result.id,{kind:operation.kind,amount:operation.amount});return result;
}
