import { z } from "zod";
const id = z.string().min(1).max(100);
const label = z.string().trim().min(1).max(160);
const reason = z.string().trim().min(3).max(1000);
const draft = { kind: z.enum(["INCOME", "EXPENSE", "OPENING", "TRANSFER"]), label, amount: z.number().int().min(-100_000_000).max(100_000_000).refine(v => v !== 0), accountId: id.nullable().default(null), targetAccountId: id.nullable().default(null), categoryId: id.nullable().default(null), payment: z.enum(["CASH", "BANK", "CARD", "OTHER"]).default("OTHER"), occurredAt: z.iso.datetime({offset:true}) };
export const financeActions = [
  z.object({ action:z.literal("finance.reconcile"), requestKey:z.string().uuid(), accountId:id.nullable(), asOf:z.iso.date(), observed:z.number().int().min(-100_000_000).max(100_000_000), note:reason }),
  z.object({ action: z.literal("finance.account.save"), accountId: id.optional(), name: label, type: z.enum(["CASH", "BANK", "OTHER"]), isDefault: z.boolean().default(false), archived: z.boolean().default(false) }),
  z.object({ action: z.literal("finance.category.save"), categoryId: id.optional(), name: label, kind: z.enum(["INCOME", "EXPENSE", "BOTH"]), archived: z.boolean().default(false) }),
  z.object({ action: z.literal("finance.operation.create"), requestKey: z.string().uuid(), ...draft }),
  z.object({ action: z.literal("finance.operation.update"), operationId: id, revision: z.number().int().min(0), ...draft }),
  z.object({ action: z.literal("finance.operation.post"), operationId: id }),
  z.object({ action: z.literal("finance.operation.decide"), operationId: id, approve: z.boolean(), reason }),
  z.object({ action: z.literal("finance.operation.cancel"), operationId: id, reason }),
  z.object({ action: z.literal("finance.operation.reverse"), operationId: id, reason, requestKey: z.string().uuid() }),
] as const;
export type FinanceAction = z.infer<typeof financeActions[number]>;
export const financeQuery = z.object({
  companyId: id, q: z.string().trim().max(160).default(""), account: id.optional(), category: id.optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(), kind: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["DRAFT", "PENDING", "POSTED", "REJECTED", "CANCELLED"]).optional(),
}).refine(v => !v.from || !v.to || v.from <= v.to, { message: "Période invalide." });
export type FinanceQuery = z.infer<typeof financeQuery>;
