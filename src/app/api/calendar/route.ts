import {activeSession} from "@/lib/active-session";
import {ZodError} from "zod";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {calendarQuery} from "@/domains/calendar/validation";
import {readCalendar} from "@/domains/calendar/queries";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  return Response.json(await readCalendar(session.user.id,calendarQuery.parse(Object.fromEntries(new URL(req.url).searchParams))),{headers:{"Cache-Control":"private, no-store"}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Paramètres du calendrier invalides."},{status:400});console.error("Calendar read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement du calendrier impossible."},{status:500});}}
