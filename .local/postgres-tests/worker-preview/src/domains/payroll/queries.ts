import {Prisma} from "@prisma/client";
import type {z} from "zod";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {canManagePay,canPay,payrollAccess} from "./service";
import type {payrollQuery} from "./validation";
export async function readPayroll(userId:string,q:z.infer<typeof payrollQuery>){
  return db.$transaction(async tx=>{
    const viewer=await membership(tx,q.companyId,userId);payrollAccess(viewer);
    const manage=canManagePay(viewer),pay=canPay(viewer);
    const privacy:Prisma.PayrollSlipWhereInput=manage?{}:{memberId:viewer.id,status:{in:["APPROVED","PAID"]}};
    const where:Prisma.PayrollSlipWhereInput={companyId:q.companyId,...privacy};
    const selected=q.slipId?await tx.payrollSlip.findFirst({where:{...where,id:q.slipId},include:{companyRun:true}}):null;
    if(q.slipId&&!selected)throw new AppError("Bulletin introuvable.",404);
    const runId=selected?.runId??q.runId;
    const run=runId?await tx.payrollRun.findFirst({where:{companyId:q.companyId,id:runId,...(!manage?{slips:{some:privacy}}:{})}}):null;
    if(runId&&!run)throw new AppError("Période inaccessible.",404);
    const runWhere:Prisma.PayrollRunWhereInput={companyId:q.companyId,...(!manage?{slips:{some:privacy}}:{})};
    const slipWhere:Prisma.PayrollSlipWhereInput={...where,runId:run?.id??"",...(q.q?{employeeName:{contains:q.q,mode:"insensitive"}}:{})};
    const staffWhere={companyId:q.companyId,...(q.q?{characterName:{contains:q.q,mode:"insensitive" as const}}:{})};
    const [runs,runCount,rows,total,staff,staffCount,roles,accounts,events,eventCount]=await Promise.all([
      tx.payrollRun.findMany({where:runWhere,orderBy:[{from:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25}),
      tx.payrollRun.count({where:runWhere}),
      tx.payrollSlip.findMany({where:slipWhere,orderBy:[{employeeName:"asc"},{id:"asc"}],take:25,skip:(q.staffPage-1)*25}),
      tx.payrollSlip.count({where:slipWhere}),
      manage?tx.companyMember.findMany({where:staffWhere,select:{id:true,characterName:true,department:true,roleId:true,status:true,salary:true},orderBy:[{characterName:"asc"},{id:"asc"}],take:25,skip:(q.staffPage-1)*25}):[],
      manage?tx.companyMember.count({where:staffWhere}):0,
      manage?tx.companyRole.findMany({where:{companyId:q.companyId},select:{id:true,name:true},orderBy:{position:"asc"}}):[],
      pay?tx.financeAccount.findMany({where:{companyId:q.companyId,archived:false},select:{id:true,name:true},orderBy:{name:"asc"}}):[],
      selected?tx.payrollEvent.findMany({where:{companyId:q.companyId,slipId:selected.id},select:{id:true,action:true,actorId:true,reason:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.eventPage-1)*25}):[],
      selected?tx.payrollEvent.count({where:{companyId:q.companyId,slipId:selected.id}}):0,
    ]);
    const policies=manage?await tx.payrollPolicy.findMany({where:{companyId:q.companyId,OR:[{memberId:{in:staff.map(m=>m.id)}},{roleId:{in:roles.map(r=>r.id)}}]}}):[];
    const authors=events.length?await tx.user.findMany({where:{id:{in:[...new Set(events.map(e=>e.actorId))]}},select:{id:true,name:true}}):[];
    const totals=await tx.payrollSlip.aggregate({where:slipWhere,_sum:{total:true},_count:true});
    return {runs,runCount,run,rows,total,staff,staffCount,roles,policies,accounts,selected,events:events.map(e=>({...e,actorName:authors.find(a=>a.id===e.actorId)?.name??"Utilisateur supprimé"})),eventCount,manage,pay,viewerId:viewer.id,summary:{total:totals._sum.total??0,count:totals._count},company:{name:viewer.company.name,currency:viewer.company.currency}};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
export type PayrollData=Awaited<ReturnType<typeof readPayroll>>;
