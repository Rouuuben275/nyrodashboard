import {activeSession} from "@/lib/active-session";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { AppError } from "@/domains/core/errors";
import { membership } from "@/domains/core/service";
import { financeAccess } from "@/domains/finance/service";
import { financeQuery } from "@/domains/finance/validation";
import { ledgerRows, ledgerWhere } from "@/domains/finance/queries";
import { effectFor } from "@/domains/finance/constants";
import { financePdf } from "@/domains/finance/pdf";
import { ZodError } from "zod";
export const runtime="nodejs";
const cell=(value:unknown)=>{let text=String(value??"");if(typeof value!=="number"&&/^[=+\-@\t\r]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};
export async function GET(req:Request){
  try{
    const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
    const search=new URL(req.url).searchParams;const q=financeQuery.parse(Object.fromEntries(search));const format=search.get("format");if(!["csv","pdf"].includes(format||""))throw new AppError("Format invalide.");
    const viewer=await membership(db,q.companyId,session.user.id);financeAccess(viewer);
    // One repeatable-read snapshot for all pages: no missing or duplicate rows if
    // another member posts while exporting. Never use the browser's loaded rows.
    const rows=await db.$transaction(async tx=>{
      const count=await tx.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "FinancialEntry" e ${ledgerWhere(q)}`);
      if(Number(count[0].count)>10000)throw new AppError("Plus de 10 000 écritures : réduisez la période avant l’export.",413);
      const result=[];for(let offset=0;offset<Number(count[0].count);offset+=500)result.push(...await ledgerRows(tx,q,{offset,take:500}));return result;
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20000});
    const headers={"Cache-Control":"private, no-store","Content-Disposition":`attachment; filename="journal-Nyro Dashboard.${format}"`};
    if(format==="csv"){
      const body="\uFEFF"+[["Date métier (Paris)","Date de saisie (UTC)","Libellé","Type","Compte","Catégorie","Montant centimes RP","Auteur","Référence"],...rows.map(r=>[new Date(r.date).toLocaleString("fr-FR",{timeZone:"Europe/Paris"}),new Date(r.createdAt).toISOString(),r.label,r.kind,r.accountName,r.categoryName,r.amount,r.actorName,r.sourceId])].map(row=>row.map(cell).join(";")).join("\r\n");return new Response(body,{headers:{...headers,"Content-Type":"text/csv; charset=utf-8"}});
    }
    const summary=rows.reduce((s,r)=>{const effect=r.effect||effectFor(r.kind);if(effect==="INCOME")s.income+=r.amount;if(effect==="EXPENSE")s.expense-=r.amount;s.result=s.income-s.expense;return s;},{income:0,expense:0,result:0});
    const bytes=await financePdf(viewer.company.name,`${q.from||"Origine"} au ${q.to||"Aujourd’hui"} · ${q.account?"Compte filtré":"Tous comptes"}${q.q?` · Recherche : ${q.q}`:""}`,rows,summary);
    return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":"application/pdf"}});
  }catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres invalides."},{status:400});console.error("Finance export failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Export impossible."},{status:500});}
}
