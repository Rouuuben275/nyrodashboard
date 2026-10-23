import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { execute } from "../src/domains/core/service";
import { getWorkspace } from "../src/domains/core/queries";

test("grade ordering and deletion preserve memberships and prevent delegated privilege escalation", async t => {
  const prefix = `roles-${randomUUID()}`; const users: string[] = [], companies: string[] = [];
  try {
    const owner = await db.user.create({ data: { name: "Grade Owner", email: `${prefix}-owner@example.test` } }); users.push(owner.id);
    const employee = await db.user.create({ data: { name: "Grade Employee", email: `${prefix}-employee@example.test` } }); users.push(employee.id);
    const manager = await db.user.create({ data: { name: "Grade Manager", email: `${prefix}-manager@example.test` } }); users.push(manager.id);
    const company = await execute(owner, undefined, { action: "company.create", name: prefix, sector: "Test", template: "garage" }) as { id: string }; companies.push(company.id);
    const initial = await db.companyRole.findMany({ where: { companyId: company.id } });
    const direction = initial.find(r => r.isOwner)!; const staff = initial.find(r => !r.isOwner)!;
    const member = await db.companyMember.create({ data: { companyId: company.id, userId: employee.id, roleId: staff.id, characterName: "Employé" } });
    const limited = await execute(owner, company.id, { action: "role.create", name: "RH limité", permissions: ["employees.read", "employees.manage", "roles.manage"] }) as { id: string };
    await db.companyMember.create({ data: { companyId: company.id, userId: manager.id, roleId: limited.id, characterName: "Gestionnaire limité" } });
    const replacement = await execute(owner, company.id, { action: "role.create", name: "Remplacement", permissions: staff.permissions }) as { id: string };
    await t.test("ordering is persisted and cannot include foreign, duplicate or owner IDs", async () => {
      await execute(owner, company.id, { action: "role.reorder", roleIds: [replacement.id, limited.id, staff.id] });
      const workspace = await getWorkspace(owner.id, company.id);
      assert.deepEqual(workspace.current?.roles.map(r => r.id), [direction.id, replacement.id, limited.id, staff.id]);
      for (const roleIds of [[direction.id, limited.id, staff.id], [staff.id, staff.id, limited.id], ["foreign", limited.id, staff.id]]) await assert.rejects(execute(owner, company.id, { action: "role.reorder", roleIds }), /chaque grade/);
    });
    await t.test("a role manager cannot create, edit, assign or invite with privileges they do not hold", async () => {
      const advanced = await execute(owner, company.id, { action: "role.create", name: "Finance", permissions: ["finance.read"] }) as { id: string };
      await assert.rejects(execute(manager, company.id, { action: "role.create", name: "Escalade", permissions: ["finance.read"] }), /déléguer/);
      await assert.rejects(execute(manager, company.id, { action: "role.update", roleId: replacement.id, name: "Escalade", permissions: ["finance.read"] }), /déléguer/);
      await assert.rejects(execute(manager, company.id, { action: "invite.create", email: `${prefix}@example.test`, roleId: advanced.id }), /droits/);
      await assert.rejects(execute(manager, company.id, { action: "member.update", memberId: member.id, roleId: advanced.id, department: "Finance", status: "ACTIVE", salary: 0 }), /droits/);
      await assert.rejects(execute(manager, company.id, { action: "role.delete", roleId: staff.id, replacementId: advanced.id, reason: "Réaffectation abusive" }), /déléguer/);
      await assert.rejects(execute(manager, company.id, { action: "role.delete", roleId: limited.id, reason: "Mon propre grade" }), /propre grade/);
    });
    await t.test("used grade deletion requires reassignment and cannot target the owner", async () => {
      await assert.rejects(execute(owner, company.id, { action: "role.delete", roleId: staff.id, reason: "Sans remplacement" }), /Réaffectez/);
      await assert.rejects(execute(owner, company.id, { action: "role.delete", roleId: direction.id, reason: "Direction protégée" }), /ne peut pas/);
      await assert.rejects(execute(owner, company.id, { action: "role.delete", roleId: staff.id, replacementId: direction.id, reason: "Promotion interdite" }), /invalide/);
      await assert.rejects(execute(owner, company.id, { action: "role.delete", roleId: staff.id, replacementId: "foreign", reason: "Autre entreprise" }), /invalide/);
    });
    await t.test("reassignment moves employees and invitations atomically with history and audit", async () => {
      await execute(owner, company.id, { action: "invite.create", email: `${prefix}-invite@example.test`, roleId: staff.id });
      await execute(owner, company.id, { action: "role.delete", roleId: staff.id, replacementId: replacement.id, reason: "Réorganisation de l’atelier" });
      assert.equal(await db.companyRole.findUnique({ where: { id: staff.id } }), null);
      assert.equal((await db.companyMember.findUniqueOrThrow({ where: { id: member.id } })).roleId, replacement.id);
      assert.equal((await db.invitation.findFirstOrThrow({ where: { companyId: company.id } })).roleId, replacement.id);
      assert.equal(await db.employeeEvent.count({ where: { companyId: company.id, memberId: member.id, kind: "GRADE" } }), 1);
      const audit = await db.auditLog.findFirstOrThrow({ where: { companyId: company.id, entityId: staff.id, action: "Grade supprimé après réaffectation contrôlée" } });
      assert.ok(JSON.stringify(audit.details).includes("Réorganisation"));
      assert.deepEqual((await db.companyRole.findUniqueOrThrow({ where: { id: direction.id } })).permissions, direction.permissions);
    });
    await t.test("read-only roles cannot reorder and disabled role modules refuse mutations", async () => {
      await assert.rejects(execute(employee, company.id, { action: "role.reorder", roleIds: [replacement.id] }), /Permission/);
      await db.companyModule.update({ where: { companyId_key: { companyId: company.id, key: "roles" } }, data: { enabled: false } });
      await assert.rejects(execute(owner, company.id, { action: "role.create", name: "Refus", permissions: [] }), /désactivé/);
    });
  } finally {
    await db.company.deleteMany({ where: { id: { in: companies } } });
    await db.rateLimit.deleteMany({ where: { OR: users.map(id => ({ key: { startsWith: `app:${id}:` } })) } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  }
});
