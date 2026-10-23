import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {assertActiveUser} from "@/domains/platform/access";
import {AppError} from "@/domains/core/errors";
export type Member=Awaited<ReturnType<typeof membership>>;
export type Tx=Prisma.TransactionClient;
export function moduleAccess(member:Member,module:string,permission:string){
 if(!member.company.modules.some(m=>m.key===module&&m.enabled)||!member.role.permissions.includes(permission))throw new AppError("Module désactivé ou permission insuffisante.",403);
}
export async function utilityWrite<T extends {companyId:string;requestKey:string}>(actor:{id:string;name:string},module:string,permission:string,input:T,work:(tx:Tx,member:Member)=>Promise<{id:string;revision:number}>){
 await assertActiveUser(db,actor.id);const key=`utility:${actor.id}:${Math.floor(Date.now()/60000)}`;
 const rate=await db.rateLimit.upsert({where:{key},create:{key,count:1,lastRequest:BigInt(Date.now())},update:{count:{increment:1},lastRequest:BigInt(Date.now())}});if(rate.count>30)throw new AppError("Trop d’actions. Réessayez dans une minute.",429);
 const fingerprint=createHash("sha256").update(JSON.stringify({actor:actor.id,module,input})).digest("hex");
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.companyId}))::text`;
  const member=await membership(tx,input.companyId,actor.id);moduleAccess(member,module,permission);
  const old=await tx.utilityCommand.findUnique({where:{companyId_requestKey:{companyId:input.companyId,requestKey:input.requestKey}}});if(old){if(old.fingerprint!==fingerprint)throw new AppError("Clé déjà utilisée pour une autre action.",409);return old.result as {id:string;revision:number};}
  const result=await work(tx,member);await tx.utilityCommand.create({data:{companyId:input.companyId,requestKey:input.requestKey,fingerprint,result}});return result;
 },{timeout:20000});
}
