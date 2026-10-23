import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { execute } from "../src/domains/core/service";
import { getEmployeeDossier } from "../src/domains/hr/service";

test("employee dossiers are persistent, permission filtered and tenant scoped", async t => {
  const prefix = `hr-${randomUUID()}`;
  const users: string[] = [], companies: string[] = [];
  try {
    const owner = await db.user.create({ data: { name: "HR Owner", email: `${prefix}-owner@example.test` } }); users.push(owner.id);
    const employee = await db.user.create({ data: { name: "HR Employee", email: `${prefix}-employee@example.test` } }); users.push(employee.id);
    const outsider = await db.user.create({ data: { name: "HR Outsider", email: `${prefix}-outsider@example.test` } }); users.push(outsider.id);
    const company = await execute(owner, undefined, { action: "company.create", name: `${prefix}-company`, sector: "Test", template: "garage" }) as { id: string }; companies.push(company.id);
    const other = await execute(outsider, undefined, { action: "company.create", name: `${prefix}-other`, sector: "Test", template: "garage" }) as { id: string }; companies.push(other.id);
    const role = await db.companyRole.findFirstOrThrow({ where: { companyId: company.id, isOwner: false } });
    const member = await db.companyMember.create({ data: { companyId: company.id, userId: employee.id, roleId: role.id, characterName: "Alex RP", salary: 12345 } });
    const secret = `Confidentiel ${randomUUID()}`;
    await t.test("authorized profile and career records persist", async () => {
      await execute(owner, company.id, { action: "employee.profile", memberId: member.id, characterName: "Alex Morgan", phone: "555-0100", jobTitle: "Mécanicien", biography: secret });
      await execute(owner, company.id, { action: "employee.event", memberId: member.id, kind: "NOTE", title: "Suivi RH", content: secret });
      await execute(owner, company.id, { action: "employee.event", memberId: member.id, kind: "TRAINING", title: "Formation moteur", content: "Formation terminée et consignée." });
      const dossier = await getEmployeeDossier(owner.id, company.id, member.id);
      assert.equal(dossier.target.characterName, "Alex Morgan");
      assert.equal(dossier.target.profile?.jobTitle, "Mécanicien");
      assert.equal(dossier.target.salary, 12345);
      assert.equal(dossier.events.length, 3);
      const audits = await db.auditLog.findMany({ where: { companyId: company.id } });
      assert.ok(!JSON.stringify(audits).includes(secret));
    });
    await t.test("read-only viewers cannot read confidential notes, phone, biography or salary", async () => {
      const dossier = await getEmployeeDossier(employee.id, company.id, member.id);
      const text = JSON.stringify(dossier);
      assert.equal(dossier.manager, false);
      assert.equal(dossier.target.profile?.jobTitle, "Mécanicien");
      assert.ok(!text.includes(secret)); assert.ok(!text.includes("555-0100")); assert.ok(!("salary" in dossier.target));
      assert.equal(dossier.events.length, 0);
      await assert.rejects(execute(employee, company.id, { action: "employee.event", memberId: member.id, kind: "NOTE", title: "Intrusion", content: "Non autorisé" }), /insuffisant/);
    });
    await t.test("foreign members and foreign companies cannot be queried or mutated", async () => {
      await assert.rejects(getEmployeeDossier(outsider.id, company.id, member.id), /inaccessible/);
      await assert.rejects(getEmployeeDossier(outsider.id, other.id, member.id), /introuvable/);
      await assert.rejects(execute(outsider, other.id, { action: "employee.profile", memberId: member.id, characterName: "Intrusion", phone: "", jobTitle: "", biography: "" }), /introuvable/);
    });
    await t.test("grade and department changes append history without changing owner access", async () => {
      const nextRole = await execute(owner, company.id, { action: "role.create", name: "Atelier", permissions: role.permissions }) as { id: string };
      await execute(owner, company.id, { action: "member.update", memberId: member.id, roleId: nextRole.id, department: "Moteurs", status: "ACTIVE", salary: 12345 });
      const history = await getEmployeeDossier(employee.id, company.id, member.id);
      assert.equal(history.events.length, 2);
      assert.deepEqual(new Set(history.events.map(e => e.kind)), new Set(["GRADE", "DEPARTMENT"]));
      assert.ok(!JSON.stringify(history).includes(secret));
      const companyOwner = await db.companyRole.findFirstOrThrow({ where: { companyId: company.id, isOwner: true } });
      assert.ok(companyOwner.permissions.includes("roles.manage"));
    });
    await t.test("event pagination is bounded and rejects a cursor outside the dossier", async () => {
      await db.employeeEvent.createMany({ data: Array.from({ length: 35 }, (_, i) => ({ companyId: company.id, memberId: member.id, kind: "CAREER", title: `Étape ${i}`, content: "Historique de contrôle", actorId: owner.id, actorName: owner.name })) });
      const first = await getEmployeeDossier(owner.id, company.id, member.id);
      assert.equal(first.events.length, 30); assert.ok(first.nextCursor);
      const second = await getEmployeeDossier(owner.id, company.id, member.id, first.nextCursor!);
      assert.ok(second.events.length > 0);
      assert.equal(new Set([...first.events, ...second.events].map(e => e.id)).size, first.events.length + second.events.length);
      await assert.rejects(getEmployeeDossier(owner.id, company.id, member.id, "foreign-cursor"), /introuvable/);
    });
    await t.test("disabled modules and suspended viewers revoke dossier access", async () => {
      await execute(owner, company.id, { action: "module.toggle", key: "planning", enabled: false });
      await execute(owner, company.id, { action: "module.toggle", key: "time", enabled: false });
      await execute(owner, company.id, { action: "module.toggle", key: "leaves", enabled: false });
      await execute(owner, company.id, { action: "module.toggle", key: "recruitment", enabled: false });
      await execute(owner, company.id, { action: "module.toggle", key: "payroll", enabled: false });
      await execute(owner, company.id, { action: "module.toggle", key: "reviews", enabled: false });
      await execute(owner, company.id, { action: "module.toggle", key: "sanctions", enabled: false });
      await execute(owner, company.id, { action: "module.toggle", key: "employees", enabled: false });
      await assert.rejects(getEmployeeDossier(owner.id, company.id, member.id), /refusé/);
      await assert.rejects(execute(owner, company.id, { action: "employee.event", memberId: member.id, kind: "NOTE", title: "Refus", content: "Module désactivé" }), /désactivé/);
      assert.ok(await db.employeeProfile.findFirst({ where: { companyId: company.id, memberId: member.id } }));
      await db.companyMember.update({ where: { id: member.id }, data: { status: "INACTIVE" } });
      await assert.rejects(getEmployeeDossier(employee.id, company.id, member.id), /inaccessible/);
    });
  } finally {
    await db.company.deleteMany({ where: { id: { in: companies } } });
    await db.rateLimit.deleteMany({ where: { OR: users.map(id => ({ key: { startsWith: `app:${id}:` } })) } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  }
});
