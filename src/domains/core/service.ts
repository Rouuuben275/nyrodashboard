import {recordSale} from "@/domains/sales/service";
import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {executeCalendar} from "@/domains/calendar/service";
import {assertActiveUser,assertCompanyActive,activeAccess} from "@/domains/platform/access";
import {assertServerCapacity} from "@/domains/servers/capacity";
import {executeAnnouncement} from "@/domains/announcements/service";
import {executeTask} from "@/domains/tasks/service";
import {executeRecruitment,executeCandidate} from "@/domains/recruitment/service";
import {assertShift,executeLeave,executeSchedule} from "@/domains/planning/service";
import {executeTime} from "@/domains/time/service";
import {executePayroll} from "@/domains/payroll/service";
import {executePeople} from "@/domains/people/service";
import { executeStock } from "@/domains/inventory/service";
import { changeStock } from "@/domains/inventory/ledger";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { allPermissions, canDisable, defaultEmployeePermissions, modules } from "@/domains/modules/registry";
import { AppError } from "./errors";
import { actionSchema, safeTotal } from "./validation";
import { freePlan, readLimits } from "./limits";
import { executeCommerce } from "@/domains/commerce/service";
import { executePurchasing } from "@/domains/purchasing/service";
import { executeHr } from "@/domains/hr/service";
import { executeFinance } from "@/domains/finance/service";
import { postLedger } from "@/domains/finance/ledger";
import {assertCompanySlot} from "@/domains/billing/slots";
import {assertLogoAttachment} from "@/domains/media/service";

type Actor = { id: string; name: string; email: string };
type Tx = Prisma.TransactionClient;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const required: Record<string, [string, string]> = {
  "role.reorder": ["roles.manage", "roles"], "role.delete": ["roles.manage", "roles"],
  "product.update": ["products.manage", "products"], "product.archive": ["products.manage", "products"],
  "company.update": ["company.manage", "dashboard"], "role.create": ["roles.manage", "roles"], "role.update": ["roles.manage", "roles"], "invite.create": ["employees.manage", "employees"], "member.update": ["employees.manage", "employees"],
  "module.toggle": ["modules.manage", "dashboard"], "product.create": ["products.manage", "products"], "inventory.adjust": ["inventory.manage", "inventory"],
  "sale.create": ["sales.create", "sales"], "sale.cancel": ["sales.cancel", "sales"], "expense.create": ["expenses.create", "expenses"], "expense.decide": ["expenses.approve", "expenses"],
  "shift.create": ["planning.manage", "planning"], "shift.update": ["planning.manage", "planning"], "shift.delete": ["planning.manage", "planning"], "time.toggle": ["time.use", "time"],
  "leave.create": ["leaves.read", "leaves"], "leave.decide": ["leaves.manage", "leaves"], "task.create": ["tasks.manage", "tasks"], "task.toggle": ["tasks.manage", "tasks"],
};
async function audit(tx: Tx, companyId: string, actor: Actor, action: string, entityId?: string, details: Prisma.InputJsonValue = {}) {
  await tx.auditLog.create({ data: { companyId, actorId: actor.id, actorName: actor.name, action, entityId, details } });
}
export async function membership(tx: Tx, companyId: string, userId: string) {
  await assertActiveUser(tx,userId);
  const member = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { role: true, company: { include: { modules: true, subscription: { select: { plan: { select: { name: true, limits: true } } } } } } } });
  if (!member || member.status !== "ACTIVE") throw new AppError("Entreprise inaccessible.", 403);
  await assertCompanyActive(tx,member.company);
  // Owner capabilities for the new optional module; stored role grants are preserved.
  if(member.role.isOwner)member.role.permissions=[...new Set([...member.role.permissions,"documents.read","documents.manage","sales.discount","messages.read","messages.send","equipment.read","equipment.manage","statistics.read"])];
  else if(member.role.permissions.includes("documents.manage")&&!member.role.permissions.includes("documents.read"))member.role.permissions=[...member.role.permissions,"documents.read"];
  if(member.role.permissions.includes("equipment.manage")&&!member.role.permissions.includes("equipment.read"))member.role.permissions=[...member.role.permissions,"equipment.read"];
  return member;
}
async function serverAccess(tx: Tx, serverId: string, userId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`server:${serverId}`}))::text`;
  const member = await tx.serverMember.findUnique({ where: { serverId_userId: { serverId, userId } }, include: { role: true,server:true } });
  if (!member||member.status!=="ACTIVE"||(member.expiresAt&&member.expiresAt<=new Date())||!activeAccess(member.server.status,member.server.suspendedUntil)||!member.role.permissions.includes("companies.manage")) throw new AppError("Vous ne pouvez pas administrer ce serveur.", 403);
}
function validRange(start: string, end: string) {
  if (new Date(end) <= new Date(start) || +new Date(end) - +new Date(start) > 90 * 86400000) throw new AppError("La période doit être positive et inférieure à 90 jours.");
}
export async function execute(actor: Actor, companyId: string | undefined, raw: unknown) {
  await assertActiveUser(db,actor.id);
  // Commit the limiter separately so invalid and refused business requests also
  // consume the budget. Never roll this counter back with a stock/permission error.
  const rateKey = `app:${actor.id}:${Math.floor(Date.now() / 60000)}`;
  const rate = await db.rateLimit.upsert({ where: { key: rateKey }, create: { key: rateKey, count: 1, lastRequest: BigInt(Date.now()) }, update: { count: { increment: 1 }, lastRequest: BigInt(Date.now()) } });
  if (rate.count > 80) throw new AppError("Trop d’actions. Réessayez dans une minute.", 429);
  const input = actionSchema.parse(raw);
  // PostgreSQL advisory locks serialize critical writes per tenant; unique constraints
  // and conditional stock decrements remain the final safeguards.
  return db.$transaction(async tx => {
    const userScoped = ["company.create", "server.create", "invite.accept", "invite.decline", "character.create", "notification.read","recruitment.apply","recruitment.accept","recruitment.withdraw"].includes(input.action);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userScoped ? actor.id : companyId || actor.id}))::text`;
    if(input.action==="recruitment.apply"||input.action==="recruitment.accept"||input.action==="recruitment.withdraw")return executeCandidate(tx,actor,input);
    if (input.action === "notification.read") return tx.notification.updateMany({ where: { id: input.notificationId, userId: actor.id }, data: { readAt: new Date() } });
    if (input.action === "character.create") return tx.rPCharacter.create({ data: { userId: actor.id, name: input.name, phone: input.phone } });
    if (input.action === "server.create") {
      throw new AppError("La création de serveurs est réservée à l’administration Nyro Dashboard (/admin/servers).",403);
    }
    if (input.action === "company.create") {
      const plan = await freePlan(tx);
      if (input.serverId) {await serverAccess(tx, input.serverId, actor.id);const server=await tx.rPServer.findUniqueOrThrow({where:{id:input.serverId}});if(await tx.company.count({where:{serverId:server.id}})>=server.maxCompanies)throw new AppError("Quota entreprises du serveur atteint.");}
      await assertCompanySlot(tx,actor.id);
      await assertLogoAttachment(tx,actor.id,"company",input.logoAssetId);
      if(input.logoAssetId&&input.logoUrl)throw new AppError("Choisissez un fichier ou un lien pour le logo.");
      const company = await tx.company.create({ data: { name: input.name, sector: input.sector, slug: `${input.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 50)}-${randomBytes(4).toString("hex")}`, serverId: input.serverId,logoAssetId:input.logoAssetId,logoUrl:input.logoUrl } });
      const owner = await tx.companyRole.create({ data: { companyId: company.id, name: "Direction", permissions: allPermissions, isOwner: true } });
      await tx.companyRole.create({ data: { companyId: company.id, name: "Employé", permissions: defaultEmployeePermissions } });
      await tx.companyMember.create({ data: { companyId: company.id, userId: actor.id, roleId: owner.id, characterName: actor.name } });
      await tx.companyModule.createMany({ data: modules.filter(m => m.available).map(m => ({ companyId: company.id, key: m.key, enabled: input.template !== "blank" || Boolean(m.required) })) });
      await tx.subscription.create({ data: { companyId: company.id, planId: plan.id } });
      await audit(tx, company.id, actor, "Entreprise créée", company.id, { template: input.template });
      if (input.serverId) await tx.serverAuditLog.create({ data: { serverId: input.serverId, actorId: actor.id, actorName: actor.name, action: `Entreprise créée : ${company.name}`, entityId: company.id } });
      return company;
    }
    if (input.action === "invite.decline") {
      const invitation = await tx.invitation.findFirst({ where: { id: input.invitationId, email: actor.email.toLowerCase(), status: "PENDING" } });
      if (!invitation) throw new AppError("Invitation introuvable.", 404);
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: "DECLINED" } });
      await audit(tx, invitation.companyId, actor, "Invitation refusée", invitation.id);
      return { ok: true };
    }
    if (input.action === "invite.accept") {
      const invitation = await tx.invitation.findUnique({ where: { tokenHash: hash(input.token) }, include: { company: { include: { subscription: { include: { plan: true } } } } } });
      if (!invitation || invitation.email !== actor.email.toLowerCase() || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) throw new AppError("Invitation invalide, expirée ou destinée à un autre compte.", 403);
      await assertCompanyActive(tx,invitation.company);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${invitation.companyId}))::text`;
      const existing = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId: invitation.companyId, userId: actor.id } } });
      if (existing) throw new AppError("Vous êtes déjà membre de cette entreprise.");
      if(invitation.company.serverId){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;await assertServerCapacity(tx,invitation.company.serverId,actor.id);}
      const limit = readLimits(invitation.company.subscription?.plan.limits).employees;
      if (await tx.companyMember.count({ where: { companyId: invitation.companyId, status: "ACTIVE" } }) >= limit) throw new AppError("Le quota d’employés de cette entreprise est atteint.");
      await tx.companyMember.create({ data: { companyId: invitation.companyId, userId: actor.id, roleId: invitation.roleId, characterName: input.characterName } });
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
      await audit(tx, invitation.companyId, actor, "Invitation acceptée", invitation.id);
      return { id: invitation.companyId };
    }

    if (!companyId) throw new AppError("Sélectionnez une entreprise.");
    const member = await membership(tx, companyId, actor.id);
    if(input.action==="calendar.create"||input.action==="calendar.update"||input.action==="calendar.cancel"||input.action==="calendar.reply"||input.action==="calendar.attendance")return executeCalendar(tx,companyId,member,actor,input);
    if(input.action==="announcement.save"||input.action==="announcement.publish"||input.action==="announcement.transition"||input.action==="announcement.pin"||input.action==="announcement.read")return executeAnnouncement(tx,companyId,member,actor,input);
    if(input.action==="task.create"||input.action==="task.update"||input.action==="task.status"||input.action==="task.toggle"||input.action==="task.check"||input.action==="task.comment"||input.action==="task.archive"||input.action==="task.column")return executeTask(tx,companyId,member,actor,input);
    if(input.action==="hr.template.save"||input.action==="hr.campaign.save"||input.action==="hr.record.save"||input.action==="hr.record.transition"||input.action==="hr.record.ack"||input.action==="hr.record.note"||input.action==="hr.goal")return executePeople(tx,companyId,member,actor,input);
    if(input.action==="payroll.policy"||input.action==="payroll.run"||input.action==="payroll.prepare"||input.action==="payroll.review"||input.action==="payroll.pay"||input.action==="payroll.cancel")return executePayroll(tx,companyId,member,actor,input);
    if(input.action==="recruitment.job.save"||input.action==="recruitment.stage"||input.action==="recruitment.note"||input.action==="recruitment.offer")return executeRecruitment(tx,companyId,member,actor,input);
    if(input.action==="shift.repeat"||input.action==="shift.cancel"||input.action==="shift.series.cancel"||input.action==="availability.save"||input.action==="availability.cancel"||input.action==="leave.type.save"||input.action==="leave.cancel")return executeSchedule(tx,companyId,member,actor,input);
    if(input.action==="leave.create"||input.action==="leave.decide")return executeLeave(tx,companyId,member,actor,input);
    if (input.action === "time.toggle" || input.action === "time.start" || input.action === "time.stop" || input.action === "time.pause" || input.action === "time.correct" || input.action === "time.review" || input.action === "time.reopen") return executeTime(tx,companyId,member,actor,input);
    if (input.action === "stock.warehouse.save" || input.action === "stock.transfer" || input.action === "stock.move" || input.action === "stock.reverse" || input.action === "stock.count.create" || input.action === "stock.count.update" || input.action === "stock.count.refresh" || input.action === "stock.count.post" || input.action === "stock.count.cancel") return executeStock(tx,companyId,member,actor,input);
    if (input.action === "finance.reconcile" || input.action === "finance.account.save" || input.action === "finance.category.save" || input.action === "finance.operation.create" || input.action === "finance.operation.update" || input.action === "finance.operation.post" || input.action === "finance.operation.decide" || input.action === "finance.operation.cancel" || input.action === "finance.operation.reverse") return executeFinance(tx, companyId, member, actor, input);
    if (input.action === "employee.profile" || input.action === "employee.event") return executeHr(tx, companyId, member, actor, input);
    if (input.action === "supplier.save" || input.action === "purchase.save" || input.action === "purchase.transition" || input.action === "purchase.receive") return executePurchasing(tx, companyId, member, actor, input);
    if (input.action === "customer.save" || input.action === "billing.save" || input.action === "billing.transition" || input.action === "billing.convert") return executeCommerce(tx, companyId, member, actor, input);
    const requirement = required[input.action];
    if (!requirement || !member.role.permissions.includes(requirement[0])) throw new AppError("Permission insuffisante.", 403);
    if (!member.company.modules.some(m => m.key === requirement[1] && m.enabled)) throw new AppError("Ce module est désactivé.", 403);
    const findProduct = async (id: string) => {
      const p = await tx.product.findFirst({ where: { id, companyId, archived: false } });
      if (!p) throw new AppError("Produit introuvable.", 404);
      return p;
    };
    let result: unknown = { ok: true };
    let entityId: string | undefined;
    let label: string = input.action;
    let details: Prisma.InputJsonValue = {};
    switch (input.action) {
      case "company.update": {
        if((input.logoAssetId??(input.logoAssetId===null?null:member.company.logoAssetId))&&(input.logoUrl??member.company.logoUrl))throw new AppError("Choisissez un fichier ou un lien pour le logo.");
        if (input.serverId && input.serverId !== member.company.serverId) {await serverAccess(tx, input.serverId, actor.id);const server=await tx.rPServer.findUniqueOrThrow({where:{id:input.serverId}});if(await tx.company.count({where:{serverId:input.serverId}})>=server.maxCompanies)throw new AppError("Quota entreprises du serveur atteint.");const incoming=await tx.companyMember.findMany({where:{companyId,status:"ACTIVE"},select:{userId:true}});await assertServerCapacity(tx,input.serverId,incoming.map(m=>m.userId));}
        if (input.serverId !== undefined && input.serverId !== member.company.serverId) {
          if (member.company.serverId) await tx.serverAuditLog.create({ data: { serverId: member.company.serverId, actorId: actor.id, actorName: actor.name, action: `Entreprise désaffiliée : ${member.company.name}`, entityId: companyId } });
          if (input.serverId) await tx.serverAuditLog.create({ data: { serverId: input.serverId, actorId: actor.id, actorName: actor.name, action: `Entreprise affiliée : ${input.name}`, entityId: companyId } });
        }
        await assertLogoAttachment(tx,actor.id,"company",input.logoAssetId,member.company.logoAssetId);
        const { action: _, ...data } = input;
        details={before:{name:member.company.name,serverId:member.company.serverId,expenseThreshold:member.company.expenseThreshold,logoAssetId:member.company.logoAssetId,logoUrl:member.company.logoUrl},after:{name:input.name,serverId:input.serverId!==undefined?input.serverId:member.company.serverId,expenseThreshold:input.expenseThreshold,logoAssetId:input.logoAssetId===undefined?member.company.logoAssetId:input.logoAssetId,logoUrl:input.logoUrl??member.company.logoUrl}};
        result = await tx.company.update({ where: { id: companyId }, data }); label = "Paramètres de l’entreprise modifiés"; break;
      }
      case "role.create": {
        if (input.permissions.some(p => !allPermissions.includes(p))) throw new AppError("Permission inconnue.");
        if (input.permissions.some(p => !member.role.permissions.includes(p))) throw new AppError("Vous ne pouvez pas déléguer un accès que vous ne possédez pas.", 403);
        if (await tx.companyRole.count({ where: { companyId, isOwner: false } }) >= 100) throw new AppError("Limite de 100 grades personnalisés atteinte.");
        const last = await tx.companyRole.aggregate({ where: { companyId }, _max: { position: true } });
        result = await tx.companyRole.create({ data: { companyId, name: input.name, permissions: [...new Set(input.permissions)], position: (last._max.position || 0) + 10 } }); label = "Grade créé"; break;
      }
      case "role.update": {
        if (input.permissions.some(p => !allPermissions.includes(p))) throw new AppError("Permission inconnue.");
        if (input.permissions.some(p => !member.role.permissions.includes(p))) throw new AppError("Vous ne pouvez pas déléguer un accès que vous ne possédez pas.", 403);
        const role = await tx.companyRole.findFirst({ where: { id: input.roleId, companyId, isOwner: false } });
        if (!role) throw new AppError("Ce grade ne peut pas être modifié.", 403);
        result = await tx.companyRole.update({ where: { id: role.id }, data: { name: input.name, permissions: [...new Set(input.permissions)] } });
        entityId = role.id; details = { before: { name: role.name, permissions: role.permissions }, after: { name: input.name, permissions: input.permissions } };
        label = "Grade et permissions modifiés"; break;
      }
      case "role.reorder": {
        const roles = await tx.companyRole.findMany({ where: { companyId, isOwner: false } });
        if (new Set(input.roleIds).size !== input.roleIds.length || input.roleIds.length !== roles.length || input.roleIds.some(id => !roles.some(r => r.id === id))) throw new AppError("La liste doit contenir chaque grade personnalisé de cette entreprise une seule fois.");
        for (let i = 0; i < input.roleIds.length; i++) await tx.companyRole.update({ where: { id: input.roleIds[i] }, data: { position: (i + 1) * 10 } });
        details = { before: roles.map(r => ({ id: r.id, position: r.position })), after: input.roleIds };
        label = "Hiérarchie des grades réorganisée"; break;
      }
      case "role.delete": {
        const role = await tx.companyRole.findFirst({ where: { companyId, id: input.roleId, isOwner: false } });
        if (!role) throw new AppError("Ce grade ne peut pas être supprimé.", 403);
        if (member.role.id === role.id) throw new AppError("Vous ne pouvez pas supprimer votre propre grade.", 403);
        // Keep former salary rules as history without retaining a deleted grade FK.
        await tx.payrollPolicy.updateMany({where:{companyId,roleId:role.id},data:{roleId:null}});
        const members = await tx.companyMember.findMany({ where: { companyId, roleId: role.id }, select: { id: true } });
        const invitations = await tx.invitation.count({ where: { companyId, roleId: role.id } });
        const replacement = input.replacementId ? await tx.companyRole.findFirst({ where: { companyId, id: input.replacementId, isOwner: false } }) : null;
        if (input.replacementId && (!replacement || replacement.id === role.id)) throw new AppError("Grade de remplacement invalide.");
        if ((members.length || invitations) && !replacement) throw new AppError("Réaffectez les employés et invitations à un grade avant la suppression.");
        if (replacement?.permissions.some(p => !member.role.permissions.includes(p))) throw new AppError("Vous ne pouvez pas déléguer les accès du grade de remplacement.", 403);
        if (replacement) {
          await tx.companyMember.updateMany({ where: { companyId, roleId: role.id }, data: { roleId: replacement.id } });
          await tx.invitation.updateMany({ where: { companyId, roleId: role.id }, data: { roleId: replacement.id } });
          if (members.length) await tx.employeeEvent.createMany({ data: members.map(m => ({ companyId, memberId: m.id, kind: "GRADE", title: "Réaffectation après suppression d’un grade", content: `${role.name} → ${replacement.name}`, actorId: actor.id, actorName: actor.name })) });
        }
        await tx.companyRole.delete({ where: { id: role.id } });
        entityId = role.id; details = { name: role.name, permissions: role.permissions, replacementId: replacement?.id || null, reassignedMembers: members.length, reassignedInvitations: invitations, reason: input.reason };
        label = "Grade supprimé après réaffectation contrôlée"; break;
      }
      case "invite.create": {
        const role = await tx.companyRole.findFirst({ where: { id: input.roleId, companyId, isOwner: false } });
        if (!role) throw new AppError("Grade invalide. Le grade de direction ne peut pas être invité.");
        if (role.permissions.some(p => !member.role.permissions.includes(p))) throw new AppError("Vous ne pouvez pas inviter avec des droits que vous ne possédez pas.", 403);
        const token = randomBytes(32).toString("hex");
        const invitation = await tx.invitation.create({ data: { companyId, email: input.email.toLowerCase(), roleId: role.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
        const user = await tx.user.findUnique({ where: { email: input.email.toLowerCase() } });
        if (user) await notifyUser(tx,{ userId: user.id, title: "Invitation reçue", body: `${member.company.name} vous invite à rejoindre son équipe. Demandez le lien d’invitation au responsable.`,category:"GENERAL",targetUrl:"/espaces" });
        result = { id: invitation.id, token }; label = "Invitation créée"; break;
      }
      case "member.update": {
        const target = await tx.companyMember.findFirst({ where: { id: input.memberId, companyId }, include: { role: true } });
        const role = await tx.companyRole.findFirst({ where: { id: input.roleId, companyId } });
        if (!target || !role) throw new AppError("Employé ou grade introuvable.", 404);
        if (target.role.isOwner || role.isOwner) throw new AppError("La direction ne peut pas être modifiée dans ce formulaire.");
        if (role.permissions.some(p => !member.role.permissions.includes(p))) throw new AppError("Vous ne pouvez pas attribuer des droits que vous ne possédez pas.", 403);
        if (target.status !== "ACTIVE" && input.status === "ACTIVE" && await tx.companyMember.count({ where: { companyId, status: "ACTIVE" } }) >= readLimits(member.company.subscription?.plan.limits).employees) throw new AppError("Le quota d’employés de cette entreprise est atteint.");
        const changes = [
          ...(target.roleId !== role.id ? [{ kind: "GRADE", title: "Changement de grade", content: `${target.role.name} → ${role.name}` }] : []),
          ...(target.department !== input.department ? [{ kind: "DEPARTMENT", title: "Mutation de département", content: `${target.department} → ${input.department}` }] : []),
          ...(target.status !== input.status ? [{ kind: "STATUS", title: "Changement de statut", content: `${target.status} → ${input.status}` }] : []),
        ];
        if (changes.length) await tx.employeeEvent.createMany({ data: changes.map(change => ({ ...change, companyId, memberId: target.id, actorId: actor.id, actorName: actor.name })) });
        if(input.status==="ACTIVE"&&target.status!=="ACTIVE"&&member.company.serverId){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;await assertServerCapacity(tx,member.company.serverId,target.userId);}
        result = await tx.companyMember.update({ where: { id: target.id }, data: { roleId: role.id, department: input.department, status: input.status, salary: input.salary } }); label = "Dossier employé modifié"; break;
      }
      case "module.toggle": {
        const definition = modules.find(m => m.key === input.key && m.available);
        if (!definition || definition.required) throw new AppError("Ce module ne peut pas être modifié.");
        const enabled = member.company.modules.filter(m => m.enabled).map(m => m.key);
        if (!input.enabled && !canDisable(input.key, enabled)) throw new AppError("Désactivez d’abord les modules qui en dépendent.");
        if (input.enabled && definition.dependencies.some(k => !enabled.includes(k))) throw new AppError("Activez d’abord les dépendances : " + definition.dependencies.join(", "));
        await tx.companyModule.upsert({ where: { companyId_key: { companyId, key: input.key } }, create: { companyId, key: input.key, enabled: input.enabled }, update: { enabled: input.enabled } });
        label = `Module ${definition.name} ${input.enabled ? "activé" : "désactivé"}`; break;
      }
      case "product.create": {
        if(!input.trackStock&&input.stock!==0)throw new AppError("Une prestation non suivie doit avoir un stock initial nul.");
        const { action: _, ...data } = input;
        const product = await tx.product.create({ data: { companyId, ...data } });
        if (product.stock) await tx.inventoryMovement.create({ data: { companyId, productId: product.id, quantity: product.stock, reason: "Stock initial", actorId: actor.id, kind:"INITIAL", occurredAt:new Date(), unitCost:product.cost, warehouseLabel:"Stock général" } });
        result = product; label = "Produit ajouté au catalogue"; break;
      }
      case "product.update": {
        const before = await tx.product.findFirst({ where: { id: input.productId, companyId } });
        if (!before) throw new AppError("Produit introuvable.", 404);
        const { action: _, productId: __, ...data } = input;
        result = await tx.product.update({ where: { id: before.id }, data });
        details = { before: { name: before.name, sku: before.sku, category: before.category, price: before.price, cost: before.cost, threshold: before.threshold }, after: data };
        label = "Référence du catalogue modifiée"; break;
      }
      case "product.archive": {
        const product = await tx.product.findFirst({ where: { id: input.productId, companyId } });
        if (!product) throw new AppError("Produit introuvable.", 404);
        if(input.archived&&await tx.warehouseStock.count({where:{companyId,productId:product.id,quantity:{gt:0}}}))throw new AppError("Transférez ou sortez les quantités des entrepôts avant d’archiver cette référence.");
        if(input.archived&&await tx.stockCountLine.count({where:{companyId,productId:product.id,batch:{status:"DRAFT"}}}))throw new AppError("Un inventaire en cours utilise cette référence.");
        if (input.archived && await tx.purchaseItem.count({ where: { companyId, productId: product.id, order: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } } })) throw new AppError("Une commande d’achat utilise cette référence. Réceptionnez ou annulez la commande avant l’archivage.");
        result = await tx.product.update({ where: { id: product.id }, data: { archived: input.archived } });
        details = { before: { archived: product.archived }, after: { archived: input.archived } };
        label = input.archived ? "Référence archivée" : "Référence réactivée"; break;
      }
      case "inventory.adjust": {
        const product = await findProduct(input.productId);
        if (!product.trackStock) throw new AppError("Cette prestation ne suit pas de stock.");
        await changeStock(tx,{companyId,productId:product.id,quantity:input.quantity,kind:"CORRECTION",reason:input.reason,actorId:actor.id});
        details = { before: { stock: product.stock }, after: { stock: product.stock + input.quantity }, reason: input.reason };
        label = "Stock ajusté"; entityId = product.id; break;
      }
      case "sale.create": {
        const recorded=await recordSale(tx,companyId,member,actor,input);
        if(recorded.replayed)return recorded.sale;
        result=recorded.sale;label="Vente enregistrée";entityId=recorded.sale.id;break;
      }
      case "sale.cancel": {
        const sale = await tx.sale.findFirst({ where: { id: input.saleId, companyId }, include: { items: { include: { product: true } } } });
        if (!sale || sale.status !== "COMPLETED") throw new AppError("Vente introuvable ou déjà annulée.");
        await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED",cancelledAt:new Date(),cancelReason:input.reason } });
        for (const item of sale.items.filter(i => i.product.trackStock)) {
          await changeStock(tx,{companyId,productId:item.productId,quantity:item.quantity,kind:"RETURN",reason:`Annulation ${sale.number} : ${input.reason}`.slice(0,500),actorId:actor.id,sourceId:sale.id,allowArchived:true});
        }
        await postLedger(tx, { companyId, amount: -sale.total, kind: "REFUND", label: `Annulation ${sale.number} · ${input.reason}`, sourceId: sale.id, actorId: actor.id }, "SALE");
        label = "Vente annulée et stock restitué"; entityId = sale.id; break;
      }
      case "expense.create": {
        const status = input.amount >= member.company.expenseThreshold ? "PENDING" : "APPROVED";
        const expense = await tx.expense.create({ data: { companyId, label: input.label, amount: input.amount, category: input.category, status, actorId: actor.id } });
        if (status === "APPROVED") await postLedger(tx, { companyId, amount: -expense.amount, kind: "EXPENSE", label: expense.label, sourceId: expense.id, actorId: actor.id });
        result = expense; label = "Dépense enregistrée"; break;
      }
      case "expense.decide": {
        const expense = await tx.expense.findFirst({ where: { id: input.expenseId, companyId, status: "PENDING" } });
        if (!expense) throw new AppError("Dépense introuvable ou déjà traitée.");
        await tx.expense.update({ where: { id: expense.id }, data: { status: input.approve ? "APPROVED" : "DECLINED" } });
        if (input.approve) await postLedger(tx, { companyId, amount: -expense.amount, kind: "EXPENSE", label: expense.label, sourceId: expense.id, actorId: actor.id });
        label = input.approve ? "Dépense validée" : "Dépense refusée"; break;
      }
      case "shift.create":
      case "shift.update": {
        validRange(input.start, input.end);
        const existing = input.action === "shift.update" ? await tx.shift.findFirst({ where: { companyId, id: input.shiftId,status:"SCHEDULED" } }) : null;
        if (input.action === "shift.update" && !existing) throw new AppError("Service introuvable.", 404);
        const target = await tx.companyMember.findFirst({ where: { id: input.memberId, companyId, status: "ACTIVE" } });
        if (!target) throw new AppError("Employé introuvable.");
        if(existing&&input.action==="shift.update"&&input.revision!==undefined&&input.revision!==existing.revision)throw new AppError("Ce service a changé. Actualisez.",409);
        await assertShift(tx,companyId,target.id,new Date(input.start),new Date(input.end),existing?.id);
        const data = { memberId: target.id, title: input.title, start: new Date(input.start), end: new Date(input.end) };
        result = existing ? await tx.shift.update({ where: { id: existing.id }, data:{...data,revision:{increment:1}} }) : await tx.shift.create({ data: { ...data, companyId } });
        await notifyUser(tx,{ userId: target.userId, title: existing ? "Service modifié" : "Nouveau service", body: `${input.title} · ${member.company.name}`,category:"PLANNING",targetUrl:companyNotificationUrl(companyId,"planning") });
        if (existing) await audit(tx, companyId, actor, "Horaires du service modifiés", existing.id, { before: { memberId: existing.memberId, start: existing.start.toISOString(), end: existing.end.toISOString() }, after: { memberId: target.id, start: input.start, end: input.end } });
        label = existing ? "Service modifié" : "Service planifié"; break;
      }
      case "shift.delete": {
        const changed = await tx.shift.deleteMany({ where: { id: input.shiftId, companyId } });
        if (!changed.count) throw new AppError("Service introuvable."); label = "Service supprimé"; entityId = input.shiftId; break;
      }

    }
    const resultId = result && typeof result === "object" && "id" in result ? String(result.id) : entityId;
    await audit(tx, companyId, actor, label, resultId, input.action === "sale.cancel" ? { reason: input.reason } : details);
    return result;
  }, { timeout: 20000, maxWait: 20000 });
}
