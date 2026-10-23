import {activeSession} from "@/lib/active-session";
import {auth} from "@/lib/auth";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {stockAccess} from "@/domains/inventory/service";
import {stockQuery} from "@/domains/inventory/validation";
import {movementWhere,stockMovements} from "@/domains/inventory/queries";
import {ZodError} from "zod";
import {tableReportPdf} from "@/lib/table-report-pdf";
const cell=(v:unknown)=>{let s=String(v??"");if(typeof v!=="number"&&/^[=+\-@\t\r]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;};
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  const params=new URL(req.url).searchParams,q=stockQuery.parse(Object.fromEntries(params)),view=params.get("view");if(!["products","movements"].includes(view||""))throw new AppError("Vue d’export invalide.");
  const format=params.get("format")||"csv";
  if(!["csv","pdf"].includes(format))throw new AppError("Format d’export invalide.");
  const viewer=await membership(db,q.companyId,session.user.id);stockAccess(viewer);
  const limit=format==="pdf"?1000:10000;
  const rows=await db.$transaction(async tx=>{
    if(view==="products"){
      const where:Prisma.ProductWhereInput={companyId:q.companyId,trackStock:true,archived:false,...(q.q?{OR:[{name:{contains:q.q,mode:"insensitive"}},{sku:{contains:q.q,mode:"insensitive"}},{category:{contains:q.q,mode:"insensitive"}}]}:{}),...(q.low?{stock:{lte:tx.product.fields.threshold}}:{})};
      if(await tx.product.count({where})>limit)throw new AppError(`Plus de ${limit} références : réduisez la sélection.`,413);
      const products=await tx.product.findMany({where,orderBy:[{name:"asc"},{id:"asc"}],take:limit});
      return [["Référence","Produit","Catégorie","Quantité","Seuil","Coût catalogue centimes RP","Estimation centimes RP (coût actuel)"],...products.map(p=>[p.sku,p.name,p.category,p.stock,p.threshold,p.cost,p.stock*p.cost])];
    }
    const count=await tx.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "InventoryMovement" m JOIN "Product" p ON p.id=m."productId" AND p."companyId"=m."companyId" ${movementWhere(q)}`);
    if(Number(count[0].count)>limit)throw new AppError(`Plus de ${limit} mouvements : réduisez la période.`,413);
    const movements=[];for(let offset=0;offset<Number(count[0].count);offset+=500)movements.push(...await stockMovements(tx,q,500,offset));
    return [["Date métier Paris","Saisi UTC","Référence","Produit","Type","Quantité signée","Motif","Coût unitaire mémorisé centimes RP","Auteur","Source","Emplacement"],...movements.map(m=>[new Date(m.date).toLocaleString("fr-FR",{timeZone:"Europe/Paris"}),m.createdAt.toISOString(),m.sku,m.name,m.kind||"Historique non typé",m.quantity,m.reason,m.unitCost,m.actorName,m.sourceId,m.warehouseLabel||"Stock général / historique"])];
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20000});
  if(format==="pdf"){
    const selection=view==="products"?`Stocks actuels · Recherche : ${q.q||"toutes références"} · ${q.low?"Au seuil d’alerte":"Tous seuils"}`:`Mouvements du ${q.from||"début"} au ${q.to||"jour courant"} · Recherche : ${q.q||"tous"} · Type : ${q.kind||"tous"}${q.productId?` · Produit : ${q.productId}`:""}`;
    const note=view==="products"?"Valeur indicative au coût catalogue actuel. Aucun CUMP/FIFO ni transfert en jeu.":"Quantités signées et coûts unitaires mémorisés lors du mouvement. Les anciennes lignes non typées sont conservées.";
    const pdf=await tableReportPdf({company:viewer.company.name,title:view==="products"?"État des stocks":"Historique des mouvements",selection,note,columns:rows[0].map(String),rows:rows.slice(1)});
    return new Response(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="nyro-stocks-${view}.pdf"`,"Cache-Control":"private, no-store"}});
  }
  return new Response("\uFEFF"+rows.map(row=>row.map(cell).join(";")).join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="nyro-stocks-${view}.csv"`,"Cache-Control":"private, no-store"}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres invalides."},{status:400});console.error("Stock export failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Export impossible."},{status:500});}}
