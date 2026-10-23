import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {readCalendar} from "../src/domains/calendar/queries";
import {calendarQuery} from "../src/domains/calendar/validation";
test("PostgreSQL: shared calendar, private invitations, Paris recurrences and preserved participation",async t=>{
  const prefix=`calendar-${randomUUID()}`,users:string[]=[],companies:string[]=[];
  try{
    const make=async(name:string)=>{const u=await db.user.create({data:{name,email:`${prefix}-${name}@example.test`}});users.push(u.id);return u;};
    const owner=await make("owner"),employee=await make("employee"),peer=await make("peer"),stranger=await make("foreign");
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Garage"}) as {id:string};companies.push(company.id);
    const foreign=await execute(stranger,undefined,{action:"company.create",name:`${prefix}-foreign`,sector:"Garage"}) as {id:string};companies.push(foreign.id);
    const role=await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:false}});
    const member=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:"Invité atelier"}}),other=await db.companyMember.create({data:{companyId:company.id,userId:peer.id,roleId:role.id,characterName:"Autre invité"}});
    const foreignMember=await db.companyMember.findFirstOrThrow({where:{companyId:foreign.id}});
    const act=(payload:Record<string,unknown>,actor=owner)=>execute(actor,company.id,{requestKey:randomUUID(),...payload}) as Promise<{id:string;revision:number;seriesId?:string;count?:number}>;
    const start=new Date(Date.now()+86400000),end=new Date(+start+3600000),day=start.toISOString().slice(0,10);
    const read=(extra:Record<string,unknown>={},actor=owner)=>readCalendar(actor.id,calendarQuery.parse({companyId:company.id,from:day,to:new Date(+start+30*86400000).toISOString().slice(0,10),...extra}));
    const fields={title:"Réunion confidentielle RP",description:"Informations privées du calendrier",location:"Atelier",kind:"MEETING",visibility:"INVITEES",start:start.toISOString(),end:end.toISOString(),memberIds:[member.id]};
    let id="",rev=0,seriesId="",pastId="";
    await t.test("module, read and organizer permissions and foreign participants are enforced",async()=>{
      await assert.rejects(act({action:"calendar.create",...fields},employee),/Administration/);await assert.rejects(read({},stranger),/inaccessible/);await assert.rejects(read({view:"staff"},employee),/organisateurs/);
      await assert.rejects(act({action:"calendar.create",...fields,memberIds:[foreignMember.id]}),/Invité actif/);await assert.rejects(act({action:"calendar.create",...fields,memberIds:[member.id,member.id]}),/distincts/);await assert.rejects(act({action:"calendar.create",...fields,memberIds:[]}),/au moins/);
      await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(act({action:"calendar.create",...fields}),/Invité actif/);await db.companyMember.update({where:{id:member.id},data:{status:"ACTIVE"}});
      await act({action:"module.toggle",key:"calendar",enabled:false});await assert.rejects(read(),/désactivé/);await assert.rejects(act({action:"calendar.create",...fields}),/désactivé/);await act({action:"module.toggle",key:"calendar",enabled:true});
      await assert.rejects(act({action:"calendar.create",...fields,end:fields.start}),/24 heures/);await assert.rejects(act({action:"calendar.create",...fields,occurrences:26,memberIds:Array(50).fill(member.id)}),/500 invitations/);
    });
    await t.test("Paris recurrences preserve local time and reject DST gaps and excess real duration atomically",async()=>{
      const series=await act({action:"calendar.create",...fields,title:"Série heure de Paris",start:"2026-10-20T07:00:00Z",end:"2026-10-20T08:00:00Z",occurrences:3,intervalWeeks:1});seriesId=series.seriesId!;assert.equal(series.count,3);
      const events=await db.calendarEvent.findMany({where:{companyId:company.id,seriesId},orderBy:{start:"asc"}});assert.equal(events[0].start.toISOString(),"2026-10-20T07:00:00.000Z");assert.equal(events[1].start.toISOString(),"2026-10-27T08:00:00.000Z");
      const count=await db.calendarEvent.count({where:{companyId:company.id}});
      await assert.rejects(act({action:"calendar.create",...fields,start:"2026-03-22T01:30:00Z",end:"2026-03-22T02:30:00Z",occurrences:2}),/ambiguë ou inexistante/);
      await assert.rejects(act({action:"calendar.create",...fields,start:"2026-10-17T22:00:00Z",end:"2026-10-18T22:00:00Z",occurrences:2}),/24 heures/);assert.equal(await db.calendarEvent.count({where:{companyId:company.id}}),count);
    });
    await t.test("concurrent create replays once and private events do not leak to peers or workspace",async()=>{
      const payload={action:"calendar.create",...fields,requestKey:randomUUID()};const [a,b]=await Promise.all([act(payload),act(payload)]);assert.deepEqual(a,b);id=a.id;rev=a.revision;
      assert.equal(await db.calendarEvent.count({where:{companyId:company.id,title:fields.title}}),1);assert.equal(await db.notification.count({where:{userId:employee.id,title:"Nouvelle invitation au calendrier"}}),1);
      await assert.rejects(act({...payload,title:"Autre événement"}),/Clé déjà/);assert.equal((await read({id},employee)).selected?.description,fields.description);await assert.rejects(read({id},peer),/introuvable/);assert.equal((await read({q:fields.title},peer)).total,0);
      assert.ok(!JSON.stringify(await getWorkspace(owner.id,company.id)).includes(fields.description));assert.ok(!JSON.stringify(await db.auditLog.findMany({where:{companyId:company.id}})).includes(fields.description));
    });
    await t.test("personal replies use invitation revisions, stay private and reset when a future slot moves",async()=>{
      const own=(await read({id},employee)).selected!.invites[0];const payload={action:"calendar.reply",id,revision:rev,inviteRevision:own.revision,response:"ACCEPTED",note:"Message personnel privé",requestKey:randomUUID()};await Promise.all([act(payload,employee),act(payload,employee)]);
      assert.equal(await db.calendarHistory.count({where:{eventId:id,action:"REPLY"}}),1);await assert.rejects(act({...payload,requestKey:randomUUID()} ,employee),/invitation a changé/);
      await assert.rejects(act({...payload,requestKey:randomUUID()},peer),/introuvable/);
      const shifted={...fields,start:new Date(+start+3600000).toISOString(),end:new Date(+end+3600000).toISOString()};rev=(await act({action:"calendar.update",id,revision:rev,...shifted})).revision;
      const reset=(await read({id},employee)).selected!.invites[0];assert.equal(reset.response,"PENDING");assert.equal(reset.responseNote,"");assert.equal(reset.respondedAt,null);
      await assert.rejects(act({...payload,requestKey:randomUUID()},employee),/événement a changé/);
      await act({action:"calendar.reply",id,revision:rev,inviteRevision:reset.revision,response:"DECLINED",note:"Indisponibilité RP",requestKey:randomUUID()},employee);
      assert.equal((await read({id})).invites[0].response,"DECLINED");assert.ok((await read({id},employee)).events.every(e=>e.action!=="REPLY"&&!("snapshot" in e)));
    });
    await t.test("removed invitees keep their record but lose private access, and shared readers cannot answer for others",async()=>{
      const selected=(await read({id})).selected!;
      const edit={...fields,start:selected.start.toISOString(),end:selected.end.toISOString()};
      rev=(await act({action:"calendar.update",id,revision:rev,...edit,memberIds:[member.id,other.id]})).revision;assert.ok((await read({id},peer)).selected);
      rev=(await act({action:"calendar.update",id,revision:rev,...edit,memberIds:[member.id]})).revision;await assert.rejects(read({id},peer),/introuvable/);assert.equal((await db.calendarInvite.findFirstOrThrow({where:{eventId:id,memberId:other.id}})).active,false);
      rev=(await act({action:"calendar.update",id,revision:rev,...edit,visibility:"ALL"})).revision;
      const publicView=await read({id},peer);assert.equal(publicView.invites.length,0);assert.equal(publicView.choices.length,0);assert.equal(publicView.selected?.invites.length,0);assert.ok(!JSON.stringify(publicView).includes("Indisponibilité RP"));
      await assert.rejects(act({action:"calendar.reply",id,revision:rev,inviteRevision:0,response:"ACCEPTED",note:"Réponse interdite"},peer),/personnelle active/);
    });
    await t.test("attendance is recorded only after the event and never changes time or payroll",async()=>{
      const activeInvite=(await read({id})).invites.find(i=>i.memberId===member.id)!;await assert.rejects(act({action:"calendar.attendance",id,revision:rev,inviteId:activeInvite.id,inviteRevision:activeInvite.revision,attendance:"PRESENT",note:"Trop tôt pour constater"}),/après la fin/);
      const before={time:await db.timeEntry.count({where:{companyId:company.id}}),finance:await db.financialEntry.count({where:{companyId:company.id}})};
      const pastFields={...fields,title:"Réunion RP passée",start:new Date(Date.now()-2*86400000).toISOString(),end:new Date(Date.now()-2*86400000+3600000).toISOString()};pastId=(await act({action:"calendar.create",...pastFields})).id;
      let invitation=(await read({id:pastId})).invites[0];await assert.rejects(act({action:"calendar.reply",id:pastId,revision:0,inviteRevision:0,response:"ACCEPTED",note:"Trop tard"},employee),/réponses sont closes/);
      await act({action:"calendar.attendance",id:pastId,revision:0,inviteId:invitation.id,inviteRevision:0,attendance:"PRESENT",note:"Présence RP constatée"});
      invitation=(await read({id:pastId})).invites[0];await act({action:"calendar.attendance",id:pastId,revision:0,inviteId:invitation.id,inviteRevision:invitation.revision,attendance:"ABSENT",note:"Correction motivée de la participation"});
      assert.equal((await read({id:pastId},employee)).selected?.invites[0].attendance,"ABSENT");await assert.rejects(act({action:"calendar.update",id:pastId,revision:0,...pastFields,visibility:"ALL",memberIds:[]}),/participation constatée/);
      await assert.rejects(act({action:"calendar.update",id:pastId,revision:0,...fields}),/commencé/);assert.deepEqual({time:await db.timeEntry.count({where:{companyId:company.id}}),finance:await db.financialEntry.count({where:{companyId:company.id}})},before);
    });
    await t.test("series cancellation keeps prior occurrences and all invitations, with no repeated notification",async()=>{
      const events=await db.calendarEvent.findMany({where:{companyId:company.id,seriesId},orderBy:{start:"asc"}}),target=events[1];
      const before=await db.calendarInvite.count({where:{companyId:company.id,eventId:{in:events.map(e=>e.id)}}}),notifications=await db.notification.count({where:{userId:employee.id,title:"Annulation dans le calendrier"}});
      const payload={action:"calendar.cancel",id:target.id,revision:0,series:true,seriesRevision:0,reason:"Réorganisation de la série RP",requestKey:randomUUID()};const a=await act(payload);assert.equal(a.count,2);assert.deepEqual(await act(payload),a);
      assert.equal((await db.calendarEvent.findUniqueOrThrow({where:{id:events[0].id}})).status,"SCHEDULED");assert.equal(await db.calendarEvent.count({where:{companyId:company.id,seriesId,status:"CANCELLED"}}),2);
      assert.equal(await db.calendarInvite.count({where:{companyId:company.id,eventId:{in:events.map(e=>e.id)}}}),before);assert.equal(await db.notification.count({where:{userId:employee.id,title:"Annulation dans le calendrier"}}),notifications+1);
      await assert.rejects(act({action:"calendar.reply",id:target.id,revision:a.revision,inviteRevision:0,response:"ACCEPTED",note:"Refusé"},employee),/annulé/);
    });
    await t.test("server pagination, grid limits, Paris day boundaries and history privacy remain consistent",async()=>{
      await db.calendarEvent.createMany({data:Array.from({length:27},(_,i)=>({companyId:company.id,title:`Pagination calendrier ${i}`,description:"Fixture",visibility:"ALL",start,end,createdBy:owner.id}))});
      const page=await read({q:"Pagination calendrier",page:2});assert.equal(page.total,27);assert.equal(page.rows.length,2);
      await db.calendarEvent.createMany({data:Array.from({length:501},(_,i)=>({companyId:company.id,title:`Limite grille ${i}`,visibility:"ALL",start,end,createdBy:owner.id}))});
      await assert.rejects(read({view:"grid",q:"Limite grille"}),/500 événements/);assert.equal((await read({view:"agenda",q:"Limite grille",page:21})).rows.length,1);
      await db.calendarEvent.create({data:{companyId:company.id,title:"Borne Paris",visibility:"ALL",start:new Date("2026-01-31T23:30:00Z"),end:new Date("2026-02-01T00:30:00Z"),createdBy:owner.id}});
      assert.equal((await read({q:"Borne Paris",from:"2026-02-01",to:"2026-02-01"},peer)).total,1);assert.equal((await read({q:"Borne Paris",from:"2026-01-31",to:"2026-01-31"},peer)).total,0);
      await db.calendarHistory.createMany({data:Array.from({length:26},(_,i)=>({companyId:company.id,eventId:id,actorId:owner.id,actorName:owner.name,action:"UPDATE",reason:`Historique ${i}`,snapshot:{secret:"raw-calendar-snapshot"}}))});
      const events=await read({id,eventPage:2},peer);assert.equal(events.events.length,events.eventCount-25);assert.ok(!JSON.stringify(events).includes("raw-calendar-snapshot"));assert.equal((await read({view:"staff",q:"atelier"})).staffCount,1);
    });
    await t.test("concurrent cancellation uses event revisions and inactive members cannot read or respond",async()=>{
      const results=await Promise.allSettled([act({action:"calendar.cancel",id,revision:rev,reason:"Annulation concurrente A"}),act({action:"calendar.cancel",id,revision:rev,reason:"Annulation concurrente B"})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(read({},employee),/inaccessible/);await assert.rejects(act({action:"calendar.reply",id,revision:rev,inviteRevision:0,response:"DECLINED",note:"Refusé"},employee),/inaccessible/);
    });
  }finally{
    await db.calendarEvent.deleteMany({where:{companyId:{in:companies}}});await db.calendarSeries.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});
