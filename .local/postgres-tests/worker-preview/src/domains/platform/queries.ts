import {Prisma} from "@prisma/client";
import type {z} from "zod";
import {db} from "@/lib/db";
import {requirePlatform} from "./access";
import type {platformQuery} from "./validation";
import {AppError} from "@/domains/core/errors";
import {serverUsage} from "@/domains/servers/capacity";
export async function readPlatform(userId:string,q:z.infer<typeof platformQuery>){
  return db.$transaction(async tx=>{
    const needed=q.view==="servers"?"servers.read":q.view==="users"?"users.read":q.view==="companies"?"companies.read":q.view==="audit"?"audit.read":undefined;
    const access=await requirePlatform(tx,userId,needed);if(q.view==="administrators"&&!access.owner)throw new AppError("Accès réservé au propriétaire Nyro Dashboard.",403);
    const skip=(q.page-1)*25,order=q.sort==="name"?{name:"asc" as const}:q.sort==="oldest"?{createdAt:"asc" as const}:{createdAt:"desc" as const};
    const serverWhere:Prisma.RPServerWhereInput={...(q.status?{status:q.status}:{}),...(q.q?{OR:[{name:{contains:q.q,mode:"insensitive"}},{id:q.q},{slug:{contains:q.q,mode:"insensitive"}}]}:{})};
    const userWhere:Prisma.UserWhereInput={...(q.status?{accessStatus:q.status}:{}),...(q.q?{OR:[{name:{contains:q.q,mode:"insensitive"}},{accounts:{some:{providerId:"discord",accountId:q.q}}}]}:{})};
    const companyWhere:Prisma.CompanyWhereInput={...(q.status?{accessStatus:q.status}:{}),...(q.q?{OR:[{name:{contains:q.q,mode:"insensitive"}},{id:q.q}]}:{})};
    const auditWhere:Prisma.PlatformAuditWhereInput=q.q?{OR:[{action:{contains:q.q,mode:"insensitive"}},{targetId:q.q},{actorName:{contains:q.q,mode:"insensitive"}},{correlationId:q.q}]}:{};
    const grantWhere:Prisma.PlatformGrantWhereInput={...(q.q?{discordId:q.q}:{}),...(q.status?{status:q.status}:{})};
    const [servers,users,companies,grants,audit,total,selectedServer,counts,daily]=await Promise.all([
      q.view==="servers"?tx.rPServer.findMany({where:serverWhere,orderBy:[order,{id:"asc"}],skip,take:25,include:{_count:{select:{companies:true,members:true}}}}):[],
      q.view==="users"?tx.user.findMany({where:userWhere,orderBy:[order,{id:"asc"}],skip,take:25,select:{id:true,name:true,image:true,createdAt:true,accessStatus:true,suspendedUntil:true,adminRevision:true,accounts:{where:{providerId:"discord"},select:{accountId:true}},sessions:{orderBy:{createdAt:"desc"},take:1,select:{createdAt:true}},_count:{select:{memberships:true,servers:true}}}}):[],
      q.view==="companies"?tx.company.findMany({where:companyWhere,orderBy:[order,{id:"asc"}],skip,take:25,select:{id:true,name:true,sector:true,serverId:true,accessStatus:true,suspendedUntil:true,adminRevision:true,createdAt:true,server:{select:{name:true}},subscription:{select:{status:true,plan:{select:{name:true}}}},members:{where:{role:{isOwner:true},status:"ACTIVE"},select:{characterName:true},take:10},_count:{select:{members:true,modules:{where:{enabled:true}}}}}}):[],
      q.view==="administrators"?tx.platformGrant.findMany({where:grantWhere,orderBy:[{createdAt:"desc"},{id:"asc"}],skip,take:25}):[],
      q.view==="audit"||q.view==="dashboard"&&access.permissions.includes("audit.read")?tx.platformAudit.findMany({where:q.view==="audit"?auditWhere:{createdAt:{gte:new Date(Date.now()-q.days*86400000)}},orderBy:[{createdAt:q.sort==="oldest"?"asc":"desc"},{id:"asc"}],skip:q.view==="audit"?skip:0,take:q.view==="audit"?25:10}):[],
      q.view==="servers"?tx.rPServer.count({where:serverWhere}):q.view==="users"?tx.user.count({where:userWhere}):q.view==="companies"?tx.company.count({where:companyWhere}):q.view==="administrators"?tx.platformGrant.count({where:grantWhere}):q.view==="audit"?tx.platformAudit.count({where:auditWhere}):0,
      q.view==="servers"&&q.id?tx.rPServer.findUnique({where:{id:q.id},include:{roles:{orderBy:{name:"asc"}},discordGrants:{orderBy:[{createdAt:"desc"},{id:"asc"}],take:25,skip:(q.grantPage-1)*25},members:{orderBy:{id:"asc"},take:25,skip:(q.memberPage-1)*25,select:{id:true,status:true,expiresAt:true,role:{select:{name:true}},user:{select:{id:true,name:true,accounts:{where:{providerId:"discord"},select:{accountId:true}}}}}},_count:{select:{discordGrants:true,companies:true,members:true}}}}):null,
      q.view==="dashboard"?Promise.all([tx.user.count(),tx.session.groupBy({by:["userId"],where:{expiresAt:{gt:new Date()}}}),tx.rPServer.count(),tx.rPServer.count({where:{status:"ACTIVE"}}),tx.rPServer.count({where:{status:"SUSPENDED",OR:[{suspendedUntil:null},{suspendedUntil:{gt:new Date()}}]}}),tx.company.count(),tx.company.count({where:{accessStatus:"ACTIVE"}}),tx.subscription.count(),tx.user.count({where:{createdAt:{gte:new Date(Date.now()-q.days*86400000)}}})]).then(([users,sessions,servers,activeServers,suspendedServers,companies,activeCompanies,subscriptions,registrations])=>({users,activeUsers:sessions.length,servers,activeServers,suspendedServers,companies,activeCompanies,subscriptions,registrations})):null,
      q.view==="dashboard"?tx.$queryRaw<{day:string;count:bigint}[]>`SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day,COUNT(*)::bigint AS count FROM "User" WHERE "createdAt">=NOW()-${q.days}*INTERVAL '1 day' GROUP BY day ORDER BY day`:[],
    ]);
    const discordIds=users.flatMap(u=>u.accounts.length===1?[u.accounts[0].accountId]:[]);
    const [slotAccounts,ownerships]=await Promise.all([
      tx.companySlotAccount.findMany({where:{discordId:{in:discordIds}}}),
      tx.companyMember.groupBy({by:["userId"],where:{userId:{in:users.map(u=>u.id)},role:{isOwner:true}},_count:{_all:true}}),
    ]);
    const usersWithSlots=users.map(u=>{const discordId=u.accounts.length===1?u.accounts[0].accountId:null,balance=slotAccounts.find(s=>s.discordId===discordId);return {...u,companySlots:{granted:balance?.granted??0,purchased:balance?.purchased??0,revision:balance?.revision??0,total:1+(balance?.granted??0)+(balance?.purchased??0),owned:ownerships.find(o=>o.userId===u.id)?._count._all??0}};});
    const usage=await serverUsage(tx,servers.map(s=>s.id));const usageById=new Map(usage.map(u=>[u.id,u.count]));
    return {access,servers:servers.map(s=>({...s,userCount:usageById.get(s.id)??0})),users:usersWithSlots,companies,grants,audit,total,selectedServer,counts,daily:daily.map(d=>({...d,count:Number(d.count)}))};
  },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type PlatformData=Awaited<ReturnType<typeof readPlatform>>;
