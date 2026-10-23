import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { execute } from "../src/domains/core/service";
import { readFinance } from "../src/domains/finance/queries";
import { getWorkspace } from "../src/domains/core/queries";
import { financeQuery } from "../src/domains/finance/validation";
import { financePdf } from "../src/domains/finance/pdf";
test("autonomous finance preserves the legacy ledger and posts audited, idempotent operations",async t=>{
  const prefix=`finance-${randomUUID()}`;const users:string[]=[],companies:string[]=[];
  try{
    const owner=await db.user.create({data:{name:"Direction finance",email:`${prefix}-owner@example.test`}});users.push(owner.id);
    const reader=await db.user.create({data:{name:"Lecteur finance",email:`${prefix}-reader@example.test`}});users.push(reader.id);
    const outsider=await db.user.create({data:{name:"Autre entreprise",email:`${prefix}-other@example.test`}});users.push(outsider.id);
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Test",template:"garage"}) as {id:string};companies.push(company.id);
    const other=await execute(outsider,undefined,{action:"company.create",name:`${prefix}-other`,sector:"Test",template:"garage"}) as {id:string};companies.push(other.id);
    const role=await db.companyRole.create({data:{companyId:company.id,name:"Lecture seule",permissions:["finance.read"]}});
    await db.companyMember.create({data:{companyId:company.id,userId:reader.id,roleId:role.id,characterName:"Lecteur"}});
    const legacy=await db.financialEntry.create({data:{companyId:company.id,amount:500,kind:"SALE",label:"Historique conservé",sourceId:"legacy-sale",actorId:owner.id,createdAt:new Date("2025-12-31T23:30:00Z")}});
    const ownerPermissions=(await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:true}})).permissions;
    const bank=await execute(owner,company.id,{action:"finance.account.save",name:"Banque RP",type:"BANK",isDefault:true}) as {id:string};
    const cash=await execute(owner,company.id,{action:"finance.account.save",name:"Caisse RP",type:"CASH"}) as {id:string};
    const category=await execute(owner,company.id,{action:"finance.category.save",name:"Activité RP",kind:"BOTH"}) as {id:string};
    const create=(kind:string,amount:number,extra:Record<string,unknown>={})=>execute(owner,company.id,{action:"finance.operation.create",requestKey:randomUUID(),kind,amount,label:`${kind} de contrôle`,accountId:bank.id,occurredAt:new Date(Date.now()-1000).toISOString(),...extra}) as Promise<{id:string}>;
    const post=(id:string)=>execute(owner,company.id,{action:"finance.operation.post",operationId:id});
    const read=(extra:Record<string,unknown>={})=>readFinance(owner.id,financeQuery.parse({companyId:company.id,...extra}));
    let incomeId="",transferId="";
    await t.test("draft edits detect stale revisions and cannot change posted entries",async()=>{
      const requestKey=randomUUID();const payload={action:"finance.operation.create",requestKey,kind:"INCOME",amount:123,label:"Brouillon à corriger",accountId:bank.id,occurredAt:"2026-01-02T12:00:00Z"};
      const draft=await execute(owner,company.id,payload) as {id:string};
      const update={...payload,action:"finance.operation.update",operationId:draft.id,revision:0,amount:456};
      await execute(owner,company.id,update);await assert.rejects(execute(owner,company.id,update),/a changé/);
      assert.equal((await execute(owner,company.id,payload) as {id:string}).id,draft.id);
      // Withdraw this corrected draft; it must not consume the opening slot.
      await execute(owner,company.id,{action:"finance.operation.cancel",operationId:draft.id,reason:"Contrôle des brouillons terminé"});
      assert.equal(await db.financialEntry.count({where:{operationId:draft.id}}),0);
      await assert.rejects(execute(owner,company.id,{...update,revision:1}),/Seul un brouillon/);
    });
    await t.test("opening entries preserve old values and are excluded from income",async()=>{
      const opening=await create("OPENING",100000);await post(opening.id);
      const state=await read();assert.equal(state.summary.balance,100500);assert.equal(state.summary.income,500);assert.equal(state.summary.expense,0);
      assert.deepEqual(await db.financialEntry.findUnique({where:{id:legacy.id}}),legacy);
      assert.deepEqual((await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:true}})).permissions,ownerPermissions);
      const duplicate=await create("OPENING",2000);await assert.rejects(post(duplicate.id),/déjà des écritures/);
      await assert.rejects(create("OPENING",2000,{accountId:null}),/compte dédié/);
    });
    await t.test("draft creation replay and posting replay do not duplicate revenue",async()=>{
      const payload={action:"finance.operation.create",requestKey:randomUUID(),kind:"INCOME",amount:25000,label:"Recette manuelle",accountId:bank.id,categoryId:category.id,occurredAt:"2026-01-02T12:00:00Z"};
      const income=await execute(owner,company.id,payload) as {id:string};incomeId=income.id;
      assert.equal(await db.financialEntry.count({where:{operationId:income.id}}),0);
      assert.equal((await execute(owner,company.id,payload) as {id:string}).id,income.id);
      await assert.rejects(execute(owner,company.id,{...payload,amount:1}),/autre opération/);
      await Promise.all([post(income.id),post(income.id)]);assert.equal(await db.financialEntry.count({where:{operationId:income.id}}),1);
      await assert.rejects(execute(owner,company.id,{...payload,action:"finance.operation.update",operationId:income.id,revision:0}),/Seul un brouillon/);
      // A receipt dated January must not enter October's dashboard merely
      // because the draft was entered today.
      if(new Date().getUTCMonth()!==0)assert.equal((await getWorkspace(owner.id,company.id)).current?.stats.revenue,0);
    });
    await t.test("manual expenses and internal transfers affect the correct totals",async()=>{
      const expense=await create("EXPENSE",5000,{categoryId:category.id});await post(expense.id);
      const transfer=await create("TRANSFER",40000,{targetAccountId:cash.id});transferId=transfer.id;await post(transfer.id);
      const state=await read();assert.equal(state.summary.balance,120500);assert.equal(state.summary.income,25500);assert.equal(state.summary.expense,5000);assert.equal(state.summary.result,20500);
      assert.equal(state.accounts.find(a=>a.id===cash.id)?.balance,40000);assert.equal(state.accounts.find(a=>a.id===bank.id)?.balance,80000);
      assert.equal(await db.financialEntry.count({where:{operationId:transfer.id}}),2);
      const impossible=await create("TRANSFER",9999999,{targetAccountId:cash.id});await assert.rejects(post(impossible.id),/insuffisant/);assert.equal(await db.financialEntry.count({where:{operationId:impossible.id}}),0);
    });
    await t.test("reversals preserve originals and replay without additional postings",async()=>{
      const [a,b]=await Promise.all([execute(owner,company.id,{action:"finance.operation.reverse",operationId:transferId,reason:"Erreur de compte RP",requestKey:randomUUID()}),execute(owner,company.id,{action:"finance.operation.reverse",operationId:transferId,reason:"Même correction",requestKey:randomUUID()})]) as {id:string}[];
      assert.equal(a.id,b.id);assert.equal(await db.financialEntry.count({where:{operationId:a.id}}),2);
      assert.equal((await read()).summary.balance,120500);assert.equal((await read()).accounts.find(a=>a.id===cash.id)?.balance,0);
      await execute(owner,company.id,{action:"finance.operation.reverse",operationId:incomeId,reason:"Recette saisie par erreur",requestKey:randomUUID()});assert.equal((await read()).summary.income,500);
      assert.equal(await db.financialEntry.count({where:{operationId:incomeId}}),1);
    });
    await t.test("large expenses require an explicit approval and can be rejected",async()=>{
      const large=await create("EXPENSE",125000);await post(large.id);assert.equal((await db.financeOperation.findUniqueOrThrow({where:{id:large.id}})).status,"PENDING");assert.equal(await db.financialEntry.count({where:{operationId:large.id}}),0);
      await assert.rejects(execute(reader,company.id,{action:"finance.operation.decide",operationId:large.id,approve:true,reason:"Tentative non autorisée"}),/insuffisant/);
      await execute(owner,company.id,{action:"finance.operation.decide",operationId:large.id,approve:true,reason:"Facture contrôlée"});assert.equal(await db.financialEntry.count({where:{operationId:large.id}}),1);
      await assert.rejects(execute(owner,company.id,{action:"finance.operation.decide",operationId:large.id,approve:true,reason:"Double validation"}),/plus en attente/);
      const refused=await create("EXPENSE",125001);await post(refused.id);await execute(owner,company.id,{action:"finance.operation.decide",operationId:refused.id,approve:false,reason:"Dépense injustifiée"});assert.equal(await db.financialEntry.count({where:{operationId:refused.id}}),0);
    });
    await t.test("read-only, foreign accounts and disabled modules cannot mutate or leak",async()=>{
      const foreign=await execute(outsider,other.id,{action:"finance.account.save",name:"Étranger",type:"BANK"}) as {id:string};
      await assert.rejects(create("INCOME",500,{accountId:foreign.id}),/introuvable/);
      await assert.rejects(execute(reader,company.id,{action:"finance.account.save",name:"Refus",type:"CASH"}),/insuffisant/);
      const snapshot=await readFinance(reader.id,financeQuery.parse({companyId:company.id}));assert.equal(snapshot.capabilities.manage,false);assert.equal(snapshot.capabilities.approve,false);
      await assert.rejects(readFinance(outsider.id,financeQuery.parse({companyId:company.id})),/inaccessible/);
      await assert.rejects(read({account:foreign.id}),/introuvable/);
      // Keep the dependency catalog intact; simulate an administratively disabled module.
      await db.companyModule.update({where:{companyId_key:{companyId:company.id,key:"finance"}},data:{enabled:false}});
      await assert.rejects(read(),/désactivé/);await assert.rejects(create("INCOME",500),/désactivé/);
      await db.companyModule.update({where:{companyId_key:{companyId:company.id,key:"finance"}},data:{enabled:true}});
    });
    await t.test("legacy reversals follow the original account after default changes",async()=>{
      const product=await execute(owner,company.id,{action:"product.create",name:"Prestation",sku:"FIN-TEST",category:"Test",price:300,cost:0,stock:0,threshold:0,trackStock:false}) as {id:string};
      const sale=await execute(owner,company.id,{action:"sale.create",customer:"Client",payment:"Carte RP",requestKey:randomUUID(),items:[{productId:product.id,quantity:1}]}) as {id:string};
      await execute(owner,company.id,{action:"finance.account.save",accountId:cash.id,name:"Caisse RP",type:"CASH",isDefault:true});
      await execute(owner,company.id,{action:"sale.cancel",saleId:sale.id,reason:"Retour RP"});
      const pair=await db.financialEntry.findMany({where:{companyId:company.id,sourceId:sale.id}});assert.equal(pair.length,2);assert.ok(pair.every(e=>e.accountId===bank.id));assert.equal(pair.reduce((s,e)=>s+e.amount,0),0);
    });
    await t.test("manual reconciliation snapshots are immutable, replay safe and flag late postings",async()=>{
      const payload={action:"finance.reconcile",accountId:bank.id,requestKey:randomUUID(),asOf:"2026-01-02",observed:24900,note:"Solde RP observé au contrôle"};
      const beforeCount=await db.financialEntry.count({where:{companyId:company.id}});
      const a=await execute(owner,company.id,payload) as {id:string};const b=await execute(owner,company.id,payload) as {id:string};assert.equal(a.id,b.id);
      assert.equal(await db.financialEntry.count({where:{companyId:company.id}}),beforeCount);
      let r=(await read()).reconciliations.find(r=>r.id===a.id)!;assert.equal(r.ledgerBalance,25000);assert.equal(r.difference,-100);assert.equal(r.stale,false);
      const late=await create("INCOME",1,{occurredAt:"2026-01-02T10:00:00Z"});await post(late.id);
      r=(await read()).reconciliations.find(r=>r.id===a.id)!;assert.equal(r.ledgerBalance,25000);assert.equal(r.currentBalance,25001);assert.equal(r.stale,true);
      await assert.rejects(execute(owner,company.id,{...payload,observed:1}),/autre rapprochement/);
      await assert.rejects(execute(reader,company.id,{...payload,requestKey:randomUUID()}),/insuffisant/);
      await assert.rejects(execute(owner,company.id,{...payload,requestKey:randomUUID(),asOf:"2099-01-01"}),/futur/);
      const report=await read({from:"2026-01-02",to:"2026-01-02"});assert.equal(report.comparison?.from,"2026-01-01");assert.equal(report.comparison?.income,500);assert.equal(report.summary.income,25001);
    });
    await t.test("server pagination, date boundaries and full PDF generation use real ledger rows",async()=>{
      const paris=await read({from:"2026-01-01",to:"2026-01-01"});assert.ok(paris.rows.some(r=>r.id===legacy.id));
      await db.financialEntry.createMany({data:Array.from({length:60},(_,i)=>({companyId:company.id,actorId:owner.id,amount:1,kind:"MANUAL_INCOME",effect:"INCOME",label:`Export complet éèà — ligne ${i} · référence de contrôle détaillée`,sourceId:`${prefix}-${i}`,occurredAt:new Date("2026-01-03T12:00:00Z")}))});
      const first=await read({q:"Export complet",page:1,pageSize:25});const second=await read({q:"Export complet",page:2,pageSize:25});assert.equal(first.total,60);assert.equal(first.rows.length,25);assert.equal(second.rows.length,25);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,50);
      assert.equal((await read({q:"' OR 1=1 --"})).total,0);
      const all=await read({q:"Export complet",pageSize:100});const pdf=await financePdf("Entreprise de contrôle éèà","Du 01/01/2026 au 31/01/2026",all.rows,all.summary);assert.equal(pdf.subarray(0,4).toString(),"%PDF");assert.ok(pdf.length>2000);
      if(process.env.RPILOT_PDF_QA){const fs=await import("node:fs/promises");await fs.mkdir(".local/qa",{recursive:true});await fs.writeFile(".local/qa/finance-report.pdf",pdf);}
    });
  }finally{
    // Self-references are cleared by deleting all entries/operations in the same tenant.
    await db.financialEntry.deleteMany({where:{companyId:{in:companies}}});
    await db.financeOperation.deleteMany({where:{companyId:{in:companies}}});
    await db.sale.deleteMany({where:{companyId:{in:companies}}});
    await db.company.deleteMany({where:{id:{in:companies}}});
    await db.rateLimit.deleteMany({where:{OR:users.map(id=>({key:{startsWith:`app:${id}:`}}))}});
    await db.user.deleteMany({where:{id:{in:users}}});
  }
});
