import test from "node:test";
import assert from "node:assert/strict";
import { allPermissions, canDisable, modules } from "../src/domains/modules/registry";
import { actionSchema, safeTotal } from "../src/domains/core/validation";
import { loginHref, workspaceHref } from "../src/lib/routes";
test("money is calculated in integer cents and rejects overflow", () => {
  assert.equal(safeTotal([{ price: 101, quantity: 3 }, { price: 1999, quantity: 2 }]), 4301);
  assert.throws(() => safeTotal([{ price: 100000000, quantity: 100 }]));
});
test("module dependencies cannot be disabled while a consumer is enabled", () => {
  assert.equal(canDisable("products", ["products", "sales"]), false);
  assert.equal(canDisable("sales", ["products", "sales"]), true);
  assert.equal(canDisable("dashboard", []), false);
});
test("all available routes have a declared, known permission", () => {
  assert.equal(modules.length, 34);
  for (const m of modules.filter(m => m.available)) {
    assert.ok(allPermissions.includes(m.permission), m.key);
    for (const d of m.dependencies) assert.ok(modules.some(m => m.key === d && m.available));
  }
});
test("input validation rejects decimals, negative stock and invalid payments", () => {
  const sale = { action: "sale.create", customer: "Client", payment: "Carte RP", requestKey: crypto.randomUUID(), items: [{ productId: "product", quantity: 1 }] };
  assert.equal(actionSchema.safeParse(sale).success, true);
  assert.equal(actionSchema.safeParse({ ...sale, items: [{ productId: "product", quantity: 1.2 }] }).success, false);
  assert.equal(actionSchema.safeParse({ ...sale, payment: "real card" }).success, false);
  assert.equal(actionSchema.safeParse({ action: "inventory.adjust", productId: "x", quantity: 0, reason: "reason" }).success, false);
});
test("Discord callbacks always target the protected application", () => {
  assert.equal(workspaceHref(), "/app");
  assert.equal(loginHref(), "/login");
});
test("invitation tokens survive sign-in and are URL encoded", () => {
  const token = "private/token?with&special=characters";
  assert.equal(new URL(workspaceHref({ invite: token }), "https://rpilot.test").searchParams.get("invite"), token);
  assert.equal(new URL(loginHref(token), "https://rpilot.test").searchParams.get("invite"), token);
});
test("callback parameters cannot replace the application's origin or path", () => {
  const url = new URL(workspaceHref({ invite: "https://foreign.test/path", company: "//foreign.test" }), "https://rpilot.test");
  assert.equal(url.origin, "https://rpilot.test"); assert.equal(url.pathname, "/app");
});
