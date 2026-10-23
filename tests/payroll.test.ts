import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readPayroll} from "../src/domains/payroll/queries";
import {payrollQuery} from "../src/domains/payroll/validation";
import {calculatePay} from "../src/domains/payroll/calculation";
import {readFinance} from "../src/domains/finance/queries";
import {financeQuery} from "../src/domains/finance/validation";
import {allPermissions} from "../src/domains/modules/registry";

test("payroll: integer cent calculations, overtime and bounded deductions",()=>{
  const policy={mode:"HOURLY",rate:6000,regularMinutes:60,overtimeBps:12500,commissionBps:1000};
  assert.deepEqual(calculatePay(policy,90,20000,500,250),{workedMinutes:90,overtimeMinutes:30,baseAmount:6000,overtimeAmount:3750,salesAmount:20000,commissionAmount:2000,total:12000});
  assert.equal(calculatePay({...policy,rate:101,regularMinutes:60},1,0,0,0).total,2);
  assert.equal(calculatePay({...policy,mode:"FIXED",rate:12000},300,0,0,0).total,12000);
  assert.throws(()=>calculatePay(policy,90,0,0,999999),/net RP/);
  assert.throws(()=>calculatePay(policy,90001,0,0,0),/Durée/);
});

test("PostgreSQL: payroll periods, frozen sources, private slips and one RP ledger debit",async t=>{
  const prefix=`pay-${randomUUID()}`,companies:string[]=[],users:string[]=[];
  try{
    const make=async(name:string)=>{const user=await db.user.create({data:{name,email:`${prefix}-${name}@example.test`}});users.push(user.id);return user;};
    const owner=await make("direction"),employee=await make("employee"),reviewer=await make("reviewer"),outsider=await make("outsider");
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Services"}) as {id:string};companies.push(company.id);
    const foreign=await execute(outsider,undefined,{action:"company.create",name:`${prefix}-other`,sector:"Services"}) as {id:string};companies.push(foreign.id);
    const role=await db.companyRole.create({data:{companyId:company.id,name:"Employé paie",permissions:["employees.read","time.use"]}});
    const managerRole=await db.companyRole.create({data:{companyId:company.id,name:"RH paie",permissions:allPermissions}});
    const member=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:"Salarié RP",salary:8000}});
    await db.companyMember.create({data:{companyId:company.id,userId:reviewer.id,roleId:managerRole.id,characterName:"Second responsable"}});
    const act=(payload:Record<string,unknown>,actor=owner)=>execute(actor,company.id,{requestKey:randomUUID(),...payload}) as Promise<{id:string;revision:number}>;
    const read=(actor=owner,extra:Record<string,unknown>={})=>readPayroll(actor.id,payrollQuery.parse({companyId:company.id,...extra}));
    let runId="",slipId="",revision=0;
    const entry=await db.timeEntry.create({data:{companyId:company.id,memberId:member.id,start:new Date("2026-01-03T08:00:00Z"),end:new Date("2026-01-03T09:30:00Z")}});
    await act({action:"time.review",entryId:entry.id,revision:0,status:"APPROVED",reason:"Heures contrôlées"});
    await db.sale.create({data:{companyId:company.id,number:"PAY-SALE",requestKey:randomUUID(),customer:"Client RP",sellerId:employee.id,sellerName:"Salarié RP",payment:"Espèces RP",total:20000,createdAt:new Date("2026-01-03T12:00:00Z")}});
    const policy={action:"payroll.policy",target:"ROLE",targetId:role.id,mode:"HOURLY",rate:6000,regularMinutes:60,overtimeBps:12500,commissionBps:1000};
    await t.test("permissions, module activation and foreign tenant are enforced",async()=>{
      await assert.rejects(act(policy,employee),/Gestion RH/);
      await assert.rejects(act(policy,outsider),/inaccessible/);
      await assert.rejects(act({...policy,targetId:(await db.companyRole.findFirstOrThrow({where:{companyId:foreign.id}})).id}),/introuvable/);
      await act({action:"module.toggle",key:"payroll",enabled:false});await assert.rejects(read(),/désactivé/);await assert.rejects(act(policy),/désactivé/);await act({action:"module.toggle",key:"payroll",enabled:true});
    });
    await t.test("periods cannot overlap; command replay creates one period",async()=>{
      const command={action:"payroll.run",label:"Semaine de janvier",from:"2026-01-01",to:"2026-01-07",requestKey:randomUUID()};
      const [a,b]=await Promise.all([act(command),act(command)]);runId=a.id;assert.equal(a.id,b.id);
      await assert.rejects(act({...command,requestKey:randomUUID(),from:"2026-01-07",to:"2026-01-10"}),/chevauche/);
      await assert.rejects(act({...command,label:"Clé réutilisée"}),/Clé/);
      await assert.rejects(act({action:"payroll.run",label:"Période invalide",from:"2026-01-10",to:"2026-01-01"}),/période/);
    });
    await t.test("grade salary uses validated hours, overtime, commissions and adjustments",async()=>{
      await act(policy);
      await assert.rejects(act({action:"payroll.prepare",runId,memberId:member.id,bonus:500,deduction:250,note:""}),/motif/);
      const command={action:"payroll.prepare",runId,memberId:member.id,bonus:500,deduction:250,note:"Prime de qualité RP",requestKey:randomUUID()};
      const [a,b]=await Promise.all([act(command),act(command)]);slipId=a.id;revision=a.revision;assert.equal(a.id,b.id);
      const s=(await read(owner,{slipId})).selected!;assert.equal(s.total,12000);assert.equal(s.workedMinutes,90);assert.equal(s.overtimeAmount,3750);assert.equal(s.commissionAmount,2000);
      assert.equal(await db.payrollTime.count({where:{slipId}}),1);assert.equal((await read(employee)).runCount,0);await assert.rejects(read(employee,{slipId}),/introuvable/);
    });
    await t.test("individual policy overrides the grade, keeps prior calculations and refuses stale revisions",async()=>{
      await act({...policy,target:"MEMBER",targetId:member.id,mode:"FIXED",rate:10000});
      await assert.rejects(act({...policy,target:"MEMBER",targetId:member.id,mode:"FIXED",rate:11000}),/changé/);
      await assert.rejects(act({action:"payroll.review",slipId,revision,decision:"APPROVE",reason:"Validation indépendante"}),/sources/);
      const result=await act({action:"payroll.prepare",runId,memberId:member.id,revision,bonus:500,deduction:250,note:"Forfait RP contrôlé"});revision=result.revision;
      const s=(await read(owner,{slipId})).selected!;assert.equal(s.total,12250);assert.equal(s.overtimeAmount,0);assert.equal(await db.payrollEvent.count({where:{slipId,action:"PREPARE"}}),2);
      await assert.rejects(act({action:"payroll.prepare",runId,memberId:member.id,revision:0,bonus:0,deduction:0,note:""}),/changé/);
    });
    await t.test("own approvals are forbidden and finance permissions do not imply RH management",async()=>{
      const own=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:owner.id}}});
      const slip=await act({action:"payroll.prepare",runId,memberId:own.id,bonus:0,deduction:0,note:""});
      await assert.rejects(act({action:"payroll.review",slipId:slip.id,revision:slip.revision,decision:"APPROVE",reason:"Auto-validation interdite"}),/autre responsable/);
      const approved=await act({action:"payroll.review",slipId,revision,decision:"APPROVE",reason:"Calcul RH contrôlé"});revision=approved.revision;
      const ownRead=await read(employee,{slipId});assert.equal(ownRead.selected!.id,slipId);
      assert.ok(!("times" in ownRead.selected!),"Raw time sources stay in the database, not in the bulletin response");
      assert.ok(ownRead.events.every(event=>!("snapshot" in event)),"Paginated history does not load every calculation snapshot into the browser");
      await assert.rejects(read(reviewer,{slipId:"foreign"}),/introuvable/);
      await assert.rejects(act({action:"time.reopen",entryId:entry.id,revision:1,reason:"Temps déjà réservé"}),/figé/);
      await assert.rejects(act({action:"payroll.pay",slipId,revision,accountId:"not-an-account"},employee),/Gestion RH/);
      await db.companyRole.update({where:{id:managerRole.id},data:{permissions:["employees.manage","employees.read"]}});
      await assert.rejects(act({action:"payroll.pay",slipId,revision,accountId:"not-an-account"},reviewer),/validation des dépenses/);
      await db.companyRole.update({where:{id:managerRole.id},data:{permissions:allPermissions}});
    });
    await t.test("reopening unlocks sources and a canceled sale invalidates an unpaid approval",async()=>{
      const reopened=await act({action:"payroll.review",slipId,revision,decision:"REOPEN",reason:"Vérifier les sources"});revision=reopened.revision;
      await act({action:"time.reopen",entryId:entry.id,revision:1,reason:"Heures recontrôlées"});
      await assert.rejects(act({action:"payroll.review",slipId,revision,decision:"APPROVE",reason:"Contrôle des heures"}),/sources/);
      await act({action:"time.review",entryId:entry.id,revision:2,status:"APPROVED",reason:"Heures confirmées"});
      revision=(await act({action:"payroll.prepare",runId,memberId:member.id,revision,bonus:500,deduction:250,note:"Recalcul contrôlé"})).revision;
      revision=(await act({action:"payroll.review",slipId,revision,decision:"APPROVE",reason:"Nouvelle validation"})).revision;
      await db.sale.update({where:{companyId_number:{companyId:company.id,number:"PAY-SALE"}},data:{status:"CANCELLED"}});
      await assert.rejects(act({action:"payroll.pay",slipId,revision,accountId:"missing"}),/sources/);
      revision=(await act({action:"payroll.review",slipId,revision,decision:"REOPEN",reason:"Vente annulée"})).revision;
      revision=(await act({action:"payroll.prepare",runId,memberId:member.id,revision,bonus:500,deduction:250,note:"Commission corrigée"})).revision;
      revision=(await act({action:"payroll.review",slipId,revision,decision:"APPROVE",reason:"Net RP vérifié"})).revision;
      assert.equal((await read(owner,{slipId})).selected!.total,10250);
    });
    await t.test("insufficient funds roll back; concurrent payment posts only once and enters expenses",async()=>{
      const account=await act({action:"finance.account.save",name:"Banque paie RP",type:"BANK",isDefault:true});
      await assert.rejects(act({action:"payroll.pay",slipId,revision,accountId:account.id}),/insuffisant/);
      assert.equal(await db.financialEntry.count({where:{companyId:company.id,kind:"PAYROLL"}}),0);
      const opening=await act({action:"finance.operation.create",kind:"OPENING",amount:100000,label:"Solde RP",accountId:account.id,occurredAt:"2026-01-01T12:00:00Z"});await act({action:"finance.operation.post",operationId:opening.id});
      const [a,b]=await Promise.all([act({action:"payroll.pay",slipId,revision,accountId:account.id}),act({action:"payroll.pay",slipId,revision,accountId:account.id})]);assert.equal(a.id,b.id);revision=a.revision;
      const entries=await db.financialEntry.findMany({where:{companyId:company.id,kind:"PAYROLL"}});assert.equal(entries.length,1);assert.equal(entries[0].amount,-10250);assert.equal(entries[0].effect,"EXPENSE");
      const finance=await readFinance(owner.id,financeQuery.parse({companyId:company.id,kind:"PAYROLL"}));assert.equal(finance.total,1);
      assert.equal((await read(employee,{slipId})).selected!.status,"PAID");
      await assert.rejects(act({action:"payroll.cancel",runId,reason:"Annulation interdite"}),/versement/);
      await assert.rejects(act({action:"payroll.review",slipId,revision,decision:"REOPEN",reason:"Immuable"}),/immuable/);
      await assert.rejects(act({action:"time.reopen",entryId:entry.id,revision:3,reason:"Après versement"}),/figé/);
      assert.ok(!(JSON.stringify(await db.auditLog.findMany({where:{companyId:company.id,action:{startsWith:"Bulletin"}}}))).includes("Commission corrigée"));
    });
    await t.test("canceling an unpaid period keeps slips and releases its dates",async()=>{
      const next=await act({action:"payroll.run",label:"Période annulable",from:"2026-02-01",to:"2026-02-07"});
      const nextSlip=await act({action:"payroll.prepare",runId:next.id,memberId:member.id,bonus:0,deduction:0,note:""});
      await act({action:"payroll.cancel",runId:next.id,reason:"Période remplacée"});
      assert.equal((await db.payrollSlip.findUniqueOrThrow({where:{id:nextSlip.id}})).status,"CANCELLED");
      assert.ok((await act({action:"payroll.run",label:"Période de remplacement",from:"2026-02-01",to:"2026-02-07"})).id);
      assert.equal(await db.payrollEvent.count({where:{slipId:nextSlip.id,action:"CANCEL"}}),1);
    });
  }finally{
    for(const companyId of companies){await db.financialEntry.updateMany({where:{companyId},data:{reversalOfId:null}});await db.financeReconciliation.deleteMany({where:{companyId}});await db.payrollSlip.deleteMany({where:{companyId}});await db.payrollPolicy.deleteMany({where:{companyId}});await db.company.delete({where:{id:companyId}});}
    await db.user.deleteMany({where:{id:{in:users}}});
    for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});
  }
});
