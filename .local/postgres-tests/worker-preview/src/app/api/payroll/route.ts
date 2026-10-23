import {activeSession} from "@/lib/active-session";
import {ZodError} from "zod";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {readPayroll} from "@/domains/payroll/queries";
import {payrollQuery} from "@/domains/payroll/validation";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  const q=payrollQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return Response.json(await readPayroll(session.user.id,q),{headers:{"Cache-Control":"private, no-store"}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres de paie invalides."},{status:400});console.error("Payroll read failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Chargement de la paie impossible."},{status:500});}}
