import {activeSession} from "@/lib/active-session";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {publicJob} from "@/domains/recruitment/queries";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{const {id}=await params;const session=await activeSession({headers:req.headers});return Response.json({...await publicJob(id,session?.user.id),signedIn:Boolean(session)},{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});console.error("Public job read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement de l’offre impossible."},{status:500});}
}
