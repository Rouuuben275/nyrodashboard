import PDFDocument from "pdfkit";
import {reportFont} from "@/lib/report-font";

/** A printable snapshot; uses the same embedded font under Node and Workers. */
export function tableReportPdf({company,title,selection,note,columns,rows,branding="NYRO DASHBOARD / STOCKS RP"}:{company:string;title:string;selection:string;note:string;columns:string[];rows:unknown[][];branding?:string}) {
  return new Promise<Buffer>((resolve,reject)=>{
    const font=reportFont();
    const doc=new PDFDocument({font:font as unknown as string,size:"A4",margin:42,bufferPages:true,info:{Title:`${title} — ${company}`,Author:"Nyro Dashboard",Subject:branding}});
    const chunks:Buffer[]=[];doc.on("data",chunk=>chunks.push(chunk));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);
    try {
      doc.registerFont("Nyro Dashboard",font).font("Nyro Dashboard");
      doc.fontSize(10).fillColor("#666666").text(branding);doc.moveDown(.7);
      doc.fontSize(23).fillColor("#111111").text(company,{width:510});doc.moveDown(.4);
      doc.fontSize(14).text(title);doc.moveDown(.4);
      doc.fontSize(9).fillColor("#555555").text(selection,{width:511});doc.moveDown(.5);
      doc.text(`Édité le ${new Date().toLocaleString("fr-FR",{timeZone:"Europe/Paris"})} · ${rows.length} ligne(s)`);
      doc.text(note,{width:511});doc.moveDown();
      const header=()=>{const y=doc.y;doc.rect(42,y,511,23).fill("#eeeeee");doc.fillColor("#222222").fontSize(9).text(title,50,y+6,{width:490});doc.y=y+32;};header();
      for(const row of rows){
        const content=row.map((value,i)=>`${columns[i]} : ${value===null||value===undefined||value===""?"—":String(value)}`).join("\n");
        const height=doc.fontSize(9).heightOfString(content,{width:491})+22;
        if(doc.y+height>doc.page.height-62){doc.addPage();header();}
        const y=doc.y;
        doc.fontSize(9).fillColor("#222222").text(content,50,y,{width:491});
        doc.moveTo(42,y+height-10).lineTo(553,y+height-10).strokeColor("#dddddd").lineWidth(.5).stroke();doc.y=y+height;
      }
      if(!rows.length)doc.fontSize(11).fillColor("#222222").text("Aucune ligne pour cette sélection.");
      const pages=doc.bufferedPageRange();
      for(let i=0;i<pages.count;i++){
        doc.switchToPage(i);doc.page.margins.bottom=0;
        doc.fontSize(8).fillColor("#777777").text(`Registre interne RP · Europe/Paris · ${rows.length} ligne(s)`,42,doc.page.height-36,{width:440,lineBreak:false});
        doc.text(`${i+1}/${pages.count}`,495,doc.page.height-36,{width:58,align:"right",lineBreak:false});
      }
      doc.end();
    } catch(e){doc.destroy();reject(e);}
  });
}
