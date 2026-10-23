import {db} from "@/lib/db";
import {activeAccess,assertActiveUser,platformAccess,resolveServerGrants} from "./access";
import {readCompanySlots} from "@/domains/billing/slots";
import {AppError} from "@/domains/core/errors";
export async function readSpaces(userId:string){
  await resolveServerGrants(userId);await assertActiveUser(db,userId);
  const [memberships,adminMemberships,communities,access,companySlots]=await Promise.all([
    db.companyMember.findMany({where:{userId,status:"ACTIVE"},select:{role:{select:{name:true,isOwner:true}},company:{select:{id:true,name:true,sector:true,logoUrl:true,logoAssetId:true,serverId:true,accessStatus:true,suspendedUntil:true,server:{select:{id:true,name:true,description:true,status:true,suspendedUntil:true,logoUrl:true,logoAssetId:true}}}}},orderBy:{hiredAt:"asc"}}),
    db.serverMember.findMany({where:{userId,status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{role:{select:{name:true,permissions:true}},server:{select:{id:true,name:true,description:true,status:true,suspendedUntil:true,logoUrl:true,logoAssetId:true}}}}),
    db.serverCommunityMember.findMany({where:{userId,status:"ACTIVE"},select:{server:{select:{id:true,name:true,description:true,status:true,suspendedUntil:true,logoUrl:true,logoAssetId:true}}}}),platformAccess(db,userId),readCompanySlots(db,userId),
  ]);
  const companies=memberships.filter(m=>activeAccess(m.company.accessStatus,m.company.suspendedUntil)&&(!m.company.server||activeAccess(m.company.server.status,m.company.server.suspendedUntil))).map(m=>({id:m.company.id,name:m.company.name,sector:m.company.sector,logoUrl:m.company.logoUrl,logoAssetId:m.company.logoAssetId,serverId:m.company.serverId,role:m.role.name,isOwner:m.role.isOwner}));
  const servers=new Map<string,{id:string;name:string;description:string;status:string;logoUrl:string;logoAssetId:string|null;role:string;administration:boolean}>();
  for(const {server:s} of communities){if(activeAccess(s.status,s.suspendedUntil))servers.set(s.id,{id:s.id,name:s.name,description:s.description,status:s.status,logoUrl:s.logoUrl,logoAssetId:s.logoAssetId,role:"Membre de la communauté",administration:false});}
  for(const membership of memberships){const s=membership.company.server;if(s&&activeAccess(s.status,s.suspendedUntil)&&companies.some(c=>c.serverId===s.id))servers.set(s.id,{id:s.id,name:s.name,description:s.description,status:s.status,logoUrl:s.logoUrl,logoAssetId:s.logoAssetId,role:"Membre d’une entreprise",administration:false});}
  for(const member of adminMemberships){const s=member.server;if(activeAccess(s.status,s.suspendedUntil))servers.set(s.id,{id:s.id,name:s.name,description:s.description,status:s.status,logoUrl:s.logoUrl,logoAssetId:s.logoAssetId,role:member.role.name,administration:member.role.permissions.some(p=>p==="members.manage"||p==="server.manage")});}
  return {companySlots,companies,servers:[...servers.values()],platform:!!access.role};
}
export async function assertSpace(userId:string,space:string){
  if(space==="independent")return;
  const spaces=await readSpaces(userId);if(!spaces.servers.some(s=>s.id===space))throw new AppError("Cet espace RP est inaccessible.",403);
}
