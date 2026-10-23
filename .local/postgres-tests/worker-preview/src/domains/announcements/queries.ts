import {Prisma} from "@prisma/client";
import type {z} from "zod";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {parisDay} from "@/domains/planning/recurrence";
import {announcementAccess,announcementVisibility} from "./service";
import type {announcementQuery} from "./validation";
const summary={id:true,title:true,priority:true,scope:true,department:true,status:true,pinned:true,revision:true,startsAt:true,expiresAt:true,publisherName:true,publishedAt:true,createdAt:true} satisfies Prisma.AnnouncementSelect;
export async function readAnnouncements(userId:string,q:z.infer<typeof announcementQuery>,now=new Date()){
  return db.$transaction(async tx=>{
    const viewer=await membership(tx,q.companyId,userId);announcementAccess(viewer);const manage=viewer.role.permissions.includes("company.manage");
    if(!manage&&["drafts","scheduled","departments"].includes(q.view))throw new AppError("Espace réservé à la direction.",403);
    const visibility=announcementVisibility(viewer,manage,now);
    const stage:Prisma.AnnouncementWhereInput=q.view==="drafts"?{status:"DRAFT"}:q.view==="scheduled"?{status:"PUBLISHED",startsAt:{gt:now}}:q.view==="archives"?{OR:[{status:"ARCHIVED"},{status:"PUBLISHED",expiresAt:{lte:now}}]}:{status:"PUBLISHED",startsAt:{lte:now},OR:[{expiresAt:null},{expiresAt:{gt:now}}]};
    const where:Prisma.AnnouncementWhereInput={AND:[visibility,stage,...(q.q?[{OR:[{title:{contains:q.q,mode:"insensitive" as const}},{body:{contains:q.q,mode:"insensitive" as const}}]}]:[]),...(q.priority?[{priority:q.priority}]:[]),...(q.unread==="true"?[{reads:{none:{memberId:viewer.id}}}]:[]),...(q.from||q.to?[{startsAt:{...(q.from?{gte:parisDay(q.from)}:{}),...(q.to?{lt:parisDay(q.to,1)}:{})}}]:[])]};
    const departmentWhere:Prisma.CompanyMemberWhereInput={companyId:q.companyId,status:"ACTIVE",...(q.q?{department:{contains:q.q,mode:"insensitive"}}:{})};
    const [rows,total,selected,departments,departmentCount]=await Promise.all([
      q.view!=="departments"?tx.announcement.findMany({where,select:{...summary,reads:{where:{memberId:viewer.id},select:{readAt:true}}},orderBy:[{pinned:"desc"},{startsAt:{sort:"desc",nulls:"last"}},{createdAt:"desc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],
      q.view!=="departments"?tx.announcement.count({where}):0,
      q.id?tx.announcement.findFirst({where:{AND:[visibility,{id:q.id}]},select:{...summary,body:true,authorName:true,updatedAt:true,reads:{where:{memberId:viewer.id},select:{readAt:true}}}}):null,
      q.view==="departments"?tx.companyMember.groupBy({by:["department"],where:departmentWhere,orderBy:{department:"asc"},take:25,skip:(q.page-1)*25}):[],
      q.view==="departments"?tx.$queryRaw<{count:number}[]>(Prisma.sql`SELECT COUNT(DISTINCT department)::int AS count FROM "CompanyMember" WHERE "companyId"=${q.companyId} AND status='ACTIVE' ${q.q?Prisma.sql`AND department ILIKE ${`%${q.q}%`}`:Prisma.empty}`):[],
    ]);
    if(q.id&&!selected)throw new AppError("Annonce introuvable.",404);
    const id=selected?.id??"",eventWhere={companyId:q.companyId,announcementId:id,...(!manage?{action:{in:["PUBLISH","PIN","ARCHIVE","RESTORE"]}}:{})};
    const [events,eventCount,readers,readCount]=await Promise.all([
      selected?tx.announcementEvent.findMany({where:eventWhere,select:{id:true,actorName:true,action:true,reason:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.eventPage-1)*25}):[],
      selected?tx.announcementEvent.count({where:eventWhere}):0,
      manage&&selected?tx.announcementRead.findMany({where:{companyId:q.companyId,announcementId:id},select:{id:true,memberName:true,department:true,readAt:true},orderBy:[{readAt:"desc"},{id:"desc"}],take:25,skip:(q.readPage-1)*25}):[],
      manage&&selected?tx.announcementRead.count({where:{companyId:q.companyId,announcementId:id}}):0,
    ]);
    return {rows,total,selected,departments,departmentCount:departmentCount[0]?.count??0,events,eventCount,readers,readCount,manage,now:now.toISOString()};
  },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type AnnouncementData=Awaited<ReturnType<typeof readAnnouncements>>;
