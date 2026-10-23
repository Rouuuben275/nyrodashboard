import assert from "node:assert/strict";
import {existsSync,readFileSync,rmSync} from "node:fs";
import {createServer} from "node:http";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import {execute} from "../src/domains/core/service";
import {writeMessage} from "../src/domains/messages/service";
const database=new URL(process.env.DATABASE_URL!);
if(process.env.RPILOT_UI_TEST!=="true"||database.hostname!=="127.0.0.1"||database.username!=="rpilot_test")throw new Error("Messaging UI requires isolated fixtures.");
const stopFile=".local/qa/messages-ui.stop";if(existsSync(stopFile))rmSync(stopFile);
const users:string[]=[],companies:string[]=[];
try{
 const people:Awaited<ReturnType<typeof db.user.create>>[]=[];for(const name of ["Ruben Recette","Alice Martin","Bob Laurent"]){const user=await db.user.create({data:{name,email:`messages-ui-${randomUUID()}@example.test`}});users.push(user.id);people.push(user);}
 const company=await execute(people[0],undefined,{action:"company.create",name:"Atelier du Centre",sector:"Garage automobile",template:"garage"}) as {id:string};companies.push(company.id);
 const role=await db.companyRole.create({data:{companyId:company.id,name:"Équipe atelier",permissions:["dashboard.read","messages.read","messages.send"]}});
 const owner=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:people[0].id}}}),alice=await db.companyMember.create({data:{companyId:company.id,userId:people[1].id,roleId:role.id,characterName:people[1].name,department:"Atelier"}}),bob=await db.companyMember.create({data:{companyId:company.id,userId:people[2].id,roleId:role.id,characterName:people[2].name,department:"Carrosserie"}});
 const thread=await writeMessage(people[0],{companyId:company.id,action:"create",kind:"PRIVATE",memberIds:[alice.id],requestKey:randomUUID()});
 await writeMessage(people[1],{companyId:company.id,action:"send",threadId:thread.id,body:"Bonjour Ruben, le planning des interventions est prêt. On fait le point sur les priorités de l’atelier ?",requestKey:randomUUID()});
 await db.chatMessage.createMany({data:Array.from({length:30},(_,i)=>({companyId:company.id,threadId:thread.id,sequence:i+2,senderMemberId:i%2?owner.id:alice.id,senderName:i%2?people[0].name:people[1].name,body:i===29?"Les pneus de la commande sont bien arrivés. Réserve mise à jour pour demain.":`Suivi intervention ${String(i+1).padStart(2,"0")} · contrôle atelier effectué, compte rendu conservé.`}))});await db.chatThread.update({where:{id:thread.id},data:{lastSequence:31}});
 const group=await writeMessage(people[0],{companyId:company.id,action:"create",kind:"GROUP",title:"Équipe atelier",memberIds:[alice.id,bob.id],requestKey:randomUUID()});await writeMessage(people[2],{companyId:company.id,action:"send",threadId:group.id,body:"La carrosserie accueille deux nouveaux véhicules cet après-midi. L’espace de préparation est disponible.",requestKey:randomUUID()});
 const hidden=await writeMessage(people[1],{companyId:company.id,action:"create",kind:"PRIVATE",memberIds:[bob.id],requestKey:randomUUID()});await writeMessage(people[1],{companyId:company.id,action:"send",threadId:hidden.id,body:"Échange privé entre Alice et Bob, absent de la boîte de la Direction.",requestKey:randomUUID()});
 const server=createServer(async(_req,res)=>{const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:people[0].id,token,expiresAt:new Date(Date.now()+120*60000)}});const c=getCookies(auth.options).sessionToken,cookie=await serializeSignedCookie(c.name,token,process.env.BETTER_AUTH_SECRET!,c.attributes);res.writeHead(302,{"Set-Cookie":cookie,Location:`${process.env.BETTER_AUTH_URL}/app?company=${company.id}&view=messages`,"Cache-Control":"no-store"});res.end();});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("Fixture unavailable");console.log(`Messages UI fixture: http://127.0.0.1:${address.port}/ (isolated test session only).`);
 await new Promise<void>(resolve=>{const start=Date.now(),timer=setInterval(()=>{if(existsSync(stopFile)||Date.now()-start>120*60000){clearInterval(timer);resolve();}},500);});await new Promise<void>(resolve=>server.close(()=>resolve()));
 const created=await db.chatThread.findFirst({where:{companyId:company.id,title:"Coordination atelier"},include:{participants:true,messages:true}}),read=await db.chatParticipant.findUniqueOrThrow({where:{threadId_memberId:{threadId:thread.id,memberId:owner.id}}});
 console.log("Messaging UI persisted summary:",JSON.stringify({newGroup:!!created,participants:created?.participants.filter(p=>p.active).length,messageCount:created?.messages.length,readThrough:read.lastReadSequence}));
 if(existsSync(stopFile)&&readFileSync(stopFile,"utf8").trim()==="verify"){assert.ok(created);assert.equal(created.participants.filter(p=>p.active).length,2);assert.equal(created.participants.find(p=>p.memberId===bob.id)?.active,false);assert.equal(created.messages.length,1);assert.equal(read.lastReadSequence,31);}
}finally{
 await db.chatThread.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`messages:${id}:`}}});await db.$disconnect();
}
