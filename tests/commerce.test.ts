import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { execute } from "../src/domains/core/service";
import { getWorkspace } from "../src/domains/core/queries";
import { billingTotals } from "../src/domains/commerce/service";
import { commerceActionSchema } from "../src/domains/commerce/validation";

test("billing uses integer cents, bounded discounts and rejects overflow", () => {
  assert.deepEqual(billingTotals([{ quantity: 3, unitPrice: 101 }], 1250), { subtotal: 303, total: 265 });
  assert.equal(billingTotals([{ quantity: 1, unitPrice: 101 }], 10000).total, 0);
  assert.throws(() => billingTotals([{ quantity: 10000, unitPrice: 100000000 }], 0));
  const input = { action: "billing.save", kind: "QUOTE", customerId: "client", discountBps: 10001, items: [{ label: "Test", quantity: 1, unitPrice: 100 }] };
  assert.equal(commerceActionSchema.safeParse(input).success, false);
  assert.equal(commerceActionSchema.safeParse({ ...input, discountBps: 0, items: [{ label: "Test", quantity: .5, unitPrice: 100 }] }).success, false);
});

test("PostgreSQL: CRM, quotes, invoices, ledger and planning isolation", async t => {
  const prefix = `commerce-${randomUUID()}`;
  const owner = { id: `${prefix}-owner`, name: "Commerce Test", email: `${prefix}-owner@example.test` };
  const outsider = { id: `${prefix}-outsider`, name: "Other Test", email: `${prefix}-outsider@example.test` };
  const employee = { id: `${prefix}-employee`, name: "Employee Test", email: `${prefix}-employee@example.test` };
  const companyIds: string[] = [];
  try {
    await db.user.createMany({ data: [owner, outsider, employee] });
    const company = await execute(owner, undefined, { action: "company.create", name: prefix, sector: "Services" }) as { id: string }; companyIds.push(company.id);
    const second = await execute(outsider, undefined, { action: "company.create", name: `${prefix}-second`, sector: "Garage" }) as { id: string }; companyIds.push(second.id);
    const role = await db.companyRole.findFirstOrThrow({ where: { companyId: company.id, isOwner: false } });
    const member = await db.companyMember.create({ data: { companyId: company.id, userId: employee.id, roleId: role.id, characterName: "Employé RP" } });
    const customer = await execute(owner, company.id, { action: "customer.save", name: "Client RP", email: "contact@example.test", phone: "555-0123", segment: "Partenaire", notes: "Private CRM note" }) as { id: string };
    await t.test("CRM permissions, projections and cross-tenant IDs", async () => {
      await assert.rejects(execute(employee, company.id, { action: "customer.save", name: "Denied" }), /Permission/);
      await assert.rejects(execute(outsider, second.id, { action: "customer.save", customerId: customer.id, name: "Intrusion" }), /introuvable/);
      assert.deepEqual((await getWorkspace(employee.id, company.id)).current!.customers, []);
      assert.deepEqual((await getWorkspace(employee.id, company.id)).current!.billingDocuments, []);
      await execute(owner, company.id, { action: "module.toggle", key: "crm", enabled: false }).then(() => assert.fail("Dependencies must block disabling CRM"), () => {});
    });
    const payload = { action: "billing.save", kind: "QUOTE", customerId: customer.id, discountBps: 1000, items: [{ label: "Réparation", quantity: 3, unitPrice: 101 }] };
    const quote = await execute(owner, company.id, payload) as { id: string; number: string; total: number };
    assert.equal(quote.total, 273);
    await t.test("draft updates, issue immutability and scoped clients", async () => {
      await assert.rejects(execute(outsider, second.id, { ...payload, documentId: quote.id }), /client actif/);
      await assert.rejects(execute(employee, company.id, payload), /Permission/);
      await execute(owner, company.id, { ...payload, documentId: quote.id, notes: "Révisé" });
      await assert.rejects(execute(owner, company.id, { action: "billing.convert", documentId: quote.id }), /accepté/);
      await execute(owner, company.id, { action: "billing.transition", documentId: quote.id, status: "ISSUED" });
      await assert.rejects(execute(owner, company.id, { ...payload, documentId: quote.id }), /brouillon/);
      await assert.rejects(execute(owner, company.id, { action: "billing.transition", documentId: quote.id, status: "PAID" }), /transition/);
      await execute(owner, company.id, { action: "billing.transition", documentId: quote.id, status: "ACCEPTED" });
    });
    let invoiceId = "";
    await t.test("quote conversion is idempotent under concurrent requests", async () => {
      const results = await Promise.all([execute(owner, company.id, { action: "billing.convert", documentId: quote.id }), execute(owner, company.id, { action: "billing.convert", documentId: quote.id })]) as { id: string; total: number }[];
      invoiceId = results[0].id; assert.equal(results[1].id, invoiceId); assert.equal(results[0].total, 273);
      assert.equal(await db.billingDocument.count({ where: { companyId: company.id, sourceId: quote.id } }), 1);
      await assert.rejects(execute(owner, company.id, { action: "billing.transition", documentId: quote.id, status: "CANCELLED", reason: "Devis déjà converti" }), /facture existe/);
    });
    await t.test("issued invoice payment and reversal post once to real ledger", async () => {
      await execute(owner, company.id, { action: "billing.transition", documentId: invoiceId, status: "ISSUED" });
      await Promise.all([execute(owner, company.id, { action: "billing.transition", documentId: invoiceId, status: "PAID" }), execute(owner, company.id, { action: "billing.transition", documentId: invoiceId, status: "PAID" })]);
      const workspace = await getWorkspace(owner.id, company.id); assert.equal(workspace.current!.balance, 273); assert.equal(workspace.current!.stats.revenue, 273);
      assert.equal(await db.financialEntry.count({ where: { companyId: company.id, sourceId: invoiceId, kind: "INVOICE" } }), 1);
      await assert.rejects(execute(owner, company.id, { action: "billing.transition", documentId: invoiceId, status: "CANCELLED" }), /motif/);
      await execute(owner, company.id, { action: "billing.transition", documentId: invoiceId, status: "CANCELLED", reason: "Annulation test" });
      await execute(owner, company.id, { action: "billing.transition", documentId: invoiceId, status: "CANCELLED", reason: "Annulation test" });
      assert.equal((await getWorkspace(owner.id, company.id)).current!.balance, 0);
      assert.equal(await db.financialEntry.count({ where: { companyId: company.id, sourceId: invoiceId, kind: "INVOICE_REFUND" } }), 1);
    });
    await t.test("disabled module refuses mutations and hides its documents", async () => {
      await execute(owner, company.id, { action: "module.toggle", key: "invoices", enabled: false });
      await assert.rejects(execute(owner, company.id, { ...payload, kind: "INVOICE" }), /désactivé/);
      assert.ok((await getWorkspace(owner.id, company.id)).current!.billingDocuments.every(d => d.kind !== "INVOICE"));
      assert.equal(await db.billingDocument.count({ where: { id: invoiceId } }), 1);
      await execute(owner, company.id, { action: "module.toggle", key: "invoices", enabled: true });
    });
    await t.test("CRM archiving preserves issued customer snapshots", async () => {
      await execute(owner, company.id, { action: "customer.save", customerId: customer.id, name: "Nouveau nom", archived: true });
      const doc = await db.billingDocument.findUniqueOrThrow({ where: { id: invoiceId } }); assert.equal(doc.customerName, "Client RP");
      await assert.rejects(execute(owner, company.id, payload), /client actif/);
      assert.equal(await db.billingDocument.count({ where: { companyId: company.id } }), 2);
    });
    await t.test("planning updates reject conflicts, absences and foreign IDs", async () => {
      const shift = await execute(owner, company.id, { action: "shift.create", memberId: member.id, title: "Service", start: "2026-12-01T10:00:00Z", end: "2026-12-01T12:00:00Z" }) as { id: string };
      await execute(owner, company.id, { action: "shift.update", shiftId: shift.id, memberId: member.id, title: "Service modifié", start: "2026-12-01T11:00:00Z", end: "2026-12-01T13:00:00Z" });
      await assert.rejects(execute(outsider, second.id, { action: "shift.update", shiftId: shift.id, memberId: member.id, title: "Intrusion", start: "2026-12-01T10:00:00Z", end: "2026-12-01T12:00:00Z" }), /introuvable/);
      await execute(owner, company.id, { action: "shift.create", memberId: member.id, title: "Second service", start: "2026-12-01T14:00:00Z", end: "2026-12-01T16:00:00Z" });
      await assert.rejects(execute(owner, company.id, { action: "shift.update", shiftId: shift.id, memberId: member.id, title: "Chevauchement", start: "2026-12-01T13:00:00Z", end: "2026-12-01T15:00:00Z" }), /chevauche/);
      const leave = await execute(employee, company.id, { action: "leave.create", start: "2026-12-02T10:00:00Z", end: "2026-12-02T18:00:00Z", reason: "Absence test" }) as { id: string };
      await execute(owner, company.id, { action: "leave.decide", leaveId: leave.id, approve: true, reason: "Accord test" });
      await assert.rejects(execute(owner, company.id, { action: "shift.create", memberId: member.id, title: "Indisponible", start: "2026-12-02T11:00:00Z", end: "2026-12-02T12:00:00Z" }), /absence validée/);
    });
    await t.test("audit records decisions without copying private CRM notes", async () => {
      const records = await db.auditLog.findMany({ where: { companyId: company.id } });
      assert.ok(records.some(a => a.action === "Devis converti en facture"));
      assert.ok(records.some(a => a.action === "Statut commercial modifié" && JSON.stringify(a.details).includes("Annulation test")));
      assert.ok(!JSON.stringify(records).includes("Private CRM note"));
    });
  } finally {
    await db.billingDocument.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.shift.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.leaveRequest.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.companyMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.company.deleteMany({ where: { id: { in: companyIds } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, outsider.id, employee.id] } } });
    await db.rateLimit.deleteMany({ where: { key: { startsWith: `app:${prefix}` } } });
    await db.$disconnect();
  }
});
