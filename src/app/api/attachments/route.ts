import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {billingFailure,billingHeaders,boundedBody} from "@/domains/billing/http";
import {documentBytes} from "@/domains/documents/files";
import {readAttachments,writeAttachment} from "@/domains/attachments/service";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{const s=await activeSession({headers:req.headers});if(!s)throw new AppError("Connexion requise.",401);return Response.json(await readAttachments(s.user.id,Object.fromEntries(new URL(req.url).searchParams)),{headers:billingHeaders});}catch(e){return billingFailure(e);}}
export async function POST(req:Request){try{
 if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
 const s=await activeSession({headers:req.headers});if(!s)throw new AppError("Connexion requise.",401);
 const type=req.headers.get("content-type")||"";
 if(type.split(";")[0]==="application/json"){
  let raw:unknown;try{raw=JSON.parse(await boundedBody(req,6000));}catch(e){if(e instanceof AppError)throw e;throw new AppError("Formulaire invalide.");}
  return Response.json(await writeAttachment(s.user,raw),{headers:billingHeaders});
 }
 return Response.json(await writeAttachment(s.user,Object.fromEntries(new URL(req.url).searchParams),{bytes:await documentBytes(req),type}),{status:201,headers:billingHeaders});
}catch(e){return billingFailure(e);}}
