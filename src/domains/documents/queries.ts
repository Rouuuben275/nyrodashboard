import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {documentAccess,documentForViewer} from "./service";
import {documentQuery,MAX_COMPANY_DOCUMENT_BYTES} from "./validation";
const summary={id:true,name:true,folderId:true,audience:true,archived:true,revision:true,createdAt:true,updatedAt:true,size:true,mimeType:true,_count:{select:{versions:true}}} satisfies Prisma.DocumentSelect;
export async function readDocuments(userId:string,raw:unknown){
 const q=documentQuery.parse(raw);
 return db.$transaction(async tx=>{
   const manage=documentAccess(await membership(tx,q.companyId,userId));
   const scope:Prisma.DocumentWhereInput={companyId:q.companyId,targetType:null,...(!manage?{audience:"TEAM"}:{})};
   const where:Prisma.DocumentWhereInput={...scope,archived:q.archived==="true",...(q.folderId?{folderId:q.folderId==="none"?null:q.folderId}:{}),...(q.audience?{audience:!manage?"TEAM":q.audience}:{}),...(q.q?{name:{contains:q.q,mode:"insensitive"}}:{})};
   if(q.audience==="MANAGERS"&&!manage)throw new AppError("Accès confidentiel refusé.",403);
   const [rows,total,folders,selected,usage]=await Promise.all([
     tx.document.findMany({where,select:summary,orderBy:[{updatedAt:"desc"},{id:"asc"}],take:25,skip:(q.page-1)*25}),tx.document.count({where}),
     tx.documentFolder.findMany({where:{companyId:q.companyId,...(!manage?{documents:{some:{...scope}}}:{})},select:{id:true,name:true,archived:true,revision:true},orderBy:[{archived:"asc"},{name:"asc"},{id:"asc"}],take:100}),
     q.documentId?tx.document.findFirst({where:{...scope,id:q.documentId},select:summary}):null,
     manage?tx.documentVersion.aggregate({where:{companyId:q.companyId},_sum:{size:true}}):null,
   ]);
   if(q.documentId&&!selected)throw new AppError("Document introuvable ou inaccessible.",404);
   const [versions,events,eventCount]=await Promise.all([
     selected?tx.documentVersion.findMany({where:{companyId:q.companyId,documentId:selected.id},select:{id:true,number:true,fileName:true,mimeType:true,size:true,authorName:true,note:true,createdAt:true},orderBy:{number:"desc"},take:50}):[],
     selected?tx.documentEvent.findMany({where:{companyId:q.companyId,documentId:selected.id},select:{id:true,actorName:true,action:true,details:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.historyPage-1)*25}):[],
     selected?tx.documentEvent.count({where:{companyId:q.companyId,documentId:selected.id}}):0,
   ]);
   return {rows,total,folders,selected,versions,events,eventCount,manage,usedBytes:usage?usage._sum.size??0:null,maxBytes:MAX_COMPANY_DOCUMENT_BYTES};
 },{isolationLevel:"RepeatableRead",timeout:20000});
}
export async function downloadDocument(userId:string,companyId:string,documentId:string,versionId?:string){
 return db.$transaction(async tx=>{
   await documentForViewer(tx,companyId,userId,documentId);
   const version=await tx.documentVersion.findFirst({where:{companyId,documentId,...(versionId?{id:versionId}:{})},orderBy:{number:"desc"},select:{fileName:true,mimeType:true,size:true,data:true,number:true}});
   if(!version)throw new AppError("Aucun fichier stocké pour cette version. Les anciens documents doivent être téléversés depuis leur fiche.",404);return version;
 },{isolationLevel:"RepeatableRead"});
}
export type DocumentsData=Awaited<ReturnType<typeof readDocuments>>;
