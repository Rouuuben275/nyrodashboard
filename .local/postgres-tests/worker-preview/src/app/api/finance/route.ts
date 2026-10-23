import {activeSession} from "@/lib/active-session";
import { auth } from "@/lib/auth";
import { AppError } from "@/domains/core/errors";
import { financeQuery } from "@/domains/finance/validation";
import { readFinance } from "@/domains/finance/queries";
import { ZodError } from "zod";
export async function GET(req:Request) {
  try{const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});const query=financeQuery.parse(Object.fromEntries(new URL(req.url).searchParams));return Response.json(await readFinance(session.user.id,query),{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres comptables invalides."},{status:400});console.error("Finance read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement comptable impossible."},{status:500});}
}
