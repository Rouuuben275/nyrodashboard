const CHUNK=1024*1024;
export async function uploadPrivateFile(kind:"LIBRARY"|"RECORD",metadata:Record<string,string>,file:File,signal:AbortSignal,progress?:(v:number)=>void){
 const parse=async(r:Response)=>{const data=await r.json();if(!r.ok)throw new Error(data.error||"Transfert impossible.");return data;};
 if(file.size<=CHUNK){const endpoint=kind==="LIBRARY"?"/api/documents/file":"/api/attachments";return parse(await fetch(`${endpoint}?${new URLSearchParams(metadata)}`,{method:"POST",headers:{"Content-Type":file.type},body:file,signal}));}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("");
 const command=(body:unknown)=>fetch("/api/documents/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal}).then(parse);
 const start=await command({action:"start",kind,metadata,size:file.size,digest,mimeType:file.type});if(start.result)return start.result;
 for(let index=start.nextPart;index<Math.ceil(file.size/CHUNK);index++){
  await parse(await fetch(`/api/documents/upload?${new URLSearchParams({id:start.id,index:String(index)})}`,{method:"PUT",headers:{"Content-Type":"application/octet-stream"},body:file.slice(index*CHUNK,(index+1)*CHUNK),signal}));progress?.(Math.round(Math.min((index+1)*CHUNK,file.size)/file.size*95));
 }
 const finished=await command({action:"finish",id:start.id});return finished.result as {id:string;revision:number};
}
