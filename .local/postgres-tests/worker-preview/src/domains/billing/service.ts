import {z} from "zod";
import type Stripe from "stripe";
import {db} from "@/lib/db";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {assertActiveUser,verifiedDiscordId} from "@/domains/platform/access";
import {lockCompanySlots,readCompanySlots,SLOT_PRICE_CENTS} from "./slots";
import {paymentAvailability,slotStripe} from "./stripe";

export const checkoutInput=z.object({requestKey:z.uuid()}).strict();
export async function billingOverview(userId:string,page=1){
  await assertActiveUser(db,userId);
  return db.$transaction(async tx=>{
    const discordId=await verifiedDiscordId(tx,userId);
    const [slots,purchases,total]=await Promise.all([
      readCompanySlots(tx,userId),
      discordId?tx.companySlotPurchase.findMany({where:{discordId},orderBy:[{createdAt:"desc"},{id:"asc"}],skip:(page-1)*25,take:25,select:{id:true,status:true,mode:true,amount:true,currency:true,createdAt:true,paidAt:true,reversedAt:true}}):[],
      discordId?tx.companySlotPurchase.count({where:{discordId}}):0,
    ]);
    return {slots,payments:paymentAvailability(),price:SLOT_PRICE_CENTS,purchases,total,page};
  },{isolationLevel:"RepeatableRead"});
}
async function checkoutRate(userId:string){
  const key=`slots-checkout:${userId}`,now=Date.now();
  const allowed=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
    const old=await tx.rateLimit.findUnique({where:{key}}),reset=!old||Number(old.lastRequest)<now-60000;
    if(!reset&&old.count>=5)return false;
    await tx.rateLimit.upsert({where:{key},create:{key,count:1,lastRequest:BigInt(now)},update:{count:reset?1:{increment:1},lastRequest:reset?BigInt(now):old.lastRequest}});return true;
  });
  if(!allowed)throw new AppError("Trop de demandes de paiement. Réessayez dans une minute.",429);
}
export async function startSlotCheckout(userId:string,raw:unknown){
  const input=checkoutInput.parse(raw);await assertActiveUser(db,userId);await checkoutRate(userId);
  const stripe=await slotStripe(),mode=paymentAvailability().mode;
  const purchase=await db.$transaction(async tx=>{
    const discordId=await verifiedDiscordId(tx,userId);if(!discordId)throw new AppError("Un compte Discord vérifié est nécessaire.",403);
    await lockCompanySlots(tx,discordId);
    const old=await tx.companySlotPurchase.findUnique({where:{requestKey:input.requestKey}});
    if(old){if(old.discordId!==discordId||old.mode!==mode)throw new AppError("Commande inaccessible.",403);if(old.status!=="PENDING")throw new AppError("Cette commande a déjà été traitée. Consultez votre historique.",409);if(old.createdAt.getTime()<Date.now()-23*3600000)throw new AppError("Commande expirée. Relancez un nouvel achat.",409);return old;}
    // Repeated clicks with different keys reuse an open checkout for this identity.
    const pending=await tx.companySlotPurchase.findFirst({where:{discordId,mode,status:"PENDING",createdAt:{gt:new Date(Date.now()-29*60000)}},orderBy:{createdAt:"desc"}});
    return pending??tx.companySlotPurchase.create({data:{discordId,requestKey:input.requestKey,mode,amount:SLOT_PRICE_CENTS}});
  });
  if(purchase.createdAt.getTime()<Date.now()-29*60000)throw new AppError("Commande expirée. Rechargez la page pour commencer un nouvel achat.",409);
  if(purchase.checkoutUrl)return {url:purchase.checkoutUrl};
  const origin=new URL(databaseRuntime().env.BETTER_AUTH_URL!).origin;
  const session=await stripe.checkout.sessions.create({
    mode:"payment",allowed_payment_method_types:["card"],locale:"fr",client_reference_id:purchase.id,adaptive_pricing:{enabled:false},automatic_tax:{enabled:false},allow_promotion_codes:false,
    line_items:[{quantity:1,price_data:{currency:"eur",unit_amount:SLOT_PRICE_CENTS,product_data:{name:"Nyro Dashboard — un slot d’entreprise",description:"Une entreprise possédée supplémentaire. Achat unique, sans abonnement."}}}],
    metadata:{purchaseId:purchase.id,discordId:purchase.discordId,purpose:"company_slot"},
    success_url:`${origin}/compte/slots?result=success`,cancel_url:`${origin}/compte/slots?result=cancel`,
    expires_at:Math.floor(purchase.createdAt.getTime()/1000)+60*60,
  },{idempotencyKey:`rpilot-company-slot-${purchase.id}`});
  if(!session.url||new URL(session.url).origin!=="https://checkout.stripe.com")throw new AppError("Lien de paiement indisponible. Réessayez.",502);
  // The webhook can arrive before this update; it binds the same provider session.
  await db.companySlotPurchase.update({where:{id:purchase.id},data:{sessionId:session.id,checkoutUrl:session.url}});
  return {url:session.url};
}

// Called only with a session fetched server-side after signature verification.
export async function fulfillSlotSession(eventId:string,eventType:string,session:Stripe.Checkout.Session){
  const purchaseId=session.metadata?.purchaseId;
  if(session.metadata?.purpose!=="company_slot"||!purchaseId)return {ignored:true};
  return db.$transaction(async tx=>{
    const purchase=await tx.companySlotPurchase.findUnique({where:{id:purchaseId}});
    if(!purchase)throw new AppError("Commande Stripe inconnue.",409);
    await lockCompanySlots(tx,purchase.discordId);
    if(await tx.companySlotPaymentEvent.findUnique({where:{id:eventId}}))return {received:true};
    const expectedLive=purchase.mode==="live";
    if(session.livemode!==expectedLive||session.client_reference_id!==purchase.id||session.metadata?.discordId!==purchase.discordId||(purchase.sessionId&&purchase.sessionId!==session.id)||session.mode!=="payment"||session.currency!=="eur"||session.amount_total!==SLOT_PRICE_CENTS)throw new AppError("Paiement incompatible avec cette commande.",409);
    const current=await tx.companySlotPurchase.findUniqueOrThrow({where:{id:purchase.id}});
    if(session.status==="complete"&&session.payment_status==="paid"&&["PENDING","EXPIRED"].includes(current.status)){
      const intent=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
      if(!intent)throw new AppError("Référence du paiement manquante.",409);
      const charge=typeof session.payment_intent==="object"?session.payment_intent?.latest_charge:null;
      const reversed=charge&&typeof charge==="object"?(charge.refunded?"REFUNDED":charge.disputed?"DISPUTED":null):null;
      if(expectedLive&&!reversed)await tx.companySlotAccount.upsert({where:{discordId:purchase.discordId},create:{discordId:purchase.discordId,purchased:1,revision:1},update:{purchased:{increment:1},revision:{increment:1}}});
      await tx.companySlotPurchase.update({where:{id:purchase.id},data:{status:expectedLive?reversed??"PAID":"TEST_PAID",sessionId:session.id,paymentIntentId:intent,paidAt:new Date(),...(reversed?{reversedAt:new Date()}:{})}});
    }else if(session.status==="expired"&&current.status==="PENDING")await tx.companySlotPurchase.update({where:{id:purchase.id},data:{status:"EXPIRED",sessionId:session.id}});
    await tx.companySlotPaymentEvent.create({data:{id:eventId,type:eventType,purchaseId:purchase.id}});
    return {received:true};
  });
}

// Refunds and disputes reduce only purchased capacity; existing companies remain.
export async function adjustSlotPayment(eventId:string,type:string,intentId:string,reason:"REFUNDED"|"DISPUTED"|"RESTORED"){
  const purchase=await db.companySlotPurchase.findUnique({where:{paymentIntentId:intentId}});if(!purchase)return {ignored:true};
  return db.$transaction(async tx=>{
    await lockCompanySlots(tx,purchase.discordId);
    if(await tx.companySlotPaymentEvent.findUnique({where:{id:eventId}}))return {received:true};
    const current=await tx.companySlotPurchase.findUniqueOrThrow({where:{id:purchase.id}});
    const reversing=reason!=="RESTORED"&&current.status==="PAID",restoring=reason==="RESTORED"&&current.status==="DISPUTED";
    if(purchase.mode==="live"&&restoring)await tx.companySlotAccount.upsert({where:{discordId:purchase.discordId},create:{discordId:purchase.discordId,purchased:1,revision:1},update:{purchased:{increment:1},revision:{increment:1}}});
    if(purchase.mode==="live"&&reversing){
      const changed=await tx.companySlotAccount.updateMany({where:{discordId:purchase.discordId,purchased:{gte:1}},data:{purchased:{decrement:1},revision:{increment:1}}});
      if(!changed.count)throw new AppError("Solde des slots à vérifier.",409);
    }
    if(reversing||restoring||reason==="REFUNDED"&&current.status==="DISPUTED")await tx.companySlotPurchase.update({where:{id:purchase.id},data:{status:restoring?"PAID":reason,reversedAt:restoring?null:new Date()}});
    await tx.companySlotPaymentEvent.create({data:{id:eventId,type,purchaseId:purchase.id}});return {received:true};
  });
}
export async function handleSlotEvent(event:Stripe.Event){
  const stripe=await slotStripe();
  if(event.livemode!==(paymentAvailability().mode==="live"))throw new AppError("Mode de paiement incompatible.",400);
  if(["checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.expired"].includes(event.type)){
    const object=event.data.object as Stripe.Checkout.Session;
    if(object.metadata?.purpose!=="company_slot")return {ignored:true};
    // Retrieve authoritative state; a browser success URL is never proof of payment.
    return fulfillSlotSession(event.id,event.type,await stripe.checkout.sessions.retrieve(object.id,{expand:["payment_intent.latest_charge"]}));
  }
  if(event.type==="charge.refunded"){
    const charge=await stripe.charges.retrieve((event.data.object as Stripe.Charge).id);
    if(charge.currency==="eur"&&charge.refunded&&typeof charge.payment_intent==="string")return adjustSlotPayment(event.id,event.type,charge.payment_intent,"REFUNDED");
  }
  if(event.type==="charge.dispute.created"||event.type==="charge.dispute.closed"){
    const dispute=await stripe.disputes.retrieve((event.data.object as Stripe.Dispute).id),charge=await stripe.charges.retrieve(typeof dispute.charge==="string"?dispute.charge:dispute.charge.id);
    if(typeof charge.payment_intent==="string")return adjustSlotPayment(event.id,event.type,charge.payment_intent,charge.refunded?"REFUNDED":dispute.status==="won"?"RESTORED":"DISPUTED");
  }
  return {ignored:true};
}
