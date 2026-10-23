import {z} from "zod";
const id=z.string().min(1).max(100);
export const attachmentTarget=z.object({companyId:id,targetType:z.enum(["EMPLOYEE","LEAVE","EXPENSE","TASK","CLAIM"]),targetId:id});
const revision=z.coerce.number().int().min(0).max(2147483646);
export const attachmentQuery=attachmentTarget.extend({page:z.coerce.number().int().min(1).max(100000).default(1),archived:z.enum(["true","false"]).default("false")}).strict();
const base={...attachmentTarget.shape,requestKey:z.string().uuid()};
const name=z.string().trim().min(1).max(160).refine(v=>!/[\x00-\x1f]/.test(v));
const note=z.string().trim().min(3).max(500);
export const attachmentUpload=z.object({...base,documentId:id.optional(),revision:revision.optional(),name,fileName:name.refine(v=>!/[\\/]/.test(v)),note}).strict();
export const attachmentAction=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("link"),sourceId:id,versionId:z.string().uuid(),name,note}).strict(),
 z.object({...base,action:z.literal("archive"),documentId:id,revision,archived:z.boolean(),note}).strict()
]);
export type AttachmentTarget=z.infer<typeof attachmentTarget>;
