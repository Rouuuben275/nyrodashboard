import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readSales,exportSales} from "../src/domains/sales/queries";
import {saleAmounts,discountBasisPoints} from "../src/domains/sales/calculation";
test("Sale amounts use integer cents, one global rounding and exact percentage input",()=>{
 assert.deepEqual(saleAmounts(303,1000),{subtotal:303,discount:30,total:273});assert.equal(saleAmounts(101,5000).total,50);assert.equal(saleAmounts(101,10000).total,0);assert.equal(discountBasisPoints("12,35"),1235);assert.equal(discountBasisPoints("100.00"),10000);
 for(const v of ["-1","100.01","1.001","NaN","1e2",""])assert.throws(()=>discountBasisPoints(v));
});
test("PostgreSQL: dedicated cash reuses sales and protects discounts, retries, stock and ledger",async t=>{
 const users:string[]=[],companies:string[]=[],tag=`cash-${randomUUID()}`;
 try{
  const person=async(name:string)=>{const u=await db.user.create({data:{name,email:`${tag}-${name}@example.test`}});users.push(u.id);return u;};
  const owner=await person("owner"),cashier=await person("cashier"),other=await person("other");
  const company=await execute(owner,undefined,{action:"company.create",name:tag,sector:"Garage"}) as {id:string},foreign=await execute(other,undefined,{action:"company.create",name:`${tag}-other`,sector:"Services"}) as {id:string};companies.push(company.id,foreign.id);
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Caisse sans historique collectif",permissions:["sales.create"]}});
  const member=await db.companyMember.create({data:{companyId:company.id,userId:cashier.id,roleId:role.id,characterName:"Vendeur de recette"}});
  const product=await execute(owner,company.id,{action:"product.create",name:"Pneu atelier",sku:"PNEU",category:"Atelier",price:101,cost:20,stock:8,trackStock:true,threshold:1}) as {id:string};
  const warehouse=await db.stockWarehouse.create({data:{companyId:company.id,name:"Réserve",code:"RESERVE"}});await db.warehouseStock.create({data:{companyId:company.id,productId:product.id,warehouseId:warehouse.id,quantity:4}});
  const act=(extra:Record<string,unknown>,actor=owner)=>execute(actor,company.id,extra) as Promise<{id:string;total:number}>;
  const create=(extra:Record<string,unknown>={},actor=owner)=>act({action:"sale.create",customer:"Client atelier",payment:"Carte RP",requestKey:randomUUID(),channel:"CASH",items:[{productId:product.id,quantity:1}],...extra},actor);
  const read=(extra:Record<string,unknown>={},actor=owner)=>readSales(actor.id,{companyId:company.id,context:"cash",...extra});let saleId="";
  await t.test("catalog returns real general stock and prices, never costs or foreign products",async()=>{
   const catalog=await read({view:"catalog"},cashier);assert.equal(catalog.products[0].generalStock,4);assert.equal(catalog.products[0].price,101);assert.ok(!("cost" in catalog.products[0]));assert.equal(catalog.discount,false);
   assert.equal((await read({view:"cart",productIds:product.id},cashier)).products[0].id,product.id);
   await assert.rejects(read({},other),/inaccessible/);await assert.rejects(create({discountBps:1000},cashier),/remise/);
  });
  await t.test("the same concurrent request creates one discounted sale, stock move and journal entry",async()=>{
   const key=randomUUID(),payload={discountBps:1000,expectedTotal:182,requestKey:key,items:[{productId:product.id,quantity:2}]};const [a,b]=await Promise.all([create(payload),create(payload)]);saleId=a.id;assert.equal(a.id,b.id);assert.equal(a.total,182);
   assert.equal(await db.financialEntry.count({where:{companyId:company.id,sourceId:saleId,kind:"SALE"}}),1);assert.equal(await db.inventoryMovement.count({where:{companyId:company.id,sourceId:saleId,kind:"SALE"}}),1);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,6);
   await assert.rejects(create({...payload,customer:"Autre client"}),/Clé de vente/);await assert.rejects(create({...payload,discountBps:0}),/Clé de vente/);
   assert.equal((await read({saleId})).selected?.items[0].unitPrice,101);
  });
  await t.test("stale prices, overdrawn general stock and foreign products leave no partial effects",async()=>{
   const before=await db.sale.count({where:{companyId:company.id}});await assert.rejects(create({expectedTotal:100}),/prix ont changé/);await assert.rejects(create({items:[{productId:product.id,quantity:3}]}),/général/);
   const foreignProduct=await execute(other,foreign.id,{action:"product.create",name:"Étranger",sku:"FOREIGN",category:"Autre",price:99,cost:0,stock:1,threshold:0,trackStock:true}) as {id:string};
   await assert.rejects(create({items:[{productId:foreignProduct.id,quantity:1}]}),/indisponible/);assert.equal(await db.sale.count({where:{companyId:company.id}}),before);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,6);
  });
  await t.test("cashiers without collective read can only open and export their own tickets",async()=>{
   const own=await create({},cashier);assert.equal((await read({},cashier)).total,1);assert.equal((await read({saleId:own.id},cashier)).selected?.sellerName,"Vendeur de recette");await assert.rejects(read({saleId},cashier),/inaccessible/);
   assert.ok((await exportSales(cashier.id,{companyId:company.id,mine:"false"})).every(s=>s.sellerId===cashier.id));await assert.rejects(act({action:"sale.cancel",saleId:own.id,reason:"Sans permission"},cashier),/Permission insuffisante/);
  });
  await t.test("historical idempotency keys are checked without backfilling stored sales",async()=>{
   const key=randomUUID(),before=(await db.product.findUniqueOrThrow({where:{id:product.id}})).stock;
   const old=await db.sale.create({data:{companyId:company.id,number:"LEGACY-CASH-TEST",requestKey:key,customer:"Client historique",sellerId:owner.id,sellerName:owner.name,payment:"Carte RP",total:101}});await db.saleItem.create({data:{companyId:company.id,saleId:old.id,productId:product.id,name:"Pneu historique",quantity:1,unitPrice:101}});
   const retry=await create({requestKey:key,customer:"Client historique",channel:"SALES"});assert.equal(retry.id,old.id);assert.equal((await db.sale.findUniqueOrThrow({where:{id:old.id}})).requestHash,null);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,before);
   await assert.rejects(create({requestKey:key,customer:"Autre client",channel:"SALES"}),/Clé de vente/);
  });
  await t.test("full refund reverses the discounted amount once, on the original account",async()=>{
   const original=await db.financialEntry.findFirstOrThrow({where:{companyId:company.id,kind:"SALE",sourceId:saleId}});await act({action:"sale.cancel",saleId,reason:"Retour RP accepté"});
   const refund=await db.financialEntry.findFirstOrThrow({where:{companyId:company.id,kind:"REFUND",sourceId:saleId}});assert.equal(refund.amount,-182);assert.equal(refund.accountId,original.accountId);assert.equal((await read({saleId})).selected?.cancelReason,"Retour RP accepté");
   await assert.rejects(act({action:"sale.cancel",saleId,reason:"Deuxième remboursement"}),/déjà annulée/);assert.equal(await db.financialEntry.count({where:{companyId:company.id,kind:"REFUND",sourceId:saleId}}),1);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,7);
  });
  await t.test("history pagination and Paris date filters cover more than the workspace's loaded rows",async()=>{
   await db.sale.createMany({data:Array.from({length:528},(_,i)=>({companyId:company.id,number:`HISTORY-${i}`,requestKey:randomUUID(),customer:"Historique paginé",sellerId:owner.id,sellerName:"Direction",payment:"Virement RP",total:100,createdAt:new Date("2026-02-01T00:00:00Z")}))});
   const history=await read({q:"Historique paginé",page:22,from:"2026-02-01",to:"2026-02-01"});assert.equal(history.total,528);assert.equal(history.rows.length,3);assert.equal((await exportSales(owner.id,{companyId:company.id,q:"Historique paginé"})).length,528);
   assert.equal((await read({q:"Historique paginé",from:"2026-01-31",to:"2026-01-31"})).total,0);
  });
  await t.test("module switches, dependencies and revoked memberships protect reads and checkout",async()=>{
   await act({action:"module.toggle",key:"cash",enabled:false});await assert.rejects(read(),/Caisse désactivé/);await assert.rejects(create(),/Caisse désactivé/);assert.ok((await readSales(owner.id,{companyId:company.id})).total>0);
   await act({action:"module.toggle",key:"cash",enabled:true});await assert.rejects(act({action:"module.toggle",key:"sales",enabled:false}),/dépendent/);
   await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(read({},cashier),/inaccessible/);await assert.rejects(create({},cashier),/inaccessible/);
  });
 }finally{await db.inventoryMovement.deleteMany({where:{companyId:{in:companies}}});await db.warehouseStock.deleteMany({where:{companyId:{in:companies}}});await db.stockWarehouse.deleteMany({where:{companyId:{in:companies}}});await db.sale.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();}
});
