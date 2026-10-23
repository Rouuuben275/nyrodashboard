import {Prisma} from "@prisma/client";
import type {z} from "zod";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {parisDay} from "@/domains/planning/recurrence";
import {criteria,goals,peopleAccess} from "./service";
import type {peopleQuery} from "./validation";
export async function readPeople(userId:string,q:z.infer<typeof peopleQuery>){
  return db.$transaction(async tx=>{
    const viewer=await membership(tx,q.companyId,userId);peopleAccess(viewer,q.kind);
    const manage=viewer.role.permissions.includes("employees.manage");
    if(!manage&&q.view!=="records")throw new AppError("Espace réservé aux responsables RH.",403);
    if(q.kind==="SANCTION"&&q.view==="campaigns")throw new AppError("Campagne indisponible pour les sanctions.",400);
    if(q.memberId&&!manage&&q.memberId!==viewer.id)throw new AppError("Dossiers confidentiels.",403);
    if(q.memberId&&!await tx.companyMember.findFirst({where:{companyId:q.companyId,id:q.memberId}}))throw new AppError("Employé introuvable.",404);
    const privacy:Prisma.HrRecordWhereInput=manage?{}:{memberId:viewer.id,publishedAt:{not:null}};
    const base:Prisma.HrRecordWhereInput={companyId:q.companyId,kind:q.kind,...privacy};
    const where:Prisma.HrRecordWhereInput={...base,...(q.memberId?{memberId:q.memberId}:{}),...(q.status?{status:q.status}:{}),...(q.q?{OR:[{title:{contains:q.q,mode:"insensitive"}},{employeeName:{contains:q.q,mode:"insensitive"}}]}:{})};
    if(q.from||q.to)where.occurredAt={...(q.from?{gte:parisDay(q.from)}:{}),...(q.to?{lt:parisDay(q.to,1)}:{})};
    const templateWhere={companyId:q.companyId,kind:q.kind,...(q.q?{name:{contains:q.q,mode:"insensitive" as const}}:{})};
    const campaignWhere={companyId:q.companyId,...(q.q?{name:{contains:q.q,mode:"insensitive" as const}}:{})};
    const staffWhere={companyId:q.companyId,...(q.memberId?{id:q.memberId}:{}),...(q.q?{characterName:{contains:q.q,mode:"insensitive" as const}}:{})};
    const [rows,count,templates,templateCount,campaigns,campaignCount,staff,staffCount,rawSelected,choiceTemplate,choiceCampaign]=await Promise.all([
      q.view==="records"?tx.hrRecord.findMany({where,select:{id:true,memberId:true,employeeName:true,title:true,templateName:true,status:true,revision:true,occurredAt:true,publishedAt:true,acknowledgedAt:true,scoreBps:true},orderBy:[{occurredAt:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25}):[],
      q.view==="records"?tx.hrRecord.count({where}):0,
      q.view==="templates"?tx.hrTemplate.findMany({where:templateWhere,orderBy:[{archived:"asc"},{name:"asc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],
      q.view==="templates"?tx.hrTemplate.count({where:templateWhere}):0,
      q.view==="campaigns"?tx.hrCampaign.findMany({where:campaignWhere,include:{_count:{select:{records:true}}},orderBy:[{from:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25}):[],
      q.view==="campaigns"?tx.hrCampaign.count({where:campaignWhere}):0,
      q.view==="staff"?tx.companyMember.findMany({where:staffWhere,select:{id:true,characterName:true,department:true,status:true},orderBy:[{characterName:"asc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],
      q.view==="staff"?tx.companyMember.count({where:staffWhere}):0,
      q.recordId?tx.hrRecord.findFirst({where:{...base,id:q.recordId},select:{id:true,memberId:true,kind:true,campaignId:true,title:true,templateName:true,employeeName:true,department:true,status:true,revision:true,occurredAt:true,content:true,conclusion:true,...(manage?{privateNote:true}:{}),criteria:true,goals:true,scoreBps:true,publishedAt:true,acknowledgedAt:true,employeeComment:true,createdAt:true}}):null,
      manage&&q.templateId?tx.hrTemplate.findFirst({where:{companyId:q.companyId,kind:q.kind,id:q.templateId}}):null,
      manage&&q.campaignId&&q.kind==="REVIEW"?tx.hrCampaign.findFirst({where:{companyId:q.companyId,id:q.campaignId},include:{_count:{select:{records:true}}}}):null,
    ]);
    if(q.recordId&&!rawSelected||q.templateId&&!choiceTemplate||q.campaignId&&!choiceCampaign)throw new AppError("Élément RH introuvable.",404);
    const eventWhere={companyId:q.companyId,recordId:rawSelected?.id??"",...(!manage?{action:{in:["PUBLISH","ARCHIVE","REVOKE","ACK","GOAL"]}}:{})};
    const [events,eventCount,progress]=await Promise.all([
      rawSelected?tx.hrRecordEvent.findMany({where:eventWhere,select:{id:true,action:true,actorName:true,reason:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.eventPage-1)*25}):[],
      rawSelected?tx.hrRecordEvent.count({where:eventWhere}):0,
      rawSelected&&q.kind==="REVIEW"?tx.hrRecord.findMany({where:{...base,memberId:rawSelected.memberId,publishedAt:{not:null},status:{in:["PUBLISHED","ARCHIVED"]}},select:{id:true,title:true,occurredAt:true,scoreBps:true},orderBy:[{occurredAt:"desc"},{id:"desc"}],take:12}):[],
    ]);
    return {manage,viewerId:viewer.id,rows,total:count,templates:templates.map(t=>({...t,criteria:criteria(t.criteria)})),templateCount,campaigns:campaigns.map(c=>({...c,criteria:criteria(c.criteria)})),campaignCount,staff,staffCount,selected:rawSelected?{...rawSelected,criteria:criteria(rawSelected.criteria),goals:goals(rawSelected.goals)}:null,events,eventCount,progress,choiceTemplate:choiceTemplate?{...choiceTemplate,criteria:criteria(choiceTemplate.criteria)}:null,choiceCampaign:choiceCampaign?{...choiceCampaign,criteria:criteria(choiceCampaign.criteria)}:null};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
export type PeopleData=Awaited<ReturnType<typeof readPeople>>;
