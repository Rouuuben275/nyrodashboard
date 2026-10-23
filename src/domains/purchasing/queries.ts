import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";

export async function readReceipts(userId:string,companyId:string,orderId:string,page=1) {
  const viewer=await membership(db,companyId,userId);
  if(!viewer.role.permissions.includes("orders.read") || !viewer.company.modules.some(m=>m.key==="orders"&&m.enabled)) throw new AppError("Historique des achats inaccessible.",403);
  return db.$transaction(async tx=>{
    const order=await tx.purchaseOrder.findFirst({where:{id:orderId,companyId},select:{status:true,receivedAt:true,receivedBy:true}});
    if(!order)throw new AppError("Commande introuvable.",404);
    const count=await tx.purchaseReceipt.count({where:{companyId,orderId}});
    const receipts=await tx.purchaseReceipt.findMany({where:{companyId,orderId},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(page-1)*25,include:{lines:{orderBy:{id:"asc"}}}});
    const authors=await tx.user.findMany({where:{id:{in:[...new Set(receipts.map(r=>r.actorId))]}},select:{id:true,name:true}});
    return {count,page,pages:Math.max(1,Math.ceil(count/25)),legacy:order.status==="RECEIVED"&&count===0?order.receivedAt:null,receipts:receipts.map(r=>({...r,actorName:authors.find(u=>u.id===r.actorId)?.name??"Utilisateur supprimé"}))};
  },{isolationLevel:"RepeatableRead"});
}
