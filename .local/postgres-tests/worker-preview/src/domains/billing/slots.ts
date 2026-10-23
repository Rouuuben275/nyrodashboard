import type {Prisma} from "@prisma/client";
import {AppError} from "@/domains/core/errors";
import {verifiedDiscordId} from "@/domains/platform/access";

type Tx=Prisma.TransactionClient;
export const INCLUDED_COMPANY_SLOTS=1;
export const SLOT_PRICE_CENTS=500;
export async function lockCompanySlots(tx:Tx,identity:string){
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`company-slots:${identity}`}))::text`;
}
export async function readCompanySlots(tx:Tx,userId:string){
  const discordId=await verifiedDiscordId(tx,userId);
  const [balance,owned]=await Promise.all([
    discordId?tx.companySlotAccount.findUnique({where:{discordId}}):null,
    tx.companyMember.count({where:{userId,role:{isOwner:true}}}),
  ]);
  // Inactive ownerships and suspended/archived companies still consume slots.
  // Ordinary employee memberships never consume an ownership slot.
  const granted=balance?.granted??0,purchased=balance?.purchased??0,total=INCLUDED_COMPANY_SLOTS+granted+purchased;
  return {included:INCLUDED_COMPANY_SLOTS,granted,purchased,total,owned,remaining:Math.max(0,total-owned),overLimit:owned>total,discordVerified:!!discordId,revision:balance?.revision??0};
}
export async function assertCompanySlot(tx:Tx,userId:string){
  const discordId=await verifiedDiscordId(tx,userId);
  await lockCompanySlots(tx,discordId??userId);
  const slots=await readCompanySlots(tx,userId);
  if(slots.owned>=slots.total)throw new AppError(`Quota entreprises atteint : ${slots.owned}/${slots.total} entreprise(s) possédée(s). Ajoutez un slot depuis Mes slots ou demandez une attribution à l’administration Nyro Dashboard.`,409);
  return slots;
}
