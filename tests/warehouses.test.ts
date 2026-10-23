import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readWarehouses,warehouseQuery} from "../src/domains/inventory/warehouses";
import {getWorkspace} from "../src/domains/core/queries";

test("PostgreSQL: warehouses preserve global stock and serialize location transfers",async t=>{
  const prefix=`warehouse-${randomUUID()}`,companies:string[]=[],users:string[]=[];
  try{
    const owner=await db.user.create({data:{name:"Direction entrepôts",email:`${prefix}@example.test`}});users.push(owner.id);
    const reader=await db.user.create({data:{name:"Lecture entrepôts",email:`${prefix}-reader@example.test`}});users.push(reader.id);
    const outsider=await db.user.create({data:{name:"Autre entrepôt",email:`${prefix}-other@example.test`}});users.push(outsider.id);
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Commerce"}) as {id:string};companies.push(company.id);
    const other=await execute(outsider,undefined,{action:"company.create",name:`${prefix}-other`,sector:"Commerce"}) as {id:string};companies.push(other.id);
    const role=await db.companyRole.create({data:{companyId:company.id,name:"Lecture",permissions:["inventory.read"]}});
    await db.companyMember.create({data:{companyId:company.id,userId:reader.id,roleId:role.id,characterName:"Lecteur"}});
    const act=(payload:Record<string,unknown>)=>execute(owner,company.id,payload) as Promise<{id:string}>;
    const product=await act({action:"product.create",name:"Pièce entrepôt",sku:"WARE",category:"Pièces",price:200,cost:125,stock:20,threshold:2,trackStock:true});
    const a=await act({action:"stock.warehouse.save",code:"A",name:"Réserve A"});const b=await act({action:"stock.warehouse.save",code:"B",name:"Réserve B"});
    const foreign=await execute(outsider,other.id,{action:"stock.warehouse.save",code:"X",name:"Autre réserve"}) as {id:string};
    const read=(warehouseId?:string,q="")=>readWarehouses(owner.id,warehouseQuery.parse({companyId:company.id,warehouseId,q}));
    const transfer=(from:string|null,to:string|null,quantity:number)=>({action:"stock.transfer",productId:product.id,sourceWarehouseId:from,destinationWarehouseId:to,quantity,reason:"Rangement physique RP",requestKey:randomUUID(),occurredAt:"2026-01-03T12:00:00Z"});
    await t.test("existing stock stays in general without a backfill or opening movement",async()=>{
      assert.equal((await read()).products[0].quantity,20);assert.equal((await read(a.id)).products[0].quantity,0);
      assert.equal(await db.warehouseStock.count({where:{companyId:company.id}}),0);assert.equal(await db.inventoryMovement.count({where:{companyId:company.id}}),1);
      await assert.rejects(act({action:"stock.warehouse.save",code:"a",name:"Doublon"}),/existe déjà/);
    });
    await t.test("concurrent replay creates one paired transfer and no financial entry",async()=>{
      const payload=transfer(null,a.id,8);const [first,second]=await Promise.all([act(payload),act(payload)]);assert.equal(first.id,second.id);
      assert.equal((await read()).products[0].quantity,12);assert.equal((await read(a.id)).products[0].quantity,8);
      const moves=await db.inventoryMovement.findMany({where:{batchId:first.id},orderBy:{quantity:"asc"}});assert.equal(moves.length,2);assert.equal(moves.reduce((s,m)=>s+m.quantity,0),0);assert.equal(moves[0].warehouseId,null);assert.equal(moves[1].warehouseId,a.id);assert.equal(moves[1].unitCost,125);
      assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,20);assert.equal(await db.financialEntry.count({where:{companyId:company.id}}),0);
      const workspace=await getWorkspace(owner.id,company.id);assert.equal(workspace.current?.products.find(p=>p.id===product.id)?.generalStock,12);
      await assert.rejects(act({...payload,quantity:9}),/clé/);
    });
    await t.test("warehouse transfers and returns preserve global totals and name snapshots",async()=>{
      await act(transfer(a.id,b.id,3));await act(transfer(b.id,null,1));
      assert.equal((await read(a.id)).products[0].quantity,5);assert.equal((await read(b.id)).products[0].quantity,2);assert.equal((await read()).products[0].quantity,13);
      await act({action:"stock.warehouse.save",warehouseId:a.id,code:"A",name:"Réserve renommée"});
      const history=await read(a.id);assert.equal(history.transferCount,2);assert.ok(history.transfers.some(t=>t.destinationLabel==="A · Réserve A"));
    });
    await t.test("overdrawn, foreign, identical, archived and future transfers leave no partial effects",async()=>{
      const count=await db.stockBatch.count({where:{companyId:company.id}});
      await assert.rejects(act(transfer(a.id,b.id,6)),/insuffisant/);await assert.rejects(act(transfer(null,a.id,14)),/insuffisant/);
      await assert.rejects(act(transfer(a.id,a.id,1)),/distincts/);await assert.rejects(act(transfer(null,foreign.id,1)),/introuvable/);
      await assert.rejects(act({...transfer(null,a.id,1),occurredAt:"2099-01-01T00:00:00Z"}),/Date/);
      await assert.rejects(act({action:"stock.warehouse.save",warehouseId:a.id,code:"A",name:"Réserve",archived:true}),/Videz/);
      await assert.rejects(act({action:"product.archive",productId:product.id,archived:true}),/entrepôts/);
      assert.equal(await db.stockBatch.count({where:{companyId:company.id}}),count);assert.equal((await read()).products[0].quantity,13);
    });
    await t.test("manual location movements and compensation preserve the allocation invariant",async()=>{
      const loss=await act({action:"stock.move",productId:product.id,warehouseId:a.id,kind:"LOSS",quantity:2,reason:"Casse dans la réserve",requestKey:randomUUID(),occurredAt:"2026-01-03T12:00:00Z"});
      assert.equal((await read(a.id)).products[0].quantity,3);assert.equal((await read()).products[0].quantity,13);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,18);
      const movement=await db.inventoryMovement.findFirstOrThrow({where:{batchId:loss.id}});
      await act({action:"stock.reverse",movementId:movement.id,requestKey:randomUUID(),reason:"Casse déclarée par erreur"});assert.equal((await read(a.id)).products[0].quantity,5);
      await assert.rejects(act({action:"inventory.adjust",productId:product.id,quantity:-14,reason:"Sortie générale impossible"}),/général/);
      const saleCount=await db.sale.count({where:{companyId:company.id}});
      await assert.rejects(act({action:"sale.create",customer:"Client",payment:"Carte RP",requestKey:randomUUID(),items:[{productId:product.id,quantity:14}]}),/général/);
      assert.equal(await db.sale.count({where:{companyId:company.id}}),saleCount);assert.equal(await db.financialEntry.count({where:{companyId:company.id}}),0);
      const batch=await act({action:"stock.count.create",label:"Comptage global",requestKey:randomUUID(),productIds:[product.id]});
      await act({action:"stock.count.update",batchId:batch.id,revision:0,lines:[{productId:product.id,counted:6,reason:"Comptage impossible sous les réserves"}]});
      await assert.rejects(act({action:"stock.count.post",batchId:batch.id,revision:1}),/général/);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,20);
    });
    await t.test("read rights, tenant boundaries and inactive modules apply to locations",async()=>{
      assert.equal((await readWarehouses(reader.id,warehouseQuery.parse({companyId:company.id}))).manage,false);
      await assert.rejects(execute(reader,company.id,transfer(null,a.id,1)),/insuffisant/);
      await assert.rejects(read(foreign.id),/introuvable/);
      await assert.rejects(readWarehouses(outsider.id,warehouseQuery.parse({companyId:company.id})),/inaccessible/);
      await act({action:"module.toggle",key:"orders",enabled:false});await act({action:"module.toggle",key:"inventory",enabled:false});await assert.rejects(read(),/désactivé/);await assert.rejects(act(transfer(null,a.id,1)),/désactivé/);await act({action:"module.toggle",key:"inventory",enabled:true});await act({action:"module.toggle",key:"orders",enabled:true});
    });
    await t.test("empty archives keep their history and cannot receive new transfers",async()=>{
      await act(transfer(b.id,null,2));await act({action:"stock.warehouse.save",warehouseId:b.id,code:"B",name:"Réserve B",archived:true});
      assert.equal((await read(b.id)).transferCount,3);await assert.rejects(act(transfer(null,b.id,1)),/introuvable/);
      await act({action:"stock.warehouse.save",warehouseId:b.id,code:"B",name:"Réserve B",archived:false});
    });
    await t.test("different concurrent requests cannot transfer the same units twice",async()=>{
      const results=await Promise.allSettled([act(transfer(a.id,b.id,3)),act(transfer(a.id,b.id,3))]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
      assert.equal((await read(a.id)).products[0].quantity,2);assert.equal((await read(b.id)).products[0].quantity,3);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,20);
    });
  }finally{
    await db.inventoryMovement.deleteMany({where:{companyId:{in:companies}}});await db.stockBatch.deleteMany({where:{companyId:{in:companies}}});await db.warehouseStock.deleteMany({where:{companyId:{in:companies}}});await db.stockWarehouse.deleteMany({where:{companyId:{in:companies}}});
    await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});
