import type { Prisma } from "@prisma/client";
import { effectFor } from "./constants";
// Used only for future postings. Existing entries stay untouched and unassigned.
export async function postLedger(tx: Prisma.TransactionClient, data: {companyId:string;amount:number;kind:string;label:string;sourceId:string;actorId:string;occurredAt?:Date}, originalKind?: string) {
  const previous = originalKind ? await tx.financialEntry.findUnique({where:{companyId_kind_sourceId:{companyId:data.companyId,kind:originalKind,sourceId:data.sourceId}}}) : null;
  const account = previous ? previous.accountId : (await tx.financeAccount.findFirst({where:{companyId:data.companyId,isDefault:true,archived:false},select:{id:true}}))?.id ?? null;
  return tx.financialEntry.create({data:{...data,accountId:account,occurredAt:data.occurredAt ?? new Date(),effect:effectFor(data.kind)}});
}
