import type {Prisma} from "@prisma/client";
import {AppError} from "@/domains/core/errors";
export async function assertServerCapacity(tx:Prisma.TransactionClient,serverId:string,userId:string|string[]){
  const ids=[...new Set(typeof userId==="string"?[userId]:userId)];if(!ids.length)return;
  const [usage]=await tx.$queryRaw<{count:number;matched:number}[]>`SELECT COUNT(*)::int AS count,COUNT(*) FILTER (WHERE id=ANY(${ids}::text[]))::int AS matched FROM (SELECT "userId" AS id FROM "ServerMember" WHERE "serverId"=${serverId} AND status='ACTIVE' AND ("expiresAt" IS NULL OR "expiresAt">(NOW() AT TIME ZONE 'UTC')) UNION SELECT "userId" AS id FROM "ServerCommunityMember" WHERE "serverId"=${serverId} AND status='ACTIVE' UNION SELECT m."userId" AS id FROM "CompanyMember" m JOIN "Company" c ON c.id=m."companyId" WHERE c."serverId"=${serverId} AND m.status='ACTIVE') users`;
  if(usage.matched===ids.length)return;
  const server=await tx.rPServer.findUniqueOrThrow({where:{id:serverId},select:{maxUsers:true}});if(usage.count+ids.length-usage.matched>server.maxUsers)throw new AppError("Quota utilisateurs du serveur atteint.");
}
export async function serverUsage(tx:Prisma.TransactionClient,ids:string[]){
  if(!ids.length)return [];
  return tx.$queryRaw<{id:string;count:number}[]>`SELECT "serverId" AS id,COUNT(DISTINCT "userId")::int AS count FROM (SELECT "serverId","userId" FROM "ServerMember" WHERE status='ACTIVE' AND ("expiresAt" IS NULL OR "expiresAt">(NOW() AT TIME ZONE 'UTC')) UNION ALL SELECT "serverId","userId" FROM "ServerCommunityMember" WHERE status='ACTIVE' UNION ALL SELECT c."serverId",m."userId" FROM "CompanyMember" m JOIN "Company" c ON c.id=m."companyId" WHERE m.status='ACTIVE') users WHERE "serverId"=ANY(${ids}::text[]) GROUP BY "serverId"`;
}
