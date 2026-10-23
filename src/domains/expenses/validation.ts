import {z} from "zod";
const id=z.string().min(1).max(100),text=z.string().trim().min(1).max(160),reason=z.string().trim().min(3).max(1000);
const base={companyId:id,requestKey:z.string().uuid()};
const fields={label:text,category:text,description:reason,amount:z.number().int().min(1).max(100000000),spentOn:z.iso.date()};
const existing={id,revision:z.number().int().min(0).max(2147483646)};
export const claimAction=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("save"),id:id.optional(),revision:existing.revision.optional(),...fields}).strict(),
 z.object({...base,...existing,action:z.enum(["submit","withdraw","cancel"]),reason}).strict(),
 z.object({...base,...existing,action:z.literal("decide"),approve:z.boolean(),reason}).strict(),
 z.object({...base,...existing,action:z.literal("pay"),reference:reason}).strict()
]);
export const expenseQuery=z.object({companyId:id,view:z.enum(["claims","expenses"]).default("claims"),page:z.coerce.number().int().min(1).max(100000).default(1),q:z.string().trim().max(120).default(""),status:z.enum(["","DRAFT","SUBMITTED","APPROVED","DECLINED","PAID","CANCELLED","PENDING"]).default(""),id:id.optional(),eventPage:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
