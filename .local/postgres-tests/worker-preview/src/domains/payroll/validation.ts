import {z} from "zod";
const id=z.string().min(1).max(100),command={requestKey:z.uuid()},reason=z.string().trim().min(3).max(1000);
const amount=z.number().int().min(0).max(100_000_000);
export const payrollActions=[
  z.object({action:z.literal("payroll.policy"),...command,target:z.enum(["MEMBER","ROLE"]),targetId:id,revision:z.number().int().min(0).optional(),mode:z.enum(["FIXED","HOURLY"]),rate:amount,regularMinutes:z.number().int().min(0).max(90000),overtimeBps:z.number().int().min(10000).max(50000),commissionBps:z.number().int().min(0).max(10000)}),
  z.object({action:z.literal("payroll.run"),...command,label:z.string().trim().min(3).max(120),from:z.iso.date(),to:z.iso.date()}),
  z.object({action:z.literal("payroll.prepare"),...command,runId:id,memberId:id,revision:z.number().int().min(0).optional(),bonus:amount,deduction:amount,note:z.string().trim().max(1000)}),
  z.object({action:z.literal("payroll.review"),...command,slipId:id,revision:z.number().int().min(0),decision:z.enum(["APPROVE","REOPEN"]),reason}),
  z.object({action:z.literal("payroll.pay"),...command,slipId:id,revision:z.number().int().min(0),accountId:id}),
  z.object({action:z.literal("payroll.cancel"),...command,runId:id,reason}),
] as const;
export type PayrollAction=z.infer<typeof payrollActions[number]>;
export const payrollQuery=z.object({companyId:id,runId:id.optional(),slipId:id.optional(),q:z.string().trim().max(100).default(""),page:z.coerce.number().int().min(1).max(100000).default(1),staffPage:z.coerce.number().int().min(1).max(100000).default(1),eventPage:z.coerce.number().int().min(1).max(100000).default(1)});
