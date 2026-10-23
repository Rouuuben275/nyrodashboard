import {AppError} from "@/domains/core/errors";
import {MAX_LOGO_BYTES} from "./validation";
const signature=[137,80,78,71,13,10,26,10];
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function pngCrc(data:Uint8Array){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
// Uploaded files are decoded/re-encoded by the browser before transfer. The
// server independently checks the PNG structure/CRC, bounds and critical chunks,
// and strips metadata. No SVG, HTML, animation or original EXIF is served.
export async function validateLogoPng(bytes:Uint8Array){
 const fail=()=>{throw new AppError("Logo PNG invalide. Choisissez une image PNG, JPEG ou WebP depuis le formulaire.",415);};
 if(!bytes.length||bytes.length>MAX_LOGO_BYTES)throw new AppError("Le logo préparé doit faire au maximum 256 Ko.",413);
 if(!signature.every((n,i)=>bytes[i]===n))return fail();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts:Uint8Array[]=[bytes.slice(0,8)],compressed:Uint8Array<ArrayBuffer>[]=[];let at=8,width=0,height=0,hasData=false,ended=false,chunks=0;
 while(at+12<=bytes.length){
  if(++chunks>128)return fail();const length=view.getUint32(at),end=at+12+length;if(end>bytes.length)return fail();
  const type=String.fromCharCode(...bytes.subarray(at+4,at+8));
  if(!/^[A-Za-z]{4}$/.test(type)||pngCrc(bytes.subarray(at+4,end-4))!==view.getUint32(end-4))return fail();
  if(chunks===1){if(type!=="IHDR"||length!==13)return fail();width=view.getUint32(at+8);height=view.getUint32(at+12);if(width<1||height<1||width>512||height>512||bytes[at+16]!==8||![2,6].includes(bytes[at+17])||bytes[at+18]!==0||bytes[at+19]!==0||bytes[at+20]!==0)return fail();}
  else if(type==="IHDR"||type==="acTL"||type==="fcTL"||type==="fdAT")return fail();
  if(type==="IDAT"){if(!length)return fail();hasData=true;compressed.push(bytes.slice(at+8,end-4));}
  if(type==="IEND"){if(length||!hasData||end!==bytes.length)return fail();ended=true;}
  if(["IHDR","IDAT","IEND","PLTE","tRNS"].includes(type))parts.push(bytes.slice(at,end));
  else if(type[0]===type[0].toUpperCase())return fail();
  at=end;if(ended)break;
 }
 if(!ended||at!==bytes.length)return fail();
 const stride=1+width*(bytes[25]===6?4:3),expected=stride*height;
 const reader=new Blob(compressed).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
 let decoded=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;if(decoded+value.length>expected){await reader.cancel();return fail();}for(let i=(stride-decoded%stride)%stride;i<value.length;i+=stride)if(value[i]>4){await reader.cancel();return fail();}decoded+=value.length;}}
 catch{await reader.cancel().catch(()=>{});return fail();}finally{reader.releaseLock();}
 if(decoded!==expected)return fail();
 const data=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
 return {data,width,height,size:data.byteLength};
}
