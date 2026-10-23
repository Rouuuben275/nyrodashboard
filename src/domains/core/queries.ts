import { Prisma, type Product } from "@prisma/client";
import { incomeKinds, expenseKinds } from "@/domains/finance/constants";
import { db } from "@/lib/db";
import { membership } from "./service";
import {activeAccess,platformAccess,resolveServerGrants,assertActiveUser} from "@/domains/platform/access";
import {assertSpace} from "@/domains/platform/spaces";
import {AppError} from "./errors";
import {readCompanySlots} from "@/domains/billing/slots";

export async function getWorkspace(userId: string, requestedCompanyId?: string,space?:string) {
  await assertActiveUser(db,userId);await resolveServerGrants(userId);if(space)await assertSpace(userId,space);
  const platform=await platformAccess(db,userId);
  const [companies, servers, notifications, invitations, characters,companySlots,notificationUnread] = await Promise.all([
    db.companyMember.findMany({ where: { userId, status: "ACTIVE",...(space?{company:{serverId:space==="independent"?null:space}}:{}) }, select: { role:{select:{name:true,isOwner:true}}, company: { select: { id: true, name: true, sector: true,logoUrl:true,logoAssetId:true, serverId: true,accessStatus:true,suspendedUntil:true,server:{select:{status:true,suspendedUntil:true}} } } }, orderBy: { hiredAt: "asc" } }),
    db.serverMember.findMany({ where: { userId,status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}] }, include: { server: { include: { companies: { select: { id: true, name: true, sector: true } }, auditLogs: { orderBy: { createdAt: "desc" }, take: 10 } } }, role: true } }),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.invitation.findMany({ where: { email: (await db.user.findUniqueOrThrow({ where: { id: userId } })).email.toLowerCase(), status: "PENDING", expiresAt: { gt: new Date() } }, select: { id: true, expiresAt: true, company: { select: { name: true } }, role: { select: { name: true } } } }),
    db.rPCharacter.findMany({ where: { userId } }),
    readCompanySlots(db,userId),
    db.notification.count({where:{userId,readAt:null}}),
  ]);
  const visibleCompanies=companies.filter(m=>activeAccess(m.company.accessStatus,m.company.suspendedUntil)&&(!m.company.server||activeAccess(m.company.server.status,m.company.server.suspendedUntil)));
  if(requestedCompanyId&&space&&!visibleCompanies.some(m=>m.company.id===requestedCompanyId))throw new AppError("Entreprise inaccessible dans cet espace RP.",403);
  const companyId = requestedCompanyId || visibleCompanies[0]?.company.id;
  const base = { notificationUnread,companySlots,platformAdmin:!!platform.role,space:space??null,companies: visibleCompanies.map(m => ({id:m.company.id,name:m.company.name,sector:m.company.sector,logoAssetId:m.company.logoAssetId,logoUrl:m.company.logoUrl,role:m.role.name,isOwner:m.role.isOwner,serverId:m.company.serverId})), servers: servers.filter(s=>activeAccess(s.server.status,s.server.suspendedUntil)).map(s => ({ ...s.server, auditLogs: s.role.permissions.includes("server.manage") ? s.server.auditLogs.map(a=>({...a,action:a.action.replace(/^Administration RPilot :/,"Administration Nyro Dashboard :")})) : [], permissions: s.role.permissions })), notifications, invitations, characters };
  if (!companyId) return { ...base, current: null };
  const member = await membership(db, companyId, userId);
  const permissions = member.role.permissions;
  const allowed = (module: string, permission: string) => permissions.includes(permission) && member.company.modules.some(m => m.key === module && m.enabled);
  const [suppliers, purchaseOrders] = await Promise.all([
    allowed("suppliers", "suppliers.read") ? db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 1000 }) : [],
    allowed("orders", "orders.read") ? db.purchaseOrder.findMany({ where: { companyId }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 500 }) : [],
  ]);
  const [customers, billingDocuments] = await Promise.all([
    allowed("crm", "crm.read") ? db.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 1000 }) : [],
    db.billingDocument.findMany({ where: { companyId, kind: { in: [allowed("quotes", "quotes.read") ? "QUOTE" : "", allowed("invoices", "invoices.read") ? "INVOICE" : ""] } }, include: { items: { orderBy: { position: "asc" } }, converted: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const [members, roles, products, sales, entries, expenses, shifts, timeEntries, leaves, tasks, audit, movements, pendingInvitations] = await Promise.all([
    allowed("employees", "employees.read") || allowed("planning", "planning.read") ? db.companyMember.findMany({ where: { companyId }, select: { id: true, userId: true, characterName: true, department: true, status: true, hiredAt: true, roleId: true, role: { select: { name: true, isOwner: true } }, ...(permissions.includes("employees.manage") ? { salary: true } : {}) }, orderBy: { hiredAt: "asc" }, take: 500 }) : [],
    permissions.includes("roles.manage") || permissions.includes("employees.manage") ? db.companyRole.findMany({ where: { companyId }, orderBy: [{ isOwner: "desc" }, { position: "asc" }, { id: "asc" }] }) : [],
    allowed("products", "products.read") || allowed("sales", "sales.create") || allowed("inventory", "inventory.read") ? db.$queryRaw<(Product&{generalStock:number})[]>(Prisma.sql`SELECT p.*,(p.stock-COALESCE((SELECT SUM(s.quantity) FROM "WarehouseStock" s WHERE s."companyId"=p."companyId" AND s."productId"=p.id),0))::int AS "generalStock" FROM "Product" p WHERE p."companyId"=${companyId} ${permissions.includes("products.manage")?Prisma.empty:Prisma.sql`AND p.archived=false`} ORDER BY p.name,p.id LIMIT 1000`) : [],
    allowed("sales", "sales.read") ? db.sale.findMany({ where: { companyId }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 500 }) : [],
    allowed("finance", "finance.read") ? db.financialEntry.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 1000 }) : [],
    allowed("expenses", "expenses.read") ? db.expense.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 500 }) : [],
    allowed("planning", "planning.read") ? db.shift.findMany({ where: { companyId,status:"SCHEDULED" }, include: { member: { select: { characterName: true } } }, orderBy: { start: "asc" }, take: 1000 }) : [],
    allowed("time", "time.use") ? db.timeEntry.findMany({ where: { companyId, ...(permissions.includes("employees.manage") ? {} : { memberId: member.id }) }, include: { member: { select: { characterName: true } } }, orderBy: { start: "desc" }, take: 500 }) : [],
    allowed("leaves", "leaves.read") ? db.leaveRequest.findMany({ where: { companyId, ...(permissions.includes("leaves.manage") ? {} : { memberId: member.id }) }, include: { member: { select: { characterName: true } } }, orderBy: { start: "desc" }, take: 500 }) : [],
    allowed("tasks", "tasks.read") ? db.task.findMany({ where: { companyId, archived:false }, select:{id:true,title:true,status:true,priority:true,dueAt:true,createdAt:true}, orderBy: { createdAt: "desc" }, take: 25 }) : [],
    allowed("audit", "audit.read") ? db.auditLog.findMany({ where: { companyId }, select:{id:true,actorName:true,action:true,entityId:true,createdAt:true}, orderBy:[{createdAt:"desc"},{id:"asc"}], take:5 }) : [],
    allowed("inventory", "inventory.read") ? db.inventoryMovement.findMany({ where: { companyId }, include: { product: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : [],
    permissions.includes("employees.manage") ? db.invitation.findMany({ where: { companyId }, select: { id: true, email: true, status: true, expiresAt: true, role: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : [],
  ]);
  const openTaskCount=allowed("tasks", "tasks.read")?await db.task.count({where:{companyId,archived:false,status:{not:"DONE"}}}):0;
  const balance = allowed("finance", "finance.read") ? (await db.financialEntry.aggregate({ where: { companyId }, _sum: { amount: true } }))._sum.amount ?? 0 : null;
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const financialMonth=(offset:number,kind:string[])=>db.$queryRaw<{amount:bigint}[]>(Prisma.sql`SELECT COALESCE(SUM(amount),0)::bigint AS amount FROM "FinancialEntry" WHERE "companyId"=${companyId} AND kind IN (${Prisma.join(kind)}) AND ((COALESCE("occurredAt","createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris') >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Paris') + ${offset} * INTERVAL '1 month' AND ((COALESCE("occurredAt","createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris') < date_trunc('month', NOW() AT TIME ZONE 'Europe/Paris') + ${offset+1} * INTERVAL '1 month'`);
  const [monthRevenue, previousRevenue, monthExpenses, totalSales, totalMembers, daily] = await Promise.all([
    allowed("finance", "finance.read") ? financialMonth(0,incomeKinds) : null,
    allowed("finance", "finance.read") ? financialMonth(-1,incomeKinds) : null,
    allowed("finance", "finance.read") ? financialMonth(0,expenseKinds) : null,
    allowed("sales", "sales.read") ? db.sale.count({ where: { companyId, status: "COMPLETED", createdAt: { gte: monthStart } } }) : null,
    allowed("employees", "employees.read") ? db.companyMember.count({ where: { companyId, status: "ACTIVE" } }) : null,
    allowed("finance", "finance.read") ? db.$queryRaw<{ date: string; kind: string; amount: bigint }[]>`SELECT TO_CHAR(COALESCE("occurredAt", "createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS date, kind, SUM(amount)::bigint AS amount FROM "FinancialEntry" WHERE "companyId" = ${companyId} AND COALESCE("occurredAt", "createdAt") >= NOW() - INTERVAL '90 days' GROUP BY date, kind ORDER BY date` : [],
  ]);
  const stats = { revenue: monthRevenue ? Number(monthRevenue[0]?.amount ?? 0) : null, previousRevenue: previousRevenue ? Number(previousRevenue[0]?.amount ?? 0) : null, expenses: monthExpenses ? Number(monthExpenses[0]?.amount ?? 0) : null, totalSales, totalMembers, daily: daily.map(d => ({ ...d, amount: Number(d.amount) })) };
  return { ...base, current: { company: member.company, memberId: member.id, permissions, suppliers, purchaseOrders, customers, billingDocuments, members, roles, products, sales, entries, balance, stats, expenses, shifts, timeEntries, leaves, tasks, openTaskCount, audit, movements, pendingInvitations } };
}
export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export type Serialized<T> = T extends Date ? string : T extends (infer U)[] ? Serialized<U>[] : T extends object ? { [K in keyof T]: Serialized<T[K]> } : T;
export type WorkspaceData = Serialized<Workspace>;
