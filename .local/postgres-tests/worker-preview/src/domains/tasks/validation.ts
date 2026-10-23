import {z} from "zod";
const id=z.string().min(1).max(100),requestKey=z.uuid(),revision=z.number().int().min(0),date=z.iso.datetime({offset:true});
const details={title:z.string().trim().min(1).max(160),description:z.string().trim().max(4000).default(""),priority:z.enum(["NORMAL","HIGH"]),dueAt:date.nullable().optional(),assigneeId:id.nullable().optional()};
const target={taskId:id,revision,requestKey};
export const taskActions=[
  z.object({action:z.literal("task.create"),requestKey:requestKey.optional(),...details,checklist:z.array(z.string().trim().min(1).max(200)).max(20).default([])}),
  z.object({action:z.literal("task.update"),...target,...details,checklist:z.array(z.object({id:id.optional(),title:z.string().trim().min(1).max(200)})).max(20)}),
  z.object({action:z.literal("task.status"),...target,status:id}),
  z.object({action:z.literal("task.toggle"),taskId:id,revision:revision.optional(),requestKey:requestKey.optional()}),
  z.object({action:z.literal("task.check"),...target,itemId:id,done:z.boolean()}),
  z.object({action:z.literal("task.comment"),...target,body:z.string().trim().min(1).max(2000)}),
  z.object({action:z.literal("task.archive"),...target,archived:z.boolean(),reason:z.string().trim().min(3).max(500)}),
  z.object({action:z.literal("task.column"),requestKey,id:id.optional(),revision:revision.optional(),name:z.string().trim().min(2).max(60),position:z.number().int().min(0).max(100),archived:z.boolean().default(false)}),
] as const;
export type TaskAction=z.infer<typeof taskActions[number]>;
export const tasksQuery=z.object({companyId:id,view:z.enum(["list","board","staff","columns"]).default("list"),q:z.string().trim().max(100).default(""),status:id.optional(),assignee:z.union([z.literal("mine"),z.literal("none"),id]).optional(),priority:z.enum(["NORMAL","HIGH"]).optional(),archived:z.enum(["true","false"]).default("false"),overdue:z.enum(["true","false"]).default("false"),from:z.iso.date().optional(),to:z.iso.date().optional(),taskId:id.optional(),page:z.coerce.number().int().min(1).max(100000).default(1),commentPage:z.coerce.number().int().min(1).max(100000).default(1),eventPage:z.coerce.number().int().min(1).max(100000).default(1)}).refine(q=>!q.from||!q.to||q.from<=q.to,{message:"Période invalide."});
