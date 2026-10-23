import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { execute } from "../src/domains/core/service";
import { getWorkspace } from "../src/domains/core/queries";

test("PostgreSQL: purchase orders receive stock and expenses atomically", async t => {
  const prefix = `purchase-${randomUUID()}`;
  const owner = { id: `${prefix}-owner`, name: "Purchase Test", email: `${prefix}-owner@example.test` };
  const other = { id: `${prefix}-other`, name: "Other Test", email: `${prefix}-other@example.test` };
  const limited = { id: `${prefix}-limited`, name: "Limited Test", email: `${prefix}-limited@example.test` };
  const companyIds: string[] = [];
  try {
    await db.user.createMany({ data: [owner, other, limited] });
    const company = await execute(owner, undefined, { action: "company.create", name: prefix, sector: "Commerce" }) as { id: string }; companyIds.push(company.id);
    const second = await execute(other, undefined, { action: "company.create", name: `${prefix}-second`, sector: "Commerce" }) as { id: string }; companyIds.push(second.id);
    const limitedRole = await execute(owner, company.id, { action: "role.create", name: "Achats sans réception", permissions: ["orders.read", "orders.manage", "suppliers.read", "inventory.read"] }) as { id: string };
    await db.companyMember.create({ data: { companyId: company.id, userId: limited.id, roleId: limitedRole.id, characterName: "Gestion achats" } });
    const supplier = await execute(owner, company.id, { action: "supplier.save", name: "Fournisseur RP", notes: "Note privée fournisseur" }) as { id: string };
    const supplier2 = await execute(other, second.id, { action: "supplier.save", name: "Fournisseur autre entreprise" }) as { id: string };
    const productInput = { action: "product.create", name: "Pièce A", sku: "A", category: "Pièces", price: 200, cost: 101, stock: 2, threshold: 0, trackStock: true };
    const product = await execute(owner, company.id, productInput) as { id: string };
    const product2 = await execute(owner, company.id, { ...productInput, name: "Pièce B", sku: "B", stock: 999999 }) as { id: string };
    const foreign = await execute(other, second.id, productInput) as { id: string };
    const payload = { action: "purchase.save", supplierId: supplier.id, notes: "Commande test", items: [{ productId: product.id, quantity: 3, unitCost: 101 }, { productId: product2.id, quantity: 2, unitCost: 50 }] };
    await t.test("supplier permissions and cross-tenant references are enforced", async () => {
      await assert.rejects(execute(limited, company.id, { action: "supplier.save", name: "Denied" }), /Permission/);
      await assert.rejects(execute(other, second.id, { action: "supplier.save", supplierId: supplier.id, name: "Intrusion" }), /introuvable/);
      await assert.rejects(execute(owner, company.id, { ...payload, supplierId: supplier2.id }), /fournisseur actif/);
      await assert.rejects(execute(owner, company.id, { ...payload, items: [{ productId: foreign.id, quantity: 1, unitCost: 1 }] }), /cette entreprise/);
      await assert.rejects(execute(owner, company.id, { ...payload, items: [...payload.items, payload.items[0]] }), /Regroupez/);
      assert.deepEqual((await getWorkspace(limited.id, company.id)).current!.suppliers, [await db.supplier.findUnique({ where: { id: supplier.id } })]);
    });
    const order = await execute(owner, company.id, payload) as { id: string; total: number; number: string };
    assert.equal(order.total, 403);
    await t.test("draft does not post stock or expenses and issued orders are immutable", async () => {
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 2);
      assert.equal(await db.financialEntry.count({ where: { companyId: company.id } }), 0);
      await assert.rejects(execute(owner, company.id, { action: "product.archive", productId: product.id, archived: true }), /commande d’achat/);
      await assert.rejects(execute(owner, company.id, { action: "inventory.adjust", productId: product2.id, quantity: 2, reason: "Stock trop élevé" }), /1 000 000/);
      await assert.rejects(execute(owner, company.id, { action: "purchase.transition", orderId: order.id, status: "RECEIVED" }), /transition/);
      await execute(owner, company.id, { ...payload, orderId: order.id, notes: "Révisé" });
      await execute(owner, company.id, { action: "purchase.transition", orderId: order.id, status: "ORDERED" });
      await assert.rejects(execute(owner, company.id, { ...payload, orderId: order.id }), /brouillon/);
      await assert.rejects(execute(limited, company.id, { action: "purchase.transition", orderId: order.id, status: "RECEIVED" }), /Permission/);
      await assert.rejects(execute(other, second.id, { action: "purchase.transition", orderId: order.id, status: "RECEIVED" }), /introuvable/);
    });
    await t.test("a failed receipt rolls back every line, movement, status and expense", async () => {
      await assert.rejects(execute(owner, company.id, { action: "purchase.transition", orderId: order.id, status: "RECEIVED" }), /Réception impossible/);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 2);
      assert.equal(await db.inventoryMovement.count({ where: { companyId: company.id, reason: `Réception ${order.number}` } }), 0);
      assert.equal(await db.financialEntry.count({ where: { companyId: company.id } }), 0);
      assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "ORDERED");
    });
    await t.test("concurrent receipt replay posts stock and cost once", async () => {
      await execute(owner, company.id, { action: "inventory.adjust", productId: product2.id, quantity: -9, reason: "Libérer le stock de test" });
      await Promise.all([execute(owner, company.id, { action: "purchase.transition", orderId: order.id, status: "RECEIVED" }), execute(owner, company.id, { action: "purchase.transition", orderId: order.id, status: "RECEIVED" })]);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 5);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product2.id } })).stock, 999992);
      assert.equal(await db.inventoryMovement.count({ where: { companyId: company.id, reason: `Réception ${order.number}` } }), 2);
      assert.equal(await db.financialEntry.count({ where: { companyId: company.id, sourceId: order.id, kind: "PURCHASE" } }), 1);
      const workspace = await getWorkspace(owner.id, company.id); assert.equal(workspace.current!.balance, -403); assert.equal(workspace.current!.stats.expenses, -403);
      await assert.rejects(execute(owner, company.id, { action: "purchase.transition", orderId: order.id, status: "CANCELLED", reason: "Annulation impossible" }), /réception/);
    });
    await t.test("disabling orders hides history but preserves receipts", async () => {
      await execute(owner, company.id, { action: "module.toggle", key: "orders", enabled: false });
      assert.deepEqual((await getWorkspace(owner.id, company.id)).current!.purchaseOrders, []);
      await assert.rejects(execute(owner, company.id, payload), /désactivé/);
      assert.equal(await db.purchaseOrder.count({ where: { id: order.id } }), 1);
      await execute(owner, company.id, { action: "module.toggle", key: "orders", enabled: true });
    });
    await t.test("supplier archive preserves order snapshots and rejects new purchases", async () => {
      await execute(owner, company.id, { action: "supplier.save", supplierId: supplier.id, name: "Fournisseur renommé", archived: true });
      assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).supplierName, "Fournisseur RP");
      await assert.rejects(execute(owner, company.id, payload), /fournisseur actif/);
      const audit = await db.auditLog.findMany({ where: { companyId: company.id } });
      assert.ok(audit.some(a => a.action === "Commande réceptionnée et stock actualisé"));
      assert.ok(!JSON.stringify(audit).includes("Note privée fournisseur"));
    });
  } finally {
    await db.purchaseReceipt.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.purchaseOrder.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.inventoryMovement.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.companyMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.company.deleteMany({ where: { id: { in: companyIds } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id, limited.id] } } });
    await db.rateLimit.deleteMany({ where: { key: { startsWith: `app:${prefix}` } } });
    await db.$disconnect();
  }
});
