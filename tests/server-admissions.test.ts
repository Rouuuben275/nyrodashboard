import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {readSpaces} from "../src/domains/platform/spaces";
import {platformAccess} from "../src/domains/platform/access";
import {executeAdmission} from "../src/domains/servers/service";
import {readAdmissions} from "../src/domains/servers/queries";
import {admissionQuery} from "../src/domains/servers/validation";
test("PostgreSQL: community admissions preserve tenant permissions, private decisions and quotas",async t=>{
  const prefix=`admissions-${randomUUID()}`,users:string[]=[],servers:string[]=[],companies:string[]=[];
  const person=async(name:string)=>{const user=await db.user.create({data:{name:`${prefix}-${name}`,email:`${prefix}-${name}@example.test`}});users.push(user.id);await db.account.create({data:{id:randomUUID(),userId:user.id,providerId:"discord",accountId:String(850000000000000000n+BigInt(users.length))}});return user;};
  const q=(view:string,rest:Record<string,unknown>={})=>admissionQuery.parse({view,...rest});
  const act=(actor:{id:string;name:string},body:Record<string,unknown>)=>executeAdmission(actor,{requestKey:randomUUID(),...body}) as Promise<{id:string;revision:number}>;
  try{
    const manager=await person("manager"),a=await person("a"),b=await person("b"),c=await person("c"),d=await person("d"),e=await person("e"),f=await person("f"),outsider=await person("outsider");
    const make=async(name:string,mode:string,visibility="PUBLIC")=>{const server=await db.rPServer.create({data:{name:`${prefix}-${name}`,accessMode:mode,visibility,maxUsers:100}});servers.push(server.id);const role=await db.serverRole.create({data:{serverId:server.id,name:"Responsable historique",permissions:["members.manage","companies.manage"]}});await db.serverMember.create({data:{serverId:server.id,userId:manager.id,roleId:role.id}});return server;};
    const open=await make("open","OPEN"),request=await make("request","REQUEST"),privateServer=await make("private","PRIVATE");let bRequest={id:"",revision:0},dRequest={id:"",revision:0};
    await t.test("only active public communities appear and ordinary users cannot read administrative queues",async()=>{
      const directory=await readAdmissions(a.id,q("directory",{q:prefix}));assert.equal(directory.total,2);assert.ok(!JSON.stringify(directory).includes(privateServer.id));
      await assert.rejects(readAdmissions(a.id,q("requests",{serverId:request.id})),/interdite/);await assert.rejects(act(a,{action:"join",serverId:privateServer.id}),/mode d’admission/);await assert.rejects(act(a,{action:"request",serverId:open.id,message:"Motivation pour rejoindre ce serveur RP."}),/mode d’admission/);
    });
    await t.test("open join is concurrent/idempotent and grants no administrative or company role",async()=>{
      const key=randomUUID(),payload={action:"join",serverId:open.id,requestKey:key,roleId:"attacker",permissions:["server.manage"]};const results=await Promise.all([executeAdmission(a,payload),executeAdmission(a,payload)]);assert.deepEqual(results[0],results[1]);assert.equal(await db.serverCommunityMember.count({where:{serverId:open.id,userId:a.id}}),1);assert.equal(await db.serverAccessEvent.count({where:{serverId:open.id,userId:a.id}}),1);
      assert.equal(await db.serverMember.count({where:{serverId:open.id,userId:a.id}}),0);assert.equal((await platformAccess(db,a.id)).role,null);assert.equal((await getWorkspace(a.id,undefined,open.id)).current,null);assert.ok((await readSpaces(a.id)).servers.some(s=>s.id===open.id&&!s.administration));
      await assert.rejects(act(a,{action:"decide",serverId:open.id,id:"x",revision:0,status:"ACCEPTED",reason:"Fake privilege"}),/interdite/);await assert.rejects(executeAdmission(a,{...payload,action:"request",message:"Change the same command fingerprint."}),/autre commande|mode d’admission/);
    });
    await t.test("requests notify managers once and expose motivation/history only to the author and authorized managers",async()=>{
      const key=randomUUID(),payload={action:"request",serverId:request.id,requestKey:key,message:"Motivation privée de B pour la communauté RP."};const before=await db.notification.count({where:{userId:manager.id}});const results=await Promise.all([executeAdmission(b,payload),executeAdmission(b,payload)]);bRequest=results[0] as typeof bRequest;assert.equal(await db.notification.count({where:{userId:manager.id}}),before+1);
      const own=await readAdmissions(b.id,q("mine",{id:bRequest.id}));assert.equal(own.total,1);assert.equal(own.events.length,1);assert.ok(!JSON.stringify(await readAdmissions(a.id,q("directory",{q:prefix}))).includes("Motivation privée"));await assert.rejects(readAdmissions(a.id,q("mine",{id:bRequest.id})),/introuvable/);
      const queue=await readAdmissions(manager.id,q("requests",{serverId:request.id}));assert.ok(queue.requests.some(r=>r.message.includes("Motivation privée")));await assert.rejects(act(outsider,{action:"withdraw",serverId:request.id,id:bRequest.id,revision:0,reason:"Not my request"}),/introuvable/);
    });
    await t.test("acceptance preserves the request and grants community membership only",async()=>{
      const decision=await act(manager,{action:"decide",serverId:request.id,id:bRequest.id,revision:bRequest.revision,status:"ACCEPTED",reason:"Bienvenue dans la communauté RP."});assert.equal(decision.revision,1);assert.equal(await db.serverMember.count({where:{serverId:request.id,userId:b.id}}),0);assert.ok((await readSpaces(b.id)).servers.some(s=>s.id===request.id));
      const own=await readAdmissions(b.id,q("mine",{id:bRequest.id}));assert.equal(own.requests[0].status,"ACCEPTED");assert.equal(own.events.length,2);await assert.rejects(act(manager,{action:"decide",serverId:request.id,id:bRequest.id,revision:0,status:"REJECTED",reason:"Obsolete decision"}),/Actualisez/);
    });
    await t.test("refusals have a 24-hour cooldown and personal withdrawals keep their history",async()=>{
      const r=await act(c,{action:"request",serverId:request.id,message:"Motivation du candidat C pour ce serveur RP."});await act(manager,{action:"decide",serverId:request.id,id:r.id,revision:r.revision,status:"REJECTED",reason:"Précisez votre projet RP avant une nouvelle demande."});await assert.rejects(act(c,{action:"request",serverId:request.id,message:"Nouvelle motivation immédiate pour contourner le refus."}),/24 heures/);
      const withdrawn=await act(d,{action:"request",serverId:request.id,message:"Motivation de D pour rejoindre la communauté RP."});await act(d,{action:"withdraw",serverId:request.id,id:withdrawn.id,revision:withdrawn.revision,reason:"Je reporte mon arrivée dans la communauté."});dRequest=await act(d,{action:"request",serverId:request.id,message:"Motivation renouvelée après retrait volontaire de ma demande."});assert.equal(dRequest.id,withdrawn.id);assert.equal((await readAdmissions(d.id,q("mine",{id:dRequest.id}))).events.length,3);
    });
    await t.test("acceptance and concurrent open joins cannot exceed the distinct-user quota",async()=>{
      await db.rPServer.update({where:{id:request.id},data:{maxUsers:2}});await assert.rejects(act(manager,{action:"decide",serverId:request.id,id:dRequest.id,revision:dRequest.revision,status:"ACCEPTED",reason:"Quota test refusal"}),/Quota utilisateurs/);assert.equal((await db.serverAccessRequest.findUniqueOrThrow({where:{id:dRequest.id}})).status,"PENDING");
      await db.rPServer.update({where:{id:open.id},data:{maxUsers:3}});const results=await Promise.allSettled([act(e,{action:"join",serverId:open.id}),act(f,{action:"join",serverId:open.id})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(await db.serverCommunityMember.count({where:{serverId:open.id}}),2);
    });
    await t.test("blocking an ordinary membership prevents self-rejoin and leaves an owned private history",async()=>{
      const member=await db.serverCommunityMember.findUniqueOrThrow({where:{serverId_userId:{serverId:open.id,userId:a.id}}});await act(manager,{action:"member.status",serverId:open.id,id:member.id,revision:member.revision,status:"BLOCKED",reason:"Blocage communautaire de vérification, sans perte de données."});await assert.rejects(act(a,{action:"join",serverId:open.id}),/bloqué/);assert.ok(!(await readSpaces(a.id)).servers.some(s=>s.id===open.id));
      const own=await readAdmissions(a.id,q("community",{id:member.id}));assert.equal(own.members[0].status,"BLOCKED");assert.ok(own.events.some(e=>e.reason.includes("Blocage communautaire")));await assert.rejects(readAdmissions(outsider.id,q("community",{id:member.id})),/introuvable/);
      await act(manager,{action:"member.status",serverId:open.id,id:member.id,revision:member.revision+1,status:"ACTIVE",reason:"Réactivation après contrôle RP."});assert.ok((await readSpaces(a.id)).servers.some(s=>s.id===open.id));
    });
    await t.test("permissions, expiry, suspended users and servers are reevaluated on every request",async()=>{
      const role=await db.serverRole.findFirstOrThrow({where:{serverId:request.id}});await db.serverRole.update({where:{id:role.id},data:{permissions:[]}});await assert.rejects(readAdmissions(manager.id,q("requests",{serverId:request.id})),/interdite/);await db.serverRole.update({where:{id:role.id},data:{permissions:role.permissions}});
      await db.serverMember.updateMany({where:{serverId:request.id,userId:manager.id},data:{expiresAt:new Date(Date.now()-1000)}});await assert.rejects(readAdmissions(manager.id,q("requests",{serverId:request.id})),/interdite/);await db.serverMember.updateMany({where:{serverId:request.id,userId:manager.id},data:{expiresAt:null}});
      await db.rPServer.update({where:{id:request.id},data:{status:"SUSPENDED"}});await assert.rejects(act(manager,{action:"decide",serverId:request.id,id:dRequest.id,revision:dRequest.revision,status:"ACCEPTED",reason:"Cannot bypass suspension"}),/inaccessible/);assert.equal((await readAdmissions(outsider.id,q("directory",{q:request.name}))).total,0);await db.rPServer.update({where:{id:request.id},data:{status:"ACTIVE"}});
      await db.user.update({where:{id:outsider.id},data:{accessStatus:"SUSPENDED"}});await assert.rejects(readAdmissions(outsider.id,q("directory")),/suspendu/);await db.user.update({where:{id:outsider.id},data:{accessStatus:"ACTIVE"}});
    });
    await t.test("changed admission mode blocks acceptance while preserving withdrawal and the original request",async()=>{
      await db.rPServer.update({where:{id:request.id},data:{accessMode:"PRIVATE"}});await assert.rejects(act(manager,{action:"decide",serverId:request.id,id:dRequest.id,revision:dRequest.revision,status:"ACCEPTED",reason:"No longer accepting requests"}),/n’accepte plus/);await act(d,{action:"withdraw",serverId:request.id,id:dRequest.id,revision:dRequest.revision,reason:"Retrait après changement du mode d’accès."});await db.rPServer.update({where:{id:request.id},data:{accessMode:"REQUEST"}});
    });
    await t.test("server employment counts once and company affiliation cannot import users beyond quota",async()=>{
      const company=await execute(manager,undefined,{action:"company.create",name:`${prefix}-company`,sector:"Garage",serverId:request.id}) as {id:string};companies.push(company.id);const role=await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:false}});await db.companyMember.create({data:{companyId:company.id,userId:b.id,roleId:role.id,characterName:"Employé déjà membre"}});
      const invite=await execute(manager,company.id,{action:"invite.create",email:outsider.email,roleId:role.id}) as {token:string};await assert.rejects(execute(outsider,undefined,{action:"invite.accept",token:invite.token,characterName:"Beyond server quota"}),/Quota utilisateurs/);
      // This scenario needs a second ownership; provision its explicit slot fixture.
      await db.companySlotAccount.create({data:{discordId:"850000000000000001",granted:1}});
      const independent=await execute(manager,undefined,{action:"company.create",name:`${prefix}-import`,sector:"Garage"}) as {id:string};companies.push(independent.id);const importedRole=await db.companyRole.findFirstOrThrow({where:{companyId:independent.id,isOwner:false}});await db.companyMember.createMany({data:[e,f].map(u=>({companyId:independent.id,userId:u.id,roleId:importedRole.id,characterName:u.name}))});
      await assert.rejects(execute(manager,independent.id,{action:"company.update",name:`${prefix}-import`,description:"",expenseThreshold:100000,serverId:request.id}),/Quota utilisateurs/);assert.equal((await db.company.findUniqueOrThrow({where:{id:independent.id}})).serverId,null);
    });
    await t.test("request, member and private event pagination do not expose other applicants",async()=>{
      for(let i=0;i<26;i++){const user=await person(`page-${i}`);await db.serverAccessRequest.create({data:{serverId:request.id,userId:user.id,message:`Motivation RP de pagination ${i}`}});}
      const page=await readAdmissions(manager.id,q("requests",{serverId:request.id,page:2}));assert.equal(page.total,29);assert.equal(page.requests.length,4);
      await db.serverAccessEvent.createMany({data:Array.from({length:26},(_,i)=>({serverId:request.id,userId:b.id,actorId:manager.id,actorName:manager.name,kind:"FIXTURE",reason:`Observation privée ${i}`}))});const events=await readAdmissions(b.id,q("mine",{id:bRequest.id,eventPage:2}));assert.equal(events.eventCount,28);assert.equal(events.events.length,3);assert.equal((await readAdmissions(outsider.id,q("mine"))).total,0);
      const members=await readAdmissions(manager.id,q("members",{serverId:open.id}));assert.equal(members.members.length,2);assert.ok(!("roleId" in members.members[0]));
    });
  }finally{await db.companySlotAccount.deleteMany({where:{discordId:"850000000000000001"}});await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.rPServer.deleteMany({where:{id:{in:servers}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`admission:${id}:`}},{key:{startsWith:`app:${id}:`}}]}});await db.$disconnect();}
});
