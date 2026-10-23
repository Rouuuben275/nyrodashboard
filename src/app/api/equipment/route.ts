import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {billingFailure,billingHeaders,boundedBody} from "@/domains/billing/http";
import {readEquipment} from "@/domains/equipment/queries";
import {writeEquipment} from "@/domains/equipment/service";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{const s=await activeSession({headers:req.headers});if(!s)throw new AppError("Connexion requise.",401);return Response.json(await readEquipment(s.user.id,Object.fromEntries(new URL(req.url).searchParams)),{headers:billingHeaders});}catch(e){return billingFailure(e);}}
export async function POST(req:Request){try{
 if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
 const s=await activeSession({headers:req.headers});if(!s)throw new AppError("Connexion requise.",401);let raw:unknown;try{raw=JSON.parse(await boundedBody(req,24000));}catch(e){if(e instanceof AppError)throw e;throw new AppError("Formulaire invalide.");}
 return Response.json(await writeEquipment(s.user,raw),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
