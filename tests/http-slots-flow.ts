import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import Stripe from "stripe";

test("HTTP: company slots enforce ownership capacity, admin grants and private audit exports",async()=>{
 const origin=process.env.BETTER_AUTH_URL!,tag=`http-slots-${randomUUID()}`,users:string[]=[],companies:string[]=[],identities:string[]=[],keys:string[]=[];
 const testingStripe=process.env.RPILOT_STRIPE_SIGNATURE_TEST==="true"&&process.env.RPILOT_SLOT_PAYMENTS_MODE==="test";
 const fixture=async(name:string,discordId:string)=>{const u=await db.user.create({data:{name,email:`${tag}-${name}@example.test`}});users.push(u.id);identities.push(discordId);await db.account.create({data:{id:randomUUID(),userId:u.id,providerId:"discord",accountId:discordId}});const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),token,userId:u.id,expiresAt:new Date(Date.now()+600000)}});const cookie=getCookies(auth.options).sessionToken;return {u,headers:{Cookie:(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0],Origin:origin,"Content-Type":"application/json"}};};
 const post=(path:string,headers:Record<string,string>,body:unknown)=>fetch(`${origin}${path}`,{method:"POST",headers,body:JSON.stringify(body)});
 try{
  const owner=await fixture("Owner",process.env.RPILOT_OWNER_DISCORD_ID!),a=await fixture("User","870000000000000001"),b=await fixture("Other","870000000000000002");
  assert.equal((await fetch(`${origin}/api/billing/slots`)).status,401);
  assert.equal((await post("/api/billing/checkout",{Origin:origin,"Content-Type":"application/json"},{requestKey:randomUUID()})).status,401);
  const read=await fetch(`${origin}/api/billing/slots`,{headers:a.headers});assert.equal(read.status,200);assert.match(read.headers.get("cache-control")??"",/no-store/);const initial=await read.json();assert.equal(initial.slots.total,1);assert.equal(initial.payments.enabled,testingStripe);
  const page=await fetch(`${origin}/compte/slots`,{headers:a.headers});assert.equal(page.status,200);assert.match(await page.text(),/Mes slots d’entreprise/);
  const create=()=>post("/api/workspace",a.headers,{action:"company.create",name:tag,sector:"Services"});const first=await create();assert.equal(first.status,200,await first.clone().text());const companyId=(await first.json()).data.id as string;companies.push(companyId);assert.equal((await create()).status,409);
  const grant={action:"user.slots.grant",discordId:identities[1],quantity:1,revision:0,reason:"HTTP quota extension",requestKey:randomUUID()};keys.push(grant.requestKey);
  assert.equal((await post("/api/admin",a.headers,grant)).status,403);assert.equal((await post("/api/admin",owner.headers,grant)).status,200);assert.equal((await post("/api/admin",owner.headers,grant)).status,200);
  assert.equal((await fetch(`${origin}/api/billing/slots`,{headers:a.headers}).then(r=>r.json())).slots.total,2);
  const second=await create();assert.equal(second.status,200,await second.clone().text());companies.push((await second.json()).data.id);assert.equal((await create()).status,409);
  assert.equal((await post("/api/billing/checkout",{...a.headers,Origin:"https://foreign.test"},{requestKey:randomUUID()})).status,403);
  assert.equal((await post("/api/billing/checkout",a.headers,{requestKey:randomUUID(),amount:1})).status,400);
  if(!testingStripe)assert.equal((await post("/api/billing/checkout",a.headers,{requestKey:randomUUID()})).status,503);
  assert.equal((await post("/api/billing/checkout",a.headers,{text:"x".repeat(2200)})).status,413);
  assert.equal((await post("/api/billing/webhook",{},{})).status,400);assert.equal((await db.companySlotAccount.findUniqueOrThrow({where:{discordId:identities[1]}})).purchased,0);
  if(testingStripe){
   const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!),payload=JSON.stringify({id:"evt_worker_signature_fixture",type:"rpilot.test.unhandled",livemode:false,data:{object:{}}}),secret=process.env.STRIPE_WEBHOOK_SECRET!;
   const signed=stripe.webhooks.generateTestHeaderString({payload,secret});
   const send=(body:string,signature:string)=>fetch(`${origin}/api/billing/webhook`,{method:"POST",headers:{"Content-Type":"application/json","stripe-signature":signature},body});
   const valid=await send(payload,signed);assert.equal(valid.status,200,await valid.clone().text());assert.equal((await valid.json()).ignored,true);
   assert.equal((await send(`${payload} `,signed)).status,400);
   assert.equal((await send(payload,stripe.webhooks.generateTestHeaderString({payload,secret,timestamp:Math.floor(Date.now()/1000)-400}))).status,400);
   assert.equal((await db.companySlotAccount.findUniqueOrThrow({where:{discordId:identities[1]}})).purchased,0);
  }
  const adminUsers=await fetch(`${origin}/api/admin?view=users&q=${identities[1]}`,{headers:owner.headers}).then(r=>r.json());assert.equal(adminUsers.users[0].companySlots.total,2);assert.ok(!JSON.stringify(adminUsers).includes("accessToken"));
  await db.auditLog.createMany({data:Array.from({length:32},(_,i)=>({companyId,actorId:a.u.id,actorName:"HTTP Viewer",action:"HTTP Audit event",entityId:`fixture-${i}`,details:{before:{name:"Avant",accessToken:"HIDDEN TOKEN",privateNotes:"HIDDEN HR"},after:{name:"Après"}}}))});
  const params=new URLSearchParams({companyId,q:"HTTP Audit"}),audit=await fetch(`${origin}/api/audit?${params}`,{headers:a.headers});assert.equal(audit.status,200);assert.match(audit.headers.get("cache-control")??"",/no-store/);const body=await audit.json();assert.equal(body.total,32);assert.equal(body.rows.length,25);assert.doesNotMatch(JSON.stringify(body),/HIDDEN/);
  const more=await fetch(`${origin}/api/audit?${params}&page=2`,{headers:a.headers}).then(r=>r.json());assert.equal(more.rows.length,7);
  const csv=await fetch(`${origin}/api/audit?${params}&format=csv`,{headers:a.headers});assert.equal(csv.status,200);assert.match(csv.headers.get("content-type")??"",/text\/csv/);const csvText=await csv.text();assert.equal(csvText.split("\r\n").length,33);assert.doesNotMatch(csvText,/HIDDEN/);
  assert.equal((await fetch(`${origin}/api/audit?${params}&format=csv`,{headers:b.headers})).status,403);
  assert.equal((await fetch(`${origin}/api/audit?${params}&from=2026-02-30`,{headers:a.headers})).status,400);
  await db.companyModule.update({where:{companyId_key:{companyId,key:"audit"}},data:{enabled:false}});assert.equal((await fetch(`${origin}/api/audit?${params}`,{headers:a.headers})).status,403);
  await db.user.update({where:{id:a.u.id},data:{accessStatus:"SUSPENDED"}});assert.equal((await fetch(`${origin}/api/billing/slots`,{headers:a.headers})).status,401);
 }finally{
  await db.companySlotAccount.deleteMany({where:{discordId:{in:identities}}});await db.platformCommand.deleteMany({where:{requestKey:{in:keys}}});await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`app:${id}:`}},{key:{startsWith:`admin:${id}:`}},{key:`slots-checkout:${id}`}]}});
 }
});
