import {streamResponse} from "@/lib/stream-response";
import {billingHeaders} from "@/domains/billing/http";
import {AppError} from "@/domains/core/errors";
export async function privateReport(format:string,company:string,title:string,selection:string,note:string,columns:string[],rows:unknown[][],name:string){
 if(format==="pdf"){
  const {tableReportPdf}=await import("@/lib/table-report-pdf");const bytes=await tableReportPdf({company,title,selection,note,columns,rows,branding:"NYRO DASHBOARD / RAPPORT INTERNE RP"});
  return streamResponse(new Uint8Array(bytes),{headers:{...billingHeaders,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${name}.pdf"`}});
 }
 if(format!=="csv")throw new AppError("Format d’export invalide.");
 const cell=(v:unknown)=>{const s=String(v??"");return `"${(/^[\s]*[=+\-@]|^[\t\r]/.test(s)?"'":"")+s.replaceAll('"','""')}"`;};
 return streamResponse("\uFEFF"+[columns,...rows].map(r=>r.map(cell).join(";")).join("\r\n"),{headers:{...billingHeaders,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${name}.csv"`}});
}
