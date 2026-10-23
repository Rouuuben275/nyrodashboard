import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {billingFailure,billingHeaders} from "@/domains/billing/http";
import {uploadLogo} from "@/domains/media/service";
import {MAX_LOGO_BYTES} from "@/domains/media/validation";
export const dynamic="force-dynamic";
export async function POST(req:Request){try{
 if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
 const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401,headers:billingHeaders});
 if(req.headers.get("content-type")!=="image/png")throw new AppError("Le formulaire doit préparer une image PNG.",415);
 if(Number(req.headers.get("content-length")||0)>MAX_LOGO_BYTES)throw new AppError("Logo trop volumineux.",413);
 const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
 if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_LOGO_BYTES){await reader.cancel();throw new AppError("Logo trop volumineux.",413);}chunks.push(value);}}finally{reader.releaseLock();}}
 const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}
 const asset=await uploadLogo(session.user.id,Object.fromEntries(new URL(req.url).searchParams),bytes);
 return Response.json({...asset,url:`/api/logos/${asset.id}`},{status:201,headers:billingHeaders});
}catch(e){return billingFailure(e);}}
