import { Prisma } from "@prisma/client";
import {ledgerEffect as effects} from "./sql";
import { db } from "@/lib/db";
import { membership } from "@/domains/core/service";
import { financeAccess } from "./service";
import type { FinanceQuery } from "./validation";
import { accountAt } from "./reconciliation";
import { AppError } from "@/domains/core/errors";
const day = Prisma.sql`((COALESCE(e."occurredAt", e."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date`;
export function ledgerWhere(q:FinanceQuery) {
  const conditions=[Prisma.sql`e."companyId" = ${q.companyId}`];
  if(q.account)conditions.push(q.account==="legacy"?Prisma.sql`e."accountId" IS NULL`:Prisma.sql`e."accountId" = ${q.account}`);
  if(q.category)conditions.push(q.category==="uncategorized"?Prisma.sql`e."categoryId" IS NULL`:Prisma.sql`e."categoryId" = ${q.category}`);
  if(q.kind)conditions.push(Prisma.sql`e.kind = ${q.kind}`);
  if(q.q)conditions.push(Prisma.sql`(e.label ILIKE ${`%${q.q.replace(/[\\%_]/g,'\\$&')}%`} OR e."sourceId" ILIKE ${`%${q.q.replace(/[\\%_]/g,'\\$&')}%`})`);
  if(q.from)conditions.push(Prisma.sql`${day} >= ${q.from}::date`);
  if(q.to)conditions.push(Prisma.sql`${day} <= ${q.to}::date`);
  return Prisma.sql`WHERE ${Prisma.join(conditions," AND ")}`;
}
export type LedgerRow={id:string;label:string;amount:number;kind:string;effect:string;date:Date;createdAt:Date;accountId:string|null;accountName:string;categoryName:string;actorName:string;operationId:string|null;sourceId:string;reversalOfId:string|null;reversed:boolean};
export async function ledgerRows(tx:Prisma.TransactionClient,q:FinanceQuery,options:{offset?:number;take?:number}={}) {
  const columns=Prisma.sql`SELECT e.id,e.label,e.amount,e.kind,${effects} AS effect,COALESCE(e."occurredAt",e."createdAt") AS date,e."createdAt",e."accountId",COALESCE(a.name,'Historique non affecté') AS "accountName",COALESCE(c.name,'Non classé') AS "categoryName",COALESCE(u.name,'Utilisateur supprimé') AS "actorName",e."operationId",e."sourceId",e."reversalOfId",EXISTS(SELECT 1 FROM "FinancialEntry" r WHERE r."companyId"=e."companyId" AND r."reversalOfId"=e.id) AS reversed FROM "FinancialEntry" e LEFT JOIN "FinanceAccount" a ON a.id=e."accountId" AND a."companyId"=e."companyId" LEFT JOIN "FinanceCategory" c ON c.id=e."categoryId" AND c."companyId"=e."companyId" LEFT JOIN "User" u ON u.id=e."actorId"`;
  return tx.$queryRaw<LedgerRow[]>(Prisma.sql`${columns} ${ledgerWhere(q)} ORDER BY COALESCE(e."occurredAt",e."createdAt") DESC,e.id DESC LIMIT ${options.take??q.pageSize} OFFSET ${options.offset??(q.page-1)*q.pageSize}`);
}
export async function readFinance(userId:string,q:FinanceQuery) {
  const viewer=await membership(db,q.companyId,userId);financeAccess(viewer);
  return db.$transaction(async tx=>{
    if(q.account&&q.account!=="legacy"&&!await tx.financeAccount.findFirst({where:{companyId:q.companyId,id:q.account}}))throw new AppError("Compte introuvable.",404);
    if(q.category&&q.category!=="uncategorized"&&!await tx.financeCategory.findFirst({where:{companyId:q.companyId,id:q.category}}))throw new AppError("Catégorie introuvable.",404);
    const where=ledgerWhere(q);
    const [rows,summary,accounts,categories,balances,operations,operationCount,totalBalance,byCategory]=[
      await ledgerRows(tx,q),
      await tx.$queryRaw<{count:bigint;income:bigint;expense:bigint;net:bigint}[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count,COALESCE(SUM(CASE WHEN ${effects}='INCOME' THEN e.amount ELSE 0 END),0)::bigint AS income,COALESCE(SUM(CASE WHEN ${effects}='EXPENSE' THEN -e.amount ELSE 0 END),0)::bigint AS expense,COALESCE(SUM(e.amount),0)::bigint AS net FROM "FinancialEntry" e ${where}`),
      await tx.financeAccount.findMany({where:{companyId:q.companyId},orderBy:[{isDefault:"desc"},{name:"asc"}]}),
      await tx.financeCategory.findMany({where:{companyId:q.companyId},orderBy:{name:"asc"}}),
      await tx.financialEntry.groupBy({by:["accountId"],where:{companyId:q.companyId},_sum:{amount:true}}),
      await tx.financeOperation.findMany({where:{companyId:q.companyId,...(q.status?{status:q.status}:{})},include:{account:{select:{name:true}},targetAccount:{select:{name:true}},reversedBy:{select:{id:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(q.page-1)*q.pageSize,take:q.pageSize}),
      await tx.financeOperation.count({where:{companyId:q.companyId,...(q.status?{status:q.status}:{})}}),
      await tx.financialEntry.aggregate({where:{companyId:q.companyId},_sum:{amount:true}}),
      await tx.$queryRaw<{name:string;income:bigint;expense:bigint}[]>(Prisma.sql`SELECT COALESCE(c.name,'Non classé') AS name,COALESCE(SUM(CASE WHEN ${effects}='INCOME' THEN e.amount ELSE 0 END),0)::bigint AS income,COALESCE(SUM(CASE WHEN ${effects}='EXPENSE' THEN -e.amount ELSE 0 END),0)::bigint AS expense FROM "FinancialEntry" e LEFT JOIN "FinanceCategory" c ON c.id=e."categoryId" AND c."companyId"=e."companyId" ${where} GROUP BY c.id,c.name ORDER BY name`),    ] as const;
    const previous=q.from&&q.to?await tx.$queryRaw<{income:bigint;expense:bigint;start:string;end:string}[]>(Prisma.sql`SELECT COALESCE(SUM(CASE WHEN ${effects}='INCOME' THEN e.amount ELSE 0 END),0)::bigint AS income,COALESCE(SUM(CASE WHEN ${effects}='EXPENSE' THEN -e.amount ELSE 0 END),0)::bigint AS expense,(${q.from}::date - (${q.to}::date-${q.from}::date+1))::text AS start,(${q.from}::date-1)::text AS end FROM "FinancialEntry" e ${ledgerWhere({...q,from:undefined,to:undefined})} AND ${day} >= ${q.from}::date - (${q.to}::date-${q.from}::date+1) AND ${day} < ${q.from}::date`):null;
    const comparison=previous?{from:previous[0].start,to:previous[0].end,income:Number(previous[0].income),expense:Number(previous[0].expense),result:Number(previous[0].income)-Number(previous[0].expense)}:null;
    const reconciliationCount=await tx.financeReconciliation.count({where:{companyId:q.companyId}});
    const checkpoints=await tx.financeReconciliation.findMany({where:{companyId:q.companyId},include:{account:{select:{name:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(q.page-1)*q.pageSize,take:q.pageSize});
    const reconciliations=[];for(const r of checkpoints){const current=await accountAt(tx,q.companyId,r.accountId,r.asOf.toISOString().slice(0,10));reconciliations.push({...r,ledgerBalance:Number(r.ledgerBalance),currentBalance:Number(current.balance),stale:current.balance!==r.ledgerBalance||current.count!==r.entryCount,difference:r.observed-Number(r.ledgerBalance)});}
    return {comparison,reconciliations,reconciliationCount,company:{id:viewer.companyId,name:viewer.company.name},capabilities:{manage:viewer.role.permissions.includes("company.manage"),approve:viewer.role.permissions.includes("expenses.approve")},rows,accounts: [{id:"legacy",name:"Historique non affecté",type:"LEGACY",isDefault:false,archived:false,balance:balances.find(b=>b.accountId===null)?._sum.amount||0},...accounts.map(a=>({...a,balance:balances.find(b=>b.accountId===a.id)?._sum.amount||0}))],categories,operations,operationCount,total:Number(summary[0]?.count||0),summary:{balance:totalBalance._sum.amount||0,income:Number(summary[0]?.income||0),expense:Number(summary[0]?.expense||0),result:Number(summary[0]?.income||0)-Number(summary[0]?.expense||0)},byCategory:byCategory.map(c=>({...c,income:Number(c.income),expense:Number(c.expense)})),page:q.page,pageSize:q.pageSize};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000});
}
export type FinanceData=Awaited<ReturnType<typeof readFinance>>;
