import {activeSession} from "@/lib/active-session";
import {z,ZodError} from "zod";
import {auth} from "@/lib/auth";
import {candidateApplications} from "@/domains/recruitment/queries";
export async function GET(req:Request){try{const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});const page=z.coerce.number().int().min(1).max(100000).default(1).parse(new URL(req.url).searchParams.get("page")??undefined);return Response.json(await candidateApplications(session.user.id,page),{headers:{"Cache-Control":"private, no-store"}});}catch(e){if(e instanceof ZodError)return Response.json({error:"Page invalide."},{status:400});console.error("Candidate read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement des candidatures impossible."},{status:500});}}
