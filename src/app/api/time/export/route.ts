export const runtime="nodejs";
import {streamResponse} from "@/lib/stream-response";
import {activeSession} from "@/lib/active-session";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {timeQuery} from "@/domains/time/validation";
import {timeReport} from "@/domains/time/queries";
import {tableReportPdf} from "@/lib/table-report-pdf";
import {ZodError} from "zod";
export const dynamic="force-dynamic";
const labels:Record<string,string>={OPEN:"En cours",PENDING:"À valider",APPROVED:"Validé",REJECTED:"Refusé"};
const csv=(v:string|number)=>`"${String(typeof v==="string"&&/^[=+\-@\t\r]/.test(v)?`'${v}`:v).replaceAll('"','""')}"`;
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  const params=new URL(req.url).searchParams,q=timeQuery.parse(Object.fromEntries(params)),format=params.get("format")??"csv";
  if(!["csv","pdf"].includes(format))throw new AppError("Format d’export invalide.");
  const report=await timeReport(session.user.id,q,format==="pdf"?1000:10000);
  const date=(d:Date|null)=>d?d.toLocaleString("fr-FR",{timeZone:"Europe/Paris"}):"En cours";
  const columns=["Employé","Département actuel","Début retenu Paris","Fin retenue Paris","Pause minutes","Net minutes","Minutes validées","Statut","Corrigé","Référence"];
  const rows=report.rows.map(r=>[r.characterName,r.department,date(r.start),date(r.end),r.pauseMinutes,r.minutes,r.status==="APPROVED"?r.minutes:0,labels[r.status],r.corrected?"Oui":"Non",r.id]);
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if(format==="pdf"){
    const pdf=await tableReportPdf({company:report.company,title:"Pointages et heures validées",branding:"NYRO DASHBOARD / POINTAGE RP",selection:`Du ${q.from??"début"} au ${q.to??"jour courant"} · Statut : ${q.status?labels[q.status]:"tous"}`,note:"Horaires retenus après corrections, pauses déduites. Les services ouverts sont provisoires. Le département correspond à l’affectation actuelle. Aucun versement automatique.",columns,rows});
    return streamResponse(new Uint8Array(pdf),{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\"nyro-pointage.pdf\""}});
  }
  return streamResponse("\uFEFF"+[columns,...rows].map(row=>row.map(csv).join(";")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=\"nyro-pointage.csv\""}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Filtres de pointage invalides."},{status:400});console.error("Time export failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Export du pointage impossible."},{status:500});}}
