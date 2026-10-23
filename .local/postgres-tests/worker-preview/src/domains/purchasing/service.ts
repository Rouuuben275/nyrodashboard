import { changeStock } from "@/domains/inventory/ledger";
import { postLedger } from "@/domains/finance/ledger";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import type { PurchaseAction } from "./validation";
import { AppError } from "@/domains/core/errors";
import { safeTotal } from "@/domains/core/validation";
type Access = { role: { permissions: string[] }; company: { modules: { key: string; enabled: boolean }[] } };
function authorize(access: Access, module: string, permission: string) {
  if (!access.role.permissions.includes(permission)) throw new AppError("Permission insuffisante.", 403);
  if (!access.company.modules.some(m => m.key === module && m.enabled)) throw new AppError("Ce module est désactivé.", 403);
}
export async function executePurchasing(tx: Prisma.TransactionClient, companyId: string, access: Access, actor: { id: string; name: string }, input: PurchaseAction) {
  const log = (action: string, entityId: string, details: Prisma.InputJsonValue = {}) => tx.auditLog.create({ data: { companyId, actorId: actor.id, actorName: actor.name, action, entityId, details } });
  if (input.action === "supplier.save") {
    authorize(access, "suppliers", "suppliers.manage");
    const existing = input.supplierId ? await tx.supplier.findFirst({ where: { id: input.supplierId, companyId } }) : null;
    if (input.supplierId && !existing) throw new AppError("Fournisseur introuvable.", 404);
    const { action: _, supplierId: __, ...data } = input;
    const supplier = existing ? await tx.supplier.update({ where: { id: existing.id }, data }) : await tx.supplier.create({ data: { ...data, companyId } });
    await log(existing ? (supplier.archived ? "Fournisseur archivé" : "Fournisseur modifié") : "Fournisseur créé", supplier.id);
    return supplier;
  }
  authorize(access, "orders", "orders.manage");
  if (input.action === "purchase.save") {
    authorize(access, "suppliers", "suppliers.read"); authorize(access, "inventory", "inventory.read");
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, companyId, archived: false } });
    if (!supplier) throw new AppError("Sélectionnez un fournisseur actif de cette entreprise.");
    if (new Set(input.items.map(i => i.productId)).size !== input.items.length) throw new AppError("Regroupez les quantités d’une même référence.");
    const products = await tx.product.findMany({ where: { companyId, id: { in: input.items.map(i => i.productId) }, archived: false, trackStock: true } });
    if (products.length !== input.items.length) throw new AppError("Chaque ligne doit désigner un produit stocké de cette entreprise.");
    const total = safeTotal(input.items.map(i => ({ quantity: i.quantity, price: i.unitCost })));
    const lines = input.items.map(i => ({ ...i, name: products.find(p => p.id === i.productId)!.name, total: i.quantity * i.unitCost }));
    let order;
    if (input.orderId) {
      const before = await tx.purchaseOrder.findFirst({ where: { id: input.orderId, companyId, status: "DRAFT" } });
      if (!before) throw new AppError("Seul un brouillon de cette entreprise peut être modifié.");
      await tx.purchaseItem.deleteMany({ where: { companyId, orderId: before.id } });
      order = await tx.purchaseOrder.update({ where: { id: before.id }, data: { supplierId: supplier.id, supplierName: supplier.name, total, notes: input.notes, items: { create: lines } } });
    } else {
      const year = new Date().getUTCFullYear();
      const count = await tx.purchaseOrder.count({ where: { companyId, createdAt: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } } });
      order = await tx.purchaseOrder.create({ data: { companyId, supplierId: supplier.id, supplierName: supplier.name, number: `ACH-${year}-${String(count + 1).padStart(5, "0")}`, notes: input.notes, total, items: { create: lines } } });
    }
    await log(input.orderId ? "Commande d’achat modifiée" : "Commande d’achat créée", order.id, { total, number: order.number });
    return order;
  }
  const order = await tx.purchaseOrder.findFirst({ where: { id: input.orderId, companyId }, include: { items: true } });
  if (!order) throw new AppError("Commande introuvable.", 404);
  if (input.action === "purchase.receive") {
    return receive(tx, companyId, access, actor, order, input, log);
  }
  if (order.status === input.status) return order;
  if (!(order.status === "DRAFT" && ["ORDERED", "CANCELLED"].includes(input.status)) && !(["ORDERED", "PARTIAL"].includes(order.status) && ["RECEIVED", "CANCELLED"].includes(input.status))) throw new AppError("Cette transition n’est pas autorisée. Une réception ne peut pas être annulée.");
  if (input.status === "CANCELLED" && input.reason.length < 3) throw new AppError("Précisez le motif d’annulation.");
  if (input.status === "RECEIVED") {
    // Backward-compatible full receipt: deliver only what is still outstanding.
    return receive(tx, companyId, access, actor, order, {
      action: "purchase.receive", orderId: order.id, requestKey: `complete:${order.id}`,
      occurredAt: new Date().toISOString(), reference: "", notes: "",
      items: order.items.filter(i => i.quantity > i.receivedQuantity).map(i => ({ itemId: i.id, quantity: i.quantity - i.receivedQuantity })),
    }, log, true);
  }
  const updated = await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: input.status, ...(input.status === "ORDERED" ? { orderedAt: new Date() } : {}) } });
  await log("Statut d’achat modifié", order.id, { before: { status: order.status }, after: { status: input.status }, reason: input.reason, number: order.number, total: order.total });
  return updated;
}

type ReceiptInput = Extract<PurchaseAction, { action: "purchase.receive" }>;
type OrderWithItems = Prisma.PurchaseOrderGetPayload<{ include: { items: true } }>;
async function receive(tx: Prisma.TransactionClient, companyId: string, access: Access, actor: {id:string;name:string}, order: OrderWithItems, input: ReceiptInput, log: (action:string,entityId:string,details?:Prisma.InputJsonValue)=>Promise<unknown>, full = false) {
  authorize(access, "inventory", "inventory.manage"); authorize(access, "finance", "finance.read");
  const items = [...input.items].sort((a,b) => a.itemId.localeCompare(b.itemId));
  const fingerprint = createHash("sha256").update(JSON.stringify({ orderId: order.id, items, occurredAt: input.occurredAt, reference: input.reference, notes: input.notes })).digest("hex");
  const previous = await tx.purchaseReceipt.findUnique({ where: { companyId_requestKey: {companyId, requestKey:input.requestKey} } });
  if (previous) {
    if (!full && previous.fingerprint !== fingerprint) throw new AppError("Cette clé a déjà servi pour une autre réception.", 409);
    return previous;
  }
  if (!["ORDERED", "PARTIAL"].includes(order.status)) throw new AppError("Cette transition de réception n’est pas autorisée.");
  const occurredAt = new Date(input.occurredAt);
  if (occurredAt > new Date() || occurredAt < new Date("2000-01-01T00:00:00Z")) throw new AppError("La date de réception doit être comprise entre 2000 et maintenant.");
  if (!items.length || new Set(items.map(i => i.itemId)).size !== items.length) throw new AppError("Sélectionnez des lignes distinctes à réceptionner.");
  const lines = items.map(i => {
    const item = order.items.find(line => line.id === i.itemId);
    if (!item) throw new AppError("Ligne de commande introuvable.",404);
    if (i.quantity > item.quantity - item.receivedQuantity) throw new AppError(`La quantité reçue dépasse le reliquat de ${item.name}.`,409);
    return {itemId:item.id,name:item.name,quantity:i.quantity,unitCost:item.unitCost};
  });
  const total = safeTotal(lines.map(i => ({quantity:i.quantity,price:i.unitCost})));
  const receipt = await tx.purchaseReceipt.create({data:{companyId,orderId:order.id,requestKey:input.requestKey,fingerprint,reference:input.reference,notes:input.notes,occurredAt,actorId:actor.id,total,lines:{create:lines}}});
  const sourceId = full ? order.id : receipt.id;
  for (const line of lines) {
    const item = order.items.find(i => i.id === line.itemId)!;
    try { await changeStock(tx,{companyId,productId:item.productId,quantity:line.quantity,kind:"RECEIPT",reason:`Réception ${order.number}`,actorId:actor.id,sourceId,unitCost:item.unitCost,occurredAt}); }
    catch(e) { if(e instanceof AppError) throw new AppError(`Réception impossible : ${e.message}`); throw e; }
    await tx.purchaseItem.update({where:{id:item.id},data:{receivedQuantity:{increment:line.quantity}}});
  }
  await postLedger(tx,{companyId,amount:-total,kind:"PURCHASE",label:`Réception ${order.number} · ${order.supplierName}`,sourceId,actorId:actor.id,occurredAt});
  const complete = order.items.every(i => i.receivedQuantity + (items.find(line => line.itemId === i.id)?.quantity ?? 0) === i.quantity);
  await tx.purchaseOrder.update({where:{id:order.id},data:{status:complete?"RECEIVED":"PARTIAL",...(complete?{receivedAt:occurredAt,receivedBy:actor.id}:{})}});
  await log(complete?"Commande réceptionnée et stock actualisé":"Réception partielle enregistrée",order.id,{receiptId:receipt.id,number:order.number,total,status:complete?"RECEIVED":"PARTIAL",reference:input.reference});
  return receipt;
}
