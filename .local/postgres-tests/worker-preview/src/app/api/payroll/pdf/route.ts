import {activeSession} from "@/lib/active-session";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {readPayroll} from "@/domains/payroll/queries";
import {payrollQuery} from "@/domains/payroll/validation";
import {payrollStatuses} from "@/domains/payroll/constants";
import {tableReportPdf} from "@/lib/table-report-pdf";
import {ZodError} from "zod";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{
  const session=await activeSession({headers:req.headers});if(!session)return Response.json({error:"Connexion requise."},{status:401});
  const q=payrollQuery.parse(Object.fromEntries(new URL(req.url).searchParams));if(!q.slipId)throw new AppError("Bulletin requis.");
  const data=await readPayroll(session.user.id,q),s=data.selected!;
  const money=(n:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:data.company.currency}).format(n/100);
    const pdf=await tableReportPdf({company:data.company.name,title:`Bulletin de paie RP · ${s.employeeName}`,branding:"NYRO DASHBOARD / PAIE RP",selection:`${s.companyRun.label} · ${s.companyRun.from.toISOString().slice(0,10)} au ${s.companyRun.to.toISOString().slice(0,10)} · ${payrollStatuses[s.status]} · version ${s.revision}`,note:"Document de gestion Roleplay. Aucun salaire réel ni virement bancaire. Les montants sont des écritures internes RP.",columns:["Rubrique","Détail"],rows:[
    ["Employé / grade / département",`${s.employeeName} · ${s.roleName} · ${s.department}`],
    ["Règle",`${s.mode==="FIXED"?"Forfait de la période":"Taux horaire"} : ${money(s.rate)} ; seuil de période ${s.regularMinutes} min ; majoration horaire ×${s.overtimeBps/10000}`],
    ["Temps validé",`${s.workedMinutes} min, dont ${s.overtimeMinutes} min au-delà du seuil`],
    ["Base",money(s.baseAmount)],["Heures supplémentaires",money(s.overtimeAmount)],
    ["Commission",`${money(s.commissionAmount)} (${s.commissionBps/100} % de ${money(s.salesAmount)})`],
    ["Prime",money(s.bonus)],["Retenue RP",money(s.deduction)],["Net RP",money(s.total)],
    ["Note du bulletin",s.note],["Versement",s.paidAt?`${s.paidAt.toLocaleString("fr-FR",{timeZone:"Europe/Paris"})} · ${s.accountLabel}`:"Non versé"],
  ]});
  return new Response(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="bulletin-rp-${s.id}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}catch(e){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});if(e instanceof ZodError)return Response.json({error:"Bulletin invalide."},{status:400});console.error("Payroll PDF failed",e instanceof Error?e.message:"Unknown");return Response.json({error:"Génération du bulletin impossible."},{status:500});}}
