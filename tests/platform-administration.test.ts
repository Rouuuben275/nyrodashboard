import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {executePlatform} from "../src/domains/platform/service";
import {platformAccess,resolveServerGrants} from "../src/domains/platform/access";
import {readPlatform} from "../src/domains/platform/queries";
import {platformQuery} from "../src/domains/platform/validation";
import {readSpaces,assertSpace} from "../src/domains/platform/spaces";
import {publicJob,publicJobs} from "../src/domains/recruitment/queries";
test("PostgreSQL: verified Discord platform authority, preserved tenants and administrative controls",async t=>{
  const prefix=`platform-${randomUUID()}`,previousOwner=process.env.RPILOT_OWNER_DISCORD_ID;
  const ownerDiscord="800000000000000001",adminDiscord="800000000000000002",pendingDiscord="800000000000000003";
  const users:string[]=[],servers:string[]=[],companies:string[]=[],keys:string[]=[];
  process.env.RPILOT_OWNER_DISCORD_ID=ownerDiscord;
  const person=async(name:string,discordId?:string)=>{const user=await db.user.create({data:{name:`${prefix}-${name}`,email:`${prefix}-${name}@example.test`}});users.push(user.id);if(discordId)await db.account.create({data:{id:randomUUID(),userId:user.id,providerId:"discord",accountId:discordId,accessToken:"fixture-token-must-never-be-exposed"}});return user;};
  const command=(actor:{id:string;name:string},body:Record<string,unknown>,created=new Date())=>{const requestKey=randomUUID();keys.push(requestKey);return executePlatform(actor,{...body,requestKey},created) as Promise<{id:string;revision:number}>;};
  const query=(view:string,rest:Record<string,unknown>={})=>platformQuery.parse({view,...rest});
  try{
    const owner=await person("owner",ownerDiscord),admin=await person("admin",adminDiscord),normal=await person("normal");
    await t.test("owner authority comes only from a provider account, never name, email or browser ID",async()=>{
      assert.equal((await platformAccess(db,owner.id)).role,"PLATFORM_OWNER");assert.equal((await platformAccess(db,normal.id)).role,null);
      await assert.rejects(command(normal,{action:"server.create",name:"Denied",slug:"denied",maxCompanies:2,maxUsers:2,reason:"Attempt",discordId:ownerDiscord}),/interdite/);
      await assert.rejects(readPlatform(normal.id,query("users")),/interdite/);
      process.env.RPILOT_OWNER_DISCORD_ID=adminDiscord;assert.equal((await platformAccess(db,owner.id)).role,null);assert.equal((await platformAccess(db,admin.id)).role,"PLATFORM_OWNER");process.env.RPILOT_OWNER_DISCORD_ID=ownerDiscord;
    });
    let server:{id:string;revision:number};
    await t.test("server creation is platform-only, idempotent and audited with six separate roles",async()=>{
      await assert.rejects(execute(normal,undefined,{action:"server.create",name:"Free creation"}),/administration Nyro Dashboard/);
      const requestKey=randomUUID();keys.push(requestKey);const payload={action:"server.create",name:prefix,slug:prefix,maxCompanies:1,maxUsers:2,reason:"Provision verified community",requestKey};
      const result=await Promise.all([executePlatform(owner,payload,new Date()),executePlatform(owner,payload,new Date())]);assert.deepEqual(result[0],result[1]);server=result[0] as typeof server;servers.push(server.id);
      assert.equal(await db.serverRole.count({where:{serverId:server.id}}),6);assert.equal(await db.platformAudit.count({where:{correlationId:requestKey}}),1);assert.equal(await db.serverMember.count({where:{serverId:server.id}}),0);
    });
    let grantRevision=0;let roleId="";
    await t.test("pending Discord assignment waits for verified identity and cannot confer global authority",async()=>{
      const role=await db.serverRole.findFirstOrThrow({where:{serverId:server.id,name:"Administrateur"}});roleId=role.id;
      const grant=await command(owner,{action:"server.grant",serverId:server.id,discordId:pendingDiscord,roleId,status:"ACTIVE",reason:"Assign verified future administrator"});grantRevision=grant.revision;
      await resolveServerGrants(normal.id);assert.equal(await db.serverMember.count({where:{serverId:server.id}}),0);
      const pending=await person("pending",pendingDiscord);await Promise.all([resolveServerGrants(pending.id),resolveServerGrants(pending.id)]);
      assert.equal(await db.serverMember.count({where:{serverId:server.id,userId:pending.id}}),1);assert.equal((await platformAccess(db,pending.id)).role,null);
      assert.ok((await readSpaces(pending.id)).servers.some(s=>s.id===server.id));await assert.rejects(assertSpace(normal.id,server.id),/inaccessible/);
    });
    await t.test("delegation is permission-limited, fresh-session gated and unable to remove the owner",async()=>{
      await assert.rejects(command(owner,{action:"platform.grant",discordId:adminDiscord,permissions:["users.read"],status:"ACTIVE",reason:"Delegate test"},new Date(Date.now()-31*60000)),/Reconnectez/);
      await command(owner,{action:"platform.grant",discordId:adminDiscord,permissions:["users.read","users.manage","servers.read"],status:"ACTIVE",reason:"Delegate test"});
      assert.equal((await platformAccess(db,admin.id)).role,"PLATFORM_ADMIN");await readPlatform(admin.id,query("users"));await assert.rejects(readPlatform(admin.id,query("companies")),/interdite/);
      await assert.rejects(command(admin,{action:"platform.grant",discordId:pendingDiscord,permissions:["users.read"],status:"ACTIVE",reason:"Forbidden delegation"}),/propriétaire/);
      await assert.rejects(command(admin,{action:"access.status",target:"user",id:owner.id,confirmation:owner.id,revision:0,status:"SUSPENDED",reason:"Forbidden suspension"}),/protégés/);
      await assert.rejects(command(owner,{action:"platform.grant",discordId:ownerDiscord,permissions:["users.read"],status:"REVOKED",reason:"Forbidden owner revoke"}),/propriétaire/);
    });
    await t.test("metadata lists are paginated, searchable and omit OAuth tokens and private company data",async()=>{
      const data=await readPlatform(owner.id,query("users",{q:pendingDiscord}));assert.equal(data.total,1);assert.equal(data.users[0].accounts[0].accountId,pendingDiscord);assert.ok(!JSON.stringify(data).includes("fixture-token"));assert.ok(!("email" in data.users[0]));
      const list=await readPlatform(owner.id,query("servers",{q:prefix,id:server.id}));assert.equal(list.total,1);assert.equal(list.selectedServer?.roles.length,6);
      for(let i=0;i<26;i++){const user=await person(`page-${i}`);void user;}
      const page=await readPlatform(owner.id,query("users",{q:prefix,page:2}));assert.equal(page.users.length,5);assert.equal(page.total,30);
    });
    let companyId="";const pendingUser=()=>db.account.findUniqueOrThrow({where:{providerId_accountId:{providerId:"discord",accountId:pendingDiscord}},include:{user:true}}).then(a=>a.user);
    await t.test("server company quota is enforced and independent businesses retain their own permissions",async()=>{
      const pending=await pendingUser();const company=await execute(pending,undefined,{action:"company.create",name:`${prefix}-company`,sector:"Garage",serverId:server.id}) as {id:string};companies.push(company.id);companyId=company.id;
      await assert.rejects(execute(pending,undefined,{action:"company.create",name:"Beyond limit",sector:"Garage",serverId:server.id}),/Quota entreprises/);
      const independent=await execute(normal,undefined,{action:"company.create",name:`${prefix}-independent`,sector:"Garage"}) as {id:string};companies.push(independent.id);
      assert.ok((await getWorkspace(normal.id,independent.id,"independent")).current);await assert.rejects(getWorkspace(normal.id,company.id),/inaccessible/);await assert.rejects(getWorkspace(pending.id,company.id,"independent"),/inaccessible/);
    });
    await t.test("suspensions, expiry and reactivation are enforced on existing sessions and domain reads",async()=>{
      const pending=await pendingUser();const before=await db.financialEntry.count({where:{companyId}});
      await command(owner,{action:"access.status",target:"server",id:server.id,revision:0,status:"SUSPENDED",confirmation:server.id,reason:"Temporary safety review"});await assert.rejects(getWorkspace(pending.id,companyId),/suspendu/);assert.ok(!(await readSpaces(pending.id)).servers.some(s=>s.id===server.id));
      await command(owner,{action:"access.status",target:"server",id:server.id,revision:1,status:"ACTIVE",confirmation:server.id,reason:"Review completed"});assert.ok((await getWorkspace(pending.id,companyId)).current);
      await command(owner,{action:"access.status",target:"company",id:companyId,revision:0,status:"ARCHIVED",confirmation:companyId,reason:"Archive conservatively"});await assert.rejects(getWorkspace(pending.id,companyId),/archivée/);
      await command(owner,{action:"access.status",target:"company",id:companyId,revision:1,status:"ACTIVE",confirmation:companyId,reason:"Restore access"});assert.equal(await db.financialEntry.count({where:{companyId}}),before);
      await db.session.create({data:{id:randomUUID(),userId:normal.id,token:randomUUID(),expiresAt:new Date(Date.now()+60000)}});
      await command(admin,{action:"access.status",target:"user",id:normal.id,revision:0,status:"SUSPENDED",confirmation:normal.id,reason:"Suspend test account"});assert.equal(await db.session.count({where:{userId:normal.id}}),0);await assert.rejects(execute(normal,undefined,{action:"character.create",name:"Blocked"}),/suspendu/);
      await db.user.update({where:{id:normal.id},data:{suspendedUntil:new Date(Date.now()-1000)}});assert.ok((await getWorkspace(normal.id)).current);await command(admin,{action:"access.status",target:"user",id:normal.id,revision:1,status:"ACTIVE",confirmation:normal.id,reason:"Reactivate test account"});
    });
    await t.test("stale revisions and changed command fingerprints cannot overwrite decisions",async()=>{
      const serverRow=await db.rPServer.findUniqueOrThrow({where:{id:server.id}});await assert.rejects(command(owner,{action:"server.update",id:server.id,revision:0,name:prefix,slug:prefix,maxCompanies:5,maxUsers:5,reason:"Stale update"}),/Actualisez/);
      const requestKey=randomUUID();keys.push(requestKey);const payload={action:"server.update",id:server.id,revision:serverRow.revision,name:prefix,slug:prefix,maxCompanies:5,maxUsers:5,reason:"Valid update",requestKey};await executePlatform(owner,payload,new Date());await assert.rejects(executePlatform(owner,{...payload,maxUsers:6},new Date()),/autre commande/);
    });
    await t.test("grant revocation and expiry immediately remove administrative access without deleting companies",async()=>{
      const pending=await pendingUser();await command(owner,{action:"server.grant",serverId:server.id,discordId:pendingDiscord,roleId,revision:grantRevision,status:"REVOKED",reason:"Revoke server administration"});assert.ok(!(await readSpaces(pending.id)).servers.find(s=>s.id===server.id)?.administration);assert.ok((await getWorkspace(pending.id,companyId)).current,"Employment remains distinct from revoked server administration");
      const grant=await db.platformGrant.findUniqueOrThrow({where:{discordId:adminDiscord}});await db.platformGrant.update({where:{id:grant.id},data:{expiresAt:new Date(Date.now()-1000)}});assert.equal((await platformAccess(db,admin.id)).role,null);await assert.rejects(readPlatform(admin.id,query("users")),/interdite/);
    });
    await t.test("server access pagination preserves legacy members, rejects foreign roles and honors user limits",async()=>{
      const foreign=await db.rPServer.create({data:{name:`${prefix}-foreign`}});servers.push(foreign.id);const foreignRole=await db.serverRole.create({data:{serverId:foreign.id,name:"Foreign role",permissions:["server.manage"]}});
      await assert.rejects(command(owner,{action:"server.grant",serverId:server.id,discordId:adminDiscord,roleId:foreignRole.id,status:"ACTIVE",reason:"Foreign role refusal"}),/étranger/);
      await db.rPServer.update({where:{id:server.id},data:{maxUsers:1}});
      await db.serverMember.updateMany({where:{serverId:server.id},data:{status:"ACTIVE"}});
      await assert.rejects(command(owner,{action:"server.grant",serverId:server.id,discordId:adminDiscord,roleId,status:"ACTIVE",reason:"Quota refusal"}),/Quota utilisateurs/);
      await db.serverDiscordGrant.createMany({data:Array.from({length:26},(_,i)=>({serverId:server.id,roleId,discordId:String(810000000000000000n+BigInt(i))}))});
      const page=await readPlatform(owner.id,query("servers",{id:server.id,grantPage:2}));assert.equal(page.selectedServer?._count.discordGrants,27);assert.equal(page.selectedServer?.discordGrants.length,2);assert.ok(page.selectedServer?.members.length);
    });
    await t.test("company suspension also blocks public recruitment and accepting previously issued invitations",async()=>{
      const pending=await pendingUser(),role=await db.companyRole.findFirstOrThrow({where:{companyId,isOwner:false}});
      const job=await execute(pending,companyId,{action:"recruitment.job.save",requestKey:randomUUID(),title:`${prefix}-job`,description:"Offre RP pour vérifier les contrôles de suspension.",contractType:"OTHER",positions:1,status:"PUBLISHED"}) as {id:string};
      const invite=await execute(pending,companyId,{action:"invite.create",email:normal.email,roleId:role.id}) as {token:string};
      assert.ok((await publicJobs(1,`${prefix}-job`)).total);await publicJob(job.id);
      const company=await db.company.findUniqueOrThrow({where:{id:companyId}});await command(owner,{action:"access.status",target:"company",id:companyId,revision:company.adminRevision,status:"SUSPENDED",confirmation:companyId,reason:"Block all suspended entry points"});
      assert.equal((await publicJobs(1,`${prefix}-job`)).total,0);await assert.rejects(publicJob(job.id),/introuvable/);
      await assert.rejects(execute(normal,undefined,{action:"invite.accept",token:invite.token,characterName:"Candidat RP"}),/suspendue/);
      await assert.rejects(execute(normal,undefined,{action:"recruitment.apply",requestKey:randomUUID(),jobId:job.id,characterName:"Candidat RP",motivation:"Motivation RP pour ce poste de vérification."}),/suspendu/);
      await command(owner,{action:"access.status",target:"company",id:companyId,revision:company.adminRevision+1,status:"ACTIVE",confirmation:companyId,reason:"Restore fixture company"});assert.ok((await publicJobs(1,`${prefix}-job`)).total);
    });
  }finally{
    if(previousOwner===undefined)delete process.env.RPILOT_OWNER_DISCORD_ID;else process.env.RPILOT_OWNER_DISCORD_ID=previousOwner;
    await db.platformCommand.deleteMany({where:{requestKey:{in:keys}}});await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.platformGrant.deleteMany({where:{discordId:{in:[adminDiscord,pendingDiscord]}}});
    await db.company.deleteMany({where:{id:{in:companies}}});await db.rPServer.deleteMany({where:{id:{in:servers}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`app:${id}:`}},{key:{startsWith:`admin:${id}:`}}]}});await db.$disconnect();
  }
});
