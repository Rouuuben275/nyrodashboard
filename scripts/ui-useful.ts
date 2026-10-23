import assert from "node:assert/strict";
import {existsSync,readFileSync,rmSync} from "node:fs";
import {createServer} from "node:http";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import {execute} from "../src/domains/core/service";
import {writeEquipment} from "../src/domains/equipment/service";
import {readStatistics} from "../src/domains/statistics/queries";
const database=new URL(process.env.DATABASE_URL!);
if(process.env.RPILOT_UI_TEST!=="true"||database.hostname!=="127.0.0.1"||database.username!=="rpilot_test")throw new Error("Useful modules UI requires isolated fixtures.");
const stopFile=".local/qa/useful-ui.stop";if(existsSync(stopFile))rmSync(stopFile);
const users:string[]=[],companies:string[]=[];
try{
 const people:Awaited<ReturnType<typeof db.user.create>>[]=[];for(const name of ["Ruben Recette","Camille Martin"]){const u=await db.user.create({data:{name,email:`useful-ui-${randomUUID()}@example.test`}});users.push(u.id);people.push(u);}
 const company=await execute(people[0],undefined,{action:"company.create",name:"Atelier du Centre",sector:"Garage automobile",template:"garage"}) as {id:string};companies.push(company.id);
 const owner=await db.companyMember.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:people[0].id}}}),role=await db.companyRole.create({data:{companyId:company.id,name:"Équipe atelier",permissions:["equipment.read","statistics.read","employees.read","time.use"]}}),employee=await db.companyMember.create({data:{companyId:company.id,userId:people[1].id,roleId:role.id,characterName:people[1].name,department:"Atelier"}});
 const productIds:string[]=[];for(const [name,sku,price,stock,trackStock] of [["Réparation moteur","MOTEUR",65000,0,false],["Pneu sport","PNEU",12500,20,true],["Huile moteur","HUILE",3500,32,true]] as const){const p=await execute(people[0],company.id,{action:"product.create",name,sku,price,stock,trackStock,cost:1000,category:"Atelier",threshold:5}) as {id:string};productIds.push(p.id);}
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),month=today.slice(0,8)+"01";
 for(let i=0;i<12;i++){
  const sale=await execute(people[0],company.id,{action:"sale.create",requestKey:randomUUID(),customer:"Client atelier",payment:"Carte RP",items:[{productId:productIds[i%3],quantity:i%2+1}]}) as {id:string};
  const at=new Date(`${today}T10:00:00Z`);at.setUTCDate(Math.max(1,at.getUTCDate()-i));await db.sale.update({where:{id:sale.id},data:{createdAt:at}});await db.financialEntry.updateMany({where:{companyId:company.id,sourceId:sale.id,kind:"SALE"},data:{occurredAt:at}});
 }
 for(const [i,amount] of [-45000,-18000,-22000].entries())await db.financialEntry.create({data:{companyId:company.id,kind:"EXPENSE",effect:"EXPENSE",amount,sourceId:randomUUID(),actorId:people[0].id,label:"Fournitures et fonctionnement atelier",occurredAt:new Date(`${today}T0${i+6}:00:00Z`)}});
 await db.financialEntry.create({data:{companyId:company.id,kind:"OPENING",effect:"NEUTRAL",amount:1500000,sourceId:randomUUID(),actorId:people[0].id,label:"Ouverture RP",occurredAt:new Date(`${month}T05:00:00Z`)}});
 const time=await db.timeEntry.create({data:{companyId:company.id,memberId:employee.id,start:new Date(`${today}T06:00:00Z`),end:new Date(`${today}T09:00:00Z`)}});await db.timeReview.create({data:{companyId:company.id,entryId:time.id,revision:0,status:"APPROVED",reason:"Service atelier validé",actorId:people[0].id,workedMinutes:180,start:time.start,end:time.end!}});
 const supplier=await db.supplier.create({data:{companyId:company.id,name:"Auto Distribution RP"}});await db.purchaseOrder.create({data:{companyId:company.id,supplierId:supplier.id,supplierName:supplier.name,number:"BC-RECETTE-001",total:100000,status:"ORDERED"}});
 const truck=await writeEquipment(people[0],{action:"save",companyId:company.id,requestKey:randomUUID(),kind:"VEHICLE",code:"VEH-001",name:"Dépanneuse atelier",registration:"NYRO01",mileage:32850,location:"Parking atelier",nextServiceOn:today,reason:"Entrée flotte atelier"});await writeEquipment(people[0],{action:"assign",companyId:company.id,requestKey:randomUUID(),itemId:truck.id,revision:truck.revision,memberId:employee.id,reason:"Équipe dépannage"});await writeEquipment(people[0],{action:"work.open",companyId:company.id,requestKey:randomUUID(),itemId:truck.id,revision:truck.revision+1,kind:"MAINTENANCE",title:"Révision périodique",details:"Contrôle du moteur et de la transmission",dueOn:today});
 await writeEquipment(people[0],{action:"save",companyId:company.id,requestKey:randomUUID(),kind:"EQUIPMENT",code:"MAT-001",name:"Station de diagnostic",serial:"DIAG-2026-014",location:"Poste de travail 2",reason:"Équipement de l’atelier"});
 const server=createServer(async(req,res)=>{const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:people[0].id,token,expiresAt:new Date(Date.now()+120*60000)}});const c=getCookies(auth.options).sessionToken,cookie=await serializeSignedCookie(c.name,token,process.env.BETTER_AUTH_SECRET!,c.attributes),view=req.url==="/equipment"?"equipment":"statistics";res.writeHead(302,{"Set-Cookie":cookie,Location:`${process.env.BETTER_AUTH_URL}/app?company=${company.id}&view=${view}`,"Cache-Control":"no-store"});res.end();});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("UI bootstrap unavailable");console.log(`Useful UI fixture: http://127.0.0.1:${address.port}/statistics ; /equipment (isolated test sessions only).`);
 await new Promise<void>(resolve=>{const start=Date.now(),timer=setInterval(()=>{if(existsSync(stopFile)||Date.now()-start>120*60000){clearInterval(timer);resolve();}},500);});await new Promise<void>(resolve=>server.close(()=>resolve()));
 const data=await readStatistics(people[0].id,{companyId:company.id,from:month,to:today}),layout=await db.statisticsLayout.findUnique({where:{companyId_memberId:{companyId:company.id,memberId:owner.id}}}),created=await db.equipmentItem.findUnique({where:{companyId_code:{companyId:company.id,code:"FOURG-01"}},include:{works:true}});
 console.log("Useful UI persisted summary:",JSON.stringify({income:data.finance?.income,expense:data.finance?.expense,result:data.finance?.result,widgets:layout?.widgets,vehicle:created?{state:created.state,archived:created.archived,custodianId:created.custodianId,works:created.works.map(w=>w.status)}:null}));
 if(existsSync(stopFile)&&readFileSync(stopFile,"utf8").trim()==="verify"){assert.equal(data.finance?.income,486000);assert.equal(data.finance?.expense,85000);assert.equal(data.finance?.result,401000);assert.deepEqual(layout?.widgets,["sales","finance","people","orders"]);assert.ok(created);assert.equal(created.state,"READY");assert.equal(created.archived,false);assert.equal(created.custodianId,null);assert.equal(created.works.length,1);assert.equal(created.works[0].status,"CLOSED");}
}finally{
 await db.equipmentItem.deleteMany({where:{companyId:{in:companies}}});await db.timeEntry.deleteMany({where:{companyId:{in:companies}}});await db.inventoryMovement.deleteMany({where:{companyId:{in:companies}}});await db.sale.deleteMany({where:{companyId:{in:companies}}});await db.purchaseOrder.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`utility:${id}:`}},{key:{startsWith:`app:${id}:`}}]}});await db.$disconnect();
}
