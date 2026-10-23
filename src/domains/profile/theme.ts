import {z} from "zod";
import {db} from "@/lib/db";
import {assertActiveUser} from "@/domains/platform/access";
import {AppError} from "@/domains/core/errors";
const input=z.object({theme:z.enum(["dark","light","system"]),initialize:z.boolean().optional()}).strict();
export async function readTheme(userId:string){await assertActiveUser(db,userId);return db.user.findUniqueOrThrow({where:{id:userId},select:{themePreference:true}});}
export async function saveTheme(userId:string,raw:unknown){
 const {theme,initialize}=input.parse(raw);await assertActiveUser(db,userId);
 const key=`theme:${userId}`,now=Date.now();
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
  const old=await tx.rateLimit.findUnique({where:{key}}),reset=!old||Number(old.lastRequest)<now-60000;
  if(!reset&&old.count>=60)throw new AppError("Trop de changements d’apparence. Réessayez dans une minute.",429);
  await tx.rateLimit.upsert({where:{key},create:{key,count:1,lastRequest:BigInt(now)},update:{count:reset?1:{increment:1},lastRequest:reset?BigInt(now):old.lastRequest}});
  await tx.user.updateMany({where:{id:userId,...(initialize?{themePreference:null}:{})},data:{themePreference:theme}});
  return tx.user.findUniqueOrThrow({where:{id:userId},select:{themePreference:true}});
 });
}
