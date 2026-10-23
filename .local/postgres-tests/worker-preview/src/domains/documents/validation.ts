import {z} from "zod";
export const MAX_DOCUMENT_BYTES=5*1024*1024;
export const MAX_COMPANY_DOCUMENT_BYTES=100*1024*1024;
export const documentTypes=["application/pdf","image/png","image/jpeg","text/plain"] as const;
const id=z.string().min(1).max(100),name=z.string().trim().min(1).max(160).refine(s=>!/[\x00-\x1f\x7f]/.test(s));
const base={companyId:id,requestKey:z.uuid()};
const revision=z.coerce.number().int().min(0).max(2147483646);
export const documentUpload=z.object({...base,documentId:id.optional(),revision:revision.optional(),name,folderId:id.optional(),audience:z.enum(["TEAM","MANAGERS"]),fileName:name.refine(s=>!/[\\/]/.test(s)),note:z.string().trim().min(3).max(500)}).strict();
export const documentAction=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("folder.save"),id:id.optional(),revision:revision.optional(),name:name.pipe(z.string().max(80))}).strict(),
 z.object({...base,action:z.literal("folder.archive"),id,revision,archived:z.boolean()}).strict(),
 z.object({...base,action:z.literal("document.update"),id,revision,name,folderId:id.nullable(),audience:z.enum(["TEAM","MANAGERS"])}).strict(),
 z.object({...base,action:z.literal("document.archive"),id,revision,archived:z.boolean(),reason:z.string().trim().min(3).max(500)}).strict(),
]);
export const documentQuery=z.object({companyId:id,q:z.string().trim().max(120).default(""),page:z.coerce.number().int().min(1).max(100000).default(1),folderId:id.optional(),archived:z.enum(["true","false"]).default("false"),audience:z.enum(["TEAM","MANAGERS"]).optional(),documentId:id.optional(),historyPage:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
