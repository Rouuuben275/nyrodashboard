import {Prisma} from "@prisma/client";
import {ZodError} from "zod";
import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {platformQuery} from "@/domains/platform/validation";
import {readPlatform} from "@/domains/platform/queries";
import {executePlatform} from "@/domains/platform/service";
export const dynamic="force-dynamic";
function failure(e:unknown){const status=e instanceof AppError?e.status:e instanceof ZodError?400:e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002"?409:500;return Response.json({error:e instanceof AppError?e.message:e instanceof ZodError?e.issues.map(i=>`${i.path.join(".")} : ${i.message}`).join(" · "):status===409?"Identifiant ou slug déjà utilisé.":"Opération administrative impossible."},{status,headers:{"Cache-Control":"private, no-store"}});}
export async function GET(req:Request){try{const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});return Response.json(await readPlatform(session.user.id,platformQuery.parse(Object.fromEntries(new URL(req.url).searchParams))),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return failure(e);}}
export async function POST(req:Request){try{
  if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  if(Number(req.headers.get("content-length")||0)>32000)throw new AppError("Requête trop volumineuse.",413);const text=await req.text();if(text.length>32000)throw new AppError("Requête trop volumineuse.",413);
  let body;try{body=JSON.parse(text);}catch{throw new AppError("JSON invalide.");}
  return Response.json({data:await executePlatform(session.user,body,new Date(session.session.createdAt))},{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return failure(e);}}
