import {activeSession} from "@/lib/active-session";
import {ZodError} from "zod";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {readTasks} from "@/domains/tasks/queries";
import {tasksQuery} from "@/domains/tasks/validation";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  return Response.json(await readTasks(session.user.id,tasksQuery.parse(Object.fromEntries(new URL(req.url).searchParams))),{headers:{"Cache-Control":"private, no-store"}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Paramètres des tâches invalides."},{status:400});console.error("Task read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement des tâches impossible."},{status:500});}}
