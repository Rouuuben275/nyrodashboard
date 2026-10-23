import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { execute } from "../src/domains/core/service";
import { getWorkspace } from "../src/domains/core/queries";

test("PostgreSQL: tenant boundaries, permissions and critical workflows", async t => {
  const prefix = `test-${randomUUID()}`;
  const owner = { id: `${prefix}-owner`, name: "Owner Test", email: `${prefix}-owner@example.test` };
  const employee = { id: `${prefix}-employee`, name: "Employee Test", email: `${prefix}-employee@example.test` };
  const outsider = { id: `${prefix}-outsider`, name: "Outsider Test", email: `${prefix}-outsider@example.test` };
  const companyIds: string[] = []; const serverIds: string[] = []; const planIds: string[] = [];
  try {
    await db.user.createMany({ data: [owner, employee, outsider] });
    const company = await execute(owner, undefined, { action: "company.create", name: prefix, sector: "Garage" }) as { id: string }; companyIds.push(company.id);
    const second = await execute(outsider, undefined, { action: "company.create", name: prefix + "-other", sector: "Commerce" }) as { id: string }; companyIds.push(second.id);
    await t.test("no access to another tenant, even by direct IDs", async () => {
      await assert.rejects(getWorkspace(outsider.id, company.id), /inaccessible/);
      await assert.rejects(execute(outsider, company.id, { action: "task.create", title: "Intrusion", priority: "HIGH" }), /inaccessible/);
    });
    await t.test("create server and affiliate only with server permission", async () => {
      await assert.rejects(execute(owner,undefined,{action:"server.create",name:prefix}),/administration Nyro Dashboard/);
      // Legacy server fixture: existing legitimate memberships survive the new policy.
      const server=await db.rPServer.create({data:{name:prefix}});serverIds.push(server.id);
      const serverRole=await db.serverRole.create({data:{serverId:server.id,name:"Propriétaire historique",permissions:["companies.manage","server.manage"]}});
      await db.serverMember.create({data:{serverId:server.id,userId:owner.id,roleId:serverRole.id}});
      await db.serverAuditLog.create({data:{serverId:server.id,actorId:owner.id,actorName:owner.name,action:"Espace serveur créé",entityId:server.id}});
      await execute(owner, company.id, { action: "company.update", name: prefix, description: "", expenseThreshold: 100000, serverId: server.id });
      await assert.rejects(execute(outsider, second.id, { action: "company.update", name: prefix, description: "", expenseThreshold: 100000, serverId: server.id }), /administrer ce serveur/);
    });
    const roles = await db.companyRole.findMany({ where: { companyId: company.id } });
    let inviteToken = "";
    await t.test("invitations require the intended account and cannot be reused", async () => {
      const invitation = await execute(owner, company.id, { action: "invite.create", email: employee.email, roleId: roles.find(r => !r.isOwner)!.id }) as { token: string }; inviteToken = invitation.token;
      await assert.rejects(execute(outsider, undefined, { action: "invite.accept", token: inviteToken, characterName: "Wrong user" }), /Invitation invalide/);
      await execute(employee, undefined, { action: "invite.accept", token: inviteToken, characterName: "Employé RP" });
      await assert.rejects(execute(employee, undefined, { action: "invite.accept", token: inviteToken, characterName: "Employé RP" }), /Invitation invalide/);
    });
    await t.test("member permissions are checked in mutations and read projections", async () => {
      await assert.rejects(execute(employee, company.id, { action: "expense.create", label: "Forbidden", category: "Test", amount: 100 }), /Permission insuffisante/);
      const workspace = await getWorkspace(employee.id, company.id);
      assert.deepEqual(workspace.current!.entries, []); assert.equal(workspace.current!.balance, null);
      assert.ok(workspace.current!.members.every(m => !("salary" in m)));
    });
    await t.test("custom role changes apply immediately and the owner grade is protected", async () => {
      const role = roles.find(r => !r.isOwner)!;
      await execute(owner, company.id, { action: "role.update", roleId: role.id, name: role.name, permissions: role.permissions.filter(p => p !== "sales.create") });
      await assert.rejects(execute(employee, company.id, { action: "sale.create", customer: "Client", payment: "Carte RP", requestKey: randomUUID(), items: [{ productId: "x", quantity: 1 }] }), /Permission insuffisante/);
      await execute(owner, company.id, { action: "role.update", roleId: role.id, name: role.name, permissions: role.permissions });
      await assert.rejects(execute(owner, company.id, { action: "role.update", roleId: roles.find(r => r.isOwner)!.id, name: "Intrusion", permissions: [] }), /ne peut pas être modifié/);
      await assert.rejects(execute(outsider, second.id, { action: "role.update", roleId: role.id, name: "Intrusion", permissions: [] }), /ne peut pas être modifié/);
    });
    await t.test("employee quotas are read from the server-side plan", async () => {
      const plan = await db.plan.create({ data: { name: `${prefix}-limited`, limits: { employees: 2, companies: 10, servers: 10 } } }); planIds.push(plan.id);
      await db.subscription.update({ where: { companyId: company.id }, data: { planId: plan.id } });
      const invitation = await execute(owner, company.id, { action: "invite.create", email: outsider.email, roleId: roles.find(r => !r.isOwner)!.id }) as { token: string };
      await assert.rejects(execute(outsider, undefined, { action: "invite.accept", token: invitation.token, characterName: "One too many" }), /quota/);
    });
    await t.test("suspended employees lose read and mutation access immediately", async () => {
      const member = await db.companyMember.findUniqueOrThrow({ where: { companyId_userId: { companyId: company.id, userId: employee.id } } });
      const update = { action: "member.update", memberId: member.id, roleId: member.roleId, department: member.department, salary: 0 };
      await execute(owner, company.id, { ...update, status: "INACTIVE" });
      await assert.rejects(getWorkspace(employee.id, company.id), /inaccessible/);
      await assert.rejects(execute(employee, company.id, { action: "time.toggle" }), /inaccessible/);
      await execute(owner, company.id, { ...update, status: "ACTIVE" });
    });
    const product = await execute(owner, company.id, { action: "product.create", name: "Limited", sku: "LIMITED", category: "Test", price: 101, cost: 50, stock: 1, threshold: 1, trackStock: true }) as { id: string };
    const salePayload = { action: "sale.create", customer: "Client Test", payment: "Carte RP", items: [{ productId: product.id, quantity: 1 }] };
    let saleId = ""; let successfulKey = "";
    await t.test("concurrent sales never oversell inventory", async () => {
      const keys = [randomUUID(), randomUUID()];
      const results = await Promise.allSettled(keys.map(requestKey => execute(owner, company.id, { ...salePayload, requestKey })));
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(results.filter(r => r.status === "rejected").length, 1);
      const index = results.findIndex(r => r.status === "fulfilled"); saleId = (results[index] as PromiseFulfilledResult<{ id: string }>).value.id; successfulKey = keys[index];
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 0);
      assert.equal(await db.sale.count({ where: { companyId: company.id } }), 1);
      assert.equal((await db.financialEntry.aggregate({ where: { companyId: company.id }, _sum: { amount: true } }))._sum.amount, 101);
    });
    await t.test("idempotent retries do not create duplicate sales or entries", async () => {
      const retry = await execute(owner, company.id, { ...salePayload, requestKey: successfulKey }) as { id: string };
      assert.equal(retry.id, saleId); assert.equal(await db.sale.count({ where: { companyId: company.id } }), 1);
    });
    await t.test("a product from another tenant cannot be sold", async () => {
      await assert.rejects(execute(outsider, second.id, { ...salePayload, requestKey: randomUUID() }), /indisponible/);
    });
    await t.test("cancellation produces one reversal and restores inventory", async () => {
      await execute(owner, company.id, { action: "sale.cancel", saleId, reason: "Erreur du client" });
      await assert.rejects(execute(owner, company.id, { action: "sale.cancel", saleId, reason: "Double annulation" }), /déjà annulée/);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 1);
      assert.equal((await db.financialEntry.aggregate({ where: { companyId: company.id }, _sum: { amount: true } }))._sum.amount, 0);
    });
    await t.test("a disabled module blocks its actions and keeps history", async () => {
      await assert.rejects(execute(owner,company.id,{action:"module.toggle",key:"sales",enabled:false}),/dépendent/);
      await execute(owner,company.id,{action:"module.toggle",key:"cash",enabled:false});
      await execute(owner, company.id, { action: "module.toggle", key: "sales", enabled: false });
      await assert.rejects(execute(owner, company.id, { ...salePayload, requestKey: randomUUID() }), /désactivé/);
      assert.equal(await db.sale.count({ where: { companyId: company.id } }), 1);
      await execute(owner, company.id, { action: "module.toggle", key: "sales", enabled: true });
    });
    await t.test("expense threshold requires approval and books only once", async () => {
      const expense = await execute(owner, company.id, { action: "expense.create", label: "Validation test", category: "Test", amount: 100000 }) as { id: string; status: string };
      assert.equal(expense.status, "PENDING");
      assert.equal(await db.financialEntry.count({ where: { sourceId: expense.id } }), 0);
      await execute(owner, company.id, { action: "expense.decide", expenseId: expense.id, approve: true });
      await assert.rejects(execute(owner, company.id, { action: "expense.decide", expenseId: expense.id, approve: true }), /déjà traitée/);
      assert.equal(await db.financialEntry.count({ where: { sourceId: expense.id } }), 1);
    });
    await t.test("shifts, clocking and leave approval persist and enforce ownership", async () => {
      const member = await db.companyMember.findUniqueOrThrow({ where: { companyId_userId: { companyId: company.id, userId: employee.id } } });
      await execute(owner, company.id, { action: "shift.create", memberId: member.id, title: "Shift", start: "2026-11-01T10:00:00Z", end: "2026-11-01T12:00:00Z" });
      await assert.rejects(execute(owner, company.id, { action: "shift.create", memberId: member.id, title: "Overlap", start: "2026-11-01T11:00:00Z", end: "2026-11-01T13:00:00Z" }), /chevauche/);
      await execute(employee, company.id, { action: "time.toggle" }); await execute(employee, company.id, { action: "time.toggle" });
      assert.equal(await db.timeEntry.count({ where: { memberId: member.id, end: { not: null } } }), 1);
      const leave = await execute(employee, company.id, { action: "leave.create", start: "2026-11-05T10:00:00Z", end: "2026-11-06T10:00:00Z", reason: "Absence test" }) as { id: string };
      await execute(owner, company.id, { action: "leave.decide", leaveId: leave.id, approve: true, reason: "Demande acceptée" });
      assert.equal((await db.leaveRequest.findUniqueOrThrow({ where: { id: leave.id } })).status, "APPROVED");
    });
    await t.test("catalog edits preserve historical sale prices and cannot change stock", async () => {
      const original = await db.product.findUniqueOrThrow({ where: { id: product.id } });
      const update = { action: "product.update", productId: product.id, name: "Limited revised", sku: "LIMITED", category: "Revised", price: 999, cost: 90, threshold: 2, stock: 999999 };
      await assert.rejects(execute(employee, company.id, update), /Permission/);
      await assert.rejects(execute(outsider, second.id, update), /introuvable/);
      await execute(owner, company.id, update);
      const current = await db.product.findUniqueOrThrow({ where: { id: product.id } });
      assert.equal(current.stock, original.stock); assert.equal(current.price, 999);
      const historical = await db.saleItem.findMany({ where: { companyId: company.id, productId: product.id } });
      assert.ok(historical.length > 0); assert.ok(historical.every(i => i.unitPrice === 101));
    });
    await t.test("catalog archiving is reversible and blocks sales without deleting history", async () => {
      await execute(owner, company.id, { action: "product.archive", productId: product.id, archived: true });
      const ownerView = await getWorkspace(owner.id, company.id); assert.ok(ownerView.current!.products.some(p => p.id === product.id && p.archived));
      assert.ok(!(await getWorkspace(employee.id, company.id)).current!.products.some(p => p.id === product.id));
      await assert.rejects(execute(owner, company.id, { ...salePayload, requestKey: randomUUID() }), /indisponible/);
      assert.ok(await db.saleItem.count({ where: { companyId: company.id, productId: product.id } }));
      await execute(owner, company.id, { action: "product.archive", productId: product.id, archived: false });
      assert.ok((await getWorkspace(employee.id, company.id)).current!.products.some(p => p.id === product.id));
      const audit = await db.auditLog.findFirstOrThrow({ where: { companyId: company.id, entityId: product.id, action: "Référence du catalogue modifiée" } });
      assert.match(JSON.stringify(audit.details), /"price":101/); assert.match(JSON.stringify(audit.details), /"price":999/);
    });
    await t.test("sensitive actions are audited without storing invitation secrets", async () => {
      const audit = await db.auditLog.findMany({ where: { companyId: company.id } });
      assert.ok(audit.some(a => a.action === "Vente enregistrée"));
      assert.ok(audit.some(a => a.action === "Vente annulée et stock restitué"));
      assert.ok(!JSON.stringify(audit).includes(inviteToken));
      assert.ok(await db.serverAuditLog.count({ where: { serverId: serverIds[0], action: "Espace serveur créé" } }));
      assert.ok(await db.serverAuditLog.count({ where: { serverId: serverIds[0], entityId: company.id } }));
    });
  } finally {
    // Historical records deliberately use restrictive FKs; fixtures are removed
    // explicitly in dependency order (the application has no destructive endpoint).
    await db.inventoryMovement.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.saleItem.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.shift.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.timeEntry.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.leaveRequest.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.invitation.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.companyMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.company.deleteMany({ where: { id: { in: companyIds } } });
    await db.plan.deleteMany({ where: { id: { in: planIds } } });
    await db.serverMember.deleteMany({ where: { serverId: { in: serverIds } } });
    await db.rPServer.deleteMany({ where: { id: { in: serverIds } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, employee.id, outsider.id] } } });
    await db.rateLimit.deleteMany({ where: { key: { startsWith: `app:${prefix}` } } });
    await db.$disconnect();
  }
});
