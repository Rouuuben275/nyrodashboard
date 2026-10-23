import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {stockAccess} from "./service";
import {AppError} from "@/domains/core/errors";
import {z} from "zod";

export const warehouseQuery=z.object({companyId:z.string().min(1).max(100),warehouseId:z.string().min(1).max(100).optional(),q:z.string().trim().max(160).default(""),page:z.coerce.number().int().min(1).max(100000).default(1)});
export async function readWarehouses(userId:string,q:z.infer<typeof warehouseQuery>){
  const viewer=await membership(db,q.companyId,userId);stockAccess(viewer);
  return db.$transaction(async tx=>{
    const warehouses=await tx.stockWarehouse.findMany({where:{companyId:q.companyId},orderBy:[{archived:"asc"},{code:"asc"}]});
    if(q.warehouseId&&!warehouses.some(w=>w.id===q.warehouseId))throw new AppError("Entrepôt introuvable.",404);
    const balances=await tx.warehouseStock.groupBy({by:["warehouseId"],where:{companyId:q.companyId},_sum:{quantity:true}});
    const search=`%${q.q.replace(/[\\%_]/g,"\\$&")}%`;
    const where=Prisma.sql`p."companyId"=${q.companyId} AND p."trackStock"=true AND p.archived=false ${q.q?Prisma.sql`AND (p.name ILIKE ${search} OR p.sku ILIKE ${search})`:Prisma.empty}`;
    const quantity=q.warehouseId?Prisma.sql`COALESCE((SELECT s.quantity FROM "WarehouseStock" s WHERE s."companyId"=p."companyId" AND s."productId"=p.id AND s."warehouseId"=${q.warehouseId}),0)`:
      Prisma.sql`p.stock-COALESCE((SELECT SUM(s.quantity) FROM "WarehouseStock" s WHERE s."companyId"=p."companyId" AND s."productId"=p.id),0)`;
    const products=await tx.$queryRaw<{id:string;name:string;sku:string;stock:number;quantity:bigint;cost:number}[]>(Prisma.sql`SELECT p.id,p.name,p.sku,p.stock,p.cost,(${quantity})::bigint AS quantity FROM "Product" p WHERE ${where} ORDER BY p.name,p.id LIMIT 25 OFFSET ${(q.page-1)*25}`);
    const total=await tx.$queryRaw<{count:bigint;units:bigint}[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count,COALESCE(SUM(${quantity}),0)::bigint AS units FROM "Product" p WHERE ${where}`);
    const transfers=await tx.stockBatch.findMany({where:{companyId:q.companyId,kind:"TRANSFER",...(q.warehouseId?{OR:[{sourceWarehouseId:q.warehouseId},{destinationWarehouseId:q.warehouseId}]}:{})},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25,include:{movements:{where:{kind:"TRANSFER_IN"},select:{quantity:true,occurredAt:true,product:{select:{name:true,sku:true}}}}}});
    const transferCount=await tx.stockBatch.count({where:{companyId:q.companyId,kind:"TRANSFER",...(q.warehouseId?{OR:[{sourceWarehouseId:q.warehouseId},{destinationWarehouseId:q.warehouseId}]}:{})}});
    return {warehouses:warehouses.map(w=>({...w,quantity:balances.find(b=>b.warehouseId===w.id)?._sum.quantity??0})),products:products.map(p=>({...p,quantity:Number(p.quantity)})),total:Number(total[0].count),units:Number(total[0].units),transfers,transferCount,manage:viewer.role.permissions.includes("inventory.manage")};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
export type WarehouseData=Awaited<ReturnType<typeof readWarehouses>>;
