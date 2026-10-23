import {ZodError} from "zod";
import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {recordDocFeedback} from "@/domains/documentation/feedback";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function POST(req:Request){try{
 if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
 if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw new AppError("Format JSON requis.",415);
 const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise pour enregistrer votre avis."},{status:401,headers});
 if(Number(req.headers.get("content-length")||0)>2048)throw new AppError("Requête trop volumineuse.",413);
 const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
 if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw new AppError("Requête trop volumineuse.",413);}chunks.push(value);}}finally{reader.releaseLock();}}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 let raw:unknown;try{raw=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError("JSON invalide.");}
 return Response.json(await recordDocFeedback(session.user.id,raw),{headers});
 }catch(e){const status=e instanceof AppError?e.status:e instanceof ZodError?400:500;return Response.json({error:e instanceof AppError?e.message:e instanceof ZodError?"Avis invalide.":"Avis non enregistré. Réessayez plus tard."},{status,headers});}
}
