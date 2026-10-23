import {ZodError} from "zod";
import {Prisma} from "@prisma/client";
import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {admissionQuery} from "@/domains/servers/validation";
import {readAdmissions} from "@/domains/servers/queries";
import {executeAdmission} from "@/domains/servers/service";
export const dynamic="force-dynamic";
function failure(e:unknown){const status=e instanceof AppError?e.status:e instanceof ZodError?400:e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002"?409:500;return Response.json({error:e instanceof AppError?e.message:e instanceof ZodError?e.issues.map(i=>i.message).join(" · "):status===409?"Cette adhésion existe déjà.":"Opération d’admission impossible."},{status,headers:{"Cache-Control":"private, no-store"}});}
export async function GET(req:Request){try{const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});return Response.json(await readAdmissions(session.user.id,admissionQuery.parse(Object.fromEntries(new URL(req.url).searchParams))),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return failure(e);}}
export async function POST(req:Request){try{if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});if(Number(req.headers.get("content-length")||0)>12000)throw new AppError("Requête trop volumineuse.",413);const text=await req.text();if(text.length>12000)throw new AppError("Requête trop volumineuse.",413);let raw;try{raw=JSON.parse(text);}catch{throw new AppError("JSON invalide.");}return Response.json({data:await executeAdmission(session.user,raw)},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return failure(e);}}
