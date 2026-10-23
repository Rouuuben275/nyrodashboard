import {createHash,randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {requirePlatform} from "./access";
export async function recordPlatformVisit(user:{id:string;name:string},sessionId:string){
  const key=`admin-visit:${createHash("sha256").update(sessionId).digest("hex")}`;
  await db.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;await requirePlatform(tx,user.id);
    if(await tx.platformCommand.findUnique({where:{requestKey:key}}))return;
    await tx.platformAudit.create({data:{actorId:user.id,actorName:user.name,action:"platform.session.open",targetType:"platform",targetId:"administration",reason:"Ouverture du panel avec session authentifiée et permissions réévaluées",correlationId:randomUUID()}});
    await tx.platformCommand.create({data:{requestKey:key,fingerprint:key,result:{visited:true}}});
  });
}
