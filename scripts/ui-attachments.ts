import assert from "node:assert/strict";
import {existsSync,readFileSync,rmSync} from "node:fs";
import {createServer} from "node:http";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import {execute} from "../src/domains/core/service";
import {writeAttachment} from "../src/domains/attachments/service";
import {writeDocument} from "../src/domains/documents/service";
import {writeClaim} from "../src/domains/expenses/service";
const database=new URL(process.env.DATABASE_URL!);
if(process.env.RPILOT_UI_TEST!=="true"||database.hostname!=="127.0.0.1"||database.username!=="rpilot_test")throw new Error("Evidence UI requires isolated fixtures.");
const stopFile=".local/qa/attachments-ui.stop";if(existsSync(stopFile))rmSync(stopFile);
const users:string[]=[],companies:string[]=[];
try{
 const people:Awaited<ReturnType<typeof db.user.create>>[]=[];for(const name of ["Direction Recette","Camille Martin"]){const u=await db.user.create({data:{name,email:`proof-ui-${randomUUID()}@example.test`}});users.push(u.id);people.push(u);}
 const company=await execute(people[0],undefined,{action:"company.create",name:"Atelier du Centre",sector:"Garage automobile",template:"garage"}) as {id:string};companies.push(company.id);
 await db.companyModule.updateMany({where:{companyId:company.id,key:{in:["documents","expenses","employees","tasks","leaves","finance"]}},data:{enabled:true}});
 const role=await db.companyRole.create({data:{companyId:company.id,name:"Équipe atelier",permissions:["dashboard.read","employees.read","tasks.read","leaves.read","expenses.read","expenses.create"]}}),member=await db.companyMember.create({data:{companyId:company.id,userId:people[1].id,roleId:role.id,characterName:people[1].name,department:"Atelier"}});
 const file={bytes:Buffer.from("Justificatif de recette locale — aucune donnée réelle"),type:"text/plain"};
 const upload=(targetType:string,targetId:string,name:string,actor=people[0])=>writeAttachment(actor,{companyId:company.id,requestKey:randomUUID(),targetType,targetId,name,fileName:"justificatif.txt",note:"Pièce privée de recette locale"},file);
 await writeDocument(people[0],{companyId:company.id,requestKey:randomUUID(),name:"Attestation de formation atelier",audience:"MANAGERS",fileName:"attestation.txt",note:"Version privée destinée au dossier RH"},file);
 await upload("EMPLOYEE",member.id,"Attestation de Camille");
 const leave=await db.leaveRequest.create({data:{companyId:company.id,memberId:member.id,start:new Date("2026-11-04T08:00:00Z"),end:new Date("2026-11-05T18:00:00Z"),reason:"Rendez-vous personnel — motif de recette"}});await upload("LEAVE",leave.id,"Justificatif d’absence");
 const task=await db.task.create({data:{companyId:company.id,title:"Préparer la révision de la dépanneuse",description:"Rassembler le devis et les documents nécessaires.",assigneeId:member.id}});await upload("TASK",task.id,"Consigne de révision");
 const expense=await db.expense.create({data:{companyId:company.id,label:"Achat de fournitures atelier",amount:6500,category:"Approvisionnement",actorId:people[1].id,status:"APPROVED"}});await upload("EXPENSE",expense.id,"Ticket de fournitures");
 const note=await writeClaim(people[1],{companyId:company.id,requestKey:randomUUID(),action:"save",label:"Déplacement fournisseur",category:"Déplacements RP",description:"Avance de frais pour récupérer les pièces de l’atelier.",amount:14500,spentOn:"2026-10-22"});await upload("CLAIM",note.id,"Reçu du déplacement",people[1]);await writeClaim(people[1],{companyId:company.id,requestKey:randomUUID(),action:"submit",id:note.id,revision:0,reason:"Déplacement effectué pour l’atelier"});
 const draft=await writeClaim(people[1],{companyId:company.id,requestKey:randomUUID(),action:"save",label:"Petit matériel atelier",category:"Achats et fournitures",description:"Fournitures avancées en attente du justificatif.",amount:3200,spentOn:"2026-10-22"});await upload("CLAIM",draft.id,"Reçu du matériel",people[1]);
 const server=createServer(async(req,res)=>{const employee=req.url?.startsWith("/employee"),user=people[employee?1:0],token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:user.id,token,expiresAt:new Date(Date.now()+120*60000)}});const c=getCookies(auth.options).sessionToken,cookie=await serializeSignedCookie(c.name,token,process.env.BETTER_AUTH_SECRET!,c.attributes),view=req.url?.split("/").filter(Boolean)[1]??"expenses";res.writeHead(302,{"Set-Cookie":cookie,Location:`${process.env.BETTER_AUTH_URL}/app?company=${company.id}&view=${view}`,"Cache-Control":"no-store"});res.end();});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("UI bootstrap unavailable");console.log(`Evidence UI fixture: http://127.0.0.1:${address.port}/owner/expenses ; /employee/expenses ; /owner/employees ; /owner/leaves ; /owner/tasks (isolated test sessions only).`);
 await new Promise<void>(resolve=>{const start=Date.now(),timer=setInterval(()=>{if(existsSync(stopFile)||Date.now()-start>120*60000){clearInterval(timer);resolve();}},500);});await new Promise<void>(resolve=>server.close(()=>resolve()));
 const paid=await db.expenseClaim.findUniqueOrThrow({where:{id:note.id},include:{expense:true}}),submitted=await db.expenseClaim.findUniqueOrThrow({where:{id:draft.id}}),ledger=await db.financialEntry.findMany({where:{companyId:company.id}});
 console.log("Evidence UI persisted summary:",JSON.stringify({firstNote:paid.status,expenseAmount:paid.expense?.amount,ledger:ledger.map(e=>({kind:e.kind,amount:e.amount})),secondNote:submitted.status,employeeDocuments:await db.document.count({where:{companyId:company.id,targetType:"EMPLOYEE",targetId:member.id}})}));
 if(existsSync(stopFile)&&readFileSync(stopFile,"utf8").trim()==="verify"){assert.equal(paid.status,"PAID");assert.equal(paid.expense?.amount,14500);assert.equal(ledger.length,1);assert.equal(ledger[0].amount,-14500);assert.equal(submitted.status,"SUBMITTED");assert.equal(await db.document.count({where:{companyId:company.id,targetType:"EMPLOYEE",targetId:member.id}}),2);}
}finally{
 await db.expenseClaim.deleteMany({where:{companyId:{in:companies}}});await db.task.deleteMany({where:{companyId:{in:companies}}});await db.leaveRequest.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`utility:${id}:`}},{key:{startsWith:`app:${id}:`}},{key:{startsWith:`documents:${id}:`}}]}});await db.$disconnect();
}
