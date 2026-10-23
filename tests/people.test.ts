import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {getEmployeeDossier} from "../src/domains/hr/service";
import {readPeople} from "../src/domains/people/queries";
import {peopleQuery} from "../src/domains/people/validation";
import {assessmentScore} from "../src/domains/people/service";

test("review scores use weighted, bounded criteria and stay incomplete until every score exists",()=>{
  const card={key:randomUUID(),label:"Qualité",weight:1,score:5,comment:""};
  assert.equal(assessmentScore([card,{...card,key:randomUUID(),weight:3,score:3}]),7000);
  assert.equal(assessmentScore([{...card,score:null}]),null);assert.equal(assessmentScore([]),null);
  assert.equal(assessmentScore([{...card,score:0}]),0);assert.equal(assessmentScore([{...card,score:5}]),10000);
});

test("PostgreSQL: private evaluations, immutable campaign criteria, goals and RP sanctions",async t=>{
  const prefix=`people-${randomUUID()}`,users:string[]=[],companies:string[]=[];
  try{
    const make=async(name:string)=>{const u=await db.user.create({data:{name,email:`${prefix}-${name}@example.test`}});users.push(u.id);return u;};
    const owner=await make("direction"),employee=await make("employee"),other=await make("other"),stranger=await make("stranger");
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Services"}) as {id:string};companies.push(company.id);
    const foreign=await execute(stranger,undefined,{action:"company.create",name:`${prefix}-foreign`,sector:"Services"}) as {id:string};companies.push(foreign.id);
    const role=await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:false}});
    const member=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:"Employé RP",salary:12000}});
    const peer=await db.companyMember.create({data:{companyId:company.id,userId:other.id,roleId:role.id,characterName:"Autre employé RP"}});
    const act=(payload:Record<string,unknown>,actor=owner)=>execute(actor,company.id,{kind:"REVIEW",requestKey:randomUUID(),...payload}) as Promise<{id:string;revision:number}>;
    const read=(actor=owner,extra:Record<string,unknown>={})=>readPeople(actor.id,peopleQuery.parse({companyId:company.id,kind:"REVIEW",...extra}));
    const secret=`Note RH confidentielle ${randomUUID()}`;
    const templatePayload={action:"hr.template.save",name:"Entretien atelier",instructions:secret,criteria:[{label:"Qualité",weight:1},{label:"Organisation",weight:3}]};
    let templateId="",campaignId="",recordId="",revision=0,cards:{key:string;score:number|null;comment:string}[]=[];
    const recordPayload=()=>({action:"hr.record.save",memberId:member.id,campaignId,title:"Entretien de janvier",occurredAt:"2026-01-15T12:00:00Z",content:"Commentaires de l’entretien RP",conclusion:"Poursuivre la formation atelier",privateNote:secret,scores:cards,goals:[{title:"Réussir la formation moteur",due:"2026-02-01"}]});
    await t.test("roles, disabled modules and tenant ownership apply to templates and reads",async()=>{
      await assert.rejects(act(templatePayload,employee),/Gestion RH/);
      await assert.rejects(act(templatePayload,stranger),/inaccessible/);
      await assert.rejects(read(employee,{view:"templates"}),/réservé/);
      await assert.rejects(read(employee,{memberId:peer.id}),/confidentiels/);
      await act({action:"module.toggle",key:"reviews",enabled:false});await assert.rejects(read(),/désactivé/);await assert.rejects(act(templatePayload),/désactivé/);await act({action:"module.toggle",key:"reviews",enabled:true});
      await assert.rejects(act({...templatePayload,criteria:[]}),/critère/);await assert.rejects(act({...templatePayload,criteria:[{label:"A",weight:1},{label:"a",weight:1}]}),/distincts/);
      await assert.rejects(act({...templatePayload,kind:"SANCTION"}),/notation/);
      templateId=(await act(templatePayload)).id;
      const foreignTemplate=await execute(stranger,foreign.id,{...templatePayload,kind:"REVIEW",requestKey:randomUUID()}) as {id:string};
      await assert.rejects(act({...templatePayload,id:foreignTemplate.id,revision:0}),/introuvable/);
    });
    await t.test("campaigns snapshot criteria independently from later template edits",async()=>{
      campaignId=(await act({action:"hr.campaign.save",templateId,name:"Campagne janvier",from:"2026-01-01",to:"2026-01-31"})).id;
      const campaign=(await read(owner,{view:"campaigns"})).campaigns[0];cards=campaign.criteria.map((c,i)=>({key:c.key,score:i?3:5,comment:`Critère ${i+1} contrôlé`}));
      await act({...templatePayload,id:templateId,revision:0,name:"Modèle renommé",criteria:[{label:"Nouveau critère",weight:2}]});
      const after=(await read(owner,{campaignId})).choiceCampaign!;assert.equal(after.templateName,"Entretien atelier");assert.equal(after.criteria.length,2);assert.equal(after.criteria[0].key,cards[0].key);
      await assert.rejects(act({...templatePayload,id:templateId,revision:0}),/changé/);
    });
    await t.test("drafts are idempotent and never visible to the target or their peers",async()=>{
      const command={...recordPayload(),requestKey:randomUUID()};const [a,b]=await Promise.all([act(command),act(command)]);recordId=a.id;revision=a.revision;assert.equal(a.id,b.id);
      const selected=(await read(owner,{recordId})).selected!;assert.equal(selected.scoreBps,7000);assert.equal(selected.templateName,"Entretien atelier");
      assert.equal((await read(employee)).total,0);assert.equal((await read(other)).total,0);await assert.rejects(read(employee,{recordId}),/introuvable/);
      await assert.rejects(act({...recordPayload(),requestKey:randomUUID()}),/déjà.+dossier/);
      await assert.rejects(readPeople(stranger.id,peopleQuery.parse({companyId:company.id,kind:"REVIEW",recordId})),/inaccessible/);
      await assert.rejects(readPeople(stranger.id,peopleQuery.parse({companyId:foreign.id,kind:"REVIEW",recordId})),/introuvable/);
    });
    await t.test("draft updates validate criteria, preserve snapshots and reject stale revisions",async()=>{
      await assert.rejects(act({...recordPayload(),id:recordId,revision,scores:[{...cards[0],key:randomUUID()},cards[1]]}),/critères/);
      await assert.rejects(act({...recordPayload(),id:recordId,revision,memberId:peer.id}),/ne peuvent pas changer/);
      const updated=await act({...recordPayload(),id:recordId,revision,conclusion:"Objectifs après échange RP"});revision=updated.revision;
      await assert.rejects(act({...recordPayload(),id:recordId,revision:0}),/changé/);
      assert.equal(await db.hrRecordEvent.count({where:{recordId}}),2);
      const own=(await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:owner.id}}}));
      const ownCase=await act({...recordPayload(),memberId:own.id});
      await assert.rejects(act({action:"hr.record.transition",id:ownCase.id,revision:ownCase.revision,decision:"PUBLISH",reason:"Auto publication interdite"}),/autre responsable/);
    });
    await t.test("publication checks complete scores and closed campaigns before notifying once",async()=>{
      const incomplete=await act({...recordPayload(),memberId:peer.id,scores:cards.map(c=>({...c,score:null}))});
      await assert.rejects(act({action:"hr.record.transition",id:incomplete.id,revision:0,decision:"PUBLISH",reason:"Notation incomplète"}),/chaque critère/);
      await act({action:"hr.campaign.save",id:campaignId,revision:0,templateId,name:"Campagne janvier",from:"2026-01-01",to:"2026-01-31",status:"CLOSED"});
      await assert.rejects(act({action:"hr.record.transition",id:recordId,revision,decision:"PUBLISH",reason:"Campagne fermée"}),/fermée/);
      await act({action:"hr.campaign.save",id:campaignId,revision:1,templateId,name:"Campagne janvier",from:"2026-01-01",to:"2026-01-31",status:"OPEN"});
      const command={action:"hr.record.transition",id:recordId,revision,decision:"PUBLISH",reason:"Entretien RP validé",requestKey:randomUUID()};const [a,b]=await Promise.all([act(command),act(command)]);revision=a.revision;assert.equal(a.revision,b.revision);
      assert.equal(await db.notification.count({where:{userId:employee.id,title:"Dossier RH mis à jour"}}),1);
      const visible=await read(employee,{recordId});assert.equal(visible.selected!.scoreBps,7000);assert.ok(!JSON.stringify(visible).includes(secret));assert.ok(!("privateNote" in visible.selected!));assert.equal(visible.events.length,1);assert.equal(visible.progress.length,1);
      await assert.rejects(read(other,{recordId}),/introuvable/);
      await assert.rejects(act({...recordPayload(),id:recordId,revision}),/brouillon/);
      await assert.rejects(act({action:"hr.campaign.save",id:campaignId,revision:2,templateId,name:"Campagne modifiée",from:"2026-01-02",to:"2026-01-31",status:"OPEN"}),/figées/);
    });
    await t.test("internal notes remain private and only the recipient may acknowledge reading",async()=>{
      revision=(await act({action:"hr.record.note",id:recordId,revision,note:`${secret} supplémentaire`})).revision;
      assert.ok(!JSON.stringify(await read(employee,{recordId})).includes(secret));assert.equal((await read(employee,{recordId})).events.length,1);
      await assert.rejects(act({action:"hr.record.ack",id:recordId,revision,comment:"Lecture par un tiers"}),/Seul/);
      const ack={action:"hr.record.ack",id:recordId,revision,comment:"J’ai pris connaissance du dossier RP.",requestKey:randomUUID()};
      const [a,b]=await Promise.all([act(ack,employee),act(ack,employee)]);revision=a.revision;assert.equal(a.revision,b.revision);
      const selected=(await read(employee,{recordId})).selected!;assert.ok(selected.acknowledgedAt);assert.match(selected.employeeComment,/pris connaissance/);
      await assert.rejects(act({...ack,revision,requestKey:randomUUID()},employee),/ne peut plus/);
    });
    await t.test("goal follow-up and paginated histories keep confidential versions on the server",async()=>{
      const goal=(await read(owner,{recordId})).selected!.goals[0];
      await assert.rejects(act({action:"hr.goal",id:recordId,revision,goalKey:goal.key,status:"DONE",note:"Tentative employé"},employee),/Gestion RH/);
      revision=(await act({action:"hr.goal",id:recordId,revision,goalKey:goal.key,status:"DONE",note:"x".repeat(1000)})).revision;
      assert.equal((await read(employee,{recordId})).selected!.goals[0].status,"DONE");
      await db.hrRecordEvent.createMany({data:Array.from({length:30},(_,i)=>({companyId:company.id,recordId,action:"NOTE",actorId:owner.id,actorName:owner.name,reason:`Note privée de contrôle ${i}`,snapshot:{content:secret}}))});
      const first=await read(owner,{recordId}),second=await read(owner,{recordId,eventPage:2});assert.equal(first.events.length,25);assert.ok(second.events.length>0);assert.ok(first.events.every(e=>!("snapshot" in e)));assert.equal(new Set([...first.events,...second.events].map(e=>e.id)).size,first.events.length+second.events.length);
      assert.ok(!(await read(employee,{recordId})).events.some(e=>e.action==="NOTE"));
      const dossier=await getEmployeeDossier(employee.id,company.id,member.id);assert.equal(dossier.permissions.reviews,true);assert.ok(!JSON.stringify(dossier).includes(secret));assert.equal((await getEmployeeDossier(other.id,company.id,member.id)).permissions.reviews,false);
      assert.ok(!JSON.stringify(await getWorkspace(other.id,company.id)).includes(secret));assert.ok(!JSON.stringify(await db.auditLog.findMany({where:{companyId:company.id}})).includes(secret));
    });
    await t.test("RP sanctions preserve decisions without changing access, salary or finances",async()=>{
      const sanctionType=await act({action:"hr.template.save",kind:"SANCTION",name:"Avertissement RP",instructions:"Consignes privées RH",criteria:[]});
      const makeSanction={action:"hr.record.save",kind:"SANCTION",memberId:member.id,templateId:sanctionType.id,title:"Avertissement atelier RP",occurredAt:"2026-01-16T12:00:00Z",content:"Faits RP constatés en atelier",conclusion:"Avertissement RP consigné",privateNote:secret,scores:[],goals:[]};
      const sanction=await act(makeSanction);assert.equal((await read(employee,{kind:"SANCTION"})).total,0);
      const originalMember=await db.companyMember.findUniqueOrThrow({where:{id:member.id}}),financialCount=await db.financialEntry.count({where:{companyId:company.id}});
      const published=await act({action:"hr.record.transition",kind:"SANCTION",id:sanction.id,revision:0,decision:"PUBLISH",reason:"Décision RP communiquée"});
      const own=await read(employee,{kind:"SANCTION",recordId:sanction.id});assert.equal(own.selected!.conclusion,"Avertissement RP consigné");assert.ok(!JSON.stringify(own).includes(secret));
      const archived=await act({action:"hr.record.transition",kind:"SANCTION",id:sanction.id,revision:published.revision,decision:"ARCHIVE",reason:"Dossier classé"});assert.equal((await read(employee,{kind:"SANCTION",recordId:sanction.id})).selected!.status,"ARCHIVED");
      await act({action:"hr.record.transition",kind:"SANCTION",id:sanction.id,revision:archived.revision,decision:"REVOKE",reason:"Décision RP révoquée après réexamen"});
      const revoked=(await read(employee,{kind:"SANCTION",recordId:sanction.id})).selected!;assert.equal(revoked.status,"REVOKED");assert.equal(revoked.content,makeSanction.content);
      assert.deepEqual(await db.companyMember.findUniqueOrThrow({where:{id:member.id}}),originalMember);assert.equal(await db.financialEntry.count({where:{companyId:company.id}}),financialCount);
      await act({action:"hr.template.save",kind:"SANCTION",id:sanctionType.id,revision:0,name:"Ancien type",instructions:"",criteria:[],archived:true});
      await assert.rejects(act(makeSanction),/actif/);assert.equal((await read(owner,{kind:"SANCTION",recordId:sanction.id})).selected!.templateName,"Avertissement RP");
    });
    await t.test("date filters use Paris, drafts archived privately and suspended users lose access",async()=>{
      const model=await db.hrTemplate.findUniqueOrThrow({where:{id:templateId}});
      const modelCards=model.criteria as {key:string}[];
      const late=await act({...recordPayload(),campaignId:undefined,templateId,title:"Entretien tardif",occurredAt:"2026-01-15T23:30:00Z",scores:modelCards.map(c=>({key:c.key,score:5,comment:""}))});
      assert.ok((await read(owner,{from:"2026-01-16",to:"2026-01-16"})).rows.some(r=>r.id===late.id));
      assert.ok(!(await read(owner,{from:"2026-01-15",to:"2026-01-15"})).rows.some(r=>r.id===late.id));
      await act({action:"hr.record.transition",id:late.id,revision:0,decision:"ARCHIVE",reason:"Brouillon abandonné"});await assert.rejects(read(employee,{recordId:late.id}),/introuvable/);
      await act({action:"module.toggle",key:"sanctions",enabled:false});await assert.rejects(read(employee,{kind:"SANCTION"}),/désactivé/);await act({action:"module.toggle",key:"sanctions",enabled:true});
      await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(read(employee),/inaccessible/);
    });
  }finally{
    for(const companyId of companies){await db.hrRecord.deleteMany({where:{companyId}});await db.hrCampaign.deleteMany({where:{companyId}});await db.hrTemplate.deleteMany({where:{companyId}});await db.company.delete({where:{id:companyId}});}
    await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});
  }
});
