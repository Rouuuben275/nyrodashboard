import {z} from "zod";
import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {billingFailure,billingHeaders} from "@/domains/billing/http";
import {readLogo,discardLogo} from "@/domains/media/service";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,context:Context){try{
 const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401,headers:billingHeaders});
 const id=z.uuid().parse((await context.params).id),data=await readLogo(session.user.id,id);
 return new Response(new Uint8Array(data),{headers:{...billingHeaders,"Content-Type":"image/png","Content-Disposition":"inline; filename=logo.png","Content-Security-Policy":"default-src 'none'; sandbox"}});
}catch(e){return billingFailure(e);}}
export async function DELETE(req:Request,context:Context){try{
 if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
 const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401,headers:billingHeaders});
 return Response.json(await discardLogo(session.user.id,z.uuid().parse((await context.params).id)),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
