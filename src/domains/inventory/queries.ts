import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {stockAccess} from "./service";
import type {StockQuery} from "./validation";
export function movementWhere(q:StockQuery){
  const conditions=[Prisma.sql`m."companyId"=${q.companyId}`];
  if(q.productId)conditions.push(Prisma.sql`m."productId"=${q.productId}`);
  if(q.kind)conditions.push(Prisma.sql`m.kind=${q.kind}`);
  if(q.q){const search=`%${q.q.replace(/[\\%_]/g,"\\$&")}%`;conditions.push(Prisma.sql`(m.reason ILIKE ${search} OR p.name ILIKE ${search} OR p.sku ILIKE ${search})`);}
  const day=Prisma.sql`((COALESCE(m."occurredAt",m."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date`;
  if(q.from)conditions.push(Prisma.sql`${day}>=${q.from}::date`);if(q.to)conditions.push(Prisma.sql`${day}<=${q.to}::date`);
  return Prisma.sql`WHERE ${Prisma.join(conditions," AND ")}`;
}
export type StockMovement={id:string;productId:string;name:string;sku:string;quantity:number;reason:string;kind:string|null;date:Date;createdAt:Date;unitCost:number|null;sourceId:string|null;actorName:string;warehouseLabel:string|null;warehouseId:string|null;reversed:boolean};
export function stockMovements(tx:Prisma.TransactionClient,q:StockQuery,take=25,offset=(q.page-1)*25){return tx.$queryRaw<StockMovement[]>(Prisma.sql`SELECT m.id,m."productId",p.name,p.sku,m.quantity,m.reason,m.kind,COALESCE(m."occurredAt",m."createdAt") AS date,m."createdAt",m."unitCost",m."sourceId",m."warehouseLabel",m."warehouseId",COALESCE(u.name,'Utilisateur supprimé') AS "actorName",EXISTS(SELECT 1 FROM "InventoryMovement" r WHERE r."companyId"=m."companyId" AND r."reversalOfId"=m.id) AS reversed FROM "InventoryMovement" m JOIN "Product" p ON p.id=m."productId" AND p."companyId"=m."companyId" LEFT JOIN "User" u ON u.id=m."actorId" ${movementWhere(q)} ORDER BY COALESCE(m."occurredAt",m."createdAt") DESC,m.id DESC LIMIT ${take} OFFSET ${offset}`);}
export async function readStock(userId:string,q:StockQuery){
  const viewer=await membership(db,q.companyId,userId);stockAccess(viewer);
  return db.$transaction(async tx=>{
    if(q.productId&&!await tx.product.findFirst({where:{id:q.productId,companyId:q.companyId,trackStock:true}}))throw new AppError("Référence introuvable.",404);
    const search=`%${q.q.replace(/[\\%_]/g,"\\$&")}%`;
    const where=Prisma.sql`WHERE "companyId"=${q.companyId} AND "trackStock"=true AND archived=false ${q.q?Prisma.sql`AND (name ILIKE ${search} OR sku ILIKE ${search} OR category ILIKE ${search})`:Prisma.empty} ${q.low?Prisma.sql`AND stock<=threshold`:Prisma.empty}`;
    const [products,summary,movements,movementCount,batches,batchCount,selected]=[
      await tx.$queryRaw<{id:string;name:string;sku:string;category:string;stock:number;generalStock:number;threshold:number;cost:number}[]>(Prisma.sql`SELECT id,name,sku,category,stock,threshold,cost,(stock-COALESCE((SELECT SUM(s.quantity) FROM "WarehouseStock" s WHERE s."companyId"="Product"."companyId" AND s."productId"="Product".id),0))::int AS "generalStock" FROM "Product" ${where} ORDER BY name,id LIMIT 25 OFFSET ${(q.page-1)*25}`),
      await tx.$queryRaw<{count:bigint;units:bigint;value:bigint;low:bigint}[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count,COALESCE(SUM(stock),0)::bigint AS units,COALESCE(SUM(stock::bigint*cost),0)::bigint AS value,COUNT(*) FILTER (WHERE stock<=threshold)::bigint AS low FROM "Product" ${where}`),
      await stockMovements(tx,q),
      await tx.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "InventoryMovement" m JOIN "Product" p ON p.id=m."productId" AND p."companyId"=m."companyId" ${movementWhere(q)}`),
      await tx.stockBatch.findMany({where:{companyId:q.companyId,kind:"COUNT"},select:{id:true,label:true,status:true,createdAt:true,postedAt:true,revision:true,reason:true,_count:{select:{lines:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25}),
      await tx.stockBatch.count({where:{companyId:q.companyId,kind:"COUNT"}}),
      q.batchId?await tx.stockBatch.findFirst({where:{companyId:q.companyId,id:q.batchId,kind:"COUNT"},include:{lines:{include:{product:{select:{stock:true,stockRevision:true,archived:true}}},orderBy:{name:"asc"}}}}):null,    ] as const;
    if(q.batchId&&!selected)throw new AppError("Inventaire introuvable.",404);
    const warehouses=await tx.stockWarehouse.findMany({where:{companyId:q.companyId,archived:false},orderBy:{code:"asc"},select:{id:true,code:true,name:true}});
    return {warehouses,products,summary:{count:Number(summary[0].count),units:Number(summary[0].units),value:Number(summary[0].value),low:Number(summary[0].low)},movements,movementCount:Number(movementCount[0].count),batches,batchCount,selected,manage:viewer.role.permissions.includes("inventory.manage")};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000});
}
export type StockData=Awaited<ReturnType<typeof readStock>>;
