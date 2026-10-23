import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
async function expectStatus(pending:Promise<Response>|Response,status:number){const response=await pending;const body=await response.arrayBuffer();assert.equal(response.status,status,Buffer.from(body).toString("utf8").slice(0,1000));}
test("HTTP: dedicated cash, discounted ticket PDF, one sale and one full refund",async()=>{
 const origin=process.env.BETTER_AUTH_URL!,users:string[]=[],companies:string[]=[];try{
 const person=async()=>{const u=await db.user.create({data:{name:"Caisse HTTP",email:`cash-http-${randomUUID()}@example.test`}});users.push(u.id);const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:u.id,token,expiresAt:new Date(Date.now()+600000)}});const c=getCookies(auth.options).sessionToken;return {u,headers:{Origin:origin,Cookie:(await serializeSignedCookie(c.name,token,process.env.BETTER_AUTH_SECRET!,c.attributes)).split(";")[0]}};};
 const a=await person(),b=await person();const post=(body:unknown,headers=a.headers)=>fetch(`${origin}/api/workspace`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)});
 // Load the signed-in workspace before writing, as the real cash UI does.
 const bootstrap=await fetch(`${origin}/api/workspace`,{headers:a.headers});assert.equal(bootstrap.status,200,await bootstrap.clone().text());await bootstrap.arrayBuffer();
 const created=await post({action:"company.create",name:`Cash ${randomUUID()}`,sector:"Services"});assert.equal(created.status,200,await created.clone().text());const company=(await created.json()).data;companies.push(company.id);
 const productResponse=await post({companyId:company.id,action:"product.create",name:"Prestation atelier",sku:"ATELIER",category:"Atelier",price:101,cost:20,stock:4,threshold:1,trackStock:true});assert.equal(productResponse.status,200);const product=(await productResponse.json()).data;
 const query=new URLSearchParams({companyId:company.id,view:"catalog",context:"cash"});const catalog=await fetch(`${origin}/api/sales?${query}`,{headers:a.headers});assert.equal(catalog.status,200);const data=await catalog.json();assert.equal(data.products[0].generalStock,4);assert.equal(data.products[0].cost,undefined);
 await expectStatus(fetch(`${origin}/api/sales?${query}`),401);await expectStatus(fetch(`${origin}/api/sales?${query}`,{headers:b.headers}),403);
 const payload={companyId:company.id,action:"sale.create",channel:"CASH",discountBps:1000,expectedTotal:91,requestKey:randomUUID(),customer:"=Client HTTP",payment:"Espèces RP",items:[{productId:product.id,quantity:1}]};
 await expectStatus(post(payload,{...a.headers,Origin:"https://evil.test"}),403);
 const [one,two]=await Promise.all([post(payload),post(payload)]);assert.equal(one.status,200,await one.clone().text());assert.equal(two.status,200);const sale=(await one.json()).data;assert.equal((await two.json()).data.id,sale.id);assert.equal(sale.total,91);assert.equal(await db.financialEntry.count({where:{companyId:company.id,kind:"SALE",sourceId:sale.id}}),1);
 await expectStatus(post({...payload,customer:"Autre client"}),409);
 const ticketUrl=`${origin}/api/sales/ticket?${new URLSearchParams({companyId:company.id,saleId:sale.id})}`;await expectStatus(fetch(ticketUrl),401);await expectStatus(fetch(ticketUrl,{headers:b.headers}),403);
 const pdf=await fetch(ticketUrl,{headers:a.headers});assert.equal(pdf.status,200,await pdf.clone().text());assert.match(pdf.headers.get("cache-control")??"",/no-store/);assert.equal(pdf.headers.get("content-type"),"application/pdf");assert.ok(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).equals(Buffer.from("%PDF-")));
 const csv=await fetch(`${origin}/api/sales/export?companyId=${company.id}`,{headers:a.headers});assert.equal(csv.status,200);assert.match(await csv.text(),/'=Client HTTP/);
 const quote=await fetch(`${origin}/api/sales?${new URLSearchParams({companyId:company.id,context:"cash",view:"cart",productIds:product.id})}`,{headers:a.headers});assert.equal(quote.status,200);assert.equal((await quote.json()).products[0].generalStock,3);
 const stale=await post({...payload,requestKey:randomUUID(),expectedTotal:99});await expectStatus(stale,409);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,3);
 const cancelled=await post({companyId:company.id,action:"sale.cancel",saleId:sale.id,reason:"Retour RP validé"});await expectStatus(cancelled,200);assert.equal((await db.financialEntry.findFirstOrThrow({where:{companyId:company.id,kind:"REFUND",sourceId:sale.id}})).amount,-91);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stock,4);
 const refundedPdf=await fetch(ticketUrl,{headers:a.headers});await expectStatus(refundedPdf,200);assert.equal((await fetch(`${origin}/api/sales?companyId=${company.id}&saleId=${sale.id}`,{headers:a.headers}).then(r=>r.json())).selected.status,"CANCELLED");
 await expectStatus(post({companyId:company.id,action:"module.toggle",key:"cash",enabled:false}),200);await expectStatus(fetch(`${origin}/api/sales?${query}`,{headers:a.headers}),403);await expectStatus(post({...payload,requestKey:randomUUID()}),403);
 }finally{await db.inventoryMovement.deleteMany({where:{companyId:{in:companies}}});await db.warehouseStock.deleteMany({where:{companyId:{in:companies}}});await db.stockWarehouse.deleteMany({where:{companyId:{in:companies}}});await db.sale.deleteMany({where:{companyId:{in:companies}}});await db.companyMember.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});}
});
