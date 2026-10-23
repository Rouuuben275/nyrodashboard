import {AppError} from "@/domains/core/errors";
import {MAX_DOCUMENT_BYTES} from "./validation";
import {pngCrc} from "@/domains/media/png";
export async function documentBytes(req:Request){
 if(Number(req.headers.get("content-length")||0)>MAX_DOCUMENT_BYTES)throw new AppError("Fichier limité à 5 Mo.",413);
 const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
 if(reader){try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_DOCUMENT_BYTES){await reader.cancel();throw new AppError("Fichier limité à 5 Mo.",413);}chunks.push(part.value);}}finally{reader.releaseLock();}}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
// Signature, bounded image structure and extension checks. This is not an antivirus.
// Active formats (HTML/SVG/Office/archives) are never accepted or served.
export function inspectDocument(bytes:Uint8Array,fileName:string,declaredType:string){
 if(!bytes.length||bytes.length>MAX_DOCUMENT_BYTES)throw new AppError("Le fichier doit contenir entre 1 octet et 5 Mo.",413);
 const invalid=()=>{throw new AppError("Fichier invalide ou format non autorisé. Utilisez PDF, PNG, JPEG ou texte UTF-8.",415);};
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);let type="",extension="";
 if(bytes.length>20&&new TextDecoder().decode(bytes.subarray(0,8)).match(/^%PDF-(1\.[0-7]|2\.0)/)&&new TextDecoder().decode(bytes.subarray(Math.max(0,bytes.length-1024))).trimEnd().endsWith("%%EOF")){type="application/pdf";extension="pdf";}
 else if(bytes.length>=45&&[137,80,78,71,13,10,26,10].every((v,i)=>v===bytes[i])){
   let at=8,count=0,hasData=false,ended=false;
   while(at+12<=bytes.length){if(++count>4096)return invalid();const length=view.getUint32(at),end=at+length+12;if(end>bytes.length)return invalid();const chunk=String.fromCharCode(...bytes.subarray(at+4,at+8));
     if(pngCrc(bytes.subarray(at+4,end-4))!==view.getUint32(end-4))return invalid();
     if(count===1){if(chunk!=="IHDR"||length!==13)return invalid();const w=view.getUint32(at+8),h=view.getUint32(at+12);if(!w||!h||w>4096||h>4096||w*h>16000000)return invalid();}
     else if(chunk==="IHDR"||["acTL","fcTL","fdAT"].includes(chunk))return invalid();
     if(chunk==="IDAT")hasData=true;if(chunk==="IEND"){if(length||!hasData||end!==bytes.length)return invalid();ended=true;}
     at=end;if(ended)break;
   }if(!ended)return invalid();type="image/png";extension="png";
 }else if(bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
   let at=2,dimensions=false;
   while(at+4<bytes.length){if(bytes[at++]!==255)return invalid();while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===218)break;const length=view.getUint16(at);if(length<2||at+length>bytes.length)return invalid();
     if([192,193,194].includes(marker)){if(length<8)return invalid();const h=view.getUint16(at+3),w=view.getUint16(at+5);if(!w||!h||w>4096||h>4096||w*h>16000000)return invalid();dimensions=true;}at+=length;
   }if(!dimensions)return invalid();type="image/jpeg";extension="jpe?g";
 }else if(fileName.toLowerCase().endsWith(".txt")){
   let text:string;try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{return invalid();}
   if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))return invalid();type="text/plain";extension="txt";
 }else return invalid();
 if(!new RegExp(`\\.${extension}$`,"i").test(fileName)||declaredType.split(";")[0].trim()!==type)return invalid();return type;
}
