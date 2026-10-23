import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";

export function paymentAvailability(){
  const env=databaseRuntime().env,mode=env.RPILOT_SLOT_PAYMENTS_MODE;
  if(mode!=="test"&&mode!=="live")return {enabled:false,mode:"disabled" as const};
  const prefix=mode==="live"?"sk_live_":"sk_test_";
  return {enabled:!!env.STRIPE_SECRET_KEY?.startsWith(prefix)&&!!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"),mode};
}
export async function slotStripe(){
  const state=paymentAvailability(),env=databaseRuntime().env;
  if(!state.enabled)throw new AppError("L’achat de slots n’est pas encore ouvert. L’administration Nyro Dashboard peut vous attribuer des slots.",503);
  const {default:Stripe}=await import("stripe");
  return new Stripe(env.STRIPE_SECRET_KEY!,{httpClient:Stripe.createFetchHttpClient(),timeout:10000,maxNetworkRetries:1});
}
export async function verifyStripeEvent(raw:string,signature:string){
  try{const client=await slotStripe(),{default:Stripe}=await import("stripe");return await client.webhooks.constructEventAsync(raw,signature,databaseRuntime().env.STRIPE_WEBHOOK_SECRET!,300,Stripe.createSubtleCryptoProvider());}
  catch(e){if(e instanceof AppError)throw e;throw new AppError("Signature Stripe invalide.",400);}
}
