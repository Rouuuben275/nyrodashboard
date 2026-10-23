import {createServer} from "node:http";
import {randomBytes,randomUUID} from "node:crypto";
import {existsSync,rmSync} from "node:fs";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import {execute} from "../src/domains/core/service";
const database=new URL(process.env.DATABASE_URL!);
if(process.env.RPILOT_UI_TEST!=="true"||database.hostname!=="127.0.0.1"||database.username!=="rpilot_test")throw new Error("Slots UI requires the isolated fixture database.");
const stopFile=".local/qa/slots-ui.stop";if(existsSync(stopFile))rmSync(stopFile);
const users:string[]=[],companies:string[]=[],identities=[process.env.RPILOT_OWNER_DISCORD_ID!,"880000000000000001"];
try{
 const cookies:string[]=[];
 for(const [i,name] of ["Administrateur de recette","Compte Discord de recette"].entries()){
  const user=await db.user.create({data:{name,email:`slots-ui-${randomUUID()}@example.test`}});users.push(user.id);await db.account.create({data:{id:randomUUID(),userId:user.id,providerId:"discord",accountId:identities[i]}});
  const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:user.id,token,expiresAt:new Date(Date.now()+25*60000)}});const cookie=getCookies(auth.options).sessionToken;cookies.push(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes));
  if(i===1){const company=await execute(user,undefined,{action:"company.create",name:"Atelier de recette — données fictives",sector:"Services"}) as {id:string};companies.push(company.id);await db.auditLog.createMany({data:Array.from({length:30},(_,j)=>({companyId:company.id,actorId:user.id,actorName:user.name,action:"Référence du catalogue modifiée",entityId:`RECETTE-${j}`,details:{before:{name:"Ancienne référence",archived:false},after:{name:"Nouvelle référence",archived:true},privateNotes:"Never exposed fixture"}}))});}
 }
 const server=createServer((req,res)=>{const admin=req.url==="/admin",audit=req.url==="/audit",destination=admin?"/admin/users":audit?`/app?company=${companies[0]}&view=audit`:"/compte/slots";res.writeHead(302,{"Set-Cookie":cookies[admin?0:1],Location:`${process.env.BETTER_AUTH_URL}${destination}`,"Cache-Control":"no-store"});res.end();});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("UI bootstrap unavailable");
 console.log(`Slots UI fixture: http://localhost:${address.port}/ ; /admin ; /audit (isolated test sessions only).`);
 await new Promise<void>(resolve=>{const started=Date.now(),timer=setInterval(()=>{if(existsSync(stopFile)||Date.now()-started>25*60000){clearInterval(timer);resolve();}},500);});
 await new Promise<void>(resolve=>server.close(()=>resolve()));
 console.log("Persisted fixture slots:",JSON.stringify(await db.companySlotAccount.findMany({where:{discordId:{in:identities}},select:{discordId:true,granted:true,purchased:true}})));
}finally{
 const commands=await db.platformAudit.findMany({where:{actorId:{in:users}},select:{correlationId:true}});
 await db.platformCommand.deleteMany({where:{requestKey:{in:commands.map(c=>c.correlationId)}}});
 await db.companySlotAccount.deleteMany({where:{discordId:{in:identities}}});await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`app:${id}:`}},{key:{startsWith:`admin:${id}:`}}]}});await db.$disconnect();
}
