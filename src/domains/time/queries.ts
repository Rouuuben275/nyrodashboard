import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {timeAccess} from "./service";
import type {z} from "zod";
import type {timeQuery} from "./validation";

export function projectedTime(companyId:string,memberId?:string){return Prisma.sql`
 SELECT t.id,t."memberId",t.revision,m."characterName",m.department,t.start AS "originalStart",t."end" AS "originalEnd",
 COALESCE(c.start,t.start) AS start,COALESCE(c."end",t."end") AS "end",(c.id IS NOT NULL) AS corrected,
 FLOOR(COALESCE(c."pauseMinutes"*60,p.seconds,0)/60)::int AS "pauseMinutes",(t."end" IS NULL AND COALESCE(p.open,false)) AS paused,
 FLOOR(GREATEST(0,EXTRACT(EPOCH FROM (COALESCE(c."end",t."end",NOW() AT TIME ZONE 'UTC')-COALESCE(c.start,t.start)))-COALESCE(c."pauseMinutes"*60,p.seconds,0))/60)::int AS minutes,
 CASE WHEN t."end" IS NULL THEN 'OPEN' ELSE COALESCE(r.status,'PENDING') END AS status
 FROM "TimeEntry" t JOIN "CompanyMember" m ON m."companyId"=t."companyId" AND m.id=t."memberId"
 LEFT JOIN LATERAL (SELECT c.* FROM "TimeCorrection" c WHERE c."companyId"=t."companyId" AND c."entryId"=t.id ORDER BY c.revision DESC LIMIT 1) c ON true
 LEFT JOIN LATERAL (SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(p."end",t."end",NOW() AT TIME ZONE 'UTC')-p.start))) AS seconds,BOOL_OR(p."end" IS NULL) AS open FROM "TimePause" p WHERE p."companyId"=t."companyId" AND p."entryId"=t.id) p ON true
 LEFT JOIN "TimeReview" r ON r."companyId"=t."companyId" AND r."entryId"=t.id AND r.revision=t.revision
 WHERE t."companyId"=${companyId} ${memberId?Prisma.sql`AND t."memberId"=${memberId}`:Prisma.empty}`;}
export type TimeRow={id:string;memberId:string;revision:number;characterName:string;department:string;originalStart:Date;originalEnd:Date|null;start:Date;end:Date|null;corrected:boolean;pauseMinutes:number;paused:boolean;minutes:number;status:string};
export function timeWhere(q:z.infer<typeof timeQuery>){
  const conditions=[Prisma.sql`true`],day=Prisma.sql`((e.start AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date`;
  if(q.from)conditions.push(Prisma.sql`${day}>=${q.from}::date`);if(q.to)conditions.push(Prisma.sql`${day}<=${q.to}::date`);if(q.status)conditions.push(Prisma.sql`e.status=${q.status}`);
  return Prisma.sql`WHERE ${Prisma.join(conditions," AND ")}`;
}
export async function readTime(userId:string,q:z.infer<typeof timeQuery>&{entryId?:string}){
  const viewer=await membership(db,q.companyId,userId);timeAccess(viewer);
  const manage=viewer.role.permissions.includes("employees.manage");
  if(q.memberId&&!manage&&q.memberId!==viewer.id)throw new AppError("Ces heures sont privées.",403);
  const memberId=manage?q.memberId:viewer.id;
  return db.$transaction(async tx=>{
    if(q.memberId&&!await tx.companyMember.findFirst({where:{id:q.memberId,companyId:q.companyId}}))throw new AppError("Employé introuvable.",404);
    const cte=Prisma.sql`WITH e AS (${projectedTime(q.companyId,memberId)})`,where=timeWhere(q);
    const rows=await tx.$queryRaw<TimeRow[]>(Prisma.sql`${cte} SELECT * FROM e ${where} ORDER BY start DESC,id DESC LIMIT 25 OFFSET ${(q.page-1)*25}`);
    const stats=await tx.$queryRaw<{count:bigint;minutes:bigint;approved:bigint;pending:bigint}[]>(Prisma.sql`${cte} SELECT COUNT(*)::bigint AS count,COALESCE(SUM(minutes) FILTER (WHERE "end" IS NOT NULL),0)::bigint AS minutes,COALESCE(SUM(minutes) FILTER (WHERE status='APPROVED'),0)::bigint AS approved,COUNT(*) FILTER (WHERE status='PENDING')::bigint AS pending FROM e ${where}`);
    const departments=manage?await tx.$queryRaw<{department:string;minutes:bigint;approved:bigint}[]>(Prisma.sql`${cte} SELECT department,COALESCE(SUM(minutes) FILTER (WHERE "end" IS NOT NULL),0)::bigint AS minutes,COALESCE(SUM(minutes) FILTER (WHERE status='APPROVED'),0)::bigint AS approved FROM e ${where} GROUP BY department ORDER BY department`):[];
    const active=await tx.$queryRaw<TimeRow[]>(Prisma.sql`WITH e AS (${projectedTime(q.companyId,viewer.id)}) SELECT * FROM e WHERE "end" IS NULL ORDER BY start DESC LIMIT 1`);
    const selectedRows=q.entryId?await tx.$queryRaw<TimeRow[]>(Prisma.sql`${cte} SELECT * FROM e WHERE id=${q.entryId}`):[];
    if(q.entryId&&!selectedRows.length)throw new AppError("Pointage introuvable.",404);
    const details=q.entryId?await tx.timeEntry.findFirst({where:{companyId:q.companyId,id:q.entryId},include:{pauses:{orderBy:{start:"desc"},take:100},corrections:{orderBy:{revision:"desc"},take:100},reviews:{orderBy:{revision:"desc"},take:100}}}):null;
    const authorIds=details?[...new Set([...details.pauses,...details.corrections,...details.reviews].map(item=>item.actorId))]:[];
    const authors=authorIds.length?await tx.user.findMany({where:{id:{in:authorIds}},select:{id:true,name:true}}):[];
    const enrich=<T extends {actorId:string}>(items:T[])=>items.map(item=>({...item,actorName:authors.find(a=>a.id===item.actorId)?.name??"Utilisateur supprimé"}));
    const detailData=details?{...details,pauses:enrich(details.pauses),corrections:enrich(details.corrections),reviews:enrich(details.reviews)}:null;
    const staff=manage?await tx.companyMember.findMany({where:{companyId:q.companyId},select:{id:true,characterName:true},orderBy:{characterName:"asc"},take:501}):[];
    return {rows,active:active[0]??null,selected:selectedRows[0]??null,details:detailData,total:Number(stats[0].count),summary:{minutes:Number(stats[0].minutes),approvedMinutes:Number(stats[0].approved),pending:Number(stats[0].pending)},departments:departments.map(d=>({department:d.department,minutes:Number(d.minutes),approvedMinutes:Number(d.approved)})),staff:staff.slice(0,500),staffTruncated:staff.length>500,manage,viewerId:viewer.id};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
export type TimeData=Awaited<ReturnType<typeof readTime>>;

export async function timeReport(userId:string,q:z.infer<typeof timeQuery>,limit:number){
  return db.$transaction(async tx=>{
    const viewer=await membership(tx,q.companyId,userId);timeAccess(viewer);
    const manage=viewer.role.permissions.includes("employees.manage");
    if(q.memberId&&!manage&&q.memberId!==viewer.id)throw new AppError("Ces heures sont privées.",403);
    const memberId=manage?q.memberId:viewer.id;
    if(q.memberId&&!await tx.companyMember.findFirst({where:{companyId:q.companyId,id:q.memberId}}))throw new AppError("Employé introuvable.",404);
    const rows=await tx.$queryRaw<TimeRow[]>(Prisma.sql`WITH e AS (${projectedTime(q.companyId,memberId)}) SELECT * FROM e ${timeWhere(q)} ORDER BY start,id LIMIT ${limit+1}`);
    if(rows.length>limit)throw new AppError(`Plus de ${limit} pointages : réduisez la période ou les filtres.`,413);
    return {company:viewer.company.name,rows};
  },{isolationLevel:"RepeatableRead",timeout:20000});
}
