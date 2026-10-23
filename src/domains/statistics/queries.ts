import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {moduleAccess,type Tx} from "@/domains/utilities/write";
import {parisDay} from "@/domains/planning/recurrence";
import {ledgerEffect} from "@/domains/finance/sql";
import {statisticsQuery} from "./validation";
import {widgets,orderStatusLabels} from "./constants";
type Cell=string|number;
export type Report={columns:string[];rows:Cell[][];total:number};
export function exactNumber(value:unknown){const n=Number(value??0);if(!Number.isSafeInteger(n))throw new AppError("Ce rapport dépasse la précision numérique autorisée. Réduisez la période.",413);return n;}
async function report(tx:Tx,sql:Prisma.Sql,columns:string[],limit:number,offset:number,format:(row:Record<string,unknown>)=>Cell[]):Promise<Report>{
 const [rows,count]=await Promise.all([tx.$queryRaw<Record<string,unknown>[]>(Prisma.sql`SELECT * FROM (${sql}) data LIMIT ${limit} OFFSET ${offset}`),tx.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) FROM (${sql}) data`)]);
 return {columns,rows:rows.map(format),total:exactNumber(count[0]?.count)};
}
export async function readStatistics(userId:string,raw:unknown,exportLimit?:number){
 const q=statisticsQuery.parse(raw);return db.$transaction(async tx=>{
  const member=await membership(tx,q.companyId,userId);moduleAccess(member,"statistics","statistics.read");
  const has=(key:string,permission:string)=>member.company.modules.some(m=>m.key===key&&m.enabled)&&member.role.permissions.includes(permission);
  const access={finance:has("finance","finance.read"),sales:has("sales","sales.read"),people:has("employees","employees.read")&&has("time","time.use")&&member.role.permissions.includes("employees.manage"),stock:has("inventory","inventory.read"),orders:has("orders","orders.read")};
  const sectionKey=q.section==="sellers"||q.section==="products"?"sales":q.section;
  if(sectionKey!=="overview"&&!access[sectionKey])throw new AppError("Le module source ou sa permission de lecture n’est pas accessible.",403);
  const layout=await tx.statisticsLayout.findUnique({where:{companyId_memberId:{companyId:q.companyId,memberId:member.id}}});
  const days=(+new Date(q.to)-+new Date(q.from))/86400000+1,from=parisDay(q.from),end=parisDay(q.to,1),previousFrom=parisDay(q.from,-days);
  const previousTo=new Date(+new Date(q.from)-86400000).toISOString().slice(0,10),previousStart=new Date(+new Date(q.from)-days*86400000).toISOString().slice(0,10);
  const take=exportLimit??25,offset=exportLimit?0:(q.page-1)*25;
  const money=(v:unknown)=>`${(exactNumber(v)/100).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} ${member.company.currency} RP`;
  const needed=(key:keyof typeof access)=>access[key]&&(q.section==="overview"||sectionKey===key);
  const companyId=q.companyId;
  let finance:null|{income:number;expense:number;result:number;balance:number;previousIncome:number;previousExpense:number;previousResult:number;series:{day:string;income:number;expense:number;result:number}[]}=null;
  if(needed("finance")){
   const stamp=Prisma.sql`COALESCE(e."occurredAt",e."createdAt")`;
   const [s,balance,daily]=await Promise.all([
    tx.$queryRaw<Record<string,unknown>[]>(Prisma.sql`SELECT SUM(e.amount) FILTER(WHERE ${ledgerEffect}='INCOME' AND ${stamp}>=${from}) AS income,SUM(-e.amount::bigint) FILTER(WHERE ${ledgerEffect}='EXPENSE' AND ${stamp}>=${from}) AS expense,SUM(e.amount) FILTER(WHERE ${ledgerEffect}='INCOME' AND ${stamp}<${from}) AS "previousIncome",SUM(-e.amount::bigint) FILTER(WHERE ${ledgerEffect}='EXPENSE' AND ${stamp}<${from}) AS "previousExpense" FROM "FinancialEntry" e WHERE e."companyId"=${companyId} AND ${stamp}>=${previousFrom} AND ${stamp}<${end}`),
    tx.$queryRaw<{amount:bigint}[]>`SELECT COALESCE(SUM(amount),0)::bigint AS amount FROM "FinancialEntry" WHERE "companyId"=${companyId} AND COALESCE("occurredAt","createdAt")<${end}`,
    tx.$queryRaw<{day:string;income:bigint;expense:bigint}[]>(Prisma.sql`SELECT ((${stamp} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date::text AS day,COALESCE(SUM(e.amount) FILTER(WHERE ${ledgerEffect}='INCOME'),0)::bigint AS income,COALESCE(SUM(-e.amount::bigint) FILTER(WHERE ${ledgerEffect}='EXPENSE'),0)::bigint AS expense FROM "FinancialEntry" e WHERE e."companyId"=${companyId} AND ${stamp}>=${from} AND ${stamp}<${end} GROUP BY day ORDER BY day`),
   ]);
   const byDay=new Map(daily.map(d=>[d.day,d]));const series=Array.from({length:days},(_,i)=>{const day=new Date(+new Date(q.from)+i*86400000).toISOString().slice(0,10),row=byDay.get(day),income=exactNumber(row?.income),expense=exactNumber(row?.expense);return {day,income,expense,result:exactNumber(income-expense)};});
   const income=exactNumber(s[0]?.income),expense=exactNumber(s[0]?.expense),previousIncome=exactNumber(s[0]?.previousIncome),previousExpense=exactNumber(s[0]?.previousExpense);
   finance={income,expense,result:exactNumber(income-expense),balance:exactNumber(balance[0]?.amount),previousIncome,previousExpense,previousResult:exactNumber(previousIncome-previousExpense),series};
  }
  const salesBase=Prisma.sql`FROM "Sale" s WHERE s."companyId"=${companyId} AND s."createdAt">=${from} AND s."createdAt"<${end}`;
  const sales=needed("sales")?(await tx.$queryRaw<{count:bigint;amount:bigint;cancelled:bigint}[]>(Prisma.sql`SELECT COUNT(*) FILTER(WHERE s.status='COMPLETED') AS count,COALESCE(SUM(s.total) FILTER(WHERE s.status='COMPLETED'),0)::bigint AS amount,COUNT(*) FILTER(WHERE s.status='CANCELLED') AS cancelled ${salesBase}`)).map(s=>({count:exactNumber(s.count),amount:exactNumber(s.amount),cancelled:exactNumber(s.cancelled)}))[0]:null;
  const stock=needed("stock")?(await tx.$queryRaw<{products:bigint;units:bigint;low:bigint}[]>`SELECT count(*) AS products,COALESCE(sum(stock),0)::bigint AS units,count(*) FILTER(WHERE stock<=threshold) AS low FROM "Product" WHERE "companyId"=${companyId} AND archived=false AND "trackStock"=true`).map(s=>({products:exactNumber(s.products),units:exactNumber(s.units),low:exactNumber(s.low)}))[0]:null;
  const peopleBase=Prisma.sql`SELECT m.id,m."characterName" AS name,m.status,COALESCE(r.minutes,0)::bigint AS minutes,COALESCE(r.services,0)::bigint AS services,COALESCE(r.days,0)::bigint AS days FROM "CompanyMember" m LEFT JOIN (SELECT t."memberId",SUM(r."workedMinutes")::bigint AS minutes,COUNT(*) AS services,COUNT(DISTINCT ((r.start AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date) AS days FROM "TimeEntry" t JOIN "TimeReview" r ON r."companyId"=t."companyId" AND r."entryId"=t.id AND r.revision=t.revision WHERE t."companyId"=${companyId} AND t."end" IS NOT NULL AND r.status='APPROVED' AND r.start>=${from} AND r.start<${end} GROUP BY t."memberId") r ON r."memberId"=m.id WHERE m."companyId"=${companyId} AND (m.status='ACTIVE' OR r.services>0)`;
  const people=needed("people")?(await tx.$queryRaw<{active:bigint;minutes:bigint;services:bigint}[]>(Prisma.sql`SELECT COUNT(*) FILTER(WHERE status='ACTIVE') AS active,COALESCE(SUM(minutes),0)::bigint AS minutes,COALESCE(SUM(services),0)::bigint AS services FROM (${peopleBase}) p`)).map(p=>({active:exactNumber(p.active),minutes:exactNumber(p.minutes),services:exactNumber(p.services)}))[0]:null;
  const orders=needed("orders")?(await tx.purchaseOrder.groupBy({by:["status"],where:{companyId,createdAt:{gte:from,lt:end}},_sum:{total:true},_count:true,orderBy:{status:"asc"}})).map(o=>({status:o.status,count:o._count,amount:exactNumber(o._sum.total)})):null;
  const visible=layout?.widgets??[...widgets];let table:Report={columns:["Indicateur","Valeur"],rows:[],total:0};
  if(q.section==="overview"){
   const summaries:Record<string,Cell[][]>={finance:finance?[["Revenus nets RP",money(finance.income)],["Charges nettes RP",money(finance.expense)],["Résultat de trésorerie RP",money(finance.result)],["Solde du journal à la fin de période",money(finance.balance)]]:[],sales:sales?[["Ventes actives",sales.count],["Montant net des ventes actives",money(sales.amount)],["Ventes annulées",sales.cancelled]]:[],people:people?[["Employés actifs aujourd’hui",people.active],["Minutes de services validés",people.minutes],["Services validés",people.services]]:[],stock:stock?[["Références stockées actives aujourd’hui",stock.products],["Unités en stock aujourd’hui",stock.units],["Références en alerte aujourd’hui",stock.low]]:[],orders:orders?.map(o=>[`Commandes ${orderStatusLabels[o.status]??"État historique"}`,`${o.count} · ${money(o.amount)}`])??[]};
   const rows=visible.flatMap(k=>summaries[k]??[]);table={columns:table.columns,rows:rows.slice(offset,offset+take),total:rows.length};
  }else if(q.section==="finance"&&finance){table={columns:["Jour Paris","Revenus nets RP","Charges nettes RP","Résultat de trésorerie RP"],rows:finance.series.slice(offset,offset+take).map(d=>[d.day,money(d.income),money(d.expense),money(d.result)]),total:finance.series.length};}
  else if(q.section==="sellers")table=await report(tx,Prisma.sql`SELECT s."sellerId" AS id,(array_agg(s."sellerName" ORDER BY s."createdAt" DESC,s.id DESC))[1] AS name,count(*) AS count,SUM(s.total)::bigint AS amount ${salesBase} AND s.status='COMPLETED' GROUP BY s."sellerId" ORDER BY amount DESC,id`,["Vendeur RP","Ventes actives","Montant net RP"],take,offset,r=>[String(r.name),exactNumber(r.count),money(r.amount)]);
  else if(q.section==="products")table=await report(tx,Prisma.sql`SELECT i."productId" AS id,(array_agg(i.name ORDER BY s."createdAt" DESC,i.id DESC))[1] AS name,SUM(i.quantity)::bigint AS units,SUM(i.quantity::bigint*i."unitPrice")::bigint AS amount FROM "SaleItem" i JOIN "Sale" s ON s.id=i."saleId" AND s."companyId"=i."companyId" WHERE s."companyId"=${companyId} AND s."createdAt">=${from} AND s."createdAt"<${end} AND s.status='COMPLETED' GROUP BY i."productId" ORDER BY units DESC,id`,["Produit ou prestation","Unités vendues","Montant AVANT remise globale RP"],take,offset,r=>[String(r.name),exactNumber(r.units),money(r.amount)]);
  else if(q.section==="people")table=await report(tx,Prisma.sql`${peopleBase} ORDER BY minutes DESC,m.id`,["Employé RP","Emploi actuel","Minutes validées","Services validés","Jours avec service validé"],take,offset,r=>[String(r.name),r.status==="ACTIVE"?"Actif":"Inactif",exactNumber(r.minutes),exactNumber(r.services),exactNumber(r.days)]);
  else if(q.section==="stock")table=await report(tx,Prisma.sql`SELECT p.id,p.name,p.sku,p.stock,p.threshold,(p.stock-COALESCE((SELECT SUM(w.quantity) FROM "WarehouseStock" w WHERE w."companyId"=p."companyId" AND w."productId"=p.id),0))::bigint AS general FROM "Product" p WHERE p."companyId"=${companyId} AND p.archived=false AND p."trackStock"=true ORDER BY (p.stock<=p.threshold) DESC,p.stock,p.id`,["Produit","Référence","Stock global ACTUEL","Stock général ACTUEL","Seuil d’alerte"],take,offset,r=>[String(r.name),String(r.sku),exactNumber(r.stock),exactNumber(r.general),exactNumber(r.threshold)]);
  else if(q.section==="orders"&&orders){table={columns:["État actuel","Commandes créées sur la période","Montant RP des commandes"],rows:orders.slice(offset,offset+take).map(o=>[orderStatusLabels[o.status]??"État historique",o.count,money(o.amount)]),total:orders.length};}
  return {company:{id:companyId,name:member.company.name,currency:member.company.currency},period:{from:q.from,to:q.to,previousFrom:previousStart,previousTo},access,layout:{widgets:visible,revision:layout?.revision??0},finance,sales,people,stock,orders,report:table,generatedAt:new Date().toISOString()};
 },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type StatisticsData=Awaited<ReturnType<typeof readStatistics>>;
