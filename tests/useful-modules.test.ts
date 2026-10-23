import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readEquipment,parisToday} from "../src/domains/equipment/queries";
import {writeEquipment} from "../src/domains/equipment/service";
import {readStatistics} from "../src/domains/statistics/queries";
import {saveStatisticsLayout} from "../src/domains/statistics/service";
import {readFinance} from "../src/domains/finance/queries";
import {financeQuery} from "../src/domains/finance/validation";
async function clean(companies:string[],users:string[]){
 await db.equipmentItem.deleteMany({where:{companyId:{in:companies}}});await db.timeEntry.deleteMany({where:{companyId:{in:companies}}});await db.inventoryMovement.deleteMany({where:{companyId:{in:companies}}});await db.warehouseStock.deleteMany({where:{companyId:{in:companies}}});await db.stockWarehouse.deleteMany({where:{companyId:{in:companies}}});await db.sale.deleteMany({where:{companyId:{in:companies}}});await db.purchaseOrder.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`utility:${id}:`}}});
}
test("PostgreSQL: equipment custody, blocking work and immutable history",async t=>{
 const users:string[]=[],companies:string[]=[];try{
  const person=async(name:string)=>{const u=await db.user.create({data:{name,email:`equipment-${randomUUID()}@example.test`}});users.push(u.id);return u;};
  const owner=await person("Responsable"),employee=await person("Camille Atelier"),foreign=await person("Autre direction");
  const company=await execute(owner,undefined,{action:"company.create",name:`Équipements ${randomUUID()}`,sector:"Services"}) as {id:string},other=await execute(foreign,undefined,{action:"company.create",name:`Autre ${randomUUID()}`,sector:"Services"}) as {id:string};companies.push(company.id,other.id);
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Lecture du registre",permissions:["equipment.read"]}}),em=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:employee.name}}),fm=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:other.id,userId:foreign.id}}}),om=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:owner.id}}});
  const grants=(await db.companyRole.findUniqueOrThrow({where:{id:om.roleId}})).permissions;
  const create={action:"save",kind:"VEHICLE",code:"veh-001",name:"Dépanneuse",registration:"AB 123 CD",mileage:100,location:"Atelier",reason:"Mise en service RP",companyId:company.id,requestKey:randomUUID()};
  const [one,two]=await Promise.all([writeEquipment(owner,create),writeEquipment(owner,create)]);assert.equal(one.id,two.id);const itemId=one.id;
  const act=async(input:Record<string,unknown>,actor=owner)=>{const item=await db.equipmentItem.findUniqueOrThrow({where:{id:itemId}});return writeEquipment(actor,{companyId:company.id,itemId,revision:item.revision,requestKey:randomUUID(),...input});};
  const read=(input:Record<string,unknown>={},actor=owner)=>readEquipment(actor.id,{companyId:company.id,...input});
  await t.test("creation normalizes identifiers and replays once without financial or stock effects",async()=>{
   const row=await db.equipmentItem.findUniqueOrThrow({where:{id:itemId}});assert.equal(row.code,"VEH-001");assert.equal(row.registration,"AB123CD");assert.equal(await db.equipmentEvent.count({where:{itemId}}),1);
   await assert.rejects(writeEquipment(owner,{...create,requestKey:randomUUID()}),/existe déjà/);await assert.rejects(writeEquipment(owner,{...create,requestKey:create.requestKey,name:"Autre"}),/Clé/);
   await assert.rejects(writeEquipment(owner,{...create,code:"OTHER",registration:"AB\n123",requestKey:randomUUID()}));
   assert.equal(await db.financialEntry.count({where:{companyId:company.id}}),0);assert.equal(await db.inventoryMovement.count({where:{companyId:company.id}}),0);
  });
  await t.test("read rights, staff listing, tenant boundaries and inactive accounts are enforced",async()=>{
   assert.equal((await read({},employee)).total,1);await assert.rejects(act({action:"state",state:"READY",reason:"Sans droit"},employee),/permission/);
   await assert.rejects(read({view:"staff"},employee),/Gestion/);await assert.rejects(read({itemId},foreign),/inaccessible/);
   await assert.rejects(act({action:"assign",memberId:fm.id,reason:"Membre étranger"}),/introuvable/);
   await db.user.update({where:{id:employee.id},data:{accessStatus:"SUSPENDED"}});await assert.rejects(read({},employee),/suspendu/);await assert.rejects(act({action:"assign",memberId:em.id,reason:"Compte suspendu"}),/introuvable/);await db.user.update({where:{id:employee.id},data:{accessStatus:"ACTIVE"}});
  });
  await t.test("assignment notifies once, keeps the RP name and blocks archival until returned",async()=>{
   const item=await db.equipmentItem.findUniqueOrThrow({where:{id:itemId}}),input={action:"assign",companyId:company.id,itemId,revision:item.revision,memberId:em.id,reason:"Service dépannage",requestKey:randomUUID()};await writeEquipment(owner,input);await writeEquipment(owner,input);
   assert.equal((await read({assigned:"mine"},employee)).total,1);assert.equal(await db.notification.count({where:{userId:employee.id,category:"EQUIPMENT"}}),1);assert.match((await db.equipmentEvent.findFirstOrThrow({where:{itemId,action:"ASSIGNED"}})).reason,/Camille/);
   await assert.rejects(act({action:"archive",archived:true,reason:"Encore affectée"}),/affectation/);
  });
  await t.test("open incidents and maintenance block service; failed closure rolls back completely",async()=>{
   await act({action:"work.open",kind:"INCIDENT",title:"Freinage défaillant",details:"Contrôle nécessaire",blocking:true,dueOn:parisToday()});assert.equal((await read({itemId})).selected!.state,"OUT_OF_SERVICE");
   await assert.rejects(act({action:"state",state:"READY",reason:"Test avant réparation"}),/bloquantes/);
   await act({action:"work.open",kind:"MAINTENANCE",title:"Révision du véhicule",details:"Vérification atelier",blocking:false});const incident=await db.equipmentWork.findFirstOrThrow({where:{itemId,kind:"INCIDENT"}}),maintenance=await db.equipmentWork.findFirstOrThrow({where:{itemId,kind:"MAINTENANCE"}});assert.equal(maintenance.blocking,true);
   await assert.rejects(act({action:"work.close",workId:incident.id,resolution:"Freinage réparé",restoreReady:true}),/D’autres/);assert.equal((await db.equipmentWork.findUniqueOrThrow({where:{id:incident.id}})).status,"OPEN");
   await act({action:"work.close",workId:incident.id,resolution:"Freinage réparé",restoreReady:false});await act({action:"work.close",workId:maintenance.id,resolution:"Révision terminée",restoreReady:true,nextServiceOn:"2026-12-20"});assert.equal((await read({itemId})).selected!.state,"READY");assert.equal((await read({itemId})).selected!.nextServiceOn,"2026-12-20");
   assert.equal(await db.equipmentWork.count({where:{itemId,status:"CLOSED"}}),2);
  });
  await t.test("concurrent changes require the same original revision and mileage never goes backwards",async()=>{
   const item=await db.equipmentItem.findUniqueOrThrow({where:{id:itemId}});const base={companyId:company.id,itemId,revision:item.revision,action:"state",reason:"Contrôle concurrent"};const results=await Promise.allSettled([writeEquipment(owner,{...base,state:"MAINTENANCE",requestKey:randomUUID()}),writeEquipment(owner,{...base,state:"OUT_OF_SERVICE",requestKey:randomUUID()})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
   await assert.rejects(act({...create,companyId:company.id,requestKey:randomUUID(),itemId,mileage:90,revision:(await db.equipmentItem.findUniqueOrThrow({where:{id:itemId}})).revision}),/compteur/);
  });
  await t.test("archives preserve all history and cannot receive edits; manager implies registry read",async()=>{
   await act({action:"assign",memberId:null,reason:"Retour à l’atelier"});await act({action:"archive",archived:true,reason:"Retrait de la flotte"});assert.equal((await read({archived:"true"})).total,1);await assert.rejects(act({action:"state",state:"READY",reason:"Archive fermée"}),/Restaurez/);
   const before=await db.equipmentEvent.count({where:{itemId}});await act({action:"archive",archived:false,reason:"Réintégration de la flotte"});assert.equal(await db.equipmentEvent.count({where:{itemId}}),before+1);
   await db.companyRole.update({where:{id:role.id},data:{permissions:["equipment.manage"]}});assert.equal((await read({},employee)).manage,true);await read({view:"staff"},employee);
  });
  await t.test("list, current due dates and complete history are paginated and module revocation precedes replay",async()=>{
   await db.equipmentItem.createMany({data:Array.from({length:30},(_,i)=>({companyId:company.id,code:`P-${i}`,name:`Pagination équipement ${i}`,kind:"EQUIPMENT",nextServiceOn:parisToday()}))});assert.equal((await read({q:"Pagination équipement"})).rows.length,25);assert.equal((await read({q:"Pagination équipement",page:2})).rows.length,5);assert.equal((await read({due:"due",q:"Pagination équipement"})).total,30);
   await db.equipmentEvent.createMany({data:Array.from({length:30},()=>({companyId:company.id,itemId,action:"UPDATED",actorName:"Fixture",reason:"Historique paginé",snapshot:{}}))});assert.equal((await read({itemId,eventPage:2})).events.length>0,true);
   await execute(owner,company.id,{action:"module.toggle",key:"equipment",enabled:false});await assert.rejects(read(),/désactivé/);await assert.rejects(writeEquipment(owner,create),/désactivé/);assert.deepEqual((await db.companyRole.findUniqueOrThrow({where:{id:om.roleId}})).permissions,grants);
  });
 }finally{await clean(companies,users);}
});

test("PostgreSQL: real statistics use authoritative ledger, Paris dates and source permissions",async t=>{
 const users:string[]=[],companies:string[]=[];try{
  const person=async(name:string)=>{const u=await db.user.create({data:{name,email:`statistics-${randomUUID()}@example.test`}});users.push(u.id);return u;};const owner=await person("Direction"),employee=await person("Alice Atelier"),foreign=await person("Autre entreprise");
  const company=await execute(owner,undefined,{action:"company.create",name:`Statistiques ${randomUUID()}`,sector:"Services"}) as {id:string},other=await execute(foreign,undefined,{action:"company.create",name:`Étranger ${randomUUID()}`,sector:"Services"}) as {id:string};companies.push(company.id,other.id);
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Statistiques sans sources",permissions:["statistics.read"]}}),em=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:employee.name}});
  const product=await execute(owner,company.id,{action:"product.create",name:"Pneu RP",sku:"PNEU-STAT",category:"Atelier",price:1001,cost:999,stock:20,trackStock:true,threshold:19}) as {id:string};
  const sell=async(quantity:number,discountBps:number,at:string)=>{const sale=await execute(owner,company.id,{action:"sale.create",items:[{productId:product.id,quantity}],customer:"Client RP",payment:"Carte RP",discountBps,requestKey:randomUUID()}) as {id:string};await db.sale.update({where:{id:sale.id},data:{createdAt:new Date(at)}});await db.financialEntry.updateMany({where:{companyId:company.id,kind:"SALE",sourceId:sale.id},data:{occurredAt:new Date(at)}});return sale;};
  await sell(2,1000,"2026-03-28T23:30:00Z");const cancelled=await sell(1,0,"2026-03-29T00:00:00Z");await execute(owner,company.id,{action:"sale.cancel",saleId:cancelled.id,reason:"Retour RP"});await db.financialEntry.updateMany({where:{companyId:company.id,kind:"REFUND",sourceId:cancelled.id},data:{occurredAt:new Date("2026-03-30T21:59:00Z")}});
  const entry=async(kind:string,amount:number,occurredAt:string,cid=company.id)=>db.financialEntry.create({data:{companyId:cid,kind,amount,label:"Écriture de recette",sourceId:randomUUID(),actorId:owner.id,occurredAt:new Date(occurredAt)}});
  await entry("OPENING",10000,"2026-03-27T12:00:00Z");await entry("SALE",333,"2026-03-25T12:00:00Z");await entry("EXPENSE",-500,"2026-03-29T21:00:00Z");await entry("PAYROLL",-200,"2026-03-30T20:00:00Z");await entry("TRANSFER_OUT",-700,"2026-03-29T14:00:00Z");await entry("TRANSFER_IN",700,"2026-03-29T14:00:00Z");await entry("SALE",88888,"2026-03-30T22:00:00Z");await entry("SALE",999999,"2026-03-29T12:00:00Z",other.id);
  const warehouse=await db.stockWarehouse.create({data:{companyId:company.id,name:"Réserve",code:"STAT"}});await db.warehouseStock.create({data:{companyId:company.id,warehouseId:warehouse.id,productId:product.id,quantity:5}});
  const time=await db.timeEntry.create({data:{companyId:company.id,memberId:em.id,start:new Date("2026-03-29T20:00:00Z"),end:new Date("2026-03-29T22:00:00Z"),revision:2}});for(const revision of [1,2])await db.timeReview.create({data:{companyId:company.id,entryId:time.id,revision,status:"APPROVED",reason:"Recette heures validées",actorId:owner.id,workedMinutes:revision===2?90:400,start:time.start,end:time.end!}});
  const supplier=await db.supplier.create({data:{companyId:company.id,name:"Fournisseur RP"}});for(const [status,total] of [["DRAFT",1200],["ORDERED",3000]] as const)await db.purchaseOrder.create({data:{companyId:company.id,supplierId:supplier.id,supplierName:supplier.name,number:randomUUID(),status,total,createdAt:new Date("2026-03-29T12:00:00Z")}});
  const read=(input:Record<string,unknown>={},actor=owner)=>readStatistics(actor.id,{companyId:company.id,from:"2026-03-28",to:"2026-03-30",...input});
  await t.test("ledger sums include refunds and historical payroll, exclude transfers/opening from performance, and respect DST",async()=>{
   const d=await read();assert.equal(d.finance!.income,1802);assert.equal(d.finance!.expense,700);assert.equal(d.finance!.result,1102);assert.equal(d.finance!.balance,11435);assert.equal(d.finance!.previousIncome,333);assert.equal(d.period.previousFrom,"2026-03-25");assert.equal(d.period.previousTo,"2026-03-27");assert.deepEqual(d.finance!.series.map(d=>d.day),["2026-03-28","2026-03-29","2026-03-30"]);assert.equal(d.finance!.series.reduce((s,d)=>s+d.result,0),1102);
   const ledger=await readFinance(owner.id,financeQuery.parse({companyId:company.id,from:"2026-03-28",to:"2026-03-30"}));assert.equal(ledger.summary.expense,700);
  });
  await t.test("sales use net active sales; product totals explicitly precede global discounts",async()=>{
   const d=await read();assert.deepEqual(d.sales,{count:1,amount:1802,cancelled:1});assert.equal((await read({section:"sellers"})).report.rows[0][1],1);const p=await read({section:"products"});assert.equal(p.report.rows[0][1],2);assert.match(p.report.columns[2],/AVANT/);assert.match(String(p.report.rows[0][2]),/20,02/);
  });
  await t.test("current stock does not expose unit costs and hours include only current approved revisions",async()=>{
   const d=await read();assert.deepEqual(d.stock,{products:1,units:18,low:1});assert.equal(d.people!.minutes,90);assert.equal(d.people!.services,1);const s=await read({section:"stock"});assert.equal(s.report.rows[0][3],13);assert.ok(!JSON.stringify(s).includes('"cost"'));
   await db.timeEntry.update({where:{id:time.id},data:{revision:3}});assert.equal((await read({section:"people"})).people!.minutes,0);await db.timeEntry.update({where:{id:time.id},data:{revision:2}});
   assert.equal((await read({section:"orders"})).report.total,2);
  });
  await t.test("statistics alone grant no financial, employee, sales, order or stock data; exports use the same gates",async()=>{
   const d=await read({},employee);assert.deepEqual(d.access,{finance:false,sales:false,people:false,stock:false,orders:false});assert.equal(d.finance,null);assert.equal(d.people,null);assert.equal(d.report.rows.length,0);
   for(const section of ["finance","sellers","products","people","stock","orders"])await assert.rejects(read({section},employee),/source/);await assert.rejects(read({},foreign),/inaccessible/);
   await execute(owner,company.id,{action:"module.toggle",key:"time",enabled:false});await assert.rejects(read({section:"people"}),/source/);await execute(owner,company.id,{action:"module.toggle",key:"time",enabled:true});
  });
  await t.test("personal widget order persists idempotently without changing another employee or accepting stale saves",async()=>{
   const input={companyId:company.id,widgets:["stock","sales"],revision:0,requestKey:randomUUID()};const [a,b]=await Promise.all([saveStatisticsLayout(owner,input),saveStatisticsLayout(owner,input)]);assert.equal(a.revision,1);assert.equal(b.revision,1);assert.deepEqual((await read()).layout.widgets,["stock","sales"]);assert.equal((await read({},employee)).layout.widgets.length,5);
   await assert.rejects(saveStatisticsLayout(owner,{...input,widgets:["sales"]}),/Clé/);await assert.rejects(saveStatisticsLayout(owner,{...input,requestKey:randomUUID()}),/disposition/);
   await assert.rejects(saveStatisticsLayout(owner,{...input,widgets:["stock","stock"],revision:1,requestKey:randomUUID()}));
  });
  await t.test("large seller reports paginate, range limits apply and revoked statistics block replay",async()=>{
   await db.sale.createMany({data:Array.from({length:30},(_,i)=>({companyId:company.id,number:`STAT-${i}`,requestKey:randomUUID(),customer:"RP",sellerId:`seller-${i}`,sellerName:`Vendeur ${i}`,payment:"Espèces RP",total:100,createdAt:new Date("2026-03-29T12:00:00Z")}))});assert.equal((await read({section:"sellers"})).report.rows.length,25);assert.equal((await read({section:"sellers",page:2})).report.rows.length,6);
   await assert.rejects(read({from:"2025-01-01",to:"2026-01-02"}),/366/);await assert.rejects(read({from:"2026-04-01",to:"2026-03-01"}));
   await execute(owner,company.id,{action:"module.toggle",key:"statistics",enabled:false});await assert.rejects(read(),/désactivé/);
  });
 }finally{await clean(companies,users);}
});
