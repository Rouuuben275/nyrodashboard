import {Prisma} from "@prisma/client";
import {AppError} from "@/domains/core/errors";
import {activeAccess,assertActiveUser,platformAccess} from "@/domains/platform/access";
export const liveServerWhere=():Prisma.RPServerWhereInput=>({OR:[{status:"ACTIVE"},{status:"SUSPENDED",suspendedUntil:{lte:new Date()}}]});
export async function requireServerManager(tx:Prisma.TransactionClient,serverId:string,userId:string){
  await assertActiveUser(tx,userId);const server=await tx.rPServer.findUnique({where:{id:serverId}});if(!server||!activeAccess(server.status,server.suspendedUntil))throw new AppError("Serveur RP inaccessible.",403);
  const member=await tx.serverMember.findUnique({where:{serverId_userId:{serverId,userId}},include:{role:true}});
  if(member?.status==="ACTIVE"&&(!member.expiresAt||member.expiresAt>new Date())&&member.role.permissions.some(p=>p==="members.manage"||p==="server.manage"))return server;
  if((await platformAccess(tx,userId)).permissions.includes("servers.manage"))return server;
  throw new AppError("Gestion des accès à ce serveur interdite.",403);
}
