import { z } from "zod";
const id = z.string().min(1).max(100);
export const purchaseActions = [
  z.object({ action: z.literal("supplier.save"), supplierId: id.optional(), name: z.string().trim().min(1).max(160), contact: z.string().trim().max(160).default(""), phone: z.string().trim().max(60).default(""), email: z.union([z.email().max(254), z.literal("")]).default(""), notes: z.string().trim().max(5000).default(""), archived: z.boolean().default(false) }),
  z.object({ action: z.literal("purchase.save"), orderId: id.optional(), supplierId: id, notes: z.string().trim().max(5000).default(""), items: z.array(z.object({ productId: id, quantity: z.number().int().min(1).max(10000), unitCost: z.number().int().min(0).max(100000000) })).min(1).max(100) }),
  z.object({ action: z.literal("purchase.transition"), orderId: id, status: z.enum(["ORDERED", "RECEIVED", "CANCELLED"]), reason: z.string().trim().max(1000).default("") }),
  z.object({ action: z.literal("purchase.receive"), orderId: id, requestKey: z.uuid(), occurredAt: z.iso.datetime(), reference: z.string().trim().max(160).default(""), notes: z.string().trim().max(2000).default(""), items: z.array(z.object({ itemId: id, quantity: z.number().int().min(1).max(10000) })).min(1).max(100) }),
] as const;
export const purchaseActionSchema = z.discriminatedUnion("action", purchaseActions);
export type PurchaseAction = z.infer<typeof purchaseActionSchema>;
