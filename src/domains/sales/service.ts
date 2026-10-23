import {createHash,randomBytes} from "node:crypto";
import type {Prisma} from "@prisma/client";
import type {membership} from "@/domains/core/service";
import type {Action} from "@/domains/core/validation";
import {safeTotal} from "@/domains/core/validation";
import {AppError} from "@/domains/core/errors";
import {changeStock} from "@/domains/inventory/ledger";
import {postLedger} from "@/domains/finance/ledger";
import {saleAmounts} from "./calculation";
type Member=Awaited<ReturnType<typeof membership>>;
type Tx=Prisma.TransactionClient;
export function salesAccess(member:Member,cash=false){
 if(!member.company.modules.some(m=>m.key==="sales"&&m.enabled))throw new AppError("Module Ventes désactivé.",403);
 if(cash&&!member.company.modules.some(m=>m.key==="cash"&&m.enabled))throw new AppError("Module Caisse désactivé.",403);
 if(!member.role.permissions.some(p=>p==="sales.read"||p==="sales.create"))throw new AppError("Accès aux ventes refusé.",403);
 if(cash&&!member.role.permissions.includes("sales.create"))throw new AppError("Enregistrement des ventes requis pour accéder à la caisse.",403);
}
// The legacy sale form and the dedicated POS both use this same transaction.
// The enclosing execute() function holds the tenant advisory lock.
export async function recordSale(tx:Tx,companyId:string,member:Member,actor:{id:string},input:Extract<Action,{action:"sale.create"}>){
 salesAccess(member,input.channel==="CASH");
 if(!member.role.permissions.includes("sales.create"))throw new AppError("Permission insuffisante.",403);
 if(["products","finance"].some(key=>!member.company.modules.some(m=>m.key===key&&m.enabled)))throw new AppError("Activez Produits et Comptabilité pour enregistrer une vente.",403);
 if(input.discountBps&&!member.role.permissions.includes("sales.discount"))throw new AppError("Permission d’appliquer une remise requise.",403);
 const ids=input.items.map(i=>i.productId);if(new Set(ids).size!==ids.length)throw new AppError("Regroupez les quantités d’un même produit.");
 const intent={sellerId:actor.id,customer:input.customer,payment:input.payment,channel:input.channel,discountBps:input.discountBps,expectedTotal:input.expectedTotal??null,items:[...input.items].sort((a,b)=>a.productId.localeCompare(b.productId))};
 const requestHash=createHash("sha256").update(JSON.stringify(intent)).digest("hex");
 const existing=await tx.sale.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}},include:{items:true}});
 if(existing){
   // Historical sales have no hash; compare their stored business fields instead.
   const legacyMatches=existing.sellerId===actor.id&&existing.customer===input.customer&&existing.payment===input.payment&&existing.channel===input.channel&&existing.discountBps===input.discountBps&&(input.expectedTotal===undefined||input.expectedTotal===existing.total)&&existing.items.length===input.items.length&&input.items.every(i=>existing.items.some(old=>old.productId===i.productId&&old.quantity===i.quantity));
   if(existing.requestHash?existing.requestHash!==requestHash:!legacyMatches)throw new AppError("Clé de vente déjà utilisée pour une autre opération.",409);
   return {sale:existing,replayed:true};
 }
 const products=await tx.product.findMany({where:{companyId,id:{in:ids},archived:false}});if(products.length!==ids.length)throw new AppError("Un produit est indisponible.");
 const items=input.items.map(i=>({...i,product:products.find(p=>p.id===i.productId)!}));
 const amounts=saleAmounts(safeTotal(items.map(i=>({quantity:i.quantity,price:i.product.price}))),input.discountBps);
 if(input.expectedTotal!==undefined&&input.expectedTotal!==amounts.total)throw new AppError("Les prix ont changé. Actualisez le catalogue et vérifiez le total avant de confirmer.",409);
 const sale=await tx.sale.create({data:{companyId,number:`VT-${randomBytes(5).toString("hex").toUpperCase()}`,requestKey:input.requestKey,requestHash,customer:input.customer,payment:input.payment,total:amounts.total,discountBps:input.discountBps,channel:input.channel,sellerId:actor.id,sellerName:member.characterName}});
 for(const item of items){
   if(item.product.trackStock)await changeStock(tx,{companyId,productId:item.productId,quantity:-item.quantity,kind:"SALE",reason:sale.number,actorId:actor.id,sourceId:sale.id});
   await tx.saleItem.create({data:{companyId,saleId:sale.id,productId:item.productId,name:item.product.name,quantity:item.quantity,unitPrice:item.product.price}});
 }
 await postLedger(tx,{companyId,amount:sale.total,kind:"SALE",label:`Vente ${sale.number} · ${input.customer}`,sourceId:sale.id,actorId:actor.id});return {sale,replayed:false};
}
