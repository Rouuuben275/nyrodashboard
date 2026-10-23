import {activeSession} from "@/lib/active-session";
import {ZodError} from "zod";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {announcementQuery} from "@/domains/announcements/validation";
import {readAnnouncements} from "@/domains/announcements/queries";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  return Response.json(await readAnnouncements(session.user.id,announcementQuery.parse(Object.fromEntries(new URL(req.url).searchParams))),{headers:{"Cache-Control":"private, no-store"}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Paramètres des annonces invalides."},{status:400});console.error("Announcement read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement des annonces impossible."},{status:500});}}
