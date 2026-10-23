import {activeSession} from "@/lib/active-session";
import {z,ZodError} from "zod";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {readTime} from "@/domains/time/queries";
import {timeQuery} from "@/domains/time/validation";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  const params=Object.fromEntries(new URL(req.url).searchParams),q=timeQuery.parse(params),entryId=z.string().min(1).max(100).optional().parse(params.entryId);
  return Response.json(await readTime(session.user.id,{...q,entryId}),{headers:{"Cache-Control":"private, no-store"}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres de pointage invalides."},{status:400});console.error("Time read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement du pointage impossible."},{status:500});}}
