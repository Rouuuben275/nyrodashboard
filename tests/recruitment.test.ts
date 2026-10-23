import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {publicJobs,publicJob,candidateApplications,readRecruitment} from "../src/domains/recruitment/queries";
import {recruitmentQuery} from "../src/domains/recruitment/validation";
import {safeReturnTo,loginHref} from "../src/lib/routes";
test("Recruitment return destinations reject external and ambiguous URLs",()=>{
  for(const value of ["https://evil.test","//evil.test","/app","/recrutement/../app","/recrutement/%2F","/candidatures?next=https://evil.test","/recrutement/job#x"])assert.equal(safeReturnTo(value),undefined);
  assert.equal(safeReturnTo("/recrutement/job-123"),"/recrutement/job-123");assert.equal(new URL(loginHref(undefined,"/candidatures"),"https://test.example").searchParams.get("returnTo"),"/candidatures");
});
test("PostgreSQL: recruitment publication, privacy, consent and atomic hiring",async t=>{
  const prefix=`recruit-${randomUUID()}`,users:string[]=[],companies:string[]=[];
  try{
    const createUser=async(name:string)=>{const u=await db.user.create({data:{name,email:`${prefix}-${users.length}@example.test`}});users.push(u.id);return u;};
    const owner=await createUser("Direction"),candidate=await createUser("Candidat"),second=await createUser("Autre candidat"),foreign=await createUser("Direction étrangère"),reviewer=await createUser("RH limité");
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Services"}) as {id:string};companies.push(company.id);
    const other=await execute(foreign,undefined,{action:"company.create",name:`${prefix}-other`,sector:"Services"}) as {id:string};companies.push(other.id);
    const role=await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:false}}),direction=await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:true}});
    const limited=await db.companyRole.create({data:{companyId:company.id,name:"RH limité",permissions:["employees.manage"]}});await db.companyMember.create({data:{companyId:company.id,userId:reviewer.id,roleId:limited.id,characterName:"RH RP"}});
    const act=(actor:typeof owner,payload:Record<string,unknown>)=>execute(actor,company.id,payload) as Promise<{id:string;revision:number}>;
    const jobPayload={action:"recruitment.job.save",requestKey:randomUUID(),title:"Mécanicien RP",description:"Rejoignez notre équipe de mécanique dans un cadre RP.",contractType:"PART_TIME",positions:1,status:"DRAFT"};
    let jobId="",appId="",appRevision=0,secondId="";
    const apply=(id=jobId)=>({action:"recruitment.apply",requestKey:randomUUID(),jobId:id,characterName:"Personnage candidat",motivation:"Je souhaite rejoindre votre équipe de mécaniciens RP.",availability:"Le soir"});
    const offer=(id=appId,revision=appRevision)=>({action:"recruitment.offer",requestKey:randomUUID(),applicationId:id,revision,roleId:role.id,department:"Atelier",salary:25000,message:"Bienvenue, voici notre proposition RP."});
    await t.test("drafts stay private, publication requires an enabled module and revisions",async()=>{
      const job=await act(owner,jobPayload);jobId=job.id;await assert.rejects(publicJob(jobId),/introuvable/);assert.equal((await publicJobs(1,prefix)).total,0);
      await act(owner,{...jobPayload,jobId,requestKey:randomUUID(),revision:0,status:"PUBLISHED"});assert.equal((await publicJobs(1,prefix)).total,1);
      await assert.rejects(act(owner,{...jobPayload,jobId,requestKey:randomUUID(),revision:0,status:"CLOSED"}),/changé/);
      await assert.rejects(act(foreign,{...jobPayload,jobId,requestKey:randomUUID()}),/inaccessible/);
      await assert.rejects(act(owner,apply()),/déjà un lien/);
    });
    await t.test("applications are idempotent, isolated and never grant access",async()=>{
      const payload=apply();const [a,b]=await Promise.all([act(candidate,payload),act(candidate,payload)]);appId=a.id;assert.equal(a.id,b.id);
      assert.equal(await db.companyMember.count({where:{companyId:company.id,userId:candidate.id}}),0);
      await assert.rejects(act(candidate,apply()),/déjà candidaté/);await assert.rejects(act(second,{action:"recruitment.withdraw",requestKey:randomUUID(),applicationId:appId,revision:0,reason:"Usurpation"}),/introuvable/);
      assert.equal((await candidateApplications(second.id)).total,0);secondId=(await act(second,apply())).id;
      await assert.rejects(readRecruitment(candidate.id,recruitmentQuery.parse({companyId:company.id})),/inaccessible/);
    });
    await t.test("internal notes do not leak to candidates, public APIs or general audit",async()=>{
      const secret="Note confidentielle RH de test";await act(owner,{action:"recruitment.note",applicationId:appId,requestKey:randomUUID(),content:secret});
      assert.ok(!JSON.stringify(await candidateApplications(candidate.id)).includes(secret));assert.ok(!JSON.stringify(await publicJob(jobId,candidate.id)).includes(secret));assert.ok(!JSON.stringify(await db.auditLog.findMany({where:{companyId:company.id}})).includes(secret));
      const hr=await readRecruitment(owner.id,recruitmentQuery.parse({companyId:company.id,applicationId:appId}));assert.ok(JSON.stringify(hr).includes(secret));assert.equal(hr.selected!.revision,0);
    });
    await t.test("interviews validate dates, offers cannot escalate privileges",async()=>{
      await assert.rejects(act(owner,{action:"recruitment.stage",requestKey:randomUUID(),applicationId:appId,revision:0,status:"INTERVIEW",reason:"Entretien proposé",interviewAt:"2000-01-01T12:00:00Z"}),/future/);
      const stage=await act(owner,{action:"recruitment.stage",requestKey:randomUUID(),applicationId:appId,revision:0,status:"INTERVIEW",reason:"Entretien proposé",interviewAt:new Date(Date.now()+86400000).toISOString(),interviewDetails:"Bureau RP"});appRevision=stage.revision;
      await assert.rejects(act(owner,{...offer(),roleId:direction.id}),/direction/);await assert.rejects(act(reviewer,offer()),/déléguer/);
      const foreignRole=await db.companyRole.findFirstOrThrow({where:{companyId:other.id}});await assert.rejects(act(owner,{...offer(),roleId:foreignRole.id}),/invalide/);
      const accepted=await act(owner,offer());appRevision=accepted.revision;await act(owner,offer(secondId,0));assert.equal(await db.companyMember.count({where:{companyId:company.id,userId:candidate.id}}),0);
    });
    await t.test("acceptance rechecks issuer rights and disabled modules",async()=>{
      const input={action:"recruitment.accept",requestKey:randomUUID(),applicationId:appId,revision:appRevision};
      await db.companyMember.update({where:{companyId_userId:{companyId:company.id,userId:owner.id}},data:{status:"INACTIVE"}});await assert.rejects(act(candidate,input),/renouveler/);await db.companyMember.update({where:{companyId_userId:{companyId:company.id,userId:owner.id}},data:{status:"ACTIVE"}});
      await act(owner,{action:"module.toggle",key:"recruitment",enabled:false});assert.equal((await publicJobs(1,prefix)).total,0);assert.equal((await candidateApplications(candidate.id)).rows[0].moduleActive,false);await assert.rejects(act(candidate,input),/désactivé/);await act(owner,{action:"module.toggle",key:"recruitment",enabled:true});
    });
    await t.test("one open position admits only one concurrent acceptance, replay remains safe",async()=>{
      const first={action:"recruitment.accept",requestKey:randomUUID(),applicationId:appId,revision:appRevision},otherInput={action:"recruitment.accept",requestKey:randomUUID(),applicationId:secondId,revision:1};
      const results=await Promise.allSettled([act(candidate,first),act(second,otherInput)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      assert.equal(await db.jobApplication.count({where:{jobId,status:"HIRED"}}),1);assert.equal((await db.recruitmentJob.findUniqueOrThrow({where:{id:jobId}})).status,"CLOSED");
      const won=results[0].status==="fulfilled";await act(won?candidate:second,won?first:otherInput);const hiredUser=won?candidate:second;const member=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:hiredUser.id}}});assert.equal(member.roleId,role.id);assert.equal(member.salary,25000);assert.equal(await db.employeeEvent.count({where:{memberId:member.id,kind:"HIRE"}}),1);
      await assert.rejects(act(owner,{...jobPayload,jobId,requestKey:randomUUID(),revision:2,status:"PUBLISHED"}),/postes disponibles/);
      const loser=won?second:candidate,id=won?secondId:appId,revision=won?1:appRevision;await act(loser,{action:"recruitment.withdraw",applicationId:id,revision,requestKey:randomUUID(),reason:"Autre poste trouvé"});assert.equal((await candidateApplications(loser.id)).rows[0].status,"WITHDRAWN");
    });
  }finally{await db.recruitmentJob.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();}
});
