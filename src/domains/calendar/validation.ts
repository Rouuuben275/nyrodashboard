import {z} from "zod";
const id=z.string().min(1).max(100),revision=z.number().int().min(0),requestKey=z.uuid(),date=z.iso.datetime({offset:true});
const fields={title:z.string().trim().min(3).max(160),description:z.string().trim().max(4000),location:z.string().trim().max(200),kind:z.enum(["MEETING","EVENT"]),visibility:z.enum(["ALL","INVITEES"]),start:date,end:date,memberIds:z.array(id).max(50)};
const target={requestKey,id,revision};
export const calendarActions=[
  z.object({action:z.literal("calendar.create"),requestKey,...fields,occurrences:z.number().int().min(1).max(26).default(1),intervalWeeks:z.number().int().min(1).max(4).default(1)}),
  z.object({action:z.literal("calendar.update"),...target,...fields}),
  z.object({action:z.literal("calendar.cancel"),...target,series:z.boolean().default(false),seriesRevision:revision.optional(),reason:z.string().trim().min(3).max(500)}),
  z.object({action:z.literal("calendar.reply"),...target,inviteRevision:revision,response:z.enum(["ACCEPTED","DECLINED"]),note:z.string().trim().max(500)}),
  z.object({action:z.literal("calendar.attendance"),...target,inviteId:id,inviteRevision:revision,attendance:z.enum(["UNKNOWN","PRESENT","ABSENT"]),note:z.string().trim().min(3).max(500)}),
] as const;
export type CalendarAction=z.infer<typeof calendarActions[number]>;
export const calendarQuery=z.object({companyId:id,from:z.iso.date(),to:z.iso.date(),view:z.enum(["agenda","grid","staff"]).default("agenda"),id:id.optional(),q:z.string().trim().max(100).default(""),kind:z.enum(["MEETING","EVENT"]).optional(),mine:z.enum(["true","false"]).default("false"),cancelled:z.enum(["true","false"]).default("false"),page:z.coerce.number().int().min(1).max(100000).default(1),invitePage:z.coerce.number().int().min(1).max(100000).default(1),eventPage:z.coerce.number().int().min(1).max(100000).default(1)}).refine(q=>q.from>="2000-01-01"&&q.to>=q.from&&+new Date(q.to)-+new Date(q.from)<62*86400000,{message:"Période de 62 jours maximum, à partir de 2000."});
