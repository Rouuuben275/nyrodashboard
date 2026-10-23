import {z} from "zod";
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),text=z.string().trim().regex(/^[^\u0000]*$/u),day=z.iso.date().refine(v=>v>="2000-01-01"&&v<="2100-12-31"),revision=z.number().int().nonnegative(),reason=text.min(3).max(500);
const base={companyId:id,requestKey:z.uuid()},target={...base,itemId:id,revision};
export const equipmentAction=z.discriminatedUnion("action",[
 z.strictObject({...base,action:z.literal("save"),itemId:id.optional(),revision:revision.optional(),kind:z.enum(["VEHICLE","EQUIPMENT"]),code:text.toUpperCase().min(2).max(40).regex(/^[A-Z0-9_-]+$/),name:text.min(2).max(120),registration:text.toUpperCase().max(40).transform(v=>v.replaceAll(" ","")).refine(v=>/^[A-Z0-9-]*$/.test(v),"Immatriculation invalide.").default(""),serial:text.max(100).default(""),location:text.max(120).default(""),notes:text.max(2000).default(""),mileage:z.number().int().min(0).max(1000000000).nullable().default(null),acquiredOn:day.nullable().default(null),nextServiceOn:day.nullable().default(null),reason}),
 z.strictObject({...target,action:z.literal("assign"),memberId:id.nullable(),reason}),
 z.strictObject({...target,action:z.literal("state"),state:z.enum(["READY","MAINTENANCE","OUT_OF_SERVICE"]),reason}),
 z.strictObject({...target,action:z.literal("work.open"),kind:z.enum(["MAINTENANCE","INCIDENT"]),title:text.min(3).max(120),details:text.min(3).max(2000),dueOn:day.nullable().default(null),blocking:z.boolean().default(true)}),
 z.strictObject({...target,action:z.literal("work.close"),workId:id,resolution:text.min(3).max(2000),restoreReady:z.boolean().default(false),nextServiceOn:day.nullable().optional()}),
 z.strictObject({...target,action:z.literal("archive"),archived:z.boolean(),reason}),
]);
const page=z.coerce.number().int().min(1).max(100000).default(1);
export const equipmentQuery=z.strictObject({companyId:id,view:z.enum(["list","staff"]).default("list"),q:text.max(100).default(""),kind:z.enum(["VEHICLE","EQUIPMENT"]).optional(),state:z.enum(["READY","MAINTENANCE","OUT_OF_SERVICE"]).optional(),assigned:z.enum(["all","mine","none"]).default("all"),archived:z.enum(["true","false"]).default("false"),due:z.enum(["all","due"]).default("all"),itemId:id.optional(),workStatus:z.enum(["all","OPEN","CLOSED"]).default("all"),page,workPage:page,eventPage:page});
