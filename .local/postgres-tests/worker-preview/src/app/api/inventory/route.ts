import {activeSession} from "@/lib/active-session";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {stockQuery} from "@/domains/inventory/validation";
import {readStock} from "@/domains/inventory/queries";
import {ZodError} from "zod";
export async function GET(req:Request){try{const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});return Response.json(await readStock(session.user.id,stockQuery.parse(Object.fromEntries(new URL(req.url).searchParams))),{headers:{"Cache-Control":"private, no-store"}});}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres de stock invalides."},{status:400});console.error("Stock read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement des stocks impossible."},{status:500});}}
