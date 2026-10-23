import {AppError} from "@/domains/core/errors";
export type PayPolicy={mode:string;rate:number;regularMinutes:number;overtimeBps:number;commissionBps:number};
function rounded(n:bigint,d:bigint){const value=Number((n+d/2n)/d);if(!Number.isSafeInteger(value)||value>2_000_000_000)throw new AppError("Montant de paie hors limites.");return value;}
export function calculatePay(policy:PayPolicy,workedMinutes:number,salesAmount:number,bonus:number,deduction:number){
  if(!Number.isSafeInteger(workedMinutes)||workedMinutes<0||workedMinutes>90000||!Number.isSafeInteger(salesAmount)||salesAmount<0)throw new AppError("Durée ou ventes de paie hors limites.");
  const overtimeMinutes=Math.max(0,workedMinutes-policy.regularMinutes);
  const baseAmount=policy.mode==="FIXED"?policy.rate:rounded(BigInt(Math.min(workedMinutes,policy.regularMinutes))*BigInt(policy.rate),60n);
  // A fixed salary covers the selected period; only hourly policies add overtime pay.
  const overtimeAmount=policy.mode==="HOURLY"?rounded(BigInt(overtimeMinutes)*BigInt(policy.rate)*BigInt(policy.overtimeBps),600000n):0;
  const commissionAmount=rounded(BigInt(salesAmount)*BigInt(policy.commissionBps),10000n);
  const total=baseAmount+overtimeAmount+commissionAmount+bonus-deduction;
  if(!Number.isSafeInteger(total)||total<0||total>2_000_000_000)throw new AppError("Le net RP doit être positif ou nul et rester dans les limites.");
  return {workedMinutes,overtimeMinutes,baseAmount,overtimeAmount,salesAmount,commissionAmount,total};
}
