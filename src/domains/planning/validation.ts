import {z} from "zod";
const id=z.string().min(1).max(100),date=z.iso.datetime({offset:true}),reason=z.string().trim().min(3).max(500);
export const scheduleActions=[
  z.object({action:z.literal("shift.repeat"),requestKey:z.uuid(),memberId:id,title:z.string().trim().min(1).max(160),start:date,end:date,occurrences:z.number().int().min(2).max(26),intervalWeeks:z.number().int().min(1).max(4)}),
  z.object({action:z.literal("shift.cancel"),requestKey:z.uuid(),shiftId:id,revision:z.number().int().min(0),reason}),
  z.object({action:z.literal("shift.series.cancel"),requestKey:z.uuid(),seriesId:id,from:date,reason}),
  z.object({action:z.literal("availability.save"),requestKey:z.uuid(),availabilityId:id.optional(),revision:z.number().int().min(0).default(0),memberId:id,start:date,end:date,kind:z.enum(["AVAILABLE","UNAVAILABLE"]),notes:z.string().trim().max(500).default("")}),
  z.object({action:z.literal("availability.cancel"),requestKey:z.uuid(),availabilityId:id,revision:z.number().int().min(0),reason}),
  z.object({action:z.literal("leave.type.save"),requestKey:z.uuid(),typeId:id.optional(),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,30}$/),name:z.string().trim().min(1).max(100),archived:z.boolean().default(false)}),
  z.object({action:z.literal("leave.cancel"),requestKey:z.uuid(),leaveId:id,revision:z.number().int().min(0),reason}),
] as const;
export type ScheduleAction=z.infer<typeof scheduleActions[number]>;
export const planningQuery=z.object({companyId:id,from:date,to:date,memberId:id.optional(),department:z.string().trim().max(160).optional()}).refine(q=>+new Date(q.to)>+new Date(q.from)&&+new Date(q.to)-+new Date(q.from)<=63*86400000,{message:"Période de 63 jours maximum."});
export const leavesQuery=z.object({companyId:id,view:z.enum(["list","calendar"]).default("list"),memberId:id.optional(),status:z.enum(["PENDING","APPROVED","DECLINED","CANCELLED"]).optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).refine(q=>!q.from||!q.to||q.from<=q.to,{message:"Période invalide."}).refine(q=>q.view!=="calendar"||(!!q.from&&!!q.to&&+new Date(q.to)-+new Date(q.from)<=63*86400000),{message:"Calendrier limité à 63 jours."});
