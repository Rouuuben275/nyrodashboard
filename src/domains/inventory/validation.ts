import {z} from "zod";
const id=z.string().min(1).max(100),label=z.string().trim().min(3).max(160),reason=z.string().trim().min(3).max(500);
export const stockActions=[
  z.object({action:z.literal("stock.warehouse.save"),warehouseId:id.optional(),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,30}$/),name:z.string().trim().min(1).max(160),archived:z.boolean().default(false)}),
  z.object({action:z.literal("stock.transfer"),requestKey:z.uuid(),productId:id,sourceWarehouseId:id.nullable(),destinationWarehouseId:id.nullable(),quantity:z.number().int().min(1).max(1000000),reason,occurredAt:z.iso.datetime({offset:true})}),
  z.object({action:z.literal("stock.move"),requestKey:z.string().uuid(),productId:id,warehouseId:id.optional(),kind:z.enum(["INITIAL","IN","OUT","LOSS","CONSUMPTION","CORRECTION"]),quantity:z.number().int().min(-1000000).max(1000000).refine(v=>v!==0),reason,occurredAt:z.iso.datetime({offset:true})}),
  z.object({action:z.literal("stock.reverse"),requestKey:z.string().uuid(),movementId:id,reason}),
  z.object({action:z.literal("stock.count.create"),requestKey:z.string().uuid(),label,productIds:z.array(id).min(1).max(100)}),
  z.object({action:z.literal("stock.count.update"),batchId:id,revision:z.number().int().min(0),lines:z.array(z.object({productId:id,counted:z.number().int().min(0).max(1000000),reason:z.string().trim().max(500).default("")})).min(1).max(100)}),
  z.object({action:z.literal("stock.count.refresh"),batchId:id,revision:z.number().int().min(0)}),
  z.object({action:z.literal("stock.count.post"),batchId:id,revision:z.number().int().min(0)}),
  z.object({action:z.literal("stock.count.cancel"),batchId:id,reason}),
] as const;
export type StockAction=z.infer<typeof stockActions[number]>;
export const stockQuery=z.object({companyId:id,q:z.string().trim().max(160).default(""),batchId:id.optional(),productId:id.optional(),kind:z.string().max(50).optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),low:z.enum(["true"]).optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).refine(v=>!v.from||!v.to||v.from<=v.to,{message:"Période invalide."});
export type StockQuery=z.infer<typeof stockQuery>;
