import {activeSession} from "@/lib/active-session";
import {AppError} from "@/domains/core/errors";
import {billingFailure} from "@/domains/billing/http";
import {readStatistics} from "@/domains/statistics/queries";
import {privateReport} from "@/domains/utilities/export";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
 const s=await activeSession({headers:req.headers});if(!s)throw new AppError("Connexion requise.",401);
 const params=new URL(req.url).searchParams,format=params.get("format")??"csv";if(!["pdf","csv"].includes(format))throw new AppError("Format invalide.");params.delete("format");
 const max=format==="pdf"?200:5000,data=await readStatistics(s.user.id,Object.fromEntries(params),max+1);
 if(data.report.total>max)throw new AppError(`Plus de ${max} lignes : réduisez la période avant l’export ${format.toUpperCase()}.`,413);
 return await privateReport(format,data.company.name,"Statistiques de l’entreprise",`${data.period.from} → ${data.period.to} · Europe/Paris · ${params.get("section")??"overview"}`,"Données internes RP. Stock et emplois : état actuel. Ventes : état actuel des ventes créées sur la période. Produits : montants avant remise globale. Heures : services validés débutant dans la période, sans prorata. Résultat de trésorerie, sans comptabilité fiscale.",data.report.columns,data.report.rows,"nyro-statistiques");
}catch(e){return billingFailure(e);}}
