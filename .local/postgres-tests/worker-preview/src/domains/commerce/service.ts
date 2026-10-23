import { postLedger } from "@/domains/finance/ledger";
import { Prisma } from "@prisma/client";
import type { CommerceAction } from "./validation";
import { AppError } from "@/domains/core/errors";
import { safeTotal } from "@/domains/core/validation";

type Access = { role: { permissions: string[] }; company: { modules: { key: string; enabled: boolean }[] } };
export function commerceAccess(access: Access, module: "crm" | "quotes" | "invoices" | "finance", mode: "read" | "manage" = "manage") {
  if (!access.role.permissions.includes(`${module}.${mode}`)) throw new AppError("Permission insuffisante.", 403);
  if (!access.company.modules.some(m => m.key === module && m.enabled)) throw new AppError("Ce module est désactivé.", 403);
}
export function billingTotals(items: { quantity: number; unitPrice: number }[], discountBps: number) {
  const subtotal = safeTotal(items.map(i => ({ quantity: i.quantity, price: i.unitPrice })));
  const total = Math.round(subtotal * (10000 - discountBps) / 10000);
  return { subtotal, total };
}
export async function executeCommerce(tx: Prisma.TransactionClient, companyId: string, access: Access, actor: { id: string; name: string }, input: CommerceAction) {
  const log = (action: string, entityId: string, details: Prisma.InputJsonValue = {}) => tx.auditLog.create({ data: { companyId, actorId: actor.id, actorName: actor.name, action, entityId, details } });
  if (input.action === "customer.save") {
    commerceAccess(access, "crm");
    const before = input.customerId ? await tx.customer.findFirst({ where: { id: input.customerId, companyId } }) : null;
    if (input.customerId && !before) throw new AppError("Client introuvable.", 404);
    const { action: _, customerId: __, ...data } = input;
    const customer = before ? await tx.customer.update({ where: { id: before.id }, data }) : await tx.customer.create({ data: { ...data, companyId } });
    // Contact notes are private CRM data: audit only changes, not their sensitive contents.
    await log(before ? (customer.archived ? "Client archivé" : "Client modifié") : "Client créé", customer.id, { fields: before ? Object.keys(data).filter(k => data[k as keyof typeof data] !== before[k as keyof typeof data]) : Object.keys(data) });
    return customer;
  }
  async function createDocument(data: { kind: string; customerId: string; customerName: string; customerContact: string; notes: string; discountBps: number; subtotal: number; total: number; validUntil?: Date | null; sourceId?: string }, items: { label: string; quantity: number; unitPrice: number }[]) {
    const year = new Date().getUTCFullYear();
    const count = await tx.billingDocument.count({ where: { companyId, kind: data.kind, createdAt: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } } });
    const number = `${data.kind === "QUOTE" ? "DEV" : "FAC"}-${year}-${String(count + 1).padStart(5, "0")}`;
    return tx.billingDocument.create({ data: { ...data, number, companyId, items: { create: items.map((i, position) => ({ ...i, position, total: i.quantity * i.unitPrice })) } } });
  }
  if (input.action === "billing.save") {
    commerceAccess(access, input.kind === "QUOTE" ? "quotes" : "invoices");
    commerceAccess(access, "crm", "read");
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, companyId, archived: false } });
    if (!customer) throw new AppError("Sélectionnez un client actif de cette entreprise.");
    const amounts = billingTotals(input.items, input.discountBps);
    const data = { kind: input.kind, customerId: customer.id, customerName: customer.name, customerContact: [customer.phone, customer.email].filter(Boolean).join(" · "), notes: input.notes, discountBps: input.discountBps, ...amounts, validUntil: input.validUntil ? new Date(input.validUntil) : null };
    let document;
    if (input.documentId) {
      const existing = await tx.billingDocument.findFirst({ where: { id: input.documentId, companyId, kind: input.kind, status: "DRAFT" } });
      if (!existing) throw new AppError("Seul un brouillon de cette entreprise peut être modifié.");
      await tx.billingItem.deleteMany({ where: { companyId, documentId: existing.id } });
      document = await tx.billingDocument.update({ where: { id: existing.id }, data: { ...data, items: { create: input.items.map((i, position) => ({ ...i, position, total: i.quantity * i.unitPrice })) } } });
    } else document = await createDocument(data, input.items);
    await log(input.documentId ? "Document commercial modifié" : "Document commercial créé", document.id, { kind: document.kind, number: document.number, total: document.total });
    return document;
  }
  const document = await tx.billingDocument.findFirst({ where: { id: input.documentId, companyId }, include: { items: { orderBy: { position: "asc" } } } });
  if (!document) throw new AppError("Document introuvable.", 404);
  commerceAccess(access, document.kind === "QUOTE" ? "quotes" : "invoices");
  if (input.action === "billing.convert") {
    commerceAccess(access, "invoices"); commerceAccess(access, "crm", "read");
    if (document.kind !== "QUOTE" || document.status !== "ACCEPTED") throw new AppError("Seul un devis accepté peut être converti.");
    const previous = await tx.billingDocument.findUnique({ where: { companyId_sourceId: { companyId, sourceId: document.id } } });
    if (previous) return previous;
    const invoice = await createDocument({ kind: "INVOICE", customerId: document.customerId, customerName: document.customerName, customerContact: document.customerContact, notes: document.notes, discountBps: document.discountBps, subtotal: document.subtotal, total: document.total, sourceId: document.id }, document.items.map(({ label, quantity, unitPrice }) => ({ label, quantity, unitPrice })));
    await log("Devis converti en facture", invoice.id, { quoteId: document.id, quoteNumber: document.number, invoiceNumber: invoice.number });
    return invoice;
  }
  const allowed: Record<string, string[]> = document.kind === "QUOTE" ? { DRAFT: ["ISSUED", "CANCELLED"], ISSUED: ["ACCEPTED", "DECLINED", "CANCELLED"], ACCEPTED: ["CANCELLED"] } : { DRAFT: ["ISSUED", "CANCELLED"], ISSUED: ["PAID", "CANCELLED"], PAID: ["CANCELLED"] };
  if (document.status === input.status) return document; // Safe replay, no second entry.
  if (!allowed[document.status]?.includes(input.status)) throw new AppError("Cette transition de statut n’est pas autorisée.");
  if (["DECLINED", "CANCELLED"].includes(input.status) && input.reason.length < 3) throw new AppError("Précisez le motif de cette décision.");
  if (input.status === "ACCEPTED" && document.validUntil && document.validUntil < new Date()) throw new AppError("Ce devis est expiré. Établissez un nouveau devis.");
  if (document.kind === "QUOTE" && input.status === "CANCELLED" && await tx.billingDocument.count({ where: { companyId, sourceId: document.id } })) throw new AppError("Une facture existe déjà pour ce devis.");
  if (input.status === "PAID" || document.status === "PAID") {
    commerceAccess(access, "finance", "read");
    await postLedger(tx, { companyId, kind: input.status === "PAID" ? "INVOICE" : "INVOICE_REFUND", amount: input.status === "PAID" ? document.total : -document.total, label: `${input.status === "PAID" ? "Paiement RP" : "Annulation RP"} ${document.number}`, sourceId: document.id, actorId: actor.id }, document.status === "PAID" ? "INVOICE" : undefined);
  }
  const updated = await tx.billingDocument.update({ where: { id: document.id }, data: { status: input.status, ...(input.status === "ISSUED" ? { issuedAt: new Date() } : {}), ...(input.status === "PAID" ? { paidAt: new Date() } : {}), ...(input.status === "CANCELLED" ? { cancelledAt: new Date() } : {}) } });
  await log("Statut commercial modifié", document.id, { before: { status: document.status }, after: { status: input.status }, reason: input.reason, number: document.number });
  return updated;
}
