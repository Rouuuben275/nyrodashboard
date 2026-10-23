import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
async function main() {
  const plan = JSON.parse(await readFile("docs/commerce-access-plan.json", "utf8")) as { roles: { id: string; companyId: string; companyName: string }[]; permissions: string[] };
  const roles = await db.companyRole.findMany({ where: { id: { in: plan.roles.map(r => r.id) }, isOwner: true } });
  if (roles.length !== plan.roles.length || roles.some(r => !plan.permissions.every(p => r.permissions.includes(p)))) throw new Error("Missing approved permission");
  const audit = await db.auditLog.findMany({ where: { entityId: { in: plan.roles.map(r => r.id) }, actorId: "rpilot:maintenance", action: "Accès aux modules commerciaux ajoutés au grade Direction" }, orderBy: { createdAt: "desc" } });
  if (plan.roles.some(r => !audit.some(a => a.entityId === r.id && a.companyId === r.companyId))) throw new Error("Missing access audit");
  const result = { verifiedAt: new Date().toISOString(), approvedCompanyNames: plan.roles.map(r => r.companyName), permissionsPerOwnerGrade: plan.permissions.length, verifiedOwnerGrades: roles.length, auditEntries: audit.length, appliedAt: audit[0]?.createdAt.toISOString() };
  await writeFile("docs/commerce-access-applied.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
