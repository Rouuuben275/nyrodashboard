import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createServer} from "node:http";
import {randomBytes,randomUUID} from "node:crypto";
import {existsSync,rmSync} from "node:fs";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import {execute} from "../src/domains/core/service";
import {executePlatform} from "../src/domains/platform/service";
const database=new URL(process.env.DATABASE_URL!);
if(process.env.RPILOT_UI_TEST!=="true"||database.hostname!=="127.0.0.1"||database.username!=="rpilot_test")throw new Error("Cash UI requires the isolated fixture database.");
const stopFile=".local/qa/cash-ui.stop";if(existsSync(stopFile))rmSync(stopFile);
const users:string[]=[],servers:string[]=[],identities=[process.env.RPILOT_OWNER_DISCORD_ID!,"892000000000000001"];
try{
 const people:Awaited<ReturnType<typeof db.user.create>>[]=[],cookies:string[]=[];
 for(const [i,name] of ["Administrateur de recette","Ruben Recette"].entries()){
  const user=await db.user.create({data:{name,email:`cash-ui-${randomUUID()}@example.test`}});users.push(user.id);people.push(user);await db.account.create({data:{id:randomUUID(),userId:user.id,providerId:"discord",accountId:identities[i]}});
  const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:user.id,token,expiresAt:new Date(Date.now()+120*60000)}});const cookie=getCookies(auth.options).sessionToken;cookies.push(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes));
 }
 await db.companySlotAccount.create({data:{discordId:identities[1],granted:3}});
 const s=await executePlatform(people[0],{action:"server.create",name:"Horizon Roleplay",description:"Une ville, des rencontres, des histoires. Votre communauté et ses équipes réunies au même endroit.",slug:`horizon-recette-${randomUUID()}`,maxCompanies:20,maxUsers:50,reason:"Fixture visuelle isolée",requestKey:randomUUID()},new Date()) as {id:string};servers.push(s.id);
 const role=await db.serverRole.findFirstOrThrow({where:{serverId:s.id,permissions:{has:"companies.manage"}}});await db.serverMember.create({data:{serverId:s.id,userId:people[1].id,roleId:role.id}});
 const companies:{id:string}[]=[];
 for(const [i,[name,sector]] of [["Atelier du Centre","Garage automobile"],["Le Comptoir","Restauration"],["Horizon Transport","Transport & logistique"]].entries())companies.push(await execute(people[1],undefined,{action:"company.create",name,sector,template:"garage",...(i===0?{serverId:s.id}:{})}) as {id:string});
 for(const [name,sku,price,stock,trackStock] of [["Réparation moteur","REPARATION",65000,0,false],["Pneu sport","PNEU",12500,20,true],["Huile moteur","HUILE",3500,12,true]] as const)await execute(people[1],companies[0].id,{action:"product.create",name,sku,price,cost:0,stock,trackStock,category:"Atelier",threshold:2});
 const server=createServer(async(req,res)=>{const admin=req.url==="/admin",company=req.url==="/company",destination=admin?"/admin/servers":company?`/app?company=${companies[0].id}&space=${s.id}`:"/espaces";const selected=people[admin?0:1],token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:selected.id,token,expiresAt:new Date(Date.now()+120*60000)}});const config=getCookies(auth.options).sessionToken,cookie=await serializeSignedCookie(config.name,token,process.env.BETTER_AUTH_SECRET!,config.attributes);res.writeHead(302,{"Set-Cookie":cookie,Location:`${process.env.BETTER_AUTH_URL}${destination}`,"Cache-Control":"no-store"});res.end();});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("UI bootstrap unavailable");
 console.log(`Cash UI fixture: http://localhost:${address.port}/ ; /admin ; /company (isolated test sessions only).`);
 await new Promise<void>(resolve=>{const started=Date.now(),timer=setInterval(()=>{if(existsSync(stopFile)||Date.now()-started>120*60000){clearInterval(timer);resolve();}},500);});
 await new Promise<void>(resolve=>server.close(()=>resolve()));
 const saleCount=await db.sale.count({where:{companyId:companies[0].id}}),entryCount=await db.financialEntry.count({where:{companyId:companies[0].id,kind:"SALE"}}),refundCount=await db.financialEntry.count({where:{companyId:companies[0].id,kind:"REFUND"}}),balance=(await db.financialEntry.aggregate({where:{companyId:companies[0].id},_sum:{amount:true}}))._sum.amount??0,huile=await db.product.findFirstOrThrow({where:{companyId:companies[0].id,sku:"HUILE"}});
 console.log("Cash UI persisted fixture summary:",JSON.stringify({saleCount,entryCount,refundCount,balance,remainingOilStock:huile.stock}));
 if(existsSync(stopFile)&&readFileSync(stopFile,"utf8").trim()==="verify"){assert.equal(saleCount,2);assert.equal(entryCount,2);assert.equal(refundCount,1);assert.equal(balance,3150);assert.equal(huile.stock,11);}

 console.log("Persisted theme fixtures:",JSON.stringify(await db.user.findMany({where:{id:{in:users}},select:{themePreference:true}})));
}finally{
 const commands=await db.platformAudit.findMany({where:{actorId:{in:users}},select:{correlationId:true,targetType:true,targetId:true}});await db.platformCommand.deleteMany({where:{requestKey:{in:commands.map(c=>c.correlationId)}}});await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.companySlotAccount.deleteMany({where:{discordId:{in:identities}}});const fixtures=await db.company.findMany({where:{members:{some:{userId:{in:users},role:{isOwner:true}}}},select:{id:true}});const ids=fixtures.map(c=>c.id);await db.inventoryMovement.deleteMany({where:{companyId:{in:ids}}});await db.sale.deleteMany({where:{companyId:{in:ids}}});await db.company.deleteMany({where:{id:{in:ids}}});await db.rPServer.deleteMany({where:{id:{in:[...servers,...commands.filter(c=>c.targetType==="server").map(c=>c.targetId)]}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`app:${id}:`}},{key:{startsWith:`admin:${id}:`}},{key:`logo-upload:${id}`}]}});await db.$disconnect();
}
