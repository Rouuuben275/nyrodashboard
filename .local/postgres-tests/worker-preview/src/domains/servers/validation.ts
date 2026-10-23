import {z} from "zod";
const id=z.string().min(1).max(100),target={serverId:id,requestKey:z.uuid()},revision=z.number().int().nonnegative(),reason=z.string().trim().min(3).max(1000);
export const admissionAction=z.discriminatedUnion("action",[
  z.object({...target,action:z.literal("join")}),
  z.object({...target,action:z.literal("request"),message:z.string().trim().min(20).max(1000)}),
  z.object({...target,action:z.literal("withdraw"),id,revision,reason}),
  z.object({...target,action:z.literal("decide"),id,revision,status:z.enum(["ACCEPTED","REJECTED"]),reason}),
  z.object({...target,action:z.literal("member.status"),id,revision,status:z.enum(["ACTIVE","BLOCKED"]),reason}),
]);
export const admissionQuery=z.object({view:z.enum(["directory","mine","community","requests","members"]).default("directory"),serverId:id.optional(),q:z.string().trim().max(100).default(""),status:z.enum(["PENDING","ACCEPTED","REJECTED","WITHDRAWN","ACTIVE","BLOCKED"]).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),id:id.optional(),eventPage:z.coerce.number().int().min(1).max(100000).default(1)}).refine(q=>!["requests","members"].includes(q.view)||!!q.serverId,{message:"Serveur requis."});
