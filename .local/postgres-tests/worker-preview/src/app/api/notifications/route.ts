import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {billingFailure,billingHeaders,boundedBody} from "@/domains/billing/http";
import {readNotifications,writeNotification} from "@/domains/notifications/service";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{const session=await activeSession({headers:req.headers});if(!session)throw new AppError("Connexion requise.",401);return Response.json(await readNotifications(session.user.id,Object.fromEntries(new URL(req.url).searchParams)),{headers:billingHeaders});}catch(e){return billingFailure(e);}}
export async function POST(req:Request){try{
 if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
 const session=await activeSession({headers:req.headers});if(!session)throw new AppError("Connexion requise.",401);
 let raw:unknown;try{raw=JSON.parse(await boundedBody(req,4096));}catch(e){if(e instanceof AppError)throw e;throw new AppError("Formulaire invalide.");}
 return Response.json(await writeNotification(session.user.id,raw),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
