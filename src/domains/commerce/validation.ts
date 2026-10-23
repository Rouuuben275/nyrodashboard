import { z } from "zod";
const id = z.string().min(1).max(100);
export const commerceActions = [
  z.object({ action: z.literal("customer.save"), customerId: id.optional(), name: z.string().trim().min(1).max(160), phone: z.string().trim().max(60).default(""), email: z.union([z.email().max(254), z.literal("")]).default(""), notes: z.string().trim().max(5000).default(""), segment: z.string().trim().min(1).max(80).default("Particulier"), archived: z.boolean().default(false) }),
  z.object({ action: z.literal("billing.save"), documentId: id.optional(), kind: z.enum(["QUOTE", "INVOICE"]), customerId: id, notes: z.string().trim().max(5000).default(""), validUntil: z.iso.datetime({ offset: true }).optional(), discountBps: z.number().int().min(0).max(10000).default(0), items: z.array(z.object({ label: z.string().trim().min(1).max(250), quantity: z.number().int().min(1).max(10000), unitPrice: z.number().int().min(0).max(100000000) })).min(1).max(100) }),
  z.object({ action: z.literal("billing.transition"), documentId: id, status: z.enum(["ISSUED", "ACCEPTED", "DECLINED", "PAID", "CANCELLED"]), reason: z.string().trim().max(1000).default("") }),
  z.object({ action: z.literal("billing.convert"), documentId: id }),
] as const;
export const commerceActionSchema = z.discriminatedUnion("action", commerceActions);
export type CommerceAction = z.infer<typeof commerceActionSchema>;
