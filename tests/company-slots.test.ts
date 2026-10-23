import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type Stripe from "stripe";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {readCompanySlots} from "../src/domains/billing/slots";
import {executePlatform} from "../src/domains/platform/service";
import {billingOverview,fulfillSlotSession,adjustSlotPayment,startSlotCheckout} from "../src/domains/billing/service";
import {paymentAvailability,verifyStripeEvent} from "../src/domains/billing/stripe";
import StripeClient from "stripe";

test("PostgreSQL: Discord company slots, administrative grants and secured payment fulfillment",async t=>{
 const tag=`slots-${randomUUID()}`,users:string[]=[],companies:string[]=[],identities:string[]=[],keys:string[]=[],purchases:string[]=[];
 const previous={owner:process.env.RPILOT_OWNER_DISCORD_ID,mode:process.env.RPILOT_SLOT_PAYMENTS_MODE,key:process.env.STRIPE_SECRET_KEY,webhook:process.env.STRIPE_WEBHOOK_SECRET,url:process.env.BETTER_AUTH_URL};
 const person=async(name:string,discord=true)=>{const u=await db.user.create({data:{name,email:`${tag}-${name}@example.test`}});users.push(u.id);if(discord){const id=String(860000000000000000n+BigInt(users.length));identities.push(id);await db.account.create({data:{id:randomUUID(),userId:u.id,providerId:"discord",accountId:id}});}return u;};
 const create=async(u:Awaited<ReturnType<typeof person>>,name:string)=>{const c=await execute(u,undefined,{action:"company.create",name:`${tag}-${name}`,sector:"Services"}) as {id:string};companies.push(c.id);return c;};
 const admin=async(actor:{id:string;name:string},input:Record<string,unknown>,created=new Date())=>{const requestKey=typeof input.requestKey==="string"?input.requestKey:randomUUID();keys.push(requestKey);return executePlatform(actor,{...input,requestKey},created);};
 try{
  const owner=await person("owner"),a=await person("a"),b=await person("b"),delegate=await person("delegate"),pendingId="860000000000009999";identities.push(pendingId);
  process.env.RPILOT_OWNER_DISCORD_ID=identities[0];
  await t.test("one included ownership across spaces, concurrent creation cannot exceed capacity",async()=>{
   const results=await Promise.allSettled([create(a,"first"),create(a,"second")]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.match(String((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason),/Quota entreprises/);
   const slots=await readCompanySlots(db,a.id);assert.equal(slots.total,1);assert.equal(slots.owned,1);assert.equal(slots.remaining,0);
   const c=await create(b,"other"),role=await db.companyRole.findFirstOrThrow({where:{companyId:c.id,isOwner:false}});await db.companyMember.create({data:{companyId:c.id,userId:a.id,roleId:role.id,characterName:"Invited employee"}});assert.equal((await readCompanySlots(db,a.id)).owned,1);
  });
  await t.test("dedicated platform permission, recent session, validation and audited idempotency",async()=>{
   const discordId=identities[1],payload={action:"user.slots.grant",discordId,quantity:2,revision:0,reason:"Extension demandée",requestKey:randomUUID()};
   await assert.rejects(admin(a,payload),/interdite/);
   await assert.rejects(admin(owner,{...payload,quantity:0}));
   await assert.rejects(admin(owner,payload,new Date(Date.now()-31*60000)),/Reconnectez/);
   const both=await Promise.all([admin(owner,payload),admin(owner,payload)]);assert.deepEqual(both[0],both[1]);assert.equal((await readCompanySlots(db,a.id)).total,3);
   assert.equal(await db.platformAudit.count({where:{correlationId:payload.requestKey,result:"SUCCESS"}}),1);
   await assert.rejects(admin(owner,{...payload,quantity:3}),/autre commande/);
   await assert.rejects(admin(owner,{...payload,requestKey:randomUUID()}),/Actualisez/);
   await db.platformGrant.create({data:{discordId:identities[3],permissions:["users.read","users.manage"]}});
   await assert.rejects(admin(delegate,{action:"user.slots.grant",discordId,quantity:1,reason:"Missing dedicated right"}),/interdite/);
   await db.platformGrant.update({where:{discordId:identities[3]},data:{permissions:["users.read","users.slots.manage"]}});
   await admin(delegate,{action:"user.slots.grant",discordId,quantity:1,revision:1,reason:"Dedicated right granted"});assert.equal((await readCompanySlots(db,a.id)).total,4);
  });
  await t.test("pending identity grants resolve on Discord connection and never affect foreign accounts",async()=>{
   await admin(owner,{action:"user.slots.grant",discordId:pendingId,quantity:1,reason:"Before Discord registration"});
   await admin(owner,{action:"user.slots.grant",discordId:pendingId,quantity:1,reason:"Second additive grant"});
   const newcomer=await person("newcomer",false);await db.account.create({data:{id:randomUUID(),userId:newcomer.id,providerId:"discord",accountId:pendingId}});assert.equal((await readCompanySlots(db,newcomer.id)).total,3);assert.equal((await readCompanySlots(db,b.id)).total,1);
  });
  await t.test("pre-existing over-quota companies stay accessible and all ownership statuses count",async()=>{
   const role=await db.companyRole.findFirstOrThrow({where:{companyId:companies[0],isOwner:true}});await db.companySlotAccount.update({where:{discordId:identities[1]},data:{granted:0}});
   const legacy=await db.company.create({data:{name:"Preserved legacy fixture",slug:`legacy-${randomUUID()}`}});companies.push(legacy.id);const legacyRole=await db.companyRole.create({data:{companyId:legacy.id,name:"Direction",isOwner:true,permissions:role.permissions}});await db.companyMember.create({data:{companyId:legacy.id,userId:a.id,roleId:legacyRole.id,characterName:a.name}});
   const before=await readCompanySlots(db,a.id);assert.equal(before.owned,2);assert.equal(before.overLimit,true);assert.ok((await getWorkspace(a.id,companies[0])).current);
   await db.company.update({where:{id:legacy.id},data:{accessStatus:"ARCHIVED"}});await db.companyMember.update({where:{companyId_userId:{companyId:legacy.id,userId:a.id}},data:{status:"INACTIVE"}});assert.equal((await readCompanySlots(db,a.id)).owned,2);await assert.rejects(create(a,"blocked"),/Quota entreprises/);
  });
  const purchase=async(mode="live")=>{const p=await db.companySlotPurchase.create({data:{discordId:identities[2],requestKey:randomUUID(),mode}});purchases.push(p.id);return p;};
  const session=(p:Awaited<ReturnType<typeof purchase>>,changes:Record<string,unknown>={})=>({id:`cs_${p.id}`,client_reference_id:p.id,metadata:{purpose:"company_slot",purchaseId:p.id,discordId:p.discordId},livemode:p.mode==="live",mode:"payment",currency:"eur",amount_total:500,payment_status:"paid",status:"complete",payment_intent:`pi_${p.id}`,...changes}) as unknown as Stripe.Checkout.Session;
  await t.test("paid confirmation credits once across duplicate and concurrent provider events",async()=>{
   const p=await purchase(),s=session(p),id=`evt_${randomUUID()}`;await Promise.all([fulfillSlotSession(id,"checkout.session.completed",s),fulfillSlotSession(id,"checkout.session.completed",s)]);await fulfillSlotSession(`evt_${randomUUID()}`,"checkout.session.completed",s);
   assert.equal((await readCompanySlots(db,b.id)).purchased,1);assert.equal((await db.companySlotPurchase.findUniqueOrThrow({where:{id:p.id}})).status,"PAID");
   await Promise.all([adjustSlotPayment(`evt_${randomUUID()}`,"charge.dispute.created",s.payment_intent as string,"DISPUTED"),adjustSlotPayment(`evt_${randomUUID()}`,"charge.dispute.created",s.payment_intent as string,"DISPUTED")]);assert.equal((await readCompanySlots(db,b.id)).purchased,0);
   await adjustSlotPayment(`evt_${randomUUID()}`,"charge.dispute.closed",s.payment_intent as string,"RESTORED");assert.equal((await readCompanySlots(db,b.id)).purchased,1);
   await adjustSlotPayment(`evt_${randomUUID()}`,"charge.refunded",s.payment_intent as string,"REFUNDED");await fulfillSlotSession(`evt_${randomUUID()}`,"checkout.session.completed",s);assert.equal((await readCompanySlots(db,b.id)).purchased,0);assert.ok((await getWorkspace(b.id,companies[1])).current);
  });
  await t.test("unpaid, wrong price/currency/identity/session/mode and test payments cannot add real capacity",async()=>{
   const p=await purchase();await fulfillSlotSession(`evt_${randomUUID()}`,"checkout.session.completed",session(p,{payment_status:"unpaid"}));assert.equal((await readCompanySlots(db,b.id)).purchased,0);
   for(const change of [{amount_total:499},{currency:"usd"},{livemode:false},{client_reference_id:"foreign"},{metadata:{purpose:"company_slot",purchaseId:p.id,discordId:identities[1]}},{mode:"subscription"}])await assert.rejects(fulfillSlotSession(`evt_${randomUUID()}`,"checkout.session.completed",session(p,change)),/incompatible/);
   await db.companySlotPurchase.update({where:{id:p.id},data:{sessionId:"cs_bound"}});await assert.rejects(fulfillSlotSession(`evt_${randomUUID()}`,"checkout.session.completed",session(p)),/incompatible/);
   const testPurchase=await purchase("test");await fulfillSlotSession(`evt_${randomUUID()}`,"checkout.session.completed",session(testPurchase));assert.equal((await readCompanySlots(db,b.id)).purchased,0);assert.equal((await db.companySlotPurchase.findUniqueOrThrow({where:{id:testPurchase.id}})).status,"TEST_PAID");
   const refunded=await purchase();await fulfillSlotSession(`evt_${randomUUID()}`,"checkout.session.completed",session(refunded,{payment_intent:{id:`pi_${refunded.id}`,latest_charge:{id:"ch_refunded",refunded:true,disputed:false}}}));assert.equal((await readCompanySlots(db,b.id)).purchased,0);
   await db.companySlotAccount.delete({where:{discordId:identities[2]}});
   const disputed=await purchase();await fulfillSlotSession(`evt_${randomUUID()}`,"checkout.session.completed",session(disputed,{payment_intent:{id:`pi_${disputed.id}`,latest_charge:{id:"ch_disputed",refunded:false,disputed:true}}}));assert.equal((await readCompanySlots(db,b.id)).purchased,0);
   await adjustSlotPayment(`evt_${randomUUID()}`,"charge.dispute.closed",`pi_${disputed.id}`,"RESTORED");assert.equal((await readCompanySlots(db,b.id)).purchased,1);await adjustSlotPayment(`evt_${randomUUID()}`,"charge.refunded",`pi_${disputed.id}`,"REFUNDED");assert.equal((await readCompanySlots(db,b.id)).purchased,0);
  });
  await t.test("Stripe signatures require exact body, fresh timestamp and enabled configuration",async()=>{
   process.env.RPILOT_SLOT_PAYMENTS_MODE="disabled";assert.equal(paymentAvailability().enabled,false);await assert.rejects(startSlotCheckout(b.id,{requestKey:randomUUID()}),/pas encore ouvert/);
   process.env.RPILOT_SLOT_PAYMENTS_MODE="test";process.env.STRIPE_SECRET_KEY="sk_test_fixture_not_a_real_key";process.env.STRIPE_WEBHOOK_SECRET="whsec_fixture_not_a_real_key";
   const stripe=new StripeClient(process.env.STRIPE_SECRET_KEY),payload=JSON.stringify({id:"evt_signature_fixture",type:"checkout.session.completed",data:{object:{}}});
   const header=stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});assert.equal((await verifyStripeEvent(payload,header)).id,"evt_signature_fixture");
   await assert.rejects(verifyStripeEvent(`${payload} `,header),/Signature/);await assert.rejects(verifyStripeEvent(payload,stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET,timestamp:Math.floor(Date.now()/1000)-400})),/Signature/);
   process.env.STRIPE_SECRET_KEY="sk_live_fixture_not_a_real_key";assert.equal(paymentAvailability().enabled,false);
  });
  await t.test("checkout uses server price, one slot, stable provider idempotency and account-scoped history",async()=>{
   process.env.STRIPE_SECRET_KEY="sk_test_fixture_not_a_real_key";process.env.BETTER_AUTH_URL="http://localhost:3000";
   const originalFetch=globalThis.fetch;let calls=0;
   globalThis.fetch=async(input,init)=>{const url=String(input);assert.match(url,/^https:\/\/api.stripe.com\/v1\/checkout\/sessions/);calls++;const body=new URLSearchParams(String(init?.body));assert.equal(body.get("line_items[0][price_data][unit_amount]"),"500");assert.equal(body.get("line_items[0][quantity]"),"1");assert.equal(body.get("mode"),"payment");assert.equal(body.get("allowed_payment_method_types[0]"),"card");assert.ok(new Headers(init?.headers).get("idempotency-key")?.startsWith("rpilot-company-slot-"));const id=body.get("metadata[purchaseId]")!;purchases.push(id);return new Response(JSON.stringify({id:`cs_${id}`,url:`https://checkout.stripe.com/c/pay/${id}`}),{headers:{"Content-Type":"application/json"}});};
   try{const key=randomUUID(),first=await startSlotCheckout(owner.id,{requestKey:key}),second=await startSlotCheckout(owner.id,{requestKey:key});assert.deepEqual(first,second);assert.equal(calls,1);await assert.rejects(startSlotCheckout(b.id,{requestKey:key}),/inaccessible/);await assert.rejects(startSlotCheckout(owner.id,{requestKey:randomUUID(),amount:1}));assert.ok((await billingOverview(owner.id)).purchases.length);assert.equal((await billingOverview(a.id)).purchases.length,0);}finally{globalThis.fetch=originalFetch;}
  });
 }finally{
  for(const [key,value] of Object.entries({RPILOT_OWNER_DISCORD_ID:previous.owner,RPILOT_SLOT_PAYMENTS_MODE:previous.mode,STRIPE_SECRET_KEY:previous.key,STRIPE_WEBHOOK_SECRET:previous.webhook,BETTER_AUTH_URL:previous.url})){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await db.companySlotPaymentEvent.deleteMany({where:{purchaseId:{in:purchases}}});await db.companySlotPurchase.deleteMany({where:{discordId:{in:identities}}});await db.companySlotAccount.deleteMany({where:{discordId:{in:identities}}});await db.platformCommand.deleteMany({where:{requestKey:{in:keys}}});await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.platformGrant.deleteMany({where:{discordId:{in:identities}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`app:${id}:`}},{key:{startsWith:`admin:${id}:`}},{key:`slots-checkout:${id}`}]}});
 }
});
