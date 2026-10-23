import type {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {databaseRuntime} from "@/lib/database-runtime";
import {AppError} from "@/domains/core/errors";
import {platformPermissions} from "./permissions";
import {assertServerCapacity} from "@/domains/servers/capacity";
type Tx=Prisma.TransactionClient;
export const activeAccess=(status:string,until:Date|null)=>status==="ACTIVE"||(status==="SUSPENDED"&&!!until&&until<=new Date());
export function activeCompanyWhere():Prisma.CompanyWhereInput{return {AND:[{OR:[{accessStatus:"ACTIVE"},{accessStatus:"SUSPENDED",suspendedUntil:{lte:new Date()}}]},{OR:[{serverId:null},{server:{OR:[{status:"ACTIVE"},{status:"SUSPENDED",suspendedUntil:{lte:new Date()}}]}}]}]};}
export async function assertActiveUser(tx:Tx,userId:string){const user=await tx.user.findUnique({where:{id:userId},select:{accessStatus:true,suspendedUntil:true}});if(!user||!activeAccess(user.accessStatus,user.suspendedUntil))throw new AppError("Compte suspendu ou inaccessible. Contactez le support Nyro Dashboard.",403);}
export async function verifiedDiscordId(tx:Tx,userId:string){
  const accounts=await tx.account.findMany({where:{userId,providerId:"discord"},select:{accountId:true},take:2});
  return accounts.length===1&&/^\d{17,20}$/.test(accounts[0].accountId)?accounts[0].accountId:null;
}
export function configuredOwner(){const value=databaseRuntime().env.RPILOT_OWNER_DISCORD_ID;return value&&/^\d{17,20}$/.test(value)?value:null;}
export async function platformAccess(tx:Tx,userId:string){
  await assertActiveUser(tx,userId);const discordId=await verifiedDiscordId(tx,userId),owner=!!discordId&&discordId===configuredOwner();
  const grant=discordId?await tx.platformGrant.findUnique({where:{discordId}}):null;
  const permissions=owner?[...platformPermissions]:grant?.status==="ACTIVE"&&(!grant.expiresAt||grant.expiresAt>new Date())?grant.permissions.filter(p=>platformPermissions.includes(p as typeof platformPermissions[number])):[];
  return {owner,permissions,role:owner?"PLATFORM_OWNER":permissions.length?"PLATFORM_ADMIN":null};
}
export async function requirePlatform(tx:Tx,userId:string,permission?:string){const access=await platformAccess(tx,userId);if(!access.role||(permission&&!access.permissions.includes(permission)))throw new AppError("Administration Nyro Dashboard interdite.",403);return access;}
export async function assertCompanyActive(tx:Tx,company:{accessStatus:string;suspendedUntil:Date|null;serverId:string|null}){
  if(!activeAccess(company.accessStatus,company.suspendedUntil))throw new AppError("Entreprise suspendue ou archivée.",403);
  if(company.serverId){const server=await tx.rPServer.findUnique({where:{id:company.serverId},select:{status:true,suspendedUntil:true}});if(!server||!activeAccess(server.status,server.suspendedUntil))throw new AppError("Serveur RP suspendu ou archivé.",403);}
}
export async function resolveServerGrants(userId:string){
  await assertActiveUser(db,userId);const discordId=await verifiedDiscordId(db,userId);if(!discordId)return;
  await db.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;
    const grants=await tx.serverDiscordGrant.findMany({where:{discordId,status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},include:{server:{select:{status:true,suspendedUntil:true}}}});
    for(const grant of grants){if(!activeAccess(grant.server.status,grant.server.suspendedUntil))continue;
      const member=await tx.serverMember.findUnique({where:{serverId_userId:{serverId:grant.serverId,userId}}});
      if(!member){try{await assertServerCapacity(tx,grant.serverId,userId);}catch(e){if(e instanceof AppError&&e.message.includes("Quota"))continue;throw e;}await tx.serverMember.create({data:{serverId:grant.serverId,userId,roleId:grant.roleId,expiresAt:grant.expiresAt}});await tx.platformAudit.create({data:{actorId:userId,actorName:"Compte Discord vérifié",action:"server.invitation.claim",targetType:"server",targetId:grant.serverId,reason:"Attribution en attente activée après vérification de l’identité Discord",correlationId:grant.id,changes:{grantId:grant.id}}});}
    }
  });
}
