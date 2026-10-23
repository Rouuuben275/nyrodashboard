import PDFDocument from "pdfkit";
import {reportFont} from "@/lib/report-font";
import { financeKindLabels } from "./constants";
import type { LedgerRow } from "./queries";
const money=(amount:number)=>`${(amount/100).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} $ RP`;
export async function financePdf(company:string, period:string, rows:LedgerRow[], summary:{income:number;expense:number;result:number}) {
  return new Promise<Buffer>((resolve,reject)=>{
    const font=reportFont();
    // PDFKit accepts embedded font bytes at construction; its separate @types
    // package still describes this one constructor option as a filename only.
    const doc=new PDFDocument({font:font as unknown as string,size:"A4",margin:42,bufferPages:true,info:{Title:`Journal RP — ${company}`,Author:"Nyro Dashboard",Subject:"Registre comptable RP autonome"}});
    const buffers:Buffer[]=[];doc.on("data",b=>buffers.push(b));doc.on("end",()=>resolve(Buffer.concat(buffers)));doc.on("error",reject);
    try{
      doc.registerFont("Nyro Dashboard",font);doc.font("Nyro Dashboard");
      doc.fontSize(10).fillColor("#666666").text("NYRO DASHBOARD / COMPTABILITÉ RP");doc.moveDown(.7);
      doc.fontSize(23).fillColor("#111111").text(company,{width:510});doc.moveDown(.3);doc.fontSize(10).fillColor("#666666").text(period);
      doc.moveDown();doc.fontSize(10).fillColor("#222222").text(`Revenus nets : ${money(summary.income)}   ·   Charges nettes : ${money(summary.expense)}`);doc.text(`Résultat RP : ${money(summary.result)} — ouvertures et transferts exclus`);doc.moveDown();
      const header=()=>{const y=doc.y;doc.rect(42,y,511,24).fill("#eeeeee");doc.fillColor("#222222").fontSize(9).text("Date / opération / compte",50,y+7,{width:360});doc.text("Montant RP",420,y+7,{width:125,align:"right"});doc.y=y+32;};header();
      for(const row of rows){
        const label=`${row.label}\n${financeKindLabels[row.kind]||row.kind} · ${row.accountName} · ${row.categoryName}\n${new Date(row.date).toLocaleString("fr-FR",{timeZone:"Europe/Paris",dateStyle:"short",timeStyle:"short"})} · ${row.actorName}`;
        const height=Math.max(56,doc.fontSize(9).heightOfString(label,{width:355})+16);
        if(doc.y+height>doc.page.height-62){doc.addPage();header();}
        const y=doc.y;doc.fillColor("#222222").fontSize(9).text(label,50,y,{width:355});doc.fontSize(10).text(money(row.amount),415,y,{width:130,align:"right"});doc.moveTo(42,y+height-8).lineTo(553,y+height-8).strokeColor("#dddddd").lineWidth(.5).stroke();doc.y=y+height;
      }
      if(!rows.length)doc.fontSize(11).text("Aucune écriture pour cette sélection.");
      const pages=doc.bufferedPageRange();for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.fontSize(8).fillColor("#777777").text(`Registre interne RP · Aucun transfert en jeu · Europe/Paris · ${rows.length} écritures`,42,doc.page.height-36,{width:445,lineBreak:false});doc.text(`${i+1}/${pages.count}`,495,doc.page.height-36,{width:58,align:"right",lineBreak:false});}
      doc.end();
    }catch(e){doc.destroy();reject(e);}
  });
}
