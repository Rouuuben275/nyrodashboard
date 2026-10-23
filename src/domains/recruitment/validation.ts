import {z} from "zod";
const id=z.string().min(1).max(100),key={requestKey:z.uuid()},target={...key,applicationId:id,revision:z.number().int().min(0)};
export const recruitmentActions=[
  z.object({action:z.literal("recruitment.job.save"),...key,jobId:id.optional(),revision:z.number().int().min(0).default(0),title:z.string().trim().min(3).max(160),description:z.string().trim().min(20).max(10000),requirements:z.string().trim().max(5000).default(""),location:z.string().trim().max(160).default(""),contractType:z.enum(["FULL_TIME","PART_TIME","OTHER"]),positions:z.number().int().min(1).max(100),status:z.enum(["DRAFT","PUBLISHED","CLOSED"])}),
  z.object({action:z.literal("recruitment.stage"),...target,status:z.enum(["SCREENING","INTERVIEW","REJECTED"]),reason:z.string().trim().min(3).max(1000),interviewAt:z.iso.datetime({offset:true}).optional(),interviewDetails:z.string().trim().max(1000).default("")}),
  z.object({action:z.literal("recruitment.note"),...key,applicationId:id,content:z.string().trim().min(3).max(5000)}),
  z.object({action:z.literal("recruitment.offer"),...target,roleId:id,department:z.string().trim().min(1).max(160),salary:z.number().int().min(0).max(100000000),message:z.string().trim().min(3).max(1000)}),
] as const;
export const candidateActions=[
  z.object({action:z.literal("recruitment.apply"),...key,jobId:id,characterName:z.string().trim().min(1).max(160),phone:z.string().trim().max(60).default(""),motivation:z.string().trim().min(20).max(5000),availability:z.string().trim().max(1000).default("")}),
  z.object({action:z.literal("recruitment.withdraw"),...target,reason:z.string().trim().min(3).max(500)}),
  z.object({action:z.literal("recruitment.accept"),...target}),
] as const;
export type RecruitmentAction=z.infer<typeof recruitmentActions[number]>;
export type CandidateAction=z.infer<typeof candidateActions[number]>;
export const recruitmentQuery=z.object({companyId:id,page:z.coerce.number().int().min(1).max(100000).default(1),jobId:id.optional(),applicationId:id.optional(),status:z.enum(["SUBMITTED","SCREENING","INTERVIEW","OFFERED","HIRED","REJECTED","WITHDRAWN"]).optional()});
