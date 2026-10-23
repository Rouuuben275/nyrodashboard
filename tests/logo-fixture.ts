import {deflateSync} from "node:zlib";
import {pngCrc} from "../src/domains/media/png";
export function pngChunk(type:string,data:Uint8Array){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);b.set(data,8);b.writeUInt32BE(pngCrc(b.subarray(4,b.length-4)),b.length-4);return b;}
export function logoPng({width=2,height=2,raw,extra=[]}:{width?:number;height?:number;raw?:Uint8Array;extra?:Buffer[]}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=raw??Buffer.from(Array.from({length:height},()=>[0,...Array.from({length:width},()=>[210,210,210,255]).flat()]).flat());
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk("IHDR",header),...extra,pngChunk("IDAT",deflateSync(rows)),pngChunk("IEND",Buffer.alloc(0))]);
}
