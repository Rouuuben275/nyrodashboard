import {createServer} from "node:http";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {executePlatform} from "../src/domains/platform/service";
import {executeAdmission} from "../src/domains/servers/service";
import {existsSync,rmSync} from "node:fs";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";

// Fixture bootstrap is a separate, loopback-only test process, never an application route.
const database=new URL(process.env.DATABASE_URL!);
if(process.env.RPILOT_UI_TEST!=="true"||database.hostname!=="127.0.0.1"||database.username!=="rpilot_test")throw new Error("UI fixtures require the isolated test cluster.");
const stopFile=".local/qa/payroll-ui.stop";
if(existsSync(stopFile))rmSync(stopFile);
const prefix=`ui-payroll-${randomUUID()}`,userIds:string[]=[];let companyId="";
const platformKeys:string[]=[],platformServerIds:string[]=[],fixtureSessionIds:string[]=[],fixtureStarted=new Date();
try{
  const owner=await db.user.create({data:{name:"Direction UI",email:`${prefix}@example.test`}});userIds.push(owner.id);
  const employee=await db.user.create({data:{name:"Employé UI",email:`${prefix}-employee@example.test`}});userIds.push(employee.id);
  await db.account.createMany({data:[{id:randomUUID(),userId:owner.id,providerId:"discord",accountId:process.env.RPILOT_OWNER_DISCORD_ID!},{id:randomUUID(),userId:employee.id,providerId:"discord",accountId:"700000000000000002"}]});
  const platformAct=async(payload:Record<string,unknown>)=>{const requestKey=randomUUID();platformKeys.push(requestKey);return executePlatform(owner,{...payload,requestKey,reason:"Fixture isolée de recette administrative"},new Date()) as Promise<{id:string}>;};
  const community=await platformAct({action:"server.create",name:"Communauté RP de recette",slug:prefix,maxCompanies:10,maxUsers:50});platformServerIds.push(community.id);
  for(const [suffix,name,mode] of [["open","Communauté ouverte RP","OPEN"],["request","Communauté sur demande RP","REQUEST"]]){const server=await platformAct({action:"server.create",name,slug:`${prefix}-${suffix}`,maxCompanies:10,maxUsers:50,visibility:"PUBLIC",accessMode:mode,description:"Communauté fictive pour vérifier les admissions sans accès aux entreprises."});platformServerIds.push(server.id);
    if(mode==="REQUEST"&&process.env.RPILOT_UI_ADMISSION_HISTORY==="true"){
      const access=await executeAdmission(employee,{action:"request",serverId:server.id,requestKey:randomUUID(),message:"Je souhaite rejoindre cette communauté RP pour participer aux événements avec mon équipe. Présentation privée de recette."}) as {id:string;revision:number};
      await executeAdmission(owner,{action:"decide",serverId:server.id,requestKey:randomUUID(),id:access.id,revision:access.revision,status:"ACCEPTED",reason:"Présentation validée par le responsable RP."});
      const admitted=await db.serverCommunityMember.findUniqueOrThrow({where:{serverId_userId:{serverId:server.id,userId:employee.id}}});
      await executeAdmission(owner,{action:"member.status",serverId:server.id,requestKey:randomUUID(),id:admitted.id,revision:admitted.revision,status:"BLOCKED",reason:"Blocage communautaire de recette avec historique et emploi conservés."});
    }
  }
  const communityRole=await db.serverRole.findFirstOrThrow({where:{serverId:community.id,name:"Administrateur"}});
  await platformAct({action:"server.grant",serverId:community.id,discordId:"700000000000000002",roleId:communityRole.id,status:"ACTIVE"});
  const company=await execute(owner,undefined,{action:"company.create",name:"Atelier RP · vérification isolée",sector:"Garage"}) as {id:string};companyId=company.id;
  const role=await db.companyRole.findFirstOrThrow({where:{companyId,isOwner:false}});
  const member=await db.companyMember.create({data:{companyId,userId:employee.id,roleId:role.id,characterName:"Alex Morgan",department:"Atelier"}});
  const act=(payload:Record<string,unknown>)=>execute(owner,companyId,{requestKey:randomUUID(),...payload}) as Promise<{id:string;revision:number}>;
  const account=await act({action:"finance.account.save",name:"Banque RP de test",type:"BANK",isDefault:true});
  const opening=await act({action:"finance.operation.create",kind:"OPENING",amount:500000,label:"Fonds RP de test",accountId:account.id,occurredAt:"2026-01-01T12:00:00Z"});await act({action:"finance.operation.post",operationId:opening.id});
  const time=await db.timeEntry.create({data:{companyId,memberId:member.id,start:new Date("2026-01-03T08:00:00Z"),end:new Date("2026-01-03T11:00:00Z")}});
  await act({action:"time.review",entryId:time.id,revision:0,status:"APPROVED",reason:"Validation de test UI"});
  await act({action:"payroll.policy",target:"ROLE",targetId:role.id,mode:"HOURLY",rate:2500,regularMinutes:120,overtimeBps:12500,commissionBps:0});
  const run=await act({action:"payroll.run",label:"Paie de janvier · test isolé",from:"2026-01-01",to:"2026-01-07"});
  await act({action:"payroll.prepare",runId:run.id,memberId:member.id,bonus:500,deduction:0,note:"Prime RP de qualité, fixture UI"});
  const reviewTemplate=await act({action:"hr.template.save",kind:"REVIEW",name:"Entretien atelier",instructions:"Critères RP de test isolé",criteria:[{label:"Qualité des prestations",weight:2},{label:"Travail en équipe",weight:1}]});
  const campaign=await act({action:"hr.campaign.save",kind:"REVIEW",templateId:reviewTemplate.id,name:"Campagne atelier janvier",from:"2026-01-01",to:"2026-01-31"});
  const reviewCards=(await db.hrCampaign.findUniqueOrThrow({where:{id:campaign.id}})).criteria as {key:string}[];
  await act({action:"hr.record.save",kind:"REVIEW",memberId:member.id,campaignId:campaign.id,title:"Entretien de progression atelier",occurredAt:"2026-01-15T12:00:00Z",content:"Prestations régulières et esprit d’équipe dans le cadre RP.",conclusion:"Poursuivre la formation et partager les procédures de l’atelier.",privateNote:"Note privée RH de fixture",scores:reviewCards.map((c,i)=>({key:c.key,score:i?4:5,comment:"Critère contrôlé pendant l’entretien RP."})),goals:[{title:"Terminer la formation moteur",due:"2026-02-01"}]});
  const sanctionType=await act({action:"hr.template.save",kind:"SANCTION",name:"Avertissement RP",instructions:"Faits et décision motivés",criteria:[]});
  await act({action:"hr.record.save",kind:"SANCTION",memberId:member.id,templateId:sanctionType.id,title:"Rappel des procédures RP",occurredAt:"2026-01-16T12:00:00Z",content:"Procédure RP non suivie lors d’un service de test.",conclusion:"Avertissement RP et rappel des procédures.",privateNote:"Note privée de fixture",scores:[],goals:[]});
  await act({action:"task.column",name:"Contrôle qualité",position:1});
  await act({action:"task.create",title:"Préparer le moteur de l’atelier",description:"Vérifier les pièces et préparer l’outillage avant le service RP.",priority:"HIGH",assigneeId:member.id,dueAt:"2026-10-21T18:00:00Z",checklist:["Contrôler les pièces","Préparer l’outillage"]});
  const announcement=await act({action:"announcement.save",title:"Consignes de l’atelier RP",body:"Bienvenue dans l’atelier RP.\nVérifiez les pièces et les procédures avant votre service.\nCette annonce est une fixture isolée.",priority:"HIGH",scope:"DEPARTMENT",department:"Atelier"});
  await act({action:"announcement.publish",id:announcement.id,revision:0});
  await act({action:"announcement.save",title:"Réunion d’équipe à préparer",body:"Brouillon de réunion RP réservé à la direction.",priority:"NORMAL",scope:"ALL",department:null});
  const calendarStart=new Date();calendarStart.setDate(calendarStart.getDate()+1);calendarStart.setHours(9,0,0,0);
  await act({action:"calendar.create",title:"Réunion de préparation atelier",description:"Réunion RP privée pour préparer le prochain service.",location:"Atelier principal",kind:"MEETING",visibility:"INVITEES",start:calendarStart.toISOString(),end:new Date(+calendarStart+3600000).toISOString(),memberIds:[member.id],occurrences:2,intervalWeeks:1});
  await act({action:"calendar.create",title:"Accueil de l’équipe RP",description:"Événement partagé de fixture.",location:"Accueil",kind:"EVENT",visibility:"ALL",start:new Date(+calendarStart+7200000).toISOString(),end:new Date(+calendarStart+10800000).toISOString(),memberIds:[]});
  await act({action:"calendar.create",title:"Réunion RP passée",description:"Fixture pour constater une participation après la fin.",location:"Atelier",kind:"MEETING",visibility:"INVITEES",start:new Date(Date.now()-2*86400000).toISOString(),end:new Date(Date.now()-2*86400000+3600000).toISOString(),memberIds:[member.id]});
  const token=randomBytes(32).toString("hex"),ownerSessionId=randomUUID();fixtureSessionIds.push(ownerSessionId);await db.session.create({data:{id:ownerSessionId,userId:owner.id,token,expiresAt:new Date(Date.now()+15*60000)}});
  const cookie=getCookies(auth.options).sessionToken;
  const signed=await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes);
  const employeeToken=randomBytes(32).toString("hex"),employeeSessionId=randomUUID();fixtureSessionIds.push(employeeSessionId);await db.session.create({data:{id:employeeSessionId,userId:employee.id,token:employeeToken,expiresAt:new Date(Date.now()+15*60000)}});
  const employeeSigned=await serializeSignedCookie(cookie.name,employeeToken,process.env.BETTER_AUTH_SECRET!,cookie.attributes);
  const server=createServer((req,res)=>{res.writeHead(302,{"Set-Cookie":req.url==="/employee"?employeeSigned:signed,Location:`${process.env.BETTER_AUTH_URL}/app?company=${companyId}`,"Cache-Control":"no-store"});res.end();});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("UI bootstrap unavailable");
  console.log(`Isolated UI fixture ready: http://localhost:${address.port}/ (normal Better Auth signed test session; no production data).`);
  console.log(`Employee UI fixture: http://localhost:${address.port}/employee (same isolated company; normal signed fixture session).`);
  await new Promise<void>(resolve=>{const started=Date.now(),timer=setInterval(()=>{if(existsSync(stopFile)||Date.now()-started>15*60000){clearInterval(timer);resolve();}},500);});
  await new Promise<void>(resolve=>server.close(()=>resolve()));
}finally{
  await db.platformAudit.deleteMany({where:{actorId:{in:userIds}}});
  // This process is guarded above to the exclusive isolated UI cluster, never a user database.
  await db.platformCommand.deleteMany({where:{OR:[{requestKey:{in:[...platformKeys,...fixtureSessionIds.map(id=>`admin-visit:${createHash("sha256").update(id).digest("hex")}`)]}},{createdAt:{gte:fixtureStarted}}]}});
  await db.platformGrant.deleteMany({where:{createdAt:{gte:fixtureStarted}}});
  await db.rPServer.deleteMany({where:{OR:[{id:{in:platformServerIds}},{createdAt:{gte:fixtureStarted}}]}});
  if(companyId){await db.calendarEvent.deleteMany({where:{companyId}});await db.calendarSeries.deleteMany({where:{companyId}});}
  if(companyId)await db.announcement.deleteMany({where:{companyId}});
  if(companyId)await db.task.deleteMany({where:{companyId}});
  if(companyId){await db.hrRecord.deleteMany({where:{companyId}});await db.hrCampaign.deleteMany({where:{companyId}});await db.hrTemplate.deleteMany({where:{companyId}});}
  if(companyId){await db.payrollSlip.deleteMany({where:{companyId}});await db.payrollPolicy.deleteMany({where:{companyId}});await db.timeEntry.deleteMany({where:{companyId}});await db.financialEntry.deleteMany({where:{companyId}});await db.financeOperation.deleteMany({where:{companyId}});await db.company.delete({where:{id:companyId}});}
  await db.user.deleteMany({where:{id:{in:userIds}}});
  for(const id of userIds)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});
  await db.$disconnect();console.log("Isolated UI fixtures removed.");
}
