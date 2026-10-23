import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {readPlanning,readLeaves} from "../src/domains/planning/queries";
import {planningQuery,leavesQuery} from "../src/domains/planning/validation";
import {recurringDates} from "../src/domains/planning/recurrence";

test("PostgreSQL: planning recurrence, availability and absence conflicts",async t=>{
  const prefix=`planning-${randomUUID()}`,companies:string[]=[],users:string[]=[];
  try{
    const owner=await db.user.create({data:{name:"Direction planning",email:`${prefix}@example.test`}});users.push(owner.id);
    const employee=await db.user.create({data:{name:"Employé planning",email:`${prefix}-employee@example.test`}});users.push(employee.id);
    const reviewer=await db.user.create({data:{name:"Responsable absences",email:`${prefix}-reviewer@example.test`}});users.push(reviewer.id);
    const other=await db.user.create({data:{name:"Autre entreprise",email:`${prefix}-other@example.test`}});users.push(other.id);
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Services"}) as {id:string};companies.push(company.id);
    const foreign=await execute(other,undefined,{action:"company.create",name:`${prefix}-other`,sector:"Services"}) as {id:string};companies.push(foreign.id);
    const role=await db.companyRole.create({data:{companyId:company.id,name:"Employé planning",permissions:["planning.read","leaves.read"]}});
    const reviewRole=await db.companyRole.create({data:{companyId:company.id,name:"Absences sans planning",permissions:["leaves.read","leaves.manage"]}});
    const member=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:"Employé RP"}});
    await db.companyMember.create({data:{companyId:company.id,userId:reviewer.id,roleId:reviewRole.id,characterName:"Responsable RP"}});
    const ownerMember=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:owner.id}}});
    const act=(actor:typeof owner,payload:Record<string,unknown>)=>execute(actor,company.id,payload) as Promise<{id:string;revision:number}>;
    const planning=(actor:typeof owner,from:string,to:string)=>readPlanning(actor.id,planningQuery.parse({companyId:company.id,from,to}));
    const repeat={action:"shift.repeat",requestKey:randomUUID(),memberId:member.id,title:"Service récurrent",start:"2027-03-21T17:00:00Z",end:"2027-03-21T19:00:00Z",occurrences:3,intervalWeeks:1};let seriesId="";
    await t.test("Paris recurrence preserves wall time across DST and rejects gaps and ambiguity",async()=>{
      const dates=recurringDates(repeat.start,repeat.end,3,1);assert.deepEqual(dates.map(d=>d.start.toISOString()),["2027-03-21T17:00:00.000Z","2027-03-28T16:00:00.000Z","2027-04-04T16:00:00.000Z"]);
      assert.throws(()=>recurringDates("2027-03-21T01:30:00Z","2027-03-21T02:30:00Z",2,1),/ambiguë ou inexistante/);
      assert.throws(()=>recurringDates("2027-10-24T00:30:00Z","2027-10-24T03:30:00Z",2,1),/ambiguë ou inexistante/);
      const [a,b]=await Promise.all([act(owner,repeat),act(owner,repeat)]);seriesId=a.id;assert.equal(a.id,b.id);assert.equal(await db.shift.count({where:{seriesId}}),3);
      await assert.rejects(act(owner,{...repeat,occurrences:4}),/clé/);
    });
    await t.test("one conflicting occurrence rolls back the entire series",async()=>{
      await act(owner,{action:"shift.create",memberId:member.id,title:"Service existant",start:"2027-05-09T16:00:00Z",end:"2027-05-09T18:00:00Z"});
      const count=await db.shift.count({where:{companyId:company.id}}),series=await db.shiftSeries.count({where:{companyId:company.id}});
      await assert.rejects(act(owner,{...repeat,requestKey:randomUUID(),start:"2027-05-02T16:00:00Z",end:"2027-05-02T18:00:00Z"}),/chevauche/);
      assert.equal(await db.shift.count({where:{companyId:company.id}}),count);assert.equal(await db.shiftSeries.count({where:{companyId:company.id}}),series);
    });
    await t.test("single and future series cancellations retain rows and reject stale edits",async()=>{
      const shifts=await db.shift.findMany({where:{seriesId},orderBy:{start:"asc"}});
      const command={action:"shift.cancel",requestKey:randomUUID(),shiftId:shifts[1].id,revision:0,reason:"Indisponibilité signalée"};await act(owner,command);await act(owner,command);
      await assert.rejects(act(owner,{action:"shift.update",shiftId:shifts[1].id,memberId:member.id,title:"Interdit",start:shifts[1].start.toISOString(),end:shifts[1].end.toISOString()}),/introuvable/);
      await act(owner,{action:"shift.series.cancel",requestKey:randomUUID(),seriesId,from:"2027-03-29T00:00:00Z",reason:"Fin des services réguliers"});
      assert.equal(await db.shift.count({where:{seriesId}}),3);assert.equal(await db.shift.count({where:{seriesId,status:"CANCELLED"}}),2);
      assert.equal((await planning(owner,"2027-03-01T00:00:00Z","2027-04-10T00:00:00Z")).shifts.length,1);
    });
    await t.test("availability is private to self and planners and blocks conflicting assignment",async()=>{
      const payload={action:"availability.save",requestKey:randomUUID(),memberId:member.id,kind:"UNAVAILABLE",start:"2027-06-01T08:00:00Z",end:"2027-06-01T10:00:00Z",notes:"Note privée de disponibilité"};const availability=await act(employee,payload);await act(employee,payload);
      await assert.rejects(act(employee,{...payload,requestKey:randomUUID(),memberId:ownerMember.id}),/seulement/);
      await assert.rejects(act(owner,{action:"shift.create",memberId:member.id,title:"Conflit",start:"2027-06-01T09:00:00Z",end:"2027-06-01T11:00:00Z"}),/indisponibilité/);
      await assert.rejects(act(employee,{...payload,requestKey:randomUUID(),availabilityId:availability.id,revision:2}),/changé/);
      const own=await planning(employee,"2027-06-01T00:00:00Z","2027-06-02T00:00:00Z");assert.equal(own.availabilities.length,1);assert.equal(own.availabilities[0].notes,payload.notes);
      const audit=await db.auditLog.findMany({where:{companyId:company.id}});assert.ok(!JSON.stringify(audit).includes(payload.notes));
      await act(employee,{action:"availability.cancel",requestKey:randomUUID(),availabilityId:availability.id,revision:0,reason:"Disponibilité modifiée"});assert.equal((await planning(employee,"2027-06-01T00:00:00Z","2027-06-02T00:00:00Z")).availabilities.length,0);
    });
    await t.test("absence type snapshots survive renaming and archiving",async()=>{
      const type=await act(owner,{action:"leave.type.save",requestKey:randomUUID(),code:"CONGE",name:"Congé RP"});
      const payload={action:"leave.create",requestKey:randomUUID(),typeId:type.id,start:"2027-07-01T08:00:00Z",end:"2027-07-01T12:00:00Z",reason:"Motif privé de congé"};const leave=await act(employee,payload);await act(employee,payload);
      await assert.rejects(act(employee,{...payload,requestKey:randomUUID()}),/chevauche/);
      await act(owner,{action:"leave.type.save",requestKey:randomUUID(),typeId:type.id,code:"CONGE",name:"Congé renommé",archived:true});assert.equal((await db.leaveRequest.findUniqueOrThrow({where:{id:leave.id}})).typeName,"Congé RP");
      await assert.rejects(act(employee,{...payload,requestKey:randomUUID(),start:"2027-08-10T08:00:00Z",end:"2027-08-10T12:00:00Z"}),/actif introuvable/);
      assert.equal(await db.leaveRequest.count({where:{companyId:company.id,memberId:member.id}}),1);
    });
    await t.test("approval cancels conflicting shifts only with explicit confirmation and planning rights",async()=>{
      const leave=await db.leaveRequest.findFirstOrThrow({where:{companyId:company.id,memberId:member.id}});
      const shift=await act(owner,{action:"shift.create",memberId:member.id,title:"Service à déplacer",start:"2027-07-01T09:00:00Z",end:"2027-07-01T11:00:00Z"});
      const pending=await readLeaves(employee.id,leavesQuery.parse({companyId:company.id,status:"PENDING"}));assert.equal(pending.rows.find(row=>row.id===leave.id)?.conflicts,1);
      const decision={action:"leave.decide",requestKey:randomUUID(),leaveId:leave.id,revision:0,approve:true,reason:"Congé autorisé"};
      await assert.rejects(act(reviewer,decision),/Confirmez/);await assert.rejects(act(reviewer,{...decision,cancelConflictingShifts:true}),/insuffisant/);
      assert.equal((await db.shift.findUniqueOrThrow({where:{id:shift.id}})).status,"SCHEDULED");assert.equal((await db.leaveRequest.findUniqueOrThrow({where:{id:leave.id}})).status,"PENDING");
      const [a,b]=await Promise.all([act(owner,{...decision,cancelConflictingShifts:true}),act(owner,{...decision,cancelConflictingShifts:true})]);assert.equal(a.id,b.id);
      assert.equal((await db.shift.findUniqueOrThrow({where:{id:shift.id}})).status,"CANCELLED");assert.equal((await db.leaveRequest.findUniqueOrThrow({where:{id:leave.id}})).status,"APPROVED");
      await act(employee,{action:"leave.cancel",requestKey:randomUUID(),leaveId:leave.id,revision:1,reason:"Congé finalement retiré"});assert.equal((await db.shift.findUniqueOrThrow({where:{id:shift.id}})).status,"CANCELLED");
    });
    await t.test("self approval and cross-tenant operations remain forbidden",async()=>{
      const own=await act(owner,{action:"leave.create",requestKey:randomUUID(),start:"2027-08-04T08:00:00Z",end:"2027-08-04T12:00:00Z",reason:"Motif privé direction"});
      await assert.rejects(act(owner,{action:"leave.decide",leaveId:own.id,approve:true,reason:"Auto validation"}),/autre responsable/);
      await assert.rejects(act(employee,{action:"leave.cancel",requestKey:randomUUID(),leaveId:own.id,revision:0,reason:"Interdit"}),/privée/);
      await assert.rejects(execute(other,foreign.id,{action:"shift.cancel",requestKey:randomUUID(),shiftId:(await db.shift.findFirstOrThrow({where:{companyId:company.id}})).id,revision:0,reason:"Interdit"}),/introuvable/);
      await act(reviewer,{action:"leave.decide",leaveId:own.id,approve:true,reason:"Accord direction"});
      const privateCalendar=await planning(employee,"2027-08-01T00:00:00Z","2027-09-01T00:00:00Z");assert.equal(privateCalendar.leaves.length,0);
      assert.ok(!JSON.stringify(await planning(owner,"2027-08-01T00:00:00Z","2027-09-01T00:00:00Z")).includes("Motif privé direction"));
    });
    await t.test("server pagination, calendar selection and module guards preserve privacy",async()=>{
      await db.leaveRequest.createMany({data:Array.from({length:30},(_,i)=>({companyId:company.id,memberId:member.id,start:new Date(Date.UTC(2027,8,i+1,8)),end:new Date(Date.UTC(2027,8,i+1,9)),reason:"Demande de pagination"}))});
      const first=await readLeaves(employee.id,leavesQuery.parse({companyId:company.id,status:"PENDING"}));assert.equal(first.total,30);assert.equal(first.rows.length,25);
      const second=await readLeaves(employee.id,leavesQuery.parse({companyId:company.id,status:"PENDING",page:2}));assert.equal(second.rows.length,5);
      const calendar=await readLeaves(employee.id,leavesQuery.parse({companyId:company.id,view:"calendar",from:"2027-09-01",to:"2027-09-30"}));assert.equal(calendar.rows.length,30);
      await assert.rejects(readLeaves(employee.id,leavesQuery.parse({companyId:company.id,memberId:ownerMember.id})),/privées/);
      await assert.rejects(readPlanning(other.id,planningQuery.parse({companyId:company.id,from:"2027-09-01T00:00:00Z",to:"2027-09-30T00:00:00Z"})),/inaccessible/);
      await act(owner,{action:"module.toggle",key:"leaves",enabled:false});await assert.rejects(readLeaves(employee.id,leavesQuery.parse({companyId:company.id})),/désactivé/);await act(owner,{action:"module.toggle",key:"leaves",enabled:true});
    });
  }finally{
    await db.memberAvailability.deleteMany({where:{companyId:{in:companies}}});await db.shift.deleteMany({where:{companyId:{in:companies}}});await db.leaveRequest.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});

