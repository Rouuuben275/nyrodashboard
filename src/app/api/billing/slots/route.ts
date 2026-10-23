import {z} from "zod";
import {activeSession} from "@/lib/active-session";
import {billingOverview} from "@/domains/billing/service";
import {billingFailure,billingHeaders} from "@/domains/billing/http";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401,headers:billingHeaders});
  const page=z.coerce.number().int().min(1).max(100000).parse(new URL(req.url).searchParams.get("page")??1);
  return Response.json(await billingOverview(session.user.id,page),{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
