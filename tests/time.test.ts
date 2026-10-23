import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readTime,timeReport} from "../src/domains/time/queries";
import {timeQuery} from "../src/domains/time/validation";
import {getEmployeeDossier} from "../src/domains/hr/service";

test("PostgreSQL: time pauses, immutable corrections and independent approvals",async t=>{
  const prefix=`time-${randomUUID()}`,companies:string[]=[],users:string[]=[];
  try{
    const owner=await db.user.create({data:{name:"Direction temps",email:`${prefix}@example.test`}});users.push(owner.id);
    const employee=await db.user.create({data:{name:"Employé temps",email:`${prefix}-employee@example.test`}});users.push(employee.id);
    const other=await db.user.create({data:{name:"Autre temps",email:`${prefix}-other@example.test`}});users.push(other.id);
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Services"}) as {id:string};companies.push(company.id);
    const foreign=await execute(other,undefined,{action:"company.create",name:`${prefix}-other`,sector:"Services"}) as {id:string};companies.push(foreign.id);
    const role=await db.companyRole.create({data:{companyId:company.id,name:"Employé pointage",permissions:["time.use","employees.read"]}});
    const member=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:"Employé RP"}});
    const act=(actor:typeof owner,payload:Record<string,unknown>)=>execute(actor,company.id,payload) as Promise<{id:string;revision:number}>;
    const read=(actor=owner,extra:Record<string,unknown>={})=>readTime(actor.id,timeQuery.parse({companyId:company.id,...extra}));
    const startPayload={action:"time.start",requestKey:randomUUID()};let entryId="",revision=0;
    await t.test("explicit start replays once and cannot start another concurrent service",async()=>{
      const [a,b]=await Promise.all([act(employee,startPayload),act(employee,startPayload)]);entryId=a.id;revision=a.revision;assert.equal(a.id,b.id);
      await assert.rejects(act(employee,{...startPayload,requestKey:randomUUID()}),/déjà en cours/);
      assert.equal(await db.timeEntry.count({where:{companyId:company.id,memberId:member.id,end:null}}),1);
    });
    await t.test("pauses and stopping during a pause produce net minutes without duplication",async()=>{
      const now=Date.now();await db.timeEntry.update({where:{id:entryId},data:{start:new Date(now-90*60000)}});
      const pause={action:"time.pause",entryId,revision,paused:true,requestKey:randomUUID()};const [a,b]=await Promise.all([act(employee,pause),act(employee,pause)]);revision=a.revision;assert.equal(a.revision,b.revision);assert.equal(await db.timePause.count({where:{entryId}}),1);
      await assert.rejects(act(employee,{...pause,requestKey:randomUUID()}),/changé/);
      await db.timePause.updateMany({where:{entryId,end:null},data:{start:new Date(now-10*60000)}});
      assert.equal((await read(employee)).active?.paused,true);
      const stop={action:"time.stop",entryId,revision,requestKey:randomUUID()};const result=await act(employee,stop);revision=result.revision;await act(employee,stop);
      assert.equal(await db.timePause.count({where:{entryId,end:null}}),0);assert.equal((await read(employee)).active,null);
      const row=(await read(employee)).rows.find(r=>r.id===entryId)!;assert.equal(row.minutes,80);assert.equal(row.pauseMinutes,10);
    });
    await t.test("manager correction keeps the original record and rejects invalid ranges",async()=>{
      const original=await db.timeEntry.findUniqueOrThrow({where:{id:entryId}});
      const correction={action:"time.correct",entryId,revision,requestKey:randomUUID(),start:"2026-01-03T08:00:00Z",end:"2026-01-03T10:00:00Z",pauseMinutes:30,reason:"Horaires RP contrôlés"};
      await assert.rejects(act(employee,correction),/responsable/);
      await assert.rejects(act(owner,{...correction,end:"2026-01-03T07:00:00Z"}),/invalides/);await assert.rejects(act(owner,{...correction,pauseMinutes:121}),/invalides/);
      await assert.rejects(act(owner,{...correction,end:"2099-01-03T10:00:00Z"}),/invalides/);
      const result=await act(owner,correction);revision=result.revision;await act(owner,correction);
      const after=await db.timeEntry.findUniqueOrThrow({where:{id:entryId}});assert.deepEqual(after.start,original.start);assert.deepEqual(after.end,original.end);
      assert.equal(await db.timeCorrection.count({where:{entryId}}),1);
      const row=(await read(employee)).rows.find(r=>r.id===entryId)!;assert.equal(row.minutes,90);assert.equal(row.corrected,true);
      const dossier=await getEmployeeDossier(owner.id,company.id,member.id);assert.equal(dossier.stats?.minutes,90);assert.equal(dossier.timeEntries[0].minutes,90);
    });
    await t.test("approval freezes the reviewed version and cannot be performed on oneself",async()=>{
      const payload={action:"time.review",entryId,revision,requestKey:randomUUID(),status:"APPROVED",reason:"Heures vérifiées"};
      const [a,b]=await Promise.all([act(owner,payload),act(owner,payload)]);revision=a.revision;assert.equal(a.revision,b.revision);
      assert.equal(await db.timeReview.count({where:{entryId}}),1);assert.equal((await db.timeReview.findFirstOrThrow({where:{entryId}})).workedMinutes,90);
      await assert.rejects(act(owner,{action:"time.correct",entryId,revision,requestKey:randomUUID(),start:"2026-01-03T08:00:00Z",end:"2026-01-03T10:00:00Z",pauseMinutes:0,reason:"Modification bloquée"}),/Rouvrez/);
      const own=await act(owner,{action:"time.start",requestKey:randomUUID()});const ended=await act(owner,{action:"time.stop",entryId:own.id,revision:own.revision,requestKey:randomUUID()});
      await assert.rejects(act(owner,{...payload,entryId:own.id,revision:ended.revision,requestKey:randomUUID()}),/autre responsable/);
      assert.equal((await read(employee)).summary.approvedMinutes,90);
    });
    await t.test("reopening, overlap validation, rejection and correction retain every decision",async()=>{
      revision=(await act(owner,{action:"time.reopen",entryId,revision,requestKey:randomUUID(),reason:"Nouveau contrôle demandé"})).revision;
      assert.equal((await read(employee)).rows.find(r=>r.id===entryId)?.status,"PENDING");assert.equal(await db.timeReview.count({where:{entryId}}),1);
      await db.timeEntry.create({data:{companyId:company.id,memberId:member.id,start:new Date("2026-01-03T11:00:00Z"),end:new Date("2026-01-03T11:30:00Z")}});
      const correction={action:"time.correct",entryId,revision,requestKey:randomUUID(),start:"2026-01-03T08:00:00Z",end:"2026-01-03T12:00:00Z",pauseMinutes:15,reason:"Correction après contrôle"};
      await assert.rejects(act(owner,correction),/chevauchent/);
      revision=(await act(owner,{...correction,end:"2026-01-03T10:00:00Z"})).revision;
      revision=(await act(owner,{action:"time.review",entryId,revision,requestKey:randomUUID(),status:"REJECTED",reason:"Pièce de contrôle manquante"})).revision;
      assert.equal((await read(employee)).rows.find(r=>r.id===entryId)?.status,"REJECTED");assert.equal((await read(employee)).summary.approvedMinutes,0);
      revision=(await act(owner,{...correction,end:"2026-01-03T10:00:00Z",pauseMinutes:0,revision,requestKey:randomUUID()})).revision;
      revision=(await act(owner,{action:"time.review",entryId,revision,requestKey:randomUUID(),status:"APPROVED",reason:"Correction vérifiée"})).revision;
      const result=await read(employee,{from:"2026-01-03",to:"2026-01-03"});assert.equal(result.summary.minutes,150);assert.equal(result.summary.approvedMinutes,120);assert.equal(result.summary.pending,1);
      assert.equal(await db.timeReview.count({where:{entryId}}),3);assert.equal(await db.timeCorrection.count({where:{entryId}}),3);
    });
    await t.test("only responsible managers can close another employee's active service with a reason",async()=>{
      const active=await act(employee,{action:"time.start",requestKey:randomUUID()});
      await assert.rejects(act(owner,{action:"time.pause",entryId:active.id,revision:active.revision,requestKey:randomUUID(),paused:true}),/propres pauses/);
      await assert.rejects(act(owner,{action:"time.stop",entryId:active.id,revision:active.revision,requestKey:randomUUID()}),/motif/);
      await act(owner,{action:"time.stop",entryId:active.id,revision:active.revision,requestKey:randomUUID(),reason:"Oubli de fin de service signalé"});assert.equal((await read(employee)).active,null);
    });
    await t.test("time data is private, tenant-scoped, paginated and unavailable when disabled",async()=>{
      const ownerMember=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:owner.id}}});
      await assert.rejects(read(employee,{memberId:ownerMember.id}),/privées/);
      await assert.rejects(readTime(other.id,timeQuery.parse({companyId:company.id})),/inaccessible/);
      await assert.rejects(execute(other,foreign.id,{action:"time.review",entryId,revision,requestKey:randomUUID(),status:"APPROVED",reason:"Interdit"}),/introuvable/);
      await db.timeEntry.createMany({data:Array.from({length:30},(_,i)=>({companyId:company.id,memberId:member.id,start:new Date(Date.UTC(2026,1,i+1,8)),end:new Date(Date.UTC(2026,1,i+1,9))}))});
      const result=await read(employee);assert.equal(result.rows.length,25);assert.equal(result.total,33);assert.equal((await read(employee,{page:2})).rows.length,8);
      const report=await timeReport(employee.id,timeQuery.parse({companyId:company.id,page:2}),10000);assert.equal(report.rows.length,33);assert.ok(report.rows.every(r=>r.memberId===member.id));
      await assert.rejects(timeReport(employee.id,timeQuery.parse({companyId:company.id,memberId:ownerMember.id}),10000),/privées/);
      await assert.rejects(timeReport(employee.id,timeQuery.parse({companyId:company.id}),25),/réduisez/);
      const management=await read(owner,{from:"2026-01-03",to:"2026-01-03"});assert.equal(management.departments[0].minutes,150);assert.equal(management.departments[0].approvedMinutes,120);assert.deepEqual((await read(employee)).departments,[]);
      await act(owner,{action:"module.toggle",key:"time",enabled:false});await assert.rejects(read(employee),/désactivé/);await assert.rejects(act(employee,{action:"time.start",requestKey:randomUUID()}),/désactivé/);await act(owner,{action:"module.toggle",key:"time",enabled:true});
    });
  }finally{
    await db.timeEntry.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});
