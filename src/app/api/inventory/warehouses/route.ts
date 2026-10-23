import {activeSession} from "@/lib/active-session";
import {ZodError} from "zod";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {readWarehouses,warehouseQuery} from "@/domains/inventory/warehouses";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  const query=warehouseQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return Response.json(await readWarehouses(session.user.id,query),{headers:{"Cache-Control":"private, no-store"}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres invalides."},{status:400});console.error("Warehouse read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Lecture des entrepôts impossible."},{status:500});}}
