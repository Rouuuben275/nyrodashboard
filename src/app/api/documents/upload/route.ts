import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {billingFailure,billingHeaders,boundedBody} from "@/domains/billing/http";
import {AppError} from "@/domains/core/errors";
import {transferCommand,transferPart,TRANSFER_PART_BYTES} from "@/domains/documents/transfers";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function actor(req:Request){if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);const session=await activeSession({headers:req.headers});if(!session)throw new AppError("Connexion requise.",401);return session.user;}
export async function POST(req:Request){try{
 const user=await actor(req);let raw:unknown;try{raw=JSON.parse(await boundedBody(req,12000));}catch(e){if(e instanceof AppError)throw e;throw new AppError("Formulaire invalide.");}
 return Response.json(await transferCommand(user,raw),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
export async function PUT(req:Request){try{
 const user=await actor(req),reader=req.body?.getReader(),parts:Uint8Array[]=[];let size=0;
 if(Number(req.headers.get("content-length")||0)>TRANSFER_PART_BYTES)throw new AppError("Fragment limité à 1 Mo.",413);
 if(reader)try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>TRANSFER_PART_BYTES){await reader.cancel();throw new AppError("Fragment limité à 1 Mo.",413);}parts.push(p.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 return Response.json(await transferPart(user,Object.fromEntries(new URL(req.url).searchParams),bytes),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
