import {Prisma} from "@prisma/client";
import type {z} from "zod";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {parisDay} from "@/domains/planning/recurrence";
import {calendarAccess,calendarVisibility} from "./service";
import type {calendarQuery} from "./validation";
const summary={id:true,title:true,kind:true,visibility:true,status:true,start:true,end:true,revision:true,seriesId:true} satisfies Prisma.CalendarEventSelect;
export async function readCalendar(userId:string,q:z.infer<typeof calendarQuery>){
  return db.$transaction(async tx=>{
    const viewer=await membership(tx,q.companyId,userId);calendarAccess(viewer);const manage=viewer.role.permissions.includes("company.manage");
    if(q.view==="staff"&&!manage)throw new AppError("Annuaire réservé aux organisateurs.",403);
    const access=calendarVisibility(viewer,manage),where:Prisma.CalendarEventWhereInput={AND:[access,{start:{lt:parisDay(q.to,1)},end:{gt:parisDay(q.from)}},...(q.cancelled==="true"?[]:[{status:"SCHEDULED"}]),...(q.kind?[{kind:q.kind}]:[]),...(q.mine==="true"?[{invites:{some:{memberId:viewer.id,active:true}}}]:[]),...(q.q?[{OR:[{title:{contains:q.q,mode:"insensitive" as const}},{location:{contains:q.q,mode:"insensitive" as const}}]}]:[])]};
    const staffWhere:Prisma.CompanyMemberWhereInput={companyId:q.companyId,status:"ACTIVE",role:{permissions:{has:"dashboard.read"}},...(q.q?{characterName:{contains:q.q,mode:"insensitive"}}:{})};
    const [total,rows,selected,staff,staffCount]=await Promise.all([
      q.view!=="staff"?tx.calendarEvent.count({where}):0,
      q.view!=="staff"?tx.calendarEvent.findMany({where,select:{...summary,invites:{where:{memberId:viewer.id,active:true},select:{id:true,response:true,revision:true}}},orderBy:[{start:"asc"},{id:"asc"}],take:q.view==="grid"?501:25,skip:q.view==="grid"?0:(q.page-1)*25}):[],
      q.id?tx.calendarEvent.findFirst({where:{AND:[access,{id:q.id}]},select:{...summary,description:true,location:true,series:{select:{id:true,occurrences:true,intervalWeeks:true,revision:true}},invites:{where:{memberId:viewer.id,active:true},select:{id:true,response:true,responseNote:true,respondedAt:true,attendance:true,attendanceNote:true,attendanceAt:true,revision:true}}}}):null,
      q.view==="staff"?tx.companyMember.findMany({where:staffWhere,select:{id:true,characterName:true,department:true},orderBy:[{characterName:"asc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],
      q.view==="staff"?tx.companyMember.count({where:staffWhere}):0,
    ]);
    if(q.view==="grid"&&total>500)throw new AppError("Plus de 500 événements : passez en Agenda ou réduisez la période et les filtres.",413);
    if(q.id&&!selected)throw new AppError("Événement introuvable.",404);
    const id=selected?.id??"",eventWhere={companyId:q.companyId,eventId:id,...(!manage?{action:{in:["CREATE","UPDATE","CANCEL"]}}:{})};
    const [invites,inviteCount,choices,events,eventCount]=await Promise.all([
      selected&&manage?tx.calendarInvite.findMany({where:{companyId:q.companyId,eventId:id},select:{id:true,memberId:true,memberName:true,active:true,response:true,responseNote:true,respondedAt:true,attendance:true,attendanceNote:true,attendanceAt:true,revision:true},orderBy:[{active:"desc"},{memberName:"asc"},{id:"asc"}],take:25,skip:(q.invitePage-1)*25}):[],
      selected&&manage?tx.calendarInvite.count({where:{companyId:q.companyId,eventId:id}}):0,
      selected&&manage?tx.calendarInvite.findMany({where:{companyId:q.companyId,eventId:id,active:true},select:{memberId:true,memberName:true},orderBy:{id:"asc"},take:50}):[],
      selected?tx.calendarHistory.findMany({where:eventWhere,select:{id:true,actorName:true,action:true,reason:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.eventPage-1)*25}):[],
      selected?tx.calendarHistory.count({where:eventWhere}):0,
    ]);
    return {rows,total,selected,staff,staffCount,invites,inviteCount,choices,events,eventCount,manage,now:new Date().toISOString()};
  },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type CalendarData=Awaited<ReturnType<typeof readCalendar>>;
