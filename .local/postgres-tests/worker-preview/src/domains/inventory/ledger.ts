import {Prisma} from "@prisma/client";
import {AppError} from "@/domains/core/errors";
// All callers run under the existing tenant advisory lock. The conditional
// update also protects the 0..1,000,000 invariant if another writer is added.
export async function changeStock(tx:Prisma.TransactionClient,input:{companyId:string;productId:string;quantity:number;kind:string;reason:string;actorId:string;sourceId?:string;occurredAt?:Date;batchId?:string;reversalOfId?:string;allowArchived?:boolean;unitCost?:number;warehouseId?:string}){
  const product=await tx.product.findFirst({where:{companyId:input.companyId,id:input.productId,trackStock:true,...(!input.allowArchived?{archived:false}:{})}});
  if(!product)throw new AppError("Référence stockée active introuvable.");
  let warehouseLabel="Stock général";
  if(input.warehouseId){
    const warehouse=await tx.stockWarehouse.findFirst({where:{companyId:input.companyId,id:input.warehouseId,archived:false}});
    if(!warehouse)throw new AppError("Entrepôt actif introuvable.");
    warehouseLabel=`${warehouse.code} · ${warehouse.name}`;
    await changeWarehouse(tx,input.companyId,warehouse.id,product.id,input.quantity);
  } else if(input.quantity<0){
    const allocated=await tx.warehouseStock.aggregate({where:{companyId:input.companyId,productId:product.id},_sum:{quantity:true}});
    if(product.stock-(allocated._sum.quantity??0)<-input.quantity)throw new AppError("Stock général insuffisant. Transférez d’abord les unités de l’entrepôt vers le stock général.");
  }
  const result=await tx.product.updateMany({where:{companyId:input.companyId,id:product.id,stock:{gte:Math.max(0,-input.quantity),lte:Math.min(1000000,1000000-input.quantity)}},data:{stock:{increment:input.quantity},stockRevision:{increment:1}}});
  if(result.count!==1)throw new AppError(`Stock insuffisant ou hors limites pour ${product.name} (0 à 1 000 000).`);
  const {allowArchived:_,...data}=input;
  return tx.inventoryMovement.create({data:{...data,warehouseLabel,occurredAt:input.occurredAt||new Date(),unitCost:input.unitCost??product.cost}});
}

export async function changeWarehouse(tx:Prisma.TransactionClient,companyId:string,warehouseId:string,productId:string,quantity:number){
  if(quantity<0){
    const result=await tx.warehouseStock.updateMany({where:{companyId,warehouseId,productId,quantity:{gte:-quantity}},data:{quantity:{increment:quantity}}});
    if(result.count!==1)throw new AppError("Stock insuffisant dans l’entrepôt source.");
  }else{
    await tx.warehouseStock.upsert({where:{companyId_warehouseId_productId:{companyId,warehouseId,productId}},create:{companyId,warehouseId,productId,quantity},update:{quantity:{increment:quantity}}});
  }
}
