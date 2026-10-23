import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {recruitmentAccess,recruitingCompany} from "./service";
import type {z} from "zod";
import type {recruitmentQuery} from "./validation";
export const publicJobSelect={id:true,companyId:true,title:true,description:true,requirements:true,location:true,contractType:true,positions:true,updatedAt:true,company:{select:{name:true}},_count:{select:{applications:{where:{status:"HIRED"}}}}} satisfies Prisma.RecruitmentJobSelect;
export async function publicJobs(page=1,search=""){
  const where:Prisma.RecruitmentJobWhereInput={status:"PUBLISHED",company:recruitingCompany(),...(search?{OR:[{title:{contains:search,mode:"insensitive"}},{company:{name:{contains:search,mode:"insensitive"}}}]}:{})};
  return db.$transaction(async tx=>{const total=await tx.recruitmentJob.count({where});const jobs=await tx.recruitmentJob.findMany({where,select:publicJobSelect,orderBy:[{updatedAt:"desc"},{id:"desc"}],take:25,skip:(page-1)*25});return {jobs:jobs.map(({_count,...job})=>({...job,remaining:Math.max(0,job.positions-_count.applications)})),total};},{isolationLevel:"RepeatableRead"});
}
export async function publicJob(id:string,userId?:string){
  const job=await db.recruitmentJob.findFirst({where:{id,status:"PUBLISHED",company:recruitingCompany()},select:publicJobSelect});if(!job)throw new AppError("Offre publique introuvable.",404);
  const application=userId?await db.jobApplication.findFirst({where:{jobId:id,userId},select:{id:true,status:true}}):null;
  const {_count,...fields}=job;return {job:{...fields,remaining:Math.max(0,job.positions-_count.applications)},application};
}
export async function readRecruitment(userId:string,q:z.infer<typeof recruitmentQuery>){
  const viewer=await membership(db,q.companyId,userId);recruitmentAccess(viewer);
  return db.$transaction(async tx=>{
    if(q.jobId&&!await tx.recruitmentJob.findFirst({where:{id:q.jobId,companyId:q.companyId}}))throw new AppError("Offre introuvable.",404);
    const jobs=await tx.recruitmentJob.findMany({where:{companyId:q.companyId},include:{_count:{select:{applications:true}}},orderBy:[{updatedAt:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25});
    const jobCount=await tx.recruitmentJob.count({where:{companyId:q.companyId}});
    const where={companyId:q.companyId,...(q.jobId?{jobId:q.jobId}:{}),...(q.status?{status:q.status}:{})};
    const applications=await tx.jobApplication.findMany({where,select:{id:true,revision:true,jobId:true,jobTitle:true,characterName:true,status:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25});
    const applicationCount=await tx.jobApplication.count({where});
    const selected=q.applicationId?await tx.jobApplication.findFirst({where:{companyId:q.companyId,id:q.applicationId},include:{user:{select:{name:true,email:true}},events:{orderBy:[{createdAt:"desc"},{id:"desc"}],take:100},_count:{select:{events:true}}}}):null;
    if(q.applicationId&&!selected)throw new AppError("Candidature introuvable.",404);
    const roles=await tx.companyRole.findMany({where:{companyId:q.companyId,isOwner:false},select:{id:true,name:true,permissions:true},orderBy:{position:"asc"}});
    return {jobs,jobCount,applications,applicationCount,selected,roles:roles.filter(r=>r.permissions.every(p=>viewer.role.permissions.includes(p))).map(({id,name})=>({id,name}))};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
const candidateSelect={id:true,companyId:true,jobId:true,jobTitle:true,characterName:true,phone:true,motivation:true,availability:true,status:true,revision:true,interviewAt:true,interviewDetails:true,decisionReason:true,offeredRoleName:true,offeredDepartment:true,offeredSalary:true,createdAt:true,job:{select:{company:{select:{name:true,modules:{where:{key:{in:["recruitment","employees"]}},select:{key:true,enabled:true}}}}}},events:{where:{visibleToCandidate:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:100,select:{id:true,kind:true,content:true,details:true,actorName:true,createdAt:true}},_count:{select:{events:{where:{visibleToCandidate:true}}}}} satisfies Prisma.JobApplicationSelect;
export async function candidateApplications(userId:string,page=1){
  return db.$transaction(async tx=>{
    const total=await tx.jobApplication.count({where:{userId}});
    const records=await tx.jobApplication.findMany({where:{userId},select:candidateSelect,orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(page-1)*25});
    return {total,rows:records.map(({job,...record})=>({...record,companyName:job.company.name,moduleActive:["recruitment","employees"].every(key=>job.company.modules.some(m=>m.key===key&&m.enabled))}))};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
export type RecruitmentData=Awaited<ReturnType<typeof readRecruitment>>;
export type CandidateData=Awaited<ReturnType<typeof candidateApplications>>;
export type PublicJobsData=Awaited<ReturnType<typeof publicJobs>>;
export type PublicJobData=Awaited<ReturnType<typeof publicJob>>;
