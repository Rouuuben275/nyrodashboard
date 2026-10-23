import {z} from "zod";
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),page=z.coerce.number().int().min(1).max(100000).default(1);
const text=z.string().regex(/^[^\u0000]*$/u,"Caractère nul interdit.");
const common={companyId:id,requestKey:z.uuid()};
const participants=z.array(id).min(1).max(24).refine(ids=>new Set(ids).size===ids.length,"Participant dupliquÃ©.");
export const messageAction=z.discriminatedUnion("action",[
 z.strictObject({...common,action:z.literal("create"),kind:z.enum(["PRIVATE","GROUP"]),title:text.trim().max(100).default(""),memberIds:participants}),
 z.strictObject({...common,action:z.literal("send"),threadId:id,body:text.trim().min(1).max(4000)}),
 z.strictObject({...common,action:z.literal("group"),threadId:id,revision:z.number().int().nonnegative(),title:text.trim().min(1).max(100),memberIds:participants}),
 z.strictObject({...common,action:z.literal("archive"),threadId:id,archived:z.boolean()}),
 z.strictObject({...common,action:z.literal("read"),threadId:id,through:z.number().int().nonnegative().max(2147483647)}),
]);
export const messagesQuery=z.strictObject({companyId:id,view:z.enum(["inbox","staff"]).default("inbox"),q:z.string().trim().max(100).default(""),archived:z.enum(["true","false"]).default("false"),page,threadId:id.optional(),messagePage:page,messageSearch:z.string().trim().max(100).default("")});
