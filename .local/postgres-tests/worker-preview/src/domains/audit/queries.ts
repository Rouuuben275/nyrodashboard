import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {parisDay} from "@/domains/planning/recurrence";
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Date invalide.");
export const auditQuery=z.object({companyId:z.string().min(1).max(100),q:z.string().trim().max(100).default(""),actor:z.string().trim().max(100).default(""),action:z.string().trim().max(100).default(""),from:day.optional(),to:day.optional(),page:z.coerce.number().int().min(1).max(100000).default(1),sort:z.enum(["newest","oldest"]).default("newest")}).refine(v=>!v.from||!v.to||v.from<=v.to,"La fin doit suivre le début.");
type Query=z.infer<typeof auditQuery>;
type SafeValue=string|number|boolean|null|string[];
const structural=["name","sector","sku","category","archived","status","enabled","key","roleId","department","module","template","position","trackStock","permissions","memberId","start","end","serverId"];
export function safeAuditDetails(raw:Prisma.JsonValue,permissions:string[]){
  const allowed=new Set([...structural,...(permissions.includes("inventory.read")?["stock","quantity"]:[]),...(permissions.includes("products.read")?["price","cost","threshold"]:[]),...(permissions.includes("finance.read")?["amount","expenseThreshold"]:[])]);
  const record=(value:Prisma.JsonValue|undefined)=>{const output:Record<string,SafeValue>={};if(value&&typeof value==="object"&&!Array.isArray(value))for(const [key,v] of Object.entries(value)){
    if(!allowed.has(key))continue;
    if(v===null||typeof v==="number"||typeof v==="boolean")output[key]=v;
    else if(typeof v==="string")output[key]=v.slice(0,2000);
    else if(Array.isArray(v)&&v.every(e=>typeof e==="string"))output[key]=(v as string[]).slice(0,100).map(s=>s.slice(0,100));
  }return output;};
  const source=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  return {before:record(source.before),after:record(source.after),context:record(source)};
}
export async function readAudit(userId:string,q:Query,exporting=false){
  return db.$transaction(async tx=>{
    const viewer=await membership(tx,q.companyId,userId);
    if(!viewer.role.permissions.includes("audit.read")||!viewer.company.modules.some(m=>m.key==="audit"&&m.enabled))throw new AppError("Consultation de l’audit interdite ou module désactivé.",403);
    const where:Prisma.AuditLogWhereInput={companyId:q.companyId,
      ...(q.actor?{OR:[{actorName:{contains:q.actor,mode:"insensitive"}},{actorId:q.actor}]}:{}),
      ...(q.action?{action:{contains:q.action,mode:"insensitive"}}:{}),
      ...(q.from||q.to?{createdAt:{...(q.from?{gte:parisDay(q.from)}:{}),...(q.to?{lt:parisDay(q.to,1)}:{})}}:{}),
      ...(q.q?{AND:[{OR:[{action:{contains:q.q,mode:"insensitive"}},{actorName:{contains:q.q,mode:"insensitive"}},{entityId:{contains:q.q,mode:"insensitive"}},{id:q.q}]}]}:{}),
    };
    const total=await tx.auditLog.count({where});
    if(exporting&&total>5000)throw new AppError("Plus de 5 000 lignes. Affinez les filtres avant d’exporter.",413);
    const rows=await tx.auditLog.findMany({where,orderBy:[{createdAt:q.sort==="oldest"?"asc":"desc"},{id:"asc"}],skip:exporting?0:(q.page-1)*25,take:exporting?5000:25});
    const effective=viewer.role.permissions.filter(p=>viewer.company.modules.some(m=>m.key===p.split(".")[0]&&m.enabled));
    return {rows:rows.map(r=>({...r,details:safeAuditDetails(r.details,effective)})),total,page:q.page,pages:Math.ceil(total/25)};
  },{isolationLevel:"RepeatableRead"});
}
export function auditCsv(data:Awaited<ReturnType<typeof readAudit>>){
  const rows=[['Date UTC','Auteur','Action','Identifiant cible','Identifiant événement','Avant','Après','Contexte'],...data.rows.map(r=>[r.createdAt.toISOString(),r.actorName,r.action,r.entityId??"",r.id,JSON.stringify(r.details.before),JSON.stringify(r.details.after),JSON.stringify(r.details.context)])];
  return "\uFEFF"+rows.map(row=>row.map(cell=>`"${String(cell).replace(/^[\s]*[=+\-@]/,"'$&").replaceAll('"','""')}"`).join(";")).join("\r\n");
}
