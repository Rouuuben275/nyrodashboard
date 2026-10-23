import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {eligibleMembers,messageAccess,threadForViewer} from "./service";
import {messagesQuery} from "./validation";
export async function readMessages(userId:string,raw:unknown){
 const q=messagesQuery.parse(raw);
 return db.$transaction(async tx=>{
  const viewer=await membership(tx,q.companyId,userId);messageAccess(viewer);
  const staffWhere:Prisma.CompanyMemberWhereInput={...eligibleMembers(q.companyId),id:{not:viewer.id},...(q.q?{characterName:{contains:q.q,mode:"insensitive"}}:{})};
  const where:Prisma.ChatThreadWhereInput={companyId:q.companyId,participants:{some:{memberId:viewer.id,active:true,archived:q.archived==="true"}},...(q.q?{OR:[{title:{contains:q.q,mode:"insensitive"}},{participants:{some:{active:true,member:{characterName:{contains:q.q,mode:"insensitive"}}}}},{messages:{some:{body:{contains:q.q,mode:"insensitive"}}}}]}:{})};
  const [threads,total,staff,staffCount,selected,unread]=await Promise.all([
   q.view==="inbox"?tx.chatThread.findMany({where,orderBy:[{updatedAt:"desc"},{id:"desc"}],take:25,skip:(q.page-1)*25,select:{id:true,title:true,kind:true,updatedAt:true,participants:{where:{active:true},select:{memberId:true,archived:true,lastReadSequence:true,member:{select:{characterName:true,status:true}}}}}}):[],
   q.view==="inbox"?tx.chatThread.count({where}):0,
   q.view==="staff"?tx.companyMember.findMany({where:staffWhere,select:{id:true,characterName:true,department:true},orderBy:[{characterName:"asc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],
   q.view==="staff"?tx.companyMember.count({where:staffWhere}):0,
   q.threadId?threadForViewer(tx,q.companyId,viewer.id,q.threadId):null,
   tx.$queryRaw<{count:bigint}[]>`SELECT count(*) AS count FROM "ChatMessage" m JOIN "ChatParticipant" p ON p."threadId"=m."threadId" AND p."companyId"=m."companyId" WHERE m."companyId"=${q.companyId} AND p."memberId"=${viewer.id} AND p.active=true AND m.sequence>p."lastReadSequence" AND m."senderMemberId"<>${viewer.id}`,
  ]);
  const counts=threads.length?await tx.$queryRaw<{threadId:string;count:bigint}[]>(Prisma.sql`SELECT m."threadId",count(*) AS count FROM "ChatMessage" m JOIN "ChatParticipant" p ON p."threadId"=m."threadId" AND p."companyId"=m."companyId" WHERE m."companyId"=${q.companyId} AND p."memberId"=${viewer.id} AND p.active=true AND m."threadId" IN (${Prisma.join(threads.map(t=>t.id))}) AND m.sequence>p."lastReadSequence" AND m."senderMemberId"<>${viewer.id} GROUP BY m."threadId"`):[];
  const byThread=new Map(counts.map(c=>[c.threadId,Number(c.count)]));
  const rows=threads.map(thread=>({...thread,participants:thread.participants.map(p=>({id:p.memberId,name:p.member.characterName,status:p.member.status})),unread:byThread.get(thread.id)??0}));
  const messageWhere:Prisma.ChatMessageWhereInput={companyId:q.companyId,threadId:selected?.id??"",...(q.messageSearch?{body:{contains:q.messageSearch,mode:"insensitive"}}:{})};
  const [messages,messageCount]=selected?await Promise.all([tx.chatMessage.findMany({where:messageWhere,select:{id:true,sequence:true,senderMemberId:true,senderName:true,body:true,createdAt:true},orderBy:{sequence:"desc"},take:25,skip:(q.messagePage-1)*25}),tx.chatMessage.count({where:messageWhere})]):[[],0];
  const mine=selected?.participants.find(p=>p.memberId===viewer.id);
  return {rows,total,staff,staffCount,unread:Number(unread[0]?.count??0),viewerId:viewer.id,canSend:viewer.role.permissions.includes("messages.send"),selected:selected?{id:selected.id,kind:selected.kind,title:selected.title,revision:selected.revision,lastSequence:selected.lastSequence,ownerMemberId:selected.ownerMemberId,archived:mine!.archived,lastReadSequence:mine!.lastReadSequence,participants:selected.participants.map(p=>({id:p.memberId,name:p.member.characterName,status:p.member.status}))}:null,messages:messages.reverse(),messageCount};
 },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type MessagesData=Awaited<ReturnType<typeof readMessages>>;
