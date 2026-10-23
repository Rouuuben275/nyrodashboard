import {notifyUser,notifyUsers} from "@/domains/notifications/delivery";
import {companyNotificationUrl} from "@/domains/notifications/constants";
import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {AppError} from "@/domains/core/errors";
import {activeAccess,assertActiveUser,verifiedDiscordId} from "@/domains/platform/access";
import {admissionAction} from "./validation";
import {requireServerManager} from "./access";
import {assertServerCapacity} from "./capacity";
type Actor={id:string;name:string};
export async function executeAdmission(actor:Actor,raw:unknown){
  await assertActiveUser(db,actor.id);const bucket=`admission:${actor.id}:${Math.floor(Date.now()/60000)}`;
  const rate=await db.rateLimit.upsert({where:{key:bucket},create:{key:bucket,count:1,lastRequest:BigInt(Date.now())},update:{count:{increment:1},lastRequest:BigInt(Date.now())}});if(rate.count>30)throw new AppError("Trop d’actions d’accès. Réessayez dans une minute.",429);
  const input=admissionAction.parse(raw),fingerprint=createHash("sha256").update(JSON.stringify({actorId:actor.id,input})).digest("hex");
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;await assertActiveUser(tx,actor.id);
    const managing=input.action==="decide"||input.action==="member.status";
    const server=managing?await requireServerManager(tx,input.serverId,actor.id):await tx.rPServer.findUnique({where:{id:input.serverId}});
    if(!server||!activeAccess(server.status,server.suspendedUntil))throw new AppError("Serveur RP inaccessible.",403);
    if(!managing&&!await verifiedDiscordId(tx,actor.id))throw new AppError("Une identité Discord vérifiée est requise.",403);
    const old=await tx.serverAccessCommand.findUnique({where:{requestKey:input.requestKey}});if(old){if(old.fingerprint!==fingerprint)throw new AppError("Cette clé appartient à une autre commande.",409);return old.result;}
    const revision=(expected:number,actual:number)=>{if(expected!==actual)throw new AppError("La demande ou l’adhésion a changé. Actualisez.",409);};
    let result:{id:string;revision?:number},userId=actor.id,reason="",kind:string=input.action;
    const admit=async(target:string)=>{await assertActiveUser(tx,target);if(!await verifiedDiscordId(tx,target))throw new AppError("Le compte cible doit posséder une identité Discord vérifiée.",403);await assertServerCapacity(tx,server.id,target);return tx.serverCommunityMember.upsert({where:{serverId_userId:{serverId:server.id,userId:target}},create:{serverId:server.id,userId:target},update:{status:"ACTIVE",revision:{increment:1}}});};
    if(input.action==="join"||input.action==="request"){
      if(server.visibility!=="PUBLIC"||server.accessMode!==(input.action==="join"?"OPEN":"REQUEST"))throw new AppError("Ce mode d’admission n’est pas disponible pour ce serveur.",403);
      const community=await tx.serverCommunityMember.findUnique({where:{serverId_userId:{serverId:server.id,userId:actor.id}}});if(community?.status==="BLOCKED")throw new AppError("Votre accès communautaire à ce serveur est bloqué.",403);
      if(community?.status==="ACTIVE")throw new AppError("Vous êtes déjà membre de cette communauté.",409);
      if(await tx.serverMember.count({where:{serverId:server.id,userId:actor.id,status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}})||await tx.companyMember.count({where:{userId:actor.id,status:"ACTIVE",company:{serverId:server.id}}}))throw new AppError("Votre compte possède déjà un accès à ce serveur.",409);
      if(input.action==="join"){const member=await admit(actor.id);result={id:member.id,revision:member.revision};reason="Adhésion volontaire à une communauté ouverte";await tx.serverAccessRequest.updateMany({where:{serverId:server.id,userId:actor.id,status:"PENDING"},data:{status:"WITHDRAWN",decisionReason:reason,decidedAt:new Date(),revision:{increment:1}}});}
      else{
        const previous=await tx.serverAccessRequest.findUnique({where:{serverId_userId:{serverId:server.id,userId:actor.id}}});
        if(previous?.status==="PENDING")throw new AppError("Une demande est déjà en attente.",409);
        if(previous?.status==="REJECTED"&&previous.decidedAt&&Date.now()-+previous.decidedAt<86400000)throw new AppError("Une nouvelle demande sera possible 24 heures après le refus.");
        if(await tx.serverAccessEvent.count({where:{actorId:actor.id,kind:"request",createdAt:{gte:new Date(Date.now()-86400000)}}})>=10)throw new AppError("Limite de dix demandes par 24 heures atteinte.",429);
        const request=await tx.serverAccessRequest.upsert({where:{serverId_userId:{serverId:server.id,userId:actor.id}},create:{serverId:server.id,userId:actor.id,message:input.message},update:{message:input.message,status:"PENDING",decisionReason:"",requestedAt:new Date(),decidedAt:null,revision:{increment:1}}});result={id:request.id,revision:request.revision};reason=input.message;
        const managers=await tx.serverMember.findMany({where:{serverId:server.id,status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}],role:{permissions:{hasSome:["members.manage","server.manage"]}},user:{OR:[{accessStatus:"ACTIVE"},{accessStatus:"SUSPENDED",suspendedUntil:{lte:new Date()}}]}},select:{userId:true}});
        if(managers.length)await notifyUsers(tx,managers.filter(m=>m.userId!==actor.id).map(m=>({userId:m.userId,title:"Demande d’accès à une communauté RP",body:"Une demande attend une décision dans la gestion des accès du serveur.",category:"COMMUNITY",targetUrl:`/serveurs/${server.id}/acces`})));
      }
    }else if(input.action==="member.status"){
      const member=await tx.serverCommunityMember.findFirst({where:{id:input.id,serverId:server.id}});if(!member)throw new AppError("Adhésion introuvable.",404);revision(input.revision,member.revision);userId=member.userId;reason=input.reason;
      if(input.status==="ACTIVE"){await assertActiveUser(tx,userId);await assertServerCapacity(tx,server.id,userId);}
      const updated=await tx.serverCommunityMember.update({where:{id:member.id},data:{status:input.status,revision:{increment:1}}});result={id:updated.id,revision:updated.revision};
      await notifyUser(tx,{userId,title:"Accès communautaire mis à jour",body:"Votre accès à une communauté RP a changé. Consultez vos espaces et votre historique d’admission.",category:"COMMUNITY",targetUrl:"/espaces"});
    }else{
      const request=await tx.serverAccessRequest.findFirst({where:{id:input.id,serverId:server.id,...(input.action==="withdraw"?{userId:actor.id}:{})}});if(!request)throw new AppError("Demande introuvable.",404);revision(input.revision,request.revision);if(request.status!=="PENDING")throw new AppError("Cette demande a déjà reçu une décision.",409);
      userId=request.userId;reason=input.reason;const status=input.action==="withdraw"?"WITHDRAWN":input.status;
      if(status==="ACCEPTED"){
        if(server.accessMode!=="REQUEST")throw new AppError("Le serveur n’accepte plus les demandes. Refusez ou rétablissez ce mode avant de décider.");
        const member=await tx.serverCommunityMember.findUnique({where:{serverId_userId:{serverId:server.id,userId}}});if(member?.status==="BLOCKED")throw new AppError("Réactivez explicitement cette adhésion avant d’accepter.");await admit(userId);
      }
      const updated=await tx.serverAccessRequest.update({where:{id:request.id},data:{status,decisionReason:reason,decidedAt:new Date(),revision:{increment:1}}});result={id:updated.id,revision:updated.revision};kind=status;
      if(input.action==="decide")await notifyUser(tx,{userId,title:"Décision sur votre demande d’accès RP",body:"Une décision motivée est disponible dans votre historique d’admission.",category:"COMMUNITY",targetUrl:"/espaces"});
    }
    await tx.serverAccessEvent.create({data:{serverId:server.id,userId,actorId:actor.id,actorName:actor.name,kind,reason}});
    if(managing){await tx.serverAuditLog.create({data:{serverId:server.id,actorId:actor.id,actorName:actor.name,action:`Admission : ${kind}`,entityId:result.id}});await tx.platformAudit.create({data:{actorId:actor.id,actorName:actor.name,action:`admission.${kind}`,targetType:"server",targetId:server.id,reason:"Décision d’admission conservée dans l’historique privé du serveur",correlationId:input.requestKey,changes:{id:result.id,userId}}});}
    await tx.serverAccessCommand.create({data:{serverId:server.id,requestKey:input.requestKey,fingerprint,result:result as Prisma.InputJsonValue}});return result;
  },{timeout:20000});
}
