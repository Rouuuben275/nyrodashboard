import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readStock} from "../src/domains/inventory/queries";
import {stockQuery} from "../src/domains/inventory/validation";
test("autonomous stock movements and counts preserve history under concurrent requests",async t=>{
  const prefix=`stock-${randomUUID()}`,users:string[]=[],companies:string[]=[];
  try{
    const owner=await db.user.create({data:{name:"Direction stocks",email:`${prefix}@example.test`}});users.push(owner.id);
    const reader=await db.user.create({data:{name:"Lecture stocks",email:`${prefix}-reader@example.test`}});users.push(reader.id);
    const outsider=await db.user.create({data:{name:"Autre direction",email:`${prefix}-other@example.test`}});users.push(outsider.id);
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Test"}) as {id:string};companies.push(company.id);
    const other=await execute(outsider,undefined,{action:"company.create",name:`${prefix}-other`,sector:"Test"}) as {id:string};companies.push(other.id);
    const role=await db.companyRole.create({data:{companyId:company.id,name:"Lecteur",permissions:["inventory.read"]}});await db.companyMember.create({data:{companyId:company.id,userId:reader.id,roleId:role.id,characterName:"Lecteur RP"}});
    const act=(payload:Record<string,unknown>)=>execute(owner,company.id,payload) as Promise<{id:string;revision:number}>;
    const product=async(sku:string,stock:number,trackStock=true)=>act({action:"product.create",name:sku,sku,category:"Test",price:200,cost:125,stock,threshold:5,trackStock});
    const p=await product("A",10),p2=await product("B",4),service=await product("Prestation",0,false);
    const move=(id:string,kind:string,quantity:number)=>act({action:"stock.move",requestKey:randomUUID(),productId:id,kind,quantity,reason:"Mouvement RP contrôlé",occurredAt:new Date(Date.now()-1000).toISOString()});
    const read=(extra:Record<string,unknown>={})=>readStock(owner.id,stockQuery.parse({companyId:company.id,...extra}));
    const count=async(ids:string[])=>{const b=await act({action:"stock.count.create",requestKey:randomUUID(),label:"Inventaire de contrôle",productIds:ids});return db.stockBatch.findUniqueOrThrow({where:{id:b.id},include:{lines:true}});};
    await t.test("typed moves replay once, keep cost snapshots and never book an expense",async()=>{
      const payload={action:"stock.move",requestKey:randomUUID(),productId:p.id,kind:"IN",quantity:5,reason:"Entrée autonome",occurredAt:"2026-01-01T12:00:00Z"};
      const [a,b]=await Promise.all([act(payload),act(payload)]);assert.equal(a.id,b.id);assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).stock,15);assert.equal(await db.inventoryMovement.count({where:{batchId:a.id}}),1);
      await assert.rejects(act({...payload,quantity:6}),/autre opération/);
      const original=await db.inventoryMovement.findFirstOrThrow({where:{batchId:a.id}});assert.equal(original.unitCost,125);
      await act({action:"product.update",productId:p.id,name:"A",sku:"A",category:"Test",price:200,cost:150,threshold:5});assert.equal((await db.inventoryMovement.findUniqueOrThrow({where:{id:original.id}})).unitCost,125);
      assert.equal(await db.financialEntry.count({where:{companyId:company.id}}),0);
    });
    await t.test("manual compensations retain the original and cannot duplicate quantities",async()=>{
      const batch=await move(p.id,"LOSS",2);const original=await db.inventoryMovement.findFirstOrThrow({where:{batchId:batch.id}});
      assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).stock,13);
      const payload={action:"stock.reverse",requestKey:randomUUID(),movementId:original.id,reason:"Casse déclarée par erreur"};await Promise.all([act(payload),act({...payload,requestKey:randomUUID()})]);
      assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).stock,15);assert.equal(await db.inventoryMovement.count({where:{reversalOfId:original.id}}),1);assert.deepEqual(await db.inventoryMovement.findUnique({where:{id:original.id}}),original);
    });
    await t.test("stock bounds, initial entries, future dates and services are validated",async()=>{
      await assert.rejects(product("Prestation invalide",1,false),/stock initial nul/);
      await assert.rejects(move(p.id,"OUT",100),/insuffisant/);await assert.rejects(move(p.id,"IN",-1),/positive/);
      await assert.rejects(move(p.id,"INITIAL",5),/stock initial/);await assert.rejects(move(service.id,"IN",1),/stockée active/);
      await assert.rejects(act({action:"stock.move",requestKey:randomUUID(),productId:p.id,kind:"IN",quantity:1,reason:"Mouvement futur",occurredAt:"2099-01-01T00:00:00Z"}),/futur/);
      const empty=await product("Initial",0);await move(empty.id,"INITIAL",3);await assert.rejects(move(empty.id,"INITIAL",1),/stock initial/);
    });
    await t.test("sale cancellation cannot exceed the stock ceiling and rolls back the refund",async()=>{
      const ceiling=await product("Plafond",1000000);
      const sale=await act({action:"sale.create",customer:"Client du contrôle",payment:"Carte RP",requestKey:randomUUID(),items:[{productId:ceiling.id,quantity:1}]});
      await move(ceiling.id,"IN",1);
      await assert.rejects(act({action:"sale.cancel",saleId:sale.id,reason:"Retour au stock plein"}),/hors limites/);
      assert.equal((await db.sale.findUniqueOrThrow({where:{id:sale.id}})).status,"COMPLETED");assert.equal(await db.financialEntry.count({where:{companyId:company.id,kind:"REFUND",sourceId:sale.id}}),0);
      await move(ceiling.id,"OUT",1);await act({action:"sale.cancel",saleId:sale.id,reason:"Retour après place libérée"});assert.equal((await db.product.findUniqueOrThrow({where:{id:ceiling.id}})).stock,1000000);
    });
    await t.test("counts apply only explained differences, once, across all lines",async()=>{
      const batch=await count([p.id,p2.id]);
      await assert.rejects(act({action:"stock.count.post",batchId:batch.id,revision:0}),/quantités comptées/);
      const lines=batch.lines.map(l=>({productId:l.productId,counted:l.expected+(l.productId===p.id?-1:3),reason:"Écart physique constaté"}));
      await act({action:"stock.count.update",batchId:batch.id,revision:0,lines});
      await assert.rejects(act({action:"stock.count.update",batchId:batch.id,revision:0,lines}),/a changé/);
      await Promise.all([act({action:"stock.count.post",batchId:batch.id,revision:1}),act({action:"stock.count.post",batchId:batch.id,revision:1})]);
      assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).stock,14);assert.equal((await db.product.findUniqueOrThrow({where:{id:p2.id}})).stock,7);assert.equal(await db.inventoryMovement.count({where:{batchId:batch.id}}),2);
      await assert.rejects(act({action:"stock.count.update",batchId:batch.id,revision:2,lines}),/déjà traité/);
    });
    await t.test("a net-zero stock change still invalidates a count until it is refreshed and recounted",async()=>{
      const batch=await count([p.id]);await act({action:"stock.count.update",batchId:batch.id,revision:0,lines:[{productId:p.id,counted:12,reason:"Recomptage réel"}]});
      await move(p.id,"OUT",1);await move(p.id,"IN",1);
      await assert.rejects(act({action:"stock.count.post",batchId:batch.id,revision:1}),/Stock modifié/);assert.equal(await db.inventoryMovement.count({where:{batchId:batch.id}}),0);
      await act({action:"stock.count.refresh",batchId:batch.id,revision:1});assert.equal((await db.stockCountLine.findFirstOrThrow({where:{batchId:batch.id}})).counted,null);
      await act({action:"stock.count.update",batchId:batch.id,revision:2,lines:[{productId:p.id,counted:12,reason:"Second comptage physique"}]});await act({action:"stock.count.post",batchId:batch.id,revision:3});assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).stock,12);
    });
    await t.test("a stale line rolls back every earlier difference and movement",async()=>{
      const batch=await count([p.id,p2.id]);await act({action:"stock.count.update",batchId:batch.id,revision:0,lines:batch.lines.map(l=>({productId:l.productId,counted:l.expected+1,reason:"Écart à vérifier"}))});
      await move(batch.lines.at(-1)!.productId,"IN",1);
      const before=await db.product.findMany({where:{id:{in:[p.id,p2.id]}}});
      await assert.rejects(act({action:"stock.count.post",batchId:batch.id,revision:1}),/Stock modifié/);assert.deepEqual(await db.product.findMany({where:{id:{in:[p.id,p2.id]}}}),before);assert.equal(await db.inventoryMovement.count({where:{batchId:batch.id}}),0);
      await act({action:"stock.count.cancel",batchId:batch.id,reason:"Comptage obsolète retiré"});
    });
    await t.test("tenant, role and module guards apply to every read and count",async()=>{
      await assert.rejects(execute(reader,company.id,{action:"stock.count.create",requestKey:randomUUID(),label:"Accès refusé",productIds:[p.id]}),/insuffisant/);
      await assert.rejects(execute(outsider,other.id,{action:"stock.move",requestKey:randomUUID(),productId:p.id,kind:"IN",quantity:1,reason:"Référence étrangère",occurredAt:new Date().toISOString()}),/introuvable/);
      assert.equal((await readStock(reader.id,stockQuery.parse({companyId:company.id}))).manage,false);
      await assert.rejects(readStock(outsider.id,stockQuery.parse({companyId:company.id})),/inaccessible/);
      await db.companyModule.update({where:{companyId_key:{companyId:company.id,key:"inventory"}},data:{enabled:false}});await assert.rejects(read(),/désactivé/);await assert.rejects(move(p.id,"IN",1),/désactivé/);await db.companyModule.update({where:{companyId_key:{companyId:company.id,key:"inventory"}},data:{enabled:true}});
    });
    await t.test("pagination and valuation aggregate the full selection and handle SQL search safely",async()=>{
      const pager=await db.product.create({data:{companyId:company.id,name:"Pagination stock",sku:"PAGER",stock:60,cost:50,price:100,stockRevision:60}});
      await db.inventoryMovement.createMany({data:Array.from({length:60},(_,i)=>({companyId:company.id,productId:pager.id,quantity:1,kind:"IN",reason:`Ligne export ${i}`,actorId:owner.id,occurredAt:new Date("2026-01-02T12:00:00Z")}))});
      const first=await read({q:"Pagination stock"}),second=await read({q:"Pagination stock",page:2});assert.equal(first.movementCount,60);assert.equal(first.movements.length,25);assert.equal(new Set([...first.movements,...second.movements].map(m=>m.id)).size,50);assert.equal(first.summary.value,3000);assert.equal((await read({q:"' OR 1=1 --"})).summary.count,0);
    });
  }finally{
    await db.inventoryMovement.deleteMany({where:{companyId:{in:companies}}});await db.stockBatch.deleteMany({where:{companyId:{in:companies}}});await db.sale.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});await db.rateLimit.deleteMany({where:{OR:users.map(id=>({key:{startsWith:`app:${id}:`}}))}});
  }
});
