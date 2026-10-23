import { Prisma } from "@prisma/client";
export async function accountAt(tx:Prisma.TransactionClient,companyId:string,accountId:string|null,asOf:string){
  const rows=await tx.$queryRaw<{balance:bigint;count:bigint}[]>(Prisma.sql`SELECT COALESCE(SUM(amount),0)::bigint AS balance,COUNT(*)::bigint AS count FROM "FinancialEntry" WHERE "companyId"=${companyId} AND ${accountId?Prisma.sql`"accountId"=${accountId}`:Prisma.sql`"accountId" IS NULL`} AND ((COALESCE("occurredAt","createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date <= ${asOf}::date`);
  return {balance:rows[0].balance,count:Number(rows[0].count)};
}
