import {activeSession} from "@/lib/active-session";
import {auditQuery,readAudit,auditCsv} from "@/domains/audit/queries";
import {billingFailure,billingHeaders} from "@/domains/billing/http";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401,headers:billingHeaders});
  const url=new URL(req.url),query=auditQuery.parse(Object.fromEntries(url.searchParams)),exporting=url.searchParams.get("format")==="csv";
  const data=await readAudit(session.user.id,query,exporting);
  return exporting?new Response(auditCsv(data),{headers:{...billingHeaders,"Content-Type":"text/csv;charset=utf-8","Content-Disposition":"attachment; filename=nyro-audit.csv"}}):Response.json(data,{headers:billingHeaders});
}catch(e){return billingFailure(e);}}
