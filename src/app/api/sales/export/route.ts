export const runtime="nodejs";
import {streamResponse} from "@/lib/stream-response";
import {activeSession} from "@/lib/active-session";
import {AppError} from "@/domains/core/errors";
import {exportSales} from "@/domains/sales/queries";
import {billingFailure,billingHeaders} from "@/domains/billing/http";
export const dynamic="force-dynamic";
const cell=(v:unknown)=>{const s=String(v??"");return `"${(/^[=+\-@\t\r]/.test(s)?"'":"")+s.replaceAll('"','""')}"`;};
export async function GET(req:Request){try{const session=await activeSession({headers:req.headers});if(!session)throw new AppError("Connexion requise.",401);const rows=await exportSales(session.user.id,Object.fromEntries(new URL(req.url).searchParams));const body="\uFEFF"+[["Ticket","Client RP","Vendeur","Paiement RP","Total centimes RP","Remise points de base","Statut","Date UTC"],...rows.map(r=>[r.number,r.customer,r.sellerName,r.payment,r.total,r.discountBps,r.status,r.createdAt.toISOString()])].map(r=>r.map(cell).join(";")).join("\r\n");return streamResponse(body,{headers:{...billingHeaders,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=ventes-nyro.csv"}});}catch(e){return billingFailure(e);}}
