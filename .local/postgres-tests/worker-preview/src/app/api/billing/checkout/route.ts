import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {startSlotCheckout} from "@/domains/billing/service";
import {boundedBody,billingFailure,billingHeaders} from "@/domains/billing/http";
export const dynamic="force-dynamic";
export async function POST(req:Request){try{
  if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
  if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw new AppError("Format JSON requis.",415);
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401,headers:billingHeaders});
  let raw:unknown;try{raw=JSON.parse(await boundedBody(req));}catch(e){if(e instanceof AppError)throw e;throw new AppError("JSON invalide.");}
  return Response.json(await startSlotCheckout(session.user.id,raw),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
