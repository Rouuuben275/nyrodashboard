import {z} from "zod";
const id=z.string().min(1).max(100),revision=z.number().int().min(0),requestKey=z.uuid(),date=z.iso.datetime({offset:true});
export const announcementActions=[
  z.object({action:z.literal("announcement.save"),requestKey,id:id.optional(),revision:revision.optional(),title:z.string().trim().min(3).max(160),body:z.string().trim().min(3).max(8000),priority:z.enum(["NORMAL","HIGH"]),scope:z.enum(["ALL","DEPARTMENT"]),department:z.string().trim().max(100).nullable().default(null)}),
  z.object({action:z.literal("announcement.publish"),requestKey,id,revision,startsAt:date.nullable().default(null),expiresAt:date.nullable().default(null)}),
  z.object({action:z.literal("announcement.transition"),requestKey,id,revision,decision:z.enum(["ARCHIVE","RESTORE","UNSCHEDULE"]),reason:z.string().trim().min(3).max(500)}),
  z.object({action:z.literal("announcement.pin"),requestKey,id,revision,pinned:z.boolean()}),
  z.object({action:z.literal("announcement.read"),requestKey,id}),
] as const;
export type AnnouncementAction=z.infer<typeof announcementActions[number]>;
export const announcementQuery=z.object({companyId:id,view:z.enum(["feed","drafts","scheduled","archives","departments"]).default("feed"),id:id.optional(),q:z.string().trim().max(100).default(""),priority:z.enum(["NORMAL","HIGH"]).optional(),unread:z.enum(["true","false"]).default("false"),from:z.iso.date().optional(),to:z.iso.date().optional(),page:z.coerce.number().int().min(1).max(100000).default(1),eventPage:z.coerce.number().int().min(1).max(100000).default(1),readPage:z.coerce.number().int().min(1).max(100000).default(1)}).refine(q=>!q.from||!q.to||q.from<=q.to,{message:"Période invalide."});
