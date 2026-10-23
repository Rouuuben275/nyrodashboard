import {activeSession} from "@/lib/active-session";
import {ZodError} from "zod";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {recruitmentQuery} from "@/domains/recruitment/validation";
import {readRecruitment} from "@/domains/recruitment/queries";
export async function GET(req:Request){try{const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});return Response.json(await readRecruitment(session.user.id,recruitmentQuery.parse(Object.fromEntries(new URL(req.url).searchParams))),{headers:{"Cache-Control":"private, no-store"}});}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres invalides."},{status:400});console.error("Recruitment read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement du recrutement impossible."},{status:500});}}
