import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readReceipts} from "../src/domains/purchasing/queries";

test("PostgreSQL: partial receipts preserve delivered stock, costs and history",async t=>{
  const prefix=`receipts-${randomUUID()}`;
  const owner={id:`${prefix}-owner`,name:"Receipt owner",email:`${prefix}@example.test`};
  const foreign={id:`${prefix}-foreign`,name:"Other owner",email:`${prefix}-other@example.test`};
  const reader={id:`${prefix}-reader`,name:"Receipt reader",email:`${prefix}-reader@example.test`};
  const companyIds:string[]=[];
  try {
    await db.user.createMany({data:[owner,foreign,reader]});
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Commerce"}) as {id:string};companyIds.push(company.id);
    const other=await execute(foreign,undefined,{action:"company.create",name:`${prefix}-other`,sector:"Commerce"}) as {id:string};companyIds.push(other.id);
    const role=await execute(owner,company.id,{action:"role.create",name:"Lecture achats",permissions:["orders.read","orders.manage"]}) as {id:string};
    await db.companyMember.create({data:{companyId:company.id,userId:reader.id,roleId:role.id,characterName:"Lecteur achats"}});
    const supplier=await execute(owner,company.id,{action:"supplier.save",name:"Fournisseur livraisons"}) as {id:string};
    const product=await execute(owner,company.id,{action:"product.create",name:"Pièce partielle",sku:"P1",category:"Pièces",price:200,cost:10,stock:0,threshold:0,trackStock:true}) as {id:string};
    const product2=await execute(owner,company.id,{action:"product.create",name:"Pièce plafond",sku:"P2",category:"Pièces",price:200,cost:10,stock:999999,threshold:0,trackStock:true}) as {id:string};
    const makeOrder=async()=>{
      const order=await execute(owner,company.id,{action:"purchase.save",supplierId:supplier.id,items:[{productId:product.id,quantity:4,unitCost:101},{productId:product2.id,quantity:2,unitCost:50}]}) as {id:string};
      await execute(owner,company.id,{action:"purchase.transition",orderId:order.id,status:"ORDERED"});
      return db.purchaseOrder.findUniqueOrThrow({where:{id:order.id},include:{items:true}});
    };
    const order=await makeOrder();const line=order.items.find(i=>i.productId===product.id)!;const line2=order.items.find(i=>i.productId===product2.id)!;
    const payload={action:"purchase.receive",orderId:order.id,requestKey:randomUUID(),occurredAt:"2026-01-03T12:00:00Z",reference:"BL-01",notes:"Note réception",items:[{itemId:line.id,quantity:2}]};
    await t.test("partial receipt is atomic, dated, priced from the order and replayed once",async()=>{
      await db.product.update({where:{id:product.id},data:{cost:999}});
      await Promise.all([execute(owner,company.id,payload),execute(owner,company.id,payload)]);
      assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,2);
      assert.equal((await db.purchaseOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PARTIAL");
      assert.equal((await db.purchaseItem.findUniqueOrThrow({where:{id:line.id}})).receivedQuantity,2);
      assert.equal(await db.purchaseReceipt.count({where:{companyId:company.id}}),1);
      const entry=await db.financialEntry.findFirstOrThrow({where:{companyId:company.id,kind:"PURCHASE"}});assert.equal(entry.amount,-202);assert.equal(entry.occurredAt?.toISOString(),payload.occurredAt.replace("Z",".000Z"));
      const history=await readReceipts(reader.id,company.id,order.id);assert.equal(history.count,1);assert.equal(history.receipts[0].lines[0].unitCost,101);assert.equal(history.receipts[0].actorName,owner.name);assert.equal(history.legacy,null);
      await assert.rejects(execute(owner,company.id,{...payload,items:[{itemId:line.id,quantity:1}]}),/clé/);
    });
    await t.test("invalid lines, future dates, excess delivery and failed stock roll back the whole receipt",async()=>{
      const attempt={...payload,requestKey:randomUUID()};
      await assert.rejects(execute(owner,company.id,{...attempt,items:[{itemId:line.id,quantity:3}]}),/reliquat/);
      await assert.rejects(execute(owner,company.id,{...attempt,items:[{itemId:line.id,quantity:1},{itemId:line2.id,quantity:2}]}),/Réception impossible/);
      await assert.rejects(execute(owner,company.id,{...attempt,items:[{itemId:line.id,quantity:1},{itemId:line.id,quantity:1}]}),/distinctes/);
      await assert.rejects(execute(owner,company.id,{...attempt,items:[{itemId:"foreign-line",quantity:1}]}),/introuvable/);
      await assert.rejects(execute(owner,company.id,{...attempt,occurredAt:"2099-01-01T00:00:00Z"}),/date/);
      assert.equal(await db.purchaseReceipt.count({where:{companyId:company.id}}),1);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,2);
      assert.equal((await db.financialEntry.aggregate({where:{companyId:company.id},_sum:{amount:true}}))._sum.amount,-202);
    });
    await t.test("tenant, permissions, archive and module guards remain enforced",async()=>{
      await assert.rejects(execute(foreign,other.id,{...payload,requestKey:randomUUID()}),/introuvable/);
      await assert.rejects(readReceipts(foreign.id,other.id,order.id),/introuvable/);
      await assert.rejects(readReceipts(foreign.id,company.id,order.id),/inaccessible/);
      await assert.rejects(execute(reader,company.id,{...payload,requestKey:randomUUID()}),/Permission/);
      await assert.rejects(execute(owner,company.id,{action:"product.archive",productId:product.id,archived:true}),/commande d’achat/);
      await execute(owner,company.id,{action:"module.toggle",key:"orders",enabled:false});
      await assert.rejects(readReceipts(reader.id,company.id,order.id),/inaccessible/);
      await assert.rejects(execute(owner,company.id,payload),/désactivé/);
      await execute(owner,company.id,{action:"module.toggle",key:"orders",enabled:true});
    });
    await t.test("full transition after a partial delivery posts only the remaining units and cost",async()=>{
      await execute(owner,company.id,{action:"inventory.adjust",productId:product2.id,quantity:-5,reason:"Place pour livraison"});
      await Promise.all([execute(owner,company.id,{action:"purchase.transition",orderId:order.id,status:"RECEIVED"}),execute(owner,company.id,{action:"purchase.transition",orderId:order.id,status:"RECEIVED"})]);
      assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,4);
      assert.equal((await db.product.findUniqueOrThrow({where:{id:product2.id}})).stock,999996);
      assert.equal((await db.financialEntry.aggregate({where:{companyId:company.id},_sum:{amount:true}}))._sum.amount,-504);
      const history=await readReceipts(owner.id,company.id,order.id);assert.equal(history.count,2);assert.equal(history.receipts[0].total,302);
      await execute(owner,company.id,payload);assert.equal(await db.purchaseReceipt.count({where:{companyId:company.id}}),2);
    });
    await t.test("cancelling an outstanding remainder preserves all delivered quantities and charges",async()=>{
      const second=await makeOrder();const item=second.items.find(i=>i.productId===product.id)!;
      await execute(owner,company.id,{...payload,orderId:second.id,requestKey:randomUUID(),items:[{itemId:item.id,quantity:1}]});
      await execute(owner,company.id,{action:"purchase.transition",orderId:second.id,status:"CANCELLED",reason:"Reliquat indisponible"});
      assert.equal((await db.purchaseItem.findUniqueOrThrow({where:{id:item.id}})).receivedQuantity,1);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,5);
      assert.equal((await readReceipts(owner.id,company.id,second.id)).count,1);
      await assert.rejects(execute(owner,company.id,{...payload,orderId:second.id,requestKey:randomUUID(),items:[{itemId:item.id,quantity:1}]}),/transition/);
      assert.equal((await db.financialEntry.aggregate({where:{companyId:company.id},_sum:{amount:true}}))._sum.amount,-605);
    });
    await t.test("pre-migration full receipts remain immutable with no invented receipt rows",async()=>{
      const historic=await makeOrder();await db.purchaseOrder.update({where:{id:historic.id},data:{status:"RECEIVED",receivedAt:new Date("2025-01-01T00:00:00Z")}});
      await execute(owner,company.id,{action:"purchase.transition",orderId:historic.id,status:"RECEIVED"});
      const history=await readReceipts(owner.id,company.id,historic.id);assert.equal(history.count,0);assert.equal(history.legacy?.toISOString(),"2025-01-01T00:00:00.000Z");
      assert.equal((await db.purchaseItem.findFirstOrThrow({where:{orderId:historic.id}})).receivedQuantity,0);
    });
  } finally {
    await db.purchaseReceipt.deleteMany({where:{companyId:{in:companyIds}}});
    await db.purchaseOrder.deleteMany({where:{companyId:{in:companyIds}}});
    await db.inventoryMovement.deleteMany({where:{companyId:{in:companyIds}}});
    await db.companyMember.deleteMany({where:{companyId:{in:companyIds}}});
    await db.company.deleteMany({where:{id:{in:companyIds}}});
    await db.user.deleteMany({where:{id:{in:[owner.id,foreign.id,reader.id]}}});
    await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${prefix}`}}});
    await db.$disconnect();
  }
});
