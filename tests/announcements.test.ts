import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {readAnnouncements} from "../src/domains/announcements/queries";
import {announcementQuery} from "../src/domains/announcements/validation";
test("PostgreSQL: private drafts, targeted publications, dated visibility and confirmed reads",async t=>{
  const prefix=`announcements-${randomUUID()}`,users:string[]=[],companies:string[]=[];
  try{
    const make=async(name:string)=>{const u=await db.user.create({data:{name,email:`${prefix}-${name}@example.test`}});users.push(u.id);return u;};
    const owner=await make("owner"),employee=await make("atelier"),office=await make("office"),stranger=await make("stranger");
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Garage"}) as {id:string};companies.push(company.id);
    const foreign=await execute(stranger,undefined,{action:"company.create",name:`${prefix}-foreign`,sector:"Services"}) as {id:string};companies.push(foreign.id);
    const role=await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:false}});
    const member=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:"Alex Atelier",department:"Atelier"}});
    const peer=await db.companyMember.create({data:{companyId:company.id,userId:office.id,roleId:role.id,characterName:"Charlie Bureau",department:"Bureau"}});
    const act=(payload:Record<string,unknown>,actor=owner)=>execute(actor,company.id,{requestKey:randomUUID(),...payload}) as Promise<{id:string;revision:number;readAt?:string}>;
    const read=(extra:Record<string,unknown>={},actor=owner,now?:Date)=>readAnnouncements(actor.id,announcementQuery.parse({companyId:company.id,...extra}),now);
    const content={action:"announcement.save",title:"Consignes atelier RP",body:"Consignes RP départementales à conserver.",priority:"HIGH",scope:"DEPARTMENT",department:"Atelier"};
    let id="",rev=0,generalId="",scheduledId="",scheduledRevision=0;const future=new Date(Date.now()+3600000),expiry=new Date(+future+3600000);
    await t.test("drafts and department directories are restricted; foreign and disabled access is refused",async()=>{
      await assert.rejects(act(content,employee),/Administration/);await assert.rejects(read({},stranger),/inaccessible/);await assert.rejects(read({view:"drafts"},employee),/direction/);await assert.rejects(read({view:"departments"},employee),/direction/);
      await assert.rejects(act({...content,department:"Département étranger"}),/Département actif/);await assert.rejects(act({...content,scope:"ALL"}),/générale/);
      const noRead=await db.companyRole.create({data:{companyId:company.id,name:"Sans lecture",permissions:[]}});await db.companyMember.update({where:{id:peer.id},data:{roleId:noRead.id}});await assert.rejects(read({},office),/Lecture/);await db.companyMember.update({where:{id:peer.id},data:{roleId:role.id}});
      await act({action:"module.toggle",key:"announcements",enabled:false});await assert.rejects(read(),/désactivé/);await assert.rejects(act(content),/désactivé/);await act({action:"module.toggle",key:"announcements",enabled:true});
      const draft=await act(content);id=draft.id;rev=draft.revision;assert.equal((await read({view:"drafts"})).total,1);await assert.rejects(read({id},employee),/introuvable/);await assert.rejects(read({id},office),/introuvable/);
      const foreignDraft=await execute(stranger,foreign.id,{...content,scope:"ALL",department:null,requestKey:randomUUID()}) as {id:string};await assert.rejects(act({...content,id:foreignDraft.id,revision:0}),/introuvable/);
    });
    await t.test("draft revisions protect content and generic audit never contains the announcement text",async()=>{
      rev=(await act({...content,id,revision:rev,body:"Texte final RP <script>reste du texte</script>"})).revision;
      await assert.rejects(act({...content,id,revision:rev-1}),/changé/);
      const audit=await db.auditLog.findMany({where:{companyId:company.id,entityId:id}});assert.ok(!JSON.stringify(audit).includes("Texte final RP"));
      const workspace=await getWorkspace(owner.id,company.id);assert.ok(!JSON.stringify(workspace).includes("Texte final RP"));
    });
    await t.test("concurrent publication replay sends exactly one targeted internal notification",async()=>{
      const payload={action:"announcement.publish",id,revision:rev,requestKey:randomUUID()};const [a,b]=await Promise.all([act(payload),act(payload)]);assert.deepEqual(a,b);rev=a.revision;
      assert.equal(await db.notification.count({where:{userId:employee.id,title:"Nouvelle annonce interne"}}),1);assert.equal(await db.notification.count({where:{userId:office.id,title:"Nouvelle annonce interne"}}),0);assert.equal(await db.announcementEvent.count({where:{announcementId:id,action:"PUBLISH"}}),1);
      await assert.rejects(act({...payload,expiresAt:new Date(Date.now()+60000).toISOString()}),/Clé déjà/);
      const own=await read({id},employee);assert.equal(own.selected?.body,"Texte final RP <script>reste du texte</script>");assert.ok(own.events.every(e=>!("snapshot" in e)));assert.ok(own.events.every(e=>!["CREATE","UPDATE"].includes(e.action)));
      await assert.rejects(read({id},office),/introuvable/);assert.equal((await read({q:"Texte final RP"},office)).total,0);await assert.rejects(act({action:"announcement.read",id},office),/introuvable/);
      await assert.rejects(act({...content,id,revision:rev,body:"Réécriture interdite"}),/brouillon/);
    });
    await t.test("read confirmations preserve their original time and remain private to each reader and the direction",async()=>{
      const payload={action:"announcement.read",id,requestKey:randomUUID()};const [a,b]=await Promise.all([act(payload,employee),act(payload,employee)]);assert.deepEqual(a,b);const again=await act({action:"announcement.read",id},employee);assert.equal(again.readAt,a.readAt);
      assert.equal(await db.announcementRead.count({where:{announcementId:id}}),1);assert.equal((await read({id})).readers[0].memberName,"Alex Atelier");
      const personal=await read({id},employee);assert.equal(personal.readers.length,0);assert.equal(personal.readCount,0);assert.equal(personal.selected?.reads.length,1);assert.equal((await read({unread:"true"},employee)).total,0);
      await db.companyMember.update({where:{id:member.id},data:{department:"Bureau"}});await assert.rejects(read({id},employee),/introuvable/);await db.companyMember.update({where:{id:member.id},data:{department:"Atelier"}});
    });
    await t.test("pinning, archiving and restoration retain the published text and receipt",async()=>{
      rev=(await act({action:"announcement.pin",id,revision:rev,pinned:true})).revision;assert.equal((await read()).rows[0].pinned,true);
      rev=(await act({action:"announcement.transition",id,revision:rev,decision:"ARCHIVE",reason:"Conserver les consignes RP"})).revision;
      assert.equal((await read({},employee)).total,0);assert.equal((await read({view:"archives"},employee)).total,1);assert.equal((await read({id},employee)).selected?.reads.length,1);
      rev=(await act({action:"announcement.transition",id,revision:rev,decision:"RESTORE",reason:"Rendre les consignes visibles"})).revision;assert.equal((await read({},employee)).total,1);
      assert.equal((await read({id},employee)).selected?.body,"Texte final RP <script>reste du texte</script>");
      await assert.rejects(act({action:"announcement.transition",id,revision:rev,decision:"UNSCHEDULE",reason:"Tentative de réécriture"}),/future/);
    });
    await t.test("scheduled publications are private until the real SQL visibility boundary and expire into archives",async()=>{
      const draft=await act({...content,scope:"ALL",department:null,title:"Réunion RP programmée"});scheduledId=draft.id;
      const initialNotifications=await db.notification.count({where:{userId:employee.id}});
      await assert.rejects(act({action:"announcement.publish",id:scheduledId,revision:0,startsAt:future.toISOString(),expiresAt:future.toISOString()}),/expiration/);
      scheduledRevision=(await act({action:"announcement.publish",id:scheduledId,revision:0,startsAt:future.toISOString(),expiresAt:expiry.toISOString()})).revision;
      assert.equal((await read({view:"scheduled"})).total,1);await assert.rejects(read({id:scheduledId},employee),/introuvable/);await assert.rejects(act({action:"announcement.read",id:scheduledId}),/encore publiée/);assert.equal(await db.notification.count({where:{userId:employee.id}}),initialNotifications);
      const live=await read({id:scheduledId,q:"programmée"},employee,new Date(+future+1));assert.equal(live.total,1);assert.equal(live.selected?.title,"Réunion RP programmée");
      assert.equal((await read({q:"programmée"},employee,expiry)).total,0);assert.equal((await read({q:"programmée",view:"archives"},employee,expiry)).total,1);
      scheduledRevision=(await act({action:"announcement.transition",id:scheduledId,revision:scheduledRevision,decision:"UNSCHEDULE",reason:"Corriger la réunion avant diffusion"})).revision;
      const edit=await act({...content,id:scheduledId,revision:scheduledRevision,scope:"ALL",department:null,title:"Réunion RP corrigée"});scheduledRevision=edit.revision;assert.equal((await read({id:scheduledId})).selected?.startsAt,null);
    });
    await t.test("general announcements reach both departments without exposing their bodies in notifications",async()=>{
      const draft=await act({...content,scope:"ALL",department:null,title:"Consignes générales RP",body:"Texte général confidentiel à l’entreprise"});generalId=draft.id;await act({action:"announcement.publish",id:generalId,revision:0});
      assert.equal((await read({id:generalId},employee)).selected?.scope,"ALL");assert.equal((await read({id:generalId},office)).selected?.scope,"ALL");
      assert.ok(!(JSON.stringify(await db.notification.findMany({where:{userId:office.id}}))).includes("Texte général confidentiel"));
      const departments=await read({view:"departments",q:"Atelier"});assert.equal(departments.departmentCount,1);assert.equal(departments.departments[0].department,"Atelier");
      const pattern=await read({view:"departments",q:"At%"});assert.equal(pattern.departmentCount,pattern.departments.length);assert.equal(pattern.departmentCount,1);
    });
    await t.test("feed, read receipts and event histories paginate with stable counters",async()=>{
      const ownerMember=await db.companyMember.findFirstOrThrow({where:{companyId:company.id,userId:owner.id}});
      await db.announcement.createMany({data:Array.from({length:27},(_,i)=>({companyId:company.id,title:`Pagination annonces ${i}`,body:"Texte de fixture",createdBy:owner.id,authorName:owner.name,status:"PUBLISHED",publishedAt:new Date(),startsAt:new Date(),scope:"ALL"}))});
      const list=await read({q:"Pagination annonces",page:2});assert.equal(list.total,27);assert.equal(list.rows.length,2);
      await db.announcementEvent.createMany({data:Array.from({length:26},(_,i)=>({companyId:company.id,announcementId:generalId,actorId:owner.id,actorName:owner.name,action:"PIN",reason:`Événement paginé ${i}`,snapshot:{secret:"raw-history-never-exposed"}}))});
      const eventView=await read({id:generalId,eventPage:2},employee);assert.equal(eventView.events.length,eventView.eventCount-25);assert.ok(!JSON.stringify(eventView).includes("raw-history-never-exposed"));
      const receipt=await act({action:"announcement.read",id:generalId},owner);assert.ok(receipt.readAt);assert.equal((await read({id:generalId})).readCount,1);assert.equal((await db.announcementRead.findFirstOrThrow({where:{announcementId:generalId}})).memberId,ownerMember.id);
      const extra=Array.from({length:26},(_,i)=>({userId:randomUUID(),memberId:randomUUID(),name:`Lecteur ${i}`}));users.push(...extra.map(u=>u.userId));
      await db.user.createMany({data:extra.map(u=>({id:u.userId,name:u.name,email:`${prefix}-${u.userId}@example.test`}))});
      await db.companyMember.createMany({data:extra.map(u=>({id:u.memberId,userId:u.userId,companyId:company.id,roleId:role.id,characterName:u.name,department:"Atelier"}))});
      await db.announcementRead.createMany({data:extra.map(u=>({companyId:company.id,announcementId:generalId,memberId:u.memberId,memberName:u.name,department:"Atelier"}))});
      const page=await read({id:generalId,readPage:2});assert.equal(page.readCount,27);assert.equal(page.readers.length,2);
      await db.announcement.create({data:{companyId:company.id,title:"Limite du jour Paris",body:"Fixture de date métier",createdBy:owner.id,authorName:owner.name,status:"PUBLISHED",startsAt:new Date("2026-01-31T23:30:00Z"),publishedAt:new Date("2026-01-31T23:30:00Z")}});
      assert.equal((await read({q:"Limite du jour Paris",from:"2026-02-01",to:"2026-02-01"},employee)).total,1);assert.equal((await read({q:"Limite du jour Paris",from:"2026-01-31",to:"2026-01-31"},employee)).total,0);
    });
    await t.test("distinct concurrent edits serialize and inactive members lose all access",async()=>{
      const results=await Promise.allSettled([act({...content,id:scheduledId,revision:scheduledRevision,scope:"ALL",department:null,title:"Version A"}),act({...content,id:scheduledId,revision:scheduledRevision,scope:"ALL",department:null,title:"Version B"})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(read({},employee),/inaccessible/);await assert.rejects(act({action:"announcement.read",id:generalId},employee),/inaccessible/);
    });
  }finally{
    await db.announcement.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});
