import {projectedTime} from "@/domains/time/queries";
import {timeInclude,effectiveTime} from "@/domains/time/calculation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { membership } from "@/domains/core/service";
import { AppError } from "@/domains/core/errors";
import { hrActions } from "./validation";
type HrAction = z.infer<typeof hrActions[number]>;
type Actor = { id: string; name: string };
export async function executeHr(tx: Prisma.TransactionClient, companyId: string, member: Awaited<ReturnType<typeof membership>>, actor: Actor, input: HrAction) {
  if (!member.role.permissions.includes("employees.manage") || !member.company.modules.some(m => m.key === "employees" && m.enabled)) throw new AppError("Accès RH insuffisant ou module désactivé.", 403);
  const target = await tx.companyMember.findFirst({ where: { companyId, id: input.memberId } });
  if (!target) throw new AppError("Employé introuvable.", 404);
  let result;
  if (input.action === "employee.profile") {
    await tx.companyMember.update({ where: { id: target.id }, data: { characterName: input.characterName } });
    result = await tx.employeeProfile.upsert({ where: { companyId_memberId: { companyId, memberId: target.id } }, create: { companyId, memberId: target.id, phone: input.phone, jobTitle: input.jobTitle, biography: input.biography }, update: { phone: input.phone, jobTitle: input.jobTitle, biography: input.biography } });
    await tx.employeeEvent.create({ data: { companyId, memberId: target.id, kind: "PROFILE", title: "Informations RP mises à jour", content: "Nom RP, fonction, téléphone ou présentation modifiés.", actorId: actor.id, actorName: actor.name } });
  } else result = await tx.employeeEvent.create({ data: { companyId, memberId: target.id, kind: input.kind, title: input.title, content: input.content, actorId: actor.id, actorName: actor.name } });
  // Confidential notes and profile text are never copied into the general audit.
  await tx.auditLog.create({ data: { companyId, actorId: actor.id, actorName: actor.name, action: input.action === "employee.profile" ? "Informations RP du dossier modifiées" : "Élément ajouté au dossier RH", entityId: target.id, details: { kind: input.action === "employee.event" ? input.kind : "PROFILE" } } });
  return { id: result.id };
}
export async function getEmployeeDossier(userId: string, companyId: string, memberId: string, cursor?: string) {
  const viewer = await membership(db, companyId, userId);
  const permits = (key: string, permission: string) => viewer.role.permissions.includes(permission) && viewer.company.modules.some(m => m.key === key && m.enabled);
  if (!permits("employees", "employees.read")) throw new AppError("Accès au dossier refusé.", 403);
  const manager = viewer.role.permissions.includes("employees.manage");
  const target = await db.companyMember.findFirst({ where: { companyId, id: memberId }, select: { id: true, characterName: true, department: true, status: true, hiredAt: true, role: { select: { name: true, isOwner: true } }, ...(manager ? { salary: true } : {}), profile: manager ? true : { select: { jobTitle: true } } } });
  if (!target) throw new AppError("Employé introuvable.", 404);
  const eventWhere = { companyId, memberId, ...(manager ? {} : { kind: { in: ["GRADE", "DEPARTMENT", "STATUS", "HIRE"] } }) };
  if (cursor && !await db.employeeEvent.findFirst({ where: { ...eventWhere, id: cursor } })) throw new AppError("Page du dossier introuvable.", 404);
  const canTime = permits("time", "time.use") && (manager || viewer.id === memberId);
  const [events, shifts, timeEntries, totalEvents, totalShifts, hours] = await Promise.all([
    db.employeeEvent.findMany({ where: eventWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }),
    permits("planning", "planning.read") ? db.shift.findMany({ where: { companyId, memberId,status:"SCHEDULED",end: { gte: new Date() } }, orderBy: { start: "asc" }, take: 30 }) : [],
    canTime ? db.timeEntry.findMany({ where: { companyId, memberId }, orderBy: { start: "desc" }, take: 30,include:timeInclude }).then(rows=>rows.map(row=>({...row,...effectiveTime(row)}))) : [],
    db.employeeEvent.count({ where: eventWhere }),
    permits("planning", "planning.read") ? db.shift.count({ where: { companyId, memberId,status:"SCHEDULED",end: { gte: new Date() } } }) : null,
    canTime ? db.$queryRaw<{minutes:bigint;count:bigint}[]>(Prisma.sql`WITH e AS (${projectedTime(companyId,memberId)}) SELECT COALESCE(SUM(minutes),0)::bigint AS minutes,COUNT(*)::bigint AS count FROM e WHERE "end" IS NOT NULL`) : [],
  ]);
  return { target, manager, permissions: { documents: viewer.company.modules.some(m=>m.key==="documents"&&m.enabled)&&(manager||viewer.id===memberId), planning: permits("planning", "planning.read"), time: canTime, reviews: permits("reviews", "employees.read") && (manager || viewer.id === memberId), sanctions: permits("sanctions", "employees.read") && (manager || viewer.id === memberId) }, events: events.slice(0, 30), nextCursor: events.length > 30 ? events[29].id : null, totalEvents, shifts, totalShifts, timeEntries, stats: canTime ? { completedServices: Number(hours[0]?.count || 0), minutes: Number(hours[0]?.minutes || 0) } : null };
}
export type EmployeeDossier = Awaited<ReturnType<typeof getEmployeeDossier>>;
