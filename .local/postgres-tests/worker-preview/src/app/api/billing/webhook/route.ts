import {verifyStripeEvent} from "@/domains/billing/stripe";
import {handleSlotEvent} from "@/domains/billing/service";
import {boundedBody,billingFailure,billingHeaders} from "@/domains/billing/http";
import {AppError} from "@/domains/core/errors";
export const dynamic="force-dynamic";
export async function POST(req:Request){try{
  const signature=req.headers.get("stripe-signature");if(!signature)throw new AppError("Signature Stripe requise.",400);
  const event=await verifyStripeEvent(await boundedBody(req,262144),signature);
  return Response.json(await handleSlotEvent(event),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
