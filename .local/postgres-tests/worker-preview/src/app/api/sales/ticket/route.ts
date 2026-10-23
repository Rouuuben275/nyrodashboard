import {z} from "zod";
import {activeSession} from "@/lib/active-session";
import {AppError} from "@/domains/core/errors";
import {readSales} from "@/domains/sales/queries";
import {billingFailure,billingHeaders} from "@/domains/billing/http";
import {tableReportPdf} from "@/lib/table-report-pdf";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
 const session=await activeSession({headers:req.headers});if(!session)throw new AppError("Connexion requise.",401);
 const q=z.object({companyId:z.string().min(1).max(100),saleId:z.string().min(1).max(100)}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));
 const data=await readSales(session.user.id,{...q,view:"history"}),sale=data.selected!;
 const money=(v:number)=>`${(v/100).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} $ RP`;
 const rows=sale.items.map(i=>[i.name,i.quantity,money(i.unitPrice),money(i.quantity*i.unitPrice)]);
 rows.push(["Sous-total", "", "", money(data.amounts!.subtotal)],[`Remise ${(sale.discountBps/100).toLocaleString("fr-FR")} %`,"","",money(data.amounts!.subtotal-sale.total)],["Total enregistré", "", "", money(sale.total)]);
 const bytes=await tableReportPdf({company:data.company.name,title:`Ticket ${sale.number}`,selection:`${new Date(sale.createdAt).toLocaleString("fr-FR",{timeZone:"Europe/Paris"})} · ${sale.customer} · ${sale.sellerName} · ${sale.payment}`,note:`Document interne Roleplay. Aucun paiement réel, aucune facture fiscale. ${sale.status==="CANCELLED"?`VENTE ANNULÉE — remboursement RP intégral. ${sale.cancelReason??"Motif historique non renseigné sur le ticket."}`:"Vente enregistrée."}`,columns:["Article","Quantité","Prix unitaire","Montant"],rows,branding:"NYRO DASHBOARD / TICKET DE VENTE RP"});
 return new Response(new Uint8Array(bytes),{headers:{...billingHeaders,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="ticket-${sale.number.replace(/[^A-Za-z0-9_-]/g,"")}.pdf"`}});
 }catch(e){return billingFailure(e);}}
