import type {Prisma} from "@prisma/client";
import type {z} from "zod";
import {db} from "@/lib/db";
import {assertActiveUser} from "@/domains/platform/access";
import {AppError} from "@/domains/core/errors";
import {liveServerWhere,requireServerManager} from "./access";
import type {admissionQuery} from "./validation";
export async function readAdmissions(userId:string,q:z.infer<typeof admissionQuery>){
  return db.$transaction(async tx=>{
    await assertActiveUser(tx,userId);const managing=q.view==="requests"||q.view==="members",server=managing?await requireServerManager(tx,q.serverId!,userId):null;
    const skip=(q.page-1)*25;
    const directoryWhere:Prisma.RPServerWhereInput={AND:[liveServerWhere(),{visibility:"PUBLIC",accessMode:{in:["OPEN","REQUEST"]}},...(q.q?[{OR:[{name:{contains:q.q,mode:"insensitive" as const}},{description:{contains:q.q,mode:"insensitive" as const}},{slug:{contains:q.q,mode:"insensitive" as const}}]}]:[])]};
    const requestWhere:Prisma.ServerAccessRequestWhereInput={...(managing?{serverId:q.serverId}:{userId}),...(q.status?{status:q.status}:{}),...(q.q?managing?{user:{name:{contains:q.q,mode:"insensitive"}}}:{server:{name:{contains:q.q,mode:"insensitive"}}}:{})};
    const memberWhere:Prisma.ServerCommunityMemberWhereInput={...(managing?{serverId:q.serverId}:{userId}),...(q.status?{status:q.status}:{}),...(q.q?managing?{user:{name:{contains:q.q,mode:"insensitive"}}}:{server:{name:{contains:q.q,mode:"insensitive"}}}:{})};
    const [directory,requests,members,total,selectedRequest,selectedMember]=await Promise.all([
      q.view==="directory"?tx.rPServer.findMany({where:directoryWhere,select:{id:true,name:true,description:true,logoUrl:true,logoAssetId:true,accessMode:true,communityMembers:{where:{userId},select:{status:true}},accessRequests:{where:{userId},select:{id:true,status:true,revision:true}},members:{where:{userId,status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true}},companies:{where:{members:{some:{userId,status:"ACTIVE"}}},select:{id:true}}},orderBy:[{name:"asc"},{id:"asc"}],take:25,skip}):[],
      q.view==="mine"||q.view==="requests"?tx.serverAccessRequest.findMany({where:requestWhere,select:{id:true,serverId:true,userId:true,status:true,message:true,decisionReason:true,revision:true,requestedAt:true,decidedAt:true,server:{select:{name:true}},user:{select:{name:true}}},orderBy:[{requestedAt:"desc"},{id:"asc"}],take:25,skip}):[],
      q.view==="members"||q.view==="community"?tx.serverCommunityMember.findMany({where:memberWhere,select:{id:true,userId:true,status:true,revision:true,joinedAt:true,user:{select:{name:true}},server:{select:{name:true}}},orderBy:[{joinedAt:"desc"},{id:"asc"}],take:25,skip}):[],
      q.view==="directory"?tx.rPServer.count({where:directoryWhere}):q.view==="members"||q.view==="community"?tx.serverCommunityMember.count({where:memberWhere}):tx.serverAccessRequest.count({where:requestWhere}),
      q.id&&q.view!=="members"&&q.view!=="community"?tx.serverAccessRequest.findFirst({where:{id:q.id,...(managing?{serverId:q.serverId}:{userId})},select:{id:true,serverId:true,userId:true}}):null,
      q.id&&(q.view==="members"||q.view==="community")?tx.serverCommunityMember.findFirst({where:{id:q.id,...(managing?{serverId:q.serverId}:{userId})},select:{id:true,serverId:true,userId:true}}):null,
    ]);
    const selected=selectedRequest??selectedMember;if(q.id&&!selected)throw new AppError("Historique introuvable.",404);
    const eventWhere={serverId:selected?.serverId??"",userId:selected?.userId??""};
    const [events,eventCount]=await Promise.all([selected?tx.serverAccessEvent.findMany({where:eventWhere,select:{id:true,kind:true,reason:true,actorName:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"asc"}],take:25,skip:(q.eventPage-1)*25}):[],selected?tx.serverAccessEvent.count({where:eventWhere}):0]);
    return {directory,requests,members,total,events,eventCount,server:server?{id:server.id,name:server.name,accessMode:server.accessMode,maxUsers:server.maxUsers}:null};
  },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type AdmissionsData=Awaited<ReturnType<typeof readAdmissions>>;
