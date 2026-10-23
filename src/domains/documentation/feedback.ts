import {createHash} from "node:crypto";
import {z} from "zod";
import {db} from "@/lib/db";
import {docBySlug} from "@/content/docs/registry";
import {assertActiveUser} from "@/domains/platform/access";
import {AppError} from "@/domains/core/errors";
const input=z.object({article:z.string().min(1).max(100),helpful:z.boolean()}).strict();
export async function recordDocFeedback(userId:string,raw:unknown){
 const value=input.parse(raw);if(!docBySlug.has(value.article))throw new AppError("Article introuvable.",404);
 await assertActiveUser(db,userId);
 const voterHash=createHash("sha256").update(`rpilot-docs-v1:${userId}`).digest("hex"),key=`docs-feedback:${voterHash}`,now=Date.now();
 // One bounded rate-limit row per account, not a new row per minute.
 const allowed=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
  const rate=await tx.rateLimit.findUnique({where:{key}});
  if(rate&&Number(rate.lastRequest)>now-60000&&rate.count>=10)return false;
  const count=rate&&Number(rate.lastRequest)>now-60000?rate.count+1:1;
  await tx.rateLimit.upsert({where:{key},create:{key,count,lastRequest:BigInt(now)},update:{count,lastRequest:BigInt(count===1?now:Number(rate!.lastRequest))}});
  return true;
 });
 if(!allowed)throw new AppError("Trop de retours. Réessayez dans une minute.",429);
 await db.documentationFeedback.upsert({where:{article_voterHash:{article:value.article,voterHash}},create:{...value,voterHash},update:{helpful:value.helpful}});
 return {saved:true,helpful:value.helpful};
}
