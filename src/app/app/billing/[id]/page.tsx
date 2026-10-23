import {activeSession} from "@/lib/active-session";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { money } from "@/lib/utils";
import { membership } from "@/domains/core/service";
import { commerceAccess } from "@/domains/commerce/service";
import { PrintButton } from "@/components/print-button";
import { Brand } from "@/components/brand";
export const metadata = { title: "Document RP — Nyro Dashboard", robots: { index: false, follow: false } };

export default async function BillingPrint({ params }: { params: Promise<{ id: string }> }) {
  const session = await activeSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { id } = await params;
  const doc = await db.billingDocument.findFirst({ where: { id, company: { members: { some: { userId: session.user.id, status: "ACTIVE" } } } }, include: { company: { select: { name: true, description: true, sector: true } }, items: { orderBy: { position: "asc" } } } });
  if (!doc) notFound();
  const member = await membership(db, doc.companyId, session.user.id);
  try { commerceAccess(member, doc.kind === "QUOTE" ? "quotes" : "invoices", "read"); } catch { notFound(); }
  const labels: Record<string, string> = { DRAFT: "Brouillon", ISSUED: "Émis", ACCEPTED: "Accepté", DECLINED: "Refusé", PAID: "Réglée", CANCELLED: "Annulé" };
  return <main className="billing-print-page"><div className="print-toolbar"><a className="btn outline" href={`/app?company=${encodeURIComponent(doc.companyId)}`}>Retour à l’entreprise</a><PrintButton/></div><article className="billing-paper"><header><Brand/><div><span>{doc.kind === "QUOTE" ? "DEVIS RP" : "FACTURE RP"}</span><h1>{doc.number}</h1><p>{labels[doc.status]}</p></div></header><div className="paper-parties"><div><small>ÉMETTEUR</small><h2>{doc.company.name}</h2><p>{doc.company.sector}</p></div><div><small>CLIENT RP</small><h2>{doc.customerName}</h2><p>{doc.customerContact}</p></div></div><div className="paper-dates"><span>Création : {doc.createdAt.toLocaleDateString("fr-FR")}</span>{doc.validUntil && <span>Échéance : {doc.validUntil.toLocaleDateString("fr-FR")}</span>}{doc.issuedAt && <span>Émission : {doc.issuedAt.toLocaleDateString("fr-FR")}</span>}</div><table><thead><tr><th>Désignation</th><th>Quantité</th><th>Prix unitaire RP</th><th>Total RP</th></tr></thead><tbody>{doc.items.map(i => <tr key={i.id}><td>{i.label}</td><td>{i.quantity}</td><td>{money(i.unitPrice)}</td><td>{money(i.total)}</td></tr>)}</tbody></table><div className="bill-totals"><span>Sous-total<strong>{money(doc.subtotal)}</strong></span><span>Remise<strong>{doc.discountBps / 100} %</strong></span><span>Total RP<strong>{money(doc.total)}</strong></span></div>{doc.notes && <p className="bill-notes">{doc.notes}</p>}<footer>Document Roleplay interne · Montants virtuels RP · Sans valeur de facture commerciale réelle.<br/>La mention « émis » indique l’enregistrement du document ; aucun envoi automatique n’est effectué.</footer></article></main>;
}
