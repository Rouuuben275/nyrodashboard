import type {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {AppError} from "@/domains/core/errors";
import {membership} from "@/domains/core/service";
import {assertActiveUser,activeAccess,platformAccess,requirePlatform} from "@/domains/platform/access";
import {readCompanySlots} from "@/domains/billing/slots";
import {validateLogoPng} from "./png";
import {uploadQuery} from "./validation";
type Tx=Prisma.TransactionClient;
export async function assertLogoAttachment(tx:Tx,actorId:string,purpose:"company"|"server",id:string|null|undefined,current?:string|null){
 if(!id||id===current)return;
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`logo-upload:${actorId}`}))::text`;
 const asset=await tx.logoAsset.findUnique({where:{id},select:{ownerId:true,purpose:true,attachedAt:true,_count:{select:{companies:true,servers:true}}}});
 if(!asset||asset.ownerId!==actorId||asset.purpose!==purpose||asset.attachedAt||asset._count.companies||asset._count.servers)throw new AppError("Ce logo ne vous appartient pas ou est déjà utilisé.",403);
 await tx.logoAsset.update({where:{id},data:{attachedAt:new Date()}});
}
export async function uploadLogo(userId:string,raw:unknown,bytes:Uint8Array){
 const q=uploadQuery.parse(raw);await assertActiveUser(db,userId);
 const now=Date.now(),key=`logo-upload:${userId}`;
 const allowed=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
  const old=await tx.rateLimit.findUnique({where:{key}}),reset=!old||Number(old.lastRequest)<now-60000;
  if(!reset&&old.count>=10)return false;
  await tx.rateLimit.upsert({where:{key},create:{key,count:1,lastRequest:BigInt(now)},update:{count:reset?1:{increment:1},lastRequest:reset?BigInt(now):old.lastRequest}});return true;
 });
 if(!allowed)throw new AppError("Trop d’imports. Réessayez dans une minute.",429);
 return db.$transaction(async tx=>{
  // Same order as platform commands, preventing inversion with server updates.
  if(q.purpose==="server")await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`logo-upload:${userId}`}))::text`;
  if(q.purpose==="server"){
   await requirePlatform(tx,userId,q.entityId?"servers.manage":"servers.create");
   if(q.entityId&&!await tx.rPServer.findUnique({where:{id:q.entityId},select:{id:true}}))throw new AppError("Serveur introuvable.",404);
  }else if(q.entityId){const member=await membership(tx,q.entityId,userId);if(!member.role.permissions.includes("company.manage"))throw new AppError("Gestion de l’entreprise requise pour changer son logo.",403);}
  else if(!(await readCompanySlots(tx,userId)).remaining)throw new AppError("Aucun slot disponible pour créer une entreprise.",409);
  const total=await tx.logoAsset.aggregate({where:{ownerId:userId},_sum:{size:true},_count:true});if(total._count>=200||(total._sum.size??0)+bytes.length>10*1024*1024)throw new AppError("Limite de stockage des logos atteinte pour ce compte.",413);
  const normalized=await validateLogoPng(bytes);
  return tx.logoAsset.create({data:{ownerId:userId,purpose:q.purpose,...normalized},select:{id:true,width:true,height:true,size:true}});
 });
}
export async function readLogo(userId:string,id:string){
 await assertActiveUser(db,userId);
 const asset=await db.logoAsset.findUnique({where:{id},include:{companies:{select:{id:true,accessStatus:true,suspendedUntil:true,server:{select:{status:true,suspendedUntil:true}},members:{where:{userId,status:"ACTIVE"},select:{id:true}}}},servers:{select:{id:true,status:true,suspendedUntil:true,visibility:true,members:{where:{userId,status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true}},communityMembers:{where:{userId,status:"ACTIVE"},select:{id:true}},companies:{where:{members:{some:{userId,status:"ACTIVE"}}},select:{accessStatus:true,suspendedUntil:true}}}}}});
 if(!asset)throw new AppError("Logo introuvable.",404);
 let allowed=asset.ownerId===userId&&asset.companies.length===0&&asset.servers.length===0;
 allowed||=asset.companies.some(c=>activeAccess(c.accessStatus,c.suspendedUntil)&&(!c.server||activeAccess(c.server.status,c.server.suspendedUntil))&&c.members.length>0);
 allowed||=asset.servers.some(s=>activeAccess(s.status,s.suspendedUntil)&&(s.visibility==="PUBLIC"||s.members.length>0||s.communityMembers.length>0||s.companies.some(c=>activeAccess(c.accessStatus,c.suspendedUntil))));
 if(!allowed){const access=await platformAccess(db,userId);allowed=asset.companies.length>0&&access.permissions.includes("companies.read")||asset.servers.length>0&&access.permissions.includes("servers.read");}
 if(!allowed)throw new AppError("Logo introuvable.",404);return asset.data;
}
export async function discardLogo(userId:string,id:string){
 await assertActiveUser(db,userId);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`logo-upload:${userId}`}))::text`;
  const asset=await tx.logoAsset.findUnique({where:{id},include:{_count:{select:{companies:true,servers:true}}}});
  if(!asset||asset.ownerId!==userId)throw new AppError("Logo introuvable.",404);
  if(asset.attachedAt||asset._count.companies||asset._count.servers)throw new AppError("Ce logo est enregistré et doit être conservé.",409);
  await tx.logoAsset.delete({where:{id}});return {discarded:true};
 });
}
