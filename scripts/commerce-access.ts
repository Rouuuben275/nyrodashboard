// Explicit maintenance command. Default mode is read-only and prepares a review plan.
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
const additions = ["crm.read", "crm.manage", "quotes.read", "quotes.manage", "invoices.read", "invoices.manage", "suppliers.read", "suppliers.manage", "orders.read", "orders.manage"];
const planPath = "docs/commerce-access-plan.json";
type Plan = { preparedAt: string; permissions: string[]; roles: { id: string; companyId: string; companyName: string }[] };
const testName = /^(?:test|commerce|purchase)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-other|-second)?$/i;
async function main() {
  if (!process.argv.includes("--apply")) {
    const roles = await db.companyRole.findMany({ where: { isOwner: true }, select: { id: true, companyId: true, permissions: true, company: { select: { name: true } } } });
    const plan: Plan = { preparedAt: new Date().toISOString(), permissions: additions, roles: roles.filter(r => !testName.test(r.company.name) && additions.some(p => !r.permissions.includes(p))).map(r => ({ id: r.id, companyId: r.companyId, companyName: r.company.name })) };
    await writeFile(planPath, JSON.stringify(plan, null, 2) + "\n");
    console.log(JSON.stringify({ mode: "read-only", plan: planPath, companies: plan.roles.map(r => r.companyName), permissions: additions, changesApplied: false }, null, 2));
    return;
  }
  // Execute only after the human has approved the named companies and permissions.
  const plan = JSON.parse(await readFile(planPath, "utf8")) as Plan;
  if (!Array.isArray(plan.roles) || JSON.stringify(plan.permissions) !== JSON.stringify(additions)) throw new Error("Invalid access plan");
  await db.$transaction(async tx => {
    for (const entry of plan.roles) {
      const role = await tx.companyRole.findFirst({ where: { id: entry.id, companyId: entry.companyId, isOwner: true } });
      if (!role) throw new Error(`Owner grade changed: ${entry.companyName}`);
      const permissions = [...new Set([...role.permissions, ...additions])];
      await tx.companyRole.update({ where: { id: role.id }, data: { permissions } });
      await tx.auditLog.create({ data: { companyId: role.companyId, actorId: "rpilot:maintenance", actorName: "Maintenance RPilot autorisée", action: "Accès aux modules commerciaux ajoutés au grade Direction", entityId: role.id, details: { before: { permissions: role.permissions }, after: { permissions } } } });
    }
  });
  console.log(`Updated ${plan.roles.length} approved owner grade(s). Employee grades and module switches are unchanged.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
