import {z} from "zod";
const id=z.string().min(1).max(100),revision=z.number().int().min(0),kind=z.enum(["REVIEW","SANCTION"]),requestKey=z.uuid();
export const criterionSchema=z.object({key:z.uuid(),label:z.string().trim().min(1).max(100),weight:z.number().int().min(1).max(100),score:z.number().int().min(0).max(5).nullable(),comment:z.string().max(600)});
export const goalSchema=z.object({key:z.uuid(),title:z.string().trim().min(3).max(200),due:z.iso.date().nullable(),status:z.enum(["OPEN","DONE"]),note:z.string().max(1000)});
export type Criterion=z.infer<typeof criterionSchema>;
export type Goal=z.infer<typeof goalSchema>;
const reason=z.string().trim().min(3).max(1000);
export const peopleActions=[
  z.object({action:z.literal("hr.template.save"),kind,requestKey,id:id.optional(),revision:revision.optional(),name:z.string().trim().min(3).max(120),instructions:z.string().trim().max(2000),criteria:z.array(z.object({label:z.string().trim().min(1).max(100),weight:z.number().int().min(1).max(100)})).max(12),archived:z.boolean().default(false)}),
  z.object({action:z.literal("hr.campaign.save"),kind:z.literal("REVIEW"),requestKey,id:id.optional(),revision:revision.optional(),templateId:id,name:z.string().trim().min(3).max(120),from:z.iso.date(),to:z.iso.date(),status:z.enum(["OPEN","CLOSED"]).default("OPEN")}),
  z.object({action:z.literal("hr.record.save"),kind,requestKey,id:id.optional(),revision:revision.optional(),memberId:id,templateId:id.optional(),campaignId:id.optional(),title:z.string().trim().min(3).max(160),occurredAt:z.iso.datetime({offset:true}),content:z.string().trim().max(4000),conclusion:z.string().trim().max(4000),privateNote:z.string().trim().max(4000),scores:z.array(z.object({key:z.uuid(),score:z.number().int().min(0).max(5).nullable(),comment:z.string().trim().max(600)})).max(12),goals:z.array(z.object({key:z.uuid().optional(),title:z.string().trim().min(3).max(200),due:z.iso.date().nullable()})).max(10)}),
  z.object({action:z.literal("hr.record.transition"),kind,requestKey,id,revision,decision:z.enum(["PUBLISH","ARCHIVE","REVOKE"]),reason}),
  z.object({action:z.literal("hr.record.ack"),kind,requestKey,id,revision,comment:z.string().trim().max(1000)}),
  z.object({action:z.literal("hr.record.note"),kind,requestKey,id,revision,note:z.string().trim().max(4000)}),
  z.object({action:z.literal("hr.goal"),kind:z.literal("REVIEW"),requestKey,id,revision,goalKey:z.uuid(),status:z.enum(["OPEN","DONE"]),note:reason}),
] as const;
export type PeopleAction=z.infer<typeof peopleActions[number]>;
export const peopleQuery=z.object({companyId:id,kind,view:z.enum(["records","templates","campaigns","staff"]).default("records"),memberId:id.optional(),recordId:id.optional(),q:z.string().trim().max(100).default(""),status:z.enum(["DRAFT","PUBLISHED","ARCHIVED","REVOKED"]).optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),page:z.coerce.number().int().min(1).max(100000).default(1),eventPage:z.coerce.number().int().min(1).max(100000).default(1),templateId:id.optional(),campaignId:id.optional()}).refine(q=>!q.from||!q.to||q.from<=q.to,{message:"Période invalide."});
