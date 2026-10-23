import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {billingFailure,billingHeaders,boundedBody} from "@/domains/billing/http";
import {readTheme,saveTheme} from "@/domains/profile/theme";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
 const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401,headers:billingHeaders});
 return Response.json(await readTheme(session.user.id),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
export async function PATCH(req:Request){try{
 if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
 const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401,headers:billingHeaders});
 if(!req.headers.get("content-type")?.startsWith("application/json"))throw new AppError("JSON requis.",415);
 let body;try{body=JSON.parse(await boundedBody(req,1024));}catch(e){if(e instanceof AppError)throw e;throw new AppError("JSON invalide.");}
 return Response.json(await saveTheme(session.user.id,body),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
