import {z} from "zod";
const id=z.string().min(1).max(100),date=z.iso.datetime({offset:true}),reason=z.string().trim().min(3).max(500);
const command={requestKey:z.uuid()};const target={...command,entryId:id,revision:z.number().int().min(0)};
export const timeActions=[
  z.object({action:z.literal("time.start"),...command}),
  z.object({action:z.literal("time.stop"),...target,reason:z.string().trim().max(500).default("")}),
  z.object({action:z.literal("time.pause"),...target,paused:z.boolean()}),
  z.object({action:z.literal("time.correct"),...target,start:date,end:date,pauseMinutes:z.number().int().min(0).max(10080),reason}),
  z.object({action:z.literal("time.review"),...target,status:z.enum(["APPROVED","REJECTED"]),reason}),
  z.object({action:z.literal("time.reopen"),...target,reason}),
] as const;
export type TimeAction=z.infer<typeof timeActions[number]>;
export const timeQuery=z.object({companyId:id,memberId:id.optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),status:z.enum(["PENDING","APPROVED","REJECTED","OPEN"]).optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).refine(q=>!q.from||!q.to||q.from<=q.to,{message:"Période invalide."});
