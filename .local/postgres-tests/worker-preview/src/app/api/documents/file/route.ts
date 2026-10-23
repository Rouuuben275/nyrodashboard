import {z} from "zod";
import {activeSession} from "@/lib/active-session";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {billingFailure,billingHeaders} from "@/domains/billing/http";
import {downloadDocument} from "@/domains/documents/queries";
import {writeDocument} from "@/domains/documents/service";
import {documentBytes} from "@/domains/documents/files";
export const dynamic="force-dynamic";
const query=z.object({companyId:z.string().min(1).max(100),documentId:z.string().min(1).max(100),versionId:z.uuid().optional(),preview:z.enum(["true"]).optional()}).strict();
export async function GET(req:Request){try{
 const session=await activeSession({headers:req.headers});if(!session)throw new AppError("Connexion requise.",401);
 const q=query.parse(Object.fromEntries(new URL(req.url).searchParams)),file=await downloadDocument(session.user.id,q.companyId,q.documentId,q.versionId);
 const filename=encodeURIComponent(file.fileName).replace(/['()*]/g,s=>`%${s.charCodeAt(0).toString(16).toUpperCase()}`);
 return new Response(new Uint8Array(file.data),{headers:{...billingHeaders,"Content-Type":file.mimeType+(file.mimeType==="text/plain"?"; charset=utf-8":""),"Content-Length":String(file.size),"Content-Disposition":`${q.preview?"inline":"attachment"}; filename="document"; filename*=UTF-8''${filename}`,"Content-Security-Policy":"default-src 'none'; frame-ancestors 'self'; sandbox","Cross-Origin-Resource-Policy":"same-origin","X-Frame-Options":"SAMEORIGIN"}});
}catch(e){return billingFailure(e);}}
export async function POST(req:Request){try{
 if(req.headers.get("origin")!==new URL(databaseRuntime().env.BETTER_AUTH_URL||req.url).origin)throw new AppError("Origine refusée.",403);
 const session=await activeSession({headers:req.headers});if(!session)throw new AppError("Connexion requise.",401);
 const bytes=await documentBytes(req);
 return Response.json(await writeDocument(session.user,Object.fromEntries(new URL(req.url).searchParams),{bytes,type:req.headers.get("content-type")??""}),{status:201,headers:billingHeaders});
}catch(e){return billingFailure(e);}}
