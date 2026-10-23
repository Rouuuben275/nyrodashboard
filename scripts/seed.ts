import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { execute } from "../src/domains/core/service";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production.");
  const email = "demo@rpilot.local";
  if (await db.user.findUnique({ where: { email } })) { console.log("Demo account already exists. No data changed."); return; }
  // Fixture data only. This account deliberately has no sign-in method.
  const actor = await db.user.create({ data: { email, name: "Nathan Brooks" } });
  // Explicit development fixture only; no public endpoint can create RP servers.
  const server=await db.rPServer.create({data:{name:"Los Santos RP",description:"Espace de démonstration — communauté et données fictives."}});
  const serverRole=await db.serverRole.create({data:{serverId:server.id,name:"Propriétaire de démonstration",permissions:["companies.manage","server.manage","statistics.read"]}});
  await db.serverMember.create({data:{serverId:server.id,userId:actor.id,roleId:serverRole.id}});
  const company = await execute(actor, undefined, { action: "company.create", name: "Benny’s Original Motor Works", sector: "Garage automobile", serverId: server.id }) as { id: string };
  await execute(actor, company.id, { action: "company.update", name: "Benny’s Original Motor Works", description: "Atelier de mécanique, réparation et personnalisation automobile à Los Santos. Espace de démonstration avec données fictives.", expenseThreshold: 500000, serverId: server.id });
  const role = await db.companyRole.findFirstOrThrow({ where: { companyId: company.id, isOwner: false } });
  for (const [i, name] of ["Lucas Moreau", "Emma Laurent", "James Carter", "Sofia Martinez", "Tom Walker"].entries()) {
    const user = await db.user.create({ data: { name, email: `demo-team-${i}@rpilot.local`, emailVerified: false } });
    await db.companyMember.create({ data: { companyId: company.id, userId: user.id, roleId: role.id, characterName: name, department: i < 3 ? "Atelier" : "Accueil", salary: 250000 } });
  }
  const products: { id: string }[] = [];
  for (const [name, sku, price, cost, stock, threshold, trackStock] of [
    ["Réparation complète", "REP-001", 85000, 25000, 0, 0, false],
    ["Kit de réparation", "KIT-001", 35000, 10000, 200, 10, true],
    ["Personnalisation carrosserie", "CUST-001", 250000, 75000, 0, 0, false],
    ["Vidange moteur", "VID-001", 45000, 10000, 0, 0, false],
    ["Pneus performance", "PNEU-001", 120000, 40000, 200, 10, true],
    ["Peinture personnalisée", "PEINT-001", 175000, 50000, 0, 0, false],
  ] as const) products.push(await execute(actor, company.id, { action: "product.create", name, sku, category: trackStock ? "Pièces détachées" : "Prestations", price, cost, stock, threshold, trackStock }) as { id: string });
  const clients = ["Ethan Parker", "Olivia Bennett", "William Hayes", "Mia Anderson", "Noah Sullivan", "Charlotte Davis"];
  for (let day = 56; day >= 0; day--) {
    const count = 1 + (day * 7 + 3) % 4;
    for (let j = 0; j < count; j++) {
      const sale = await execute(actor, company.id, { action: "sale.create", customer: clients[(day + j) % clients.length], payment: j % 2 ? "Espèces RP" : "Carte RP", requestKey: randomUUID(), items: [{ productId: products[(day + j) % products.length].id, quantity: 1 + (day + j) % 3 }] }) as { id: string };
      const date = new Date(); date.setDate(date.getDate() - day); date.setHours(10 + j * 2, 15 + j * 7, 0, 0);
      await db.sale.update({ where: { id: sale.id }, data: { createdAt: date } });
      await db.financialEntry.updateMany({ where: { sourceId: sale.id }, data: { createdAt: date } });
      await db.auditLog.updateMany({ where: { entityId: sale.id }, data: { createdAt: date } });
    }
    if (day % 3 === 0) {
      const expense = await execute(actor, company.id, { action: "expense.create", label: "Approvisionnement atelier (démo)", amount: 100000 + (day % 7) * 25000, category: "Approvisionnement" }) as { id: string };
      const date = new Date(); date.setDate(date.getDate() - day); date.setHours(9, 0, 0, 0);
      await db.financialEntry.updateMany({ where: { sourceId: expense.id }, data: { createdAt: date } });
      await db.auditLog.updateMany({ where: { entityId: expense.id }, data: { createdAt: date } });
    }
    // Seed uses real service validations; do not bypass the normal per-minute limiter.
    await db.rateLimit.deleteMany({ where: { key: { startsWith: `app:${actor.id}:` } } });
  }
  const members = await db.companyMember.findMany({ where: { companyId: company.id } });
  for (const [i, m] of members.entries()) {
    const start = new Date(); start.setHours(16 + i % 3, 0, 0, 0); const end = new Date(start); end.setHours(end.getHours() + 4);
    await execute(actor, company.id, { action: "shift.create", memberId: m.id, title: i < 3 ? "Service atelier" : "Accueil clients", start: start.toISOString(), end: end.toISOString() });
    if (i < 3) await db.timeEntry.create({ data: { companyId: company.id, memberId: m.id, start: new Date(Date.now() - (45 + i * 20) * 60000) } });
  }
  for (const [title, priority] of [["Préparer la commande de pièces", "HIGH"], ["Organiser l’inventaire de la semaine", "NORMAL"], ["Accueillir les nouveaux mécaniciens", "NORMAL"]]) await execute(actor, company.id, { action: "task.create", title, priority });
  await db.product.update({ where: { id: products[1].id }, data: { stock: 4 } });
  await db.inventoryMovement.create({ data: { companyId: company.id, productId: products[1].id, quantity: 4 - (await db.inventoryMovement.aggregate({ where: { productId: products[1].id }, _sum: { quantity: true } }))._sum.quantity!, reason: "Inventaire de démonstration", actorId: actor.id } });
  await db.notification.create({ data: { userId: actor.id, title: "Bienvenue dans votre espace de démonstration", body: "Ces données sont fictives et réservées à la découverte du logiciel. Créez une nouvelle entreprise pour démarrer avec des données vierges." } });
  console.log("Fictional demo data created for development. The fixture account has no sign-in method; application access uses Discord only.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
