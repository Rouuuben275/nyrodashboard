import {ZodError} from "zod";
import {AppError} from "@/domains/core/errors";
export const billingHeaders={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function boundedBody(req:Request,max=2048){
  if(Number(req.headers.get("content-length")||0)>max)throw new AppError("Requête trop volumineuse.",413);
  const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
  if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new AppError("Requête trop volumineuse.",413);}chunks.push(value);}}finally{reader.releaseLock();}}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}return new TextDecoder().decode(bytes);
}
export function billingFailure(e:unknown){
  const status=e instanceof AppError?e.status:e instanceof ZodError?400:500;
  return Response.json({error:e instanceof AppError?e.message:e instanceof ZodError?"Paramètres invalides.":"Opération indisponible. Réessayez plus tard."},{status,headers:billingHeaders});
}
