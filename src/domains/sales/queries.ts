import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {parisDay} from "@/domains/planning/recurrence";
import {salesQuery} from "./validation";
import {salesAccess} from "./service";
import {saleAmounts} from "./calculation";
const saleFields={id:true,number:true,customer:true,sellerName:true,sellerId:true,payment:true,total:true,discountBps:true,channel:true,status:true,createdAt:true,cancelledAt:true,cancelReason:true} satisfies Prisma.SaleSelect;
type Query=ReturnType<typeof salesQuery.parse>;
function saleWhere(userId:string,q:Query,all:boolean):Prisma.SaleWhereInput{const scope:Prisma.SaleWhereInput={companyId:q.companyId,...(!all||q.mine==="true"?{sellerId:userId}:{})};return {...scope,...(q.status?{status:q.status}:{}),...(q.payment?{payment:q.payment}:{}),...(q.q?{OR:[{number:{contains:q.q,mode:"insensitive"}},{customer:{contains:q.q,mode:"insensitive"}},{sellerName:{contains:q.q,mode:"insensitive"}}]}:{}),...(q.from||q.to?{createdAt:{...(q.from?{gte:parisDay(q.from)}:{}),...(q.to?{lt:parisDay(q.to,1)}:{})}}:{})};}
export async function readSales(userId:string,raw:unknown){const q=salesQuery.parse(raw);return db.$transaction(async tx=>{
 const member=await membership(tx,q.companyId,userId);salesAccess(member,q.context==="cash");
 const create=member.role.permissions.includes("sales.create"),all=member.role.permissions.includes("sales.read");
 if(q.view!=="history"&&!create)throw new AppError("Permission de vendre requise.",403);
 const scope:Prisma.SaleWhereInput={companyId:q.companyId,...(!all||q.mine==="true"?{sellerId:userId}:{})};
 const where=saleWhere(userId,q,all);
 const productWhere:Prisma.ProductWhereInput={companyId:q.companyId,archived:false,...(q.view==="cart"?{id:{in:q.productIds}}:{...(q.category?{category:q.category}:{}),...(q.q?{OR:[{name:{contains:q.q,mode:"insensitive"}},{sku:{contains:q.q,mode:"insensitive"}},{category:{contains:q.q,mode:"insensitive"}}]}:{})})};
 const [products,productCount,categories,rows,total,selected]=await Promise.all([
   q.view!=="history"?tx.product.findMany({where:productWhere,select:{id:true,name:true,sku:true,category:true,price:true,stock:true,stockRevision:true,trackStock:true},orderBy:[{name:"asc"},{id:"asc"}],take:q.view==="cart"?100:24,skip:q.view==="cart"?0:(q.page-1)*24}):[],
   q.view!=="history"?tx.product.count({where:productWhere}):0,
   q.view==="catalog"?tx.product.groupBy({by:["category"],where:{companyId:q.companyId,archived:false},orderBy:{category:"asc"},take:201}):[],
   q.view==="history"?tx.sale.findMany({where,select:saleFields,orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25}):[],q.view==="history"?tx.sale.count({where}):0,
   q.saleId?tx.sale.findFirst({where:{...scope,id:q.saleId},select:{...saleFields,items:{select:{id:true,name:true,productId:true,quantity:true,unitPrice:true},orderBy:{id:"asc"},take:101}}}):null,
 ]);
 if(q.saleId&&!selected)throw new AppError("Vente introuvable ou inaccessible.",404);if(selected&&selected.items.length>100)throw new AppError("Ticket historique trop volumineux.",413);
 const allocations=products.length?await tx.warehouseStock.groupBy({by:["productId"],where:{companyId:q.companyId,productId:{in:products.map(p=>p.id)}},_sum:{quantity:true}}):[];
 const allocated=new Map(allocations.map(a=>[a.productId,a._sum.quantity??0]));
 return {products:products.map(p=>({...p,generalStock:p.stock-(allocated.get(p.id)??0)})),productCount,categories:categories.slice(0,200).map(c=>c.category),categoriesTruncated:categories.length>200,rows,total,selected,onlyMine:!all,create,discount:member.role.permissions.includes("sales.discount"),cancel:member.role.permissions.includes("sales.cancel"),company:{id:member.companyId,name:member.company.name},amounts:selected?saleAmounts(selected.items.reduce((s,i)=>s+i.quantity*i.unitPrice,0),selected.discountBps):null};
 },{isolationLevel:"RepeatableRead",timeout:20000});}
export type SalesData=Awaited<ReturnType<typeof readSales>>;

export async function exportSales(userId:string,raw:unknown){const q=salesQuery.parse(raw);return db.$transaction(async tx=>{
 const member=await membership(tx,q.companyId,userId);salesAccess(member,q.context==="cash");
 const rows=await tx.sale.findMany({where:saleWhere(userId,q,member.role.permissions.includes("sales.read")),select:saleFields,orderBy:[{createdAt:"desc"},{id:"desc"}],take:5001});
 if(rows.length>5000)throw new AppError("Plus de 5 000 ventes : affinez les filtres avant l’export.",413);return rows;
},{isolationLevel:"RepeatableRead",timeout:20000});}
