import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {scheduleAccess} from "./service";
import {parisDay} from "./recurrence";
import type {z} from "zod";
import type {planningQuery,leavesQuery} from "./validation";
export async function readPlanning(userId:string,q:z.infer<typeof planningQuery>){
  const viewer=await membership(db,q.companyId,userId);scheduleAccess(viewer,"planning","planning.read");
  const manage=viewer.role.permissions.includes("planning.manage"),canLeaves=viewer.role.permissions.includes("leaves.read")&&viewer.company.modules.some(m=>m.key==="leaves"&&m.enabled);
  return db.$transaction(async tx=>{
    const period={start:{lt:new Date(q.to)},end:{gt:new Date(q.from)}};
    const where={companyId:q.companyId,status:"SCHEDULED",...period,...(q.memberId?{memberId:q.memberId}:{}),...(q.department?{member:{department:q.department}}:{})};
    if(await tx.shift.count({where})>2000)throw new AppError("Plus de 2 000 services sur la période : filtrez un employé ou un département.",413);
    const shifts=await tx.shift.findMany({where,include:{member:{select:{characterName:true}}},orderBy:[{start:"asc"},{id:"asc"}]});
    const leaveWhere={companyId:q.companyId,status:"APPROVED",...period,...(q.department?{member:{department:q.department}}:{}),...(q.memberId?{AND:{memberId:q.memberId}}:{}),...(viewer.role.permissions.includes("leaves.manage")?(q.memberId?{memberId:q.memberId}:{}):{memberId:viewer.id})};
    if(canLeaves&&await tx.leaveRequest.count({where:leaveWhere})>1000)throw new AppError("Trop d’absences sur cette période. Réduisez la période.",413);
    const leaves=canLeaves?await tx.leaveRequest.findMany({where:leaveWhere,select:{id:true,memberId:true,start:true,end:true,member:{select:{characterName:true}}},orderBy:{start:"asc"}}):[];
    const availabilityWhere={companyId:q.companyId,active:true,...period,...(q.department?{member:{department:q.department}}:{}),...(q.memberId?{AND:{memberId:q.memberId}}:{}),...(manage?(q.memberId?{memberId:q.memberId}:{}):{memberId:viewer.id})};
    if(await tx.memberAvailability.count({where:availabilityWhere})>2000)throw new AppError("Trop de disponibilités : réduisez la période ou filtrez un employé.",413);
    const availabilities=await tx.memberAvailability.findMany({where:availabilityWhere,include:{member:{select:{characterName:true}}},orderBy:{start:"asc"}});
    const staff=await tx.companyMember.findMany({where:{companyId:q.companyId},select:{id:true,characterName:true,department:true,status:true},orderBy:{characterName:"asc"},take:501});
    return {shifts,leaves,availabilities,staff:staff.slice(0,500),staffTruncated:staff.length>500,manage,viewerId:viewer.id};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
export async function readLeaves(userId:string,q:z.infer<typeof leavesQuery>){
  const viewer=await membership(db,q.companyId,userId);scheduleAccess(viewer,"leaves","leaves.read");const manage=viewer.role.permissions.includes("leaves.manage");
  if(q.memberId&&!manage&&q.memberId!==viewer.id)throw new AppError("Ces demandes sont privées.",403);
  return db.$transaction(async tx=>{
    const where:Prisma.LeaveRequestWhereInput={companyId:q.companyId,...(manage?(q.memberId?{memberId:q.memberId}:{}):{memberId:viewer.id}),...(q.status?{status:q.status}:{}),...(q.from?{end:{gt:parisDay(q.from)}}:{}),...(q.to?{start:{lt:parisDay(q.to,1)}}:{})};
    const total=await tx.leaveRequest.count({where});
    if(q.view==="calendar"&&total>1000)throw new AppError("Plus de 1 000 absences : filtrez un employé ou un statut.",413);
    const records=await tx.leaveRequest.findMany({where,include:{member:{select:{characterName:true}}},orderBy:[{start:"desc"},{id:"desc"}],take:q.view==="calendar"?1000:25,skip:q.view==="calendar"?0:(q.page-1)*25});
    const pendingIds=records.filter(row=>row.status==="PENDING").map(row=>row.id);
    const conflicts=pendingIds.length?await tx.$queryRaw<{id:string;count:number}[]>(Prisma.sql`
      SELECT l.id, COUNT(s.id)::int AS count FROM "LeaveRequest" l
      LEFT JOIN "Shift" s ON s."companyId"=l."companyId" AND s."memberId"=l."memberId"
        AND s.status='SCHEDULED' AND s.start<l.end AND s.end>l.start
      WHERE l."companyId"=${q.companyId} AND l.id IN (${Prisma.join(pendingIds)}) GROUP BY l.id
    `):[];
    const counts=new Map(conflicts.map(row=>[row.id,row.count]));
    const rows=records.map(row=>({...row,conflicts:counts.get(row.id)??0}));
    const types=await tx.leaveType.findMany({where:{companyId:q.companyId},orderBy:[{archived:"asc"},{name:"asc"}]});
    const staff=manage?await tx.companyMember.findMany({where:{companyId:q.companyId},select:{id:true,characterName:true},orderBy:{characterName:"asc"},take:501}):[];
    return {rows,total,types,staff:staff.slice(0,500),staffTruncated:staff.length>500,manage,cancelShifts:viewer.role.permissions.includes("planning.manage")&&viewer.company.modules.some(m=>m.key==="planning"&&m.enabled),viewerId:viewer.id};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
export type PlanningData=Awaited<ReturnType<typeof readPlanning>>;
export type LeavesData=Awaited<ReturnType<typeof readLeaves>>;
