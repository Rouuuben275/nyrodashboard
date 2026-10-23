import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {AppError} from "@/domains/core/errors";
import type {StockAction} from "./validation";
import {changeStock,changeWarehouse} from "./ledger";
type Access={role:{permissions:string[]};company:{modules:{key:string;enabled:boolean}[]}};
export function stockAccess(access:Access,manage=false){if(!access.role.permissions.includes(manage?"inventory.manage":"inventory.read")||!access.company.modules.some(m=>m.key==="inventory"&&m.enabled))throw new AppError("Accès aux stocks insuffisant ou module désactivé.",403);}
export async function executeStock(tx:Prisma.TransactionClient,companyId:string,access:Access,actor:{id:string;name:string},input:StockAction){
  stockAccess(access,true);
  const log=(action:string,entityId:string,details:Prisma.InputJsonValue={})=>tx.auditLog.create({data:{companyId,actorId:actor.id,actorName:actor.name,action,entityId,details}});
  if(input.action==="stock.warehouse.save"){
    const before=input.warehouseId?await tx.stockWarehouse.findFirst({where:{id:input.warehouseId,companyId}}):null;
    if(input.warehouseId&&!before)throw new AppError("Entrepôt introuvable.",404);
    if(!before&&await tx.stockWarehouse.count({where:{companyId}})>=100)throw new AppError("Limite de 100 entrepôts atteinte.");
    if(await tx.stockWarehouse.findFirst({where:{companyId,code:input.code,...(before?{id:{not:before.id}}:{})}}))throw new AppError("Ce code d’entrepôt existe déjà.",409);
    if(input.archived&&await tx.warehouseStock.count({where:{companyId,warehouseId:before?.id??"",quantity:{gt:0}}}))throw new AppError("Videz cet entrepôt par transfert avant de l’archiver.");
    const data={code:input.code,name:input.name,archived:input.archived};
    const result=before?await tx.stockWarehouse.update({where:{id:before.id},data}):await tx.stockWarehouse.create({data:{companyId,...data}});
    await log(before?"Entrepôt modifié":"Entrepôt créé",result.id,{before:before?{code:before.code,name:before.name,archived:before.archived}:null,after:data});return result;
  }
  if("requestKey" in input){
    const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous=await tx.stockBatch.findUnique({where:{companyId_requestKey:{companyId,requestKey:input.requestKey}}});
    if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("Cette clé a déjà servi pour une autre opération de stock.",409);return previous;}
    if(input.action==="stock.transfer"){
      if(input.sourceWarehouseId===input.destinationWarehouseId)throw new AppError("Choisissez deux emplacements distincts.");
      const occurredAt=new Date(input.occurredAt);
      if(occurredAt>new Date()||occurredAt<new Date("2000-01-01T00:00:00Z"))throw new AppError("Date de transfert invalide : entre 2000 et maintenant.");
      const product=await tx.product.findFirst({where:{companyId,id:input.productId,trackStock:true,archived:false}});
      if(!product)throw new AppError("Référence stockée active introuvable.");
      const warehouses=await tx.stockWarehouse.findMany({where:{companyId,id:{in:[input.sourceWarehouseId,input.destinationWarehouseId].filter((id):id is string=>!!id)},archived:false}});
      for(const id of [input.sourceWarehouseId,input.destinationWarehouseId])if(id&&!warehouses.some(w=>w.id===id))throw new AppError("Entrepôt actif introuvable.");
      if(input.sourceWarehouseId)await changeWarehouse(tx,companyId,input.sourceWarehouseId,product.id,-input.quantity);
      else {
        const allocated=await tx.warehouseStock.aggregate({where:{companyId,productId:product.id},_sum:{quantity:true}});
        if(product.stock-(allocated._sum.quantity??0)<input.quantity)throw new AppError("Stock insuffisant dans le stock général.");
      }
      if(input.destinationWarehouseId)await changeWarehouse(tx,companyId,input.destinationWarehouseId,product.id,input.quantity);
      const name=(id:string|null)=>{const w=warehouses.find(w=>w.id===id);return w?`${w.code} · ${w.name}`:"Stock général";};
      const batch=await tx.stockBatch.create({data:{companyId,requestKey:input.requestKey,fingerprint,kind:"TRANSFER",status:"POSTED",label:input.reason,actorId:actor.id,postedAt:new Date(),decidedBy:actor.id,sourceWarehouseId:input.sourceWarehouseId,destinationWarehouseId:input.destinationWarehouseId,sourceLabel:name(input.sourceWarehouseId),destinationLabel:name(input.destinationWarehouseId)}});
      await tx.product.update({where:{id:product.id},data:{stockRevision:{increment:1}}});
      await tx.inventoryMovement.createMany({data:[{warehouseId:input.sourceWarehouseId,warehouseLabel:name(input.sourceWarehouseId),quantity:-input.quantity,kind:"TRANSFER_OUT"},{warehouseId:input.destinationWarehouseId,warehouseLabel:name(input.destinationWarehouseId),quantity:input.quantity,kind:"TRANSFER_IN"}].map(line=>({...line,companyId,productId:product.id,reason:input.reason,actorId:actor.id,occurredAt,unitCost:product.cost,batchId:batch.id,sourceId:batch.id}))});
      await log("Stock transféré",batch.id,{productId:product.id,quantity:input.quantity,from:name(input.sourceWarehouseId),to:name(input.destinationWarehouseId),reason:input.reason});return batch;
    }
    if(input.action==="stock.count.create"){
      if(new Set(input.productIds).size!==input.productIds.length)throw new AppError("Une référence ne peut être comptée deux fois.");
      const products=await tx.product.findMany({where:{companyId,id:{in:input.productIds},trackStock:true,archived:false}});
      if(products.length!==input.productIds.length)throw new AppError("Choisissez uniquement des références stockées actives de cette entreprise.");
      const batch=await tx.stockBatch.create({data:{companyId,requestKey:input.requestKey,fingerprint,kind:"COUNT",label:input.label,actorId:actor.id,lines:{create:products.map(p=>({productId:p.id,name:p.name,sku:p.sku,expected:p.stock,stockRevision:p.stockRevision}))}}});
      await log("Inventaire préparé",batch.id,{references:products.length});return batch;
    }
    if(input.action==="stock.reverse"){
      const original=await tx.inventoryMovement.findFirst({where:{companyId,id:input.movementId},include:{reversedBy:true}});
      if(!original||!["INITIAL","IN","OUT","LOSS","CONSUMPTION","CORRECTION"].includes(original.kind||""))throw new AppError("Seul un mouvement manuel typé peut être compensé ici. Utilisez le flux d’origine pour une vente, un achat ou un inventaire.");
      if(original.reversedBy.length)return {id:original.reversedBy[0].batchId};
      const batch=await tx.stockBatch.create({data:{companyId,requestKey:input.requestKey,fingerprint,kind:"REVERSAL",status:"POSTED",label:input.reason,actorId:actor.id,postedAt:new Date(),decidedBy:actor.id}});
      await changeStock(tx,{companyId,productId:original.productId,quantity:-original.quantity,kind:"REVERSAL",reason:input.reason,actorId:actor.id,batchId:batch.id,reversalOfId:original.id,allowArchived:true,unitCost:original.unitCost??undefined,warehouseId:original.warehouseId??undefined});
      await log("Mouvement manuel compensé",batch.id,{movementId:original.id,quantity:-original.quantity,reason:input.reason});return batch;
    }
    if(input.action==="stock.move"){
      if(new Date(input.occurredAt)>new Date())throw new AppError("Un mouvement futur ne peut pas être validé.");
      if(input.kind!=="CORRECTION"&&input.quantity<0)throw new AppError("Saisissez une quantité positive ; le type détermine le sens du mouvement.");
      if(input.kind==="INITIAL"){
        const product=await tx.product.findFirst({where:{id:input.productId,companyId}});
        if(!product||product.stock!==0||await tx.inventoryMovement.count({where:{companyId,productId:input.productId}}))throw new AppError("Le stock initial exige une référence vide sans mouvements. Utilisez une entrée ou une correction.");
      }
      const quantity=["OUT","LOSS","CONSUMPTION"].includes(input.kind)?-input.quantity:input.quantity;
      const batch=await tx.stockBatch.create({data:{companyId,requestKey:input.requestKey,fingerprint,kind:"MANUAL",status:"POSTED",label:input.reason,actorId:actor.id,postedAt:new Date(),decidedBy:actor.id}});
      await changeStock(tx,{companyId,productId:input.productId,quantity,kind:input.kind,reason:input.reason,occurredAt:new Date(input.occurredAt),actorId:actor.id,batchId:batch.id,warehouseId:input.warehouseId});
      await log("Mouvement de stock manuel validé",batch.id,{productId:input.productId,kind:input.kind,quantity,reason:input.reason});return batch;
    }
  }
  if(!("batchId" in input))throw new AppError("Opération de stock invalide.");
  const batch=await tx.stockBatch.findFirst({where:{companyId,id:input.batchId,kind:"COUNT"},include:{lines:true}});
  if(!batch)throw new AppError("Inventaire introuvable.",404);
  if(input.action==="stock.count.post"&&batch.status==="POSTED")return batch;
  if(input.action==="stock.count.cancel"&&batch.status==="CANCELLED")return batch;
  if(batch.status!=="DRAFT")throw new AppError("Cet inventaire est déjà traité.");
  if(input.action==="stock.count.cancel"){const result=await tx.stockBatch.update({where:{id:batch.id},data:{status:"CANCELLED",reason:input.reason,decidedBy:actor.id}});await log("Inventaire retiré",batch.id,{reason:input.reason});return result;}
  if(input.revision!==batch.revision)throw new AppError("Cet inventaire a changé. Actualisez la page.",409);
  if(input.action==="stock.count.update"){
    if(input.lines.length!==batch.lines.length||new Set(input.lines.map(l=>l.productId)).size!==input.lines.length||input.lines.some(l=>!batch.lines.some(b=>b.productId===l.productId)))throw new AppError("Le comptage doit contenir exactement le périmètre de cet inventaire.");
    for(const line of input.lines){const before=batch.lines.find(l=>l.productId===line.productId)!;if(line.counted!==before.expected&&line.reason.length<3)throw new AppError(`Expliquez l’écart pour ${before.name}.`);await tx.stockCountLine.update({where:{id:before.id},data:{counted:line.counted,reason:line.reason}});}
  }else if(input.action==="stock.count.refresh"){
    for(const line of batch.lines){const p=await tx.product.findFirst({where:{companyId,id:line.productId,archived:false,trackStock:true}});if(!p)throw new AppError("Une référence n’est plus active.");await tx.stockCountLine.update({where:{id:line.id},data:{expected:p.stock,stockRevision:p.stockRevision,counted:null,reason:""}});}
  }else{
    for(const line of batch.lines){
      if(line.counted===null)throw new AppError("Complétez toutes les quantités comptées.");
      const p=await tx.product.findFirst({where:{companyId,id:line.productId,trackStock:true,archived:false}});
      if(!p||p.stockRevision!==line.stockRevision||p.stock!==line.expected)throw new AppError(`Stock modifié pour ${line.name}. Réactualisez le périmètre et recomptez avant validation.`,409);
      const difference=line.counted-line.expected;
      if(difference){if(line.reason.length<3)throw new AppError("Un écart nécessite un motif.");await changeStock(tx,{companyId,productId:line.productId,quantity:difference,kind:"COUNT",reason:`${batch.label} : ${line.reason}`.slice(0,500),actorId:actor.id,batchId:batch.id});}
    }
    const result=await tx.stockBatch.update({where:{id:batch.id},data:{status:"POSTED",postedAt:new Date(),decidedBy:actor.id,revision:{increment:1}}});await log("Inventaire validé",batch.id,{references:batch.lines.length,ecarts:batch.lines.filter(l=>l.counted!==l.expected).length});return result;
  }
  const result=await tx.stockBatch.update({where:{id:batch.id},data:{revision:{increment:1}}});await log(input.action==="stock.count.refresh"?"Inventaire à recompter après actualisation":"Comptage enregistré",batch.id);return result;
}
