import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {AppError} from "@/domains/core/errors";
import {configuredOwner,requirePlatform,verifiedDiscordId} from "./access";
import {defaultServerRoles} from "./permissions";
import {platformAction} from "./validation";
import {assertServerCapacity} from "@/domains/servers/capacity";
import {lockCompanySlots} from "@/domains/billing/slots";
import {assertLogoAttachment} from "@/domains/media/service";
type Actor={id:string;name:string};
export async function executePlatform(actor:Actor,raw:unknown,sessionCreatedAt:Date){
  const input=platformAction.parse(raw),key=(raw as {requestKey?:unknown}).requestKey;
  if(typeof key!=="string"||!/^[-a-f0-9]{36}$/i.test(key))throw new AppError("Clé de commande requise.");
  const rate=await db.rateLimit.upsert({where:{key:`admin:${actor.id}:${Math.floor(Date.now()/60000)}`},create:{key:`admin:${actor.id}:${Math.floor(Date.now()/60000)}`,count:1,lastRequest:BigInt(Date.now())},update:{count:{increment:1},lastRequest:BigInt(Date.now())}});if(rate.count>40)throw new AppError("Trop d’actions administratives.",429);
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin'))::text`;
    const permission=input.action==="server.create"?"servers.create":input.action.startsWith("server.")?"servers.manage":input.action==="sessions.revoke"?"users.manage":input.action==="access.status"?input.target==="user"?"users.manage":input.target==="company"?"companies.manage":"servers.manage":undefined;
    const access=await requirePlatform(tx,actor.id,permission);
    if(input.action==="user.slots.grant")await requirePlatform(tx,actor.id,"users.slots.manage");
    if(input.action==="platform.grant"&&!access.owner)throw new AppError("Seul le propriétaire Nyro Dashboard délègue les accès plateforme.",403);
    const fingerprint=createHash("sha256").update(JSON.stringify({actor:actor.id,input})).digest("hex"),old=await tx.platformCommand.findUnique({where:{requestKey:key}});
    if(old){if(old.fingerprint!==fingerprint)throw new AppError("Cette clé a déjà été utilisée pour une autre commande.",409);return old.result;}
    if(input.action!=="server.create"&&input.action!=="server.update"&&Date.now()-sessionCreatedAt.getTime()>30*60000)throw new AppError("Reconnectez-vous avec Discord pour confirmer cette opération sensible (session de moins de 30 minutes requise).",403);
    const check=(expected:number,current:number)=>{if(expected!==current)throw new AppError("Données modifiées depuis l’ouverture. Actualisez avant de réessayer.",409);};
    let result:{id:string;revision?:number}={id:""},changes:Prisma.InputJsonValue={},targetType="server",targetId="";
    if(input.action==="user.slots.grant"){
      await lockCompanySlots(tx,input.discordId);
      const previous=await tx.companySlotAccount.findUnique({where:{discordId:input.discordId}});
      if(input.revision!==undefined)check(input.revision,previous?.revision??0);
      if((previous?.granted??0)+input.quantity>10000)throw new AppError("Plafond de 10 000 slots administratifs atteint.");
      const balance=await tx.companySlotAccount.upsert({where:{discordId:input.discordId},create:{discordId:input.discordId,granted:input.quantity,revision:1},update:{granted:{increment:input.quantity},revision:{increment:1}}});
      result={id:balance.discordId,revision:balance.revision};targetType="companySlots";targetId=balance.discordId;
      changes={quantity:input.quantity,before:{granted:previous?.granted??0,purchased:previous?.purchased??0},after:{granted:balance.granted,purchased:balance.purchased}};
    }else if(input.action==="server.create"||input.action==="server.update"){
      const {action,reason,...rest}=input;void reason;
      const fields={name:rest.name,description:rest.description,slug:rest.slug,logoUrl:rest.logoUrl,logoAssetId:rest.logoAssetId,bannerUrl:rest.bannerUrl,visibility:rest.visibility,accessMode:rest.accessMode,maxCompanies:rest.maxCompanies,maxUsers:rest.maxUsers};
      if(rest.logoAssetId&&rest.logoUrl)throw new AppError("Choisissez un fichier ou un lien pour le logo.");
      if(action==="server.create"){
        await assertLogoAttachment(tx,actor.id,"server",rest.logoAssetId);
        const server=await tx.rPServer.create({data:fields});result={id:server.id,revision:server.revision};
        await tx.serverRole.createMany({data:defaultServerRoles.map(r=>({...r,serverId:server.id}))});changes={after:fields};
      }else if(input.action==="server.update"){
        const previous=await tx.rPServer.findUnique({where:{id:input.id}});if(!previous)throw new AppError("Serveur introuvable.",404);check(input.revision,previous.revision);
        await assertLogoAttachment(tx,actor.id,"server",input.logoAssetId,previous.logoAssetId);
        if((input.logoAssetId===undefined?previous.logoAssetId:input.logoAssetId)&&input.logoUrl)throw new AppError("Choisissez un fichier ou un lien pour le logo.");
        const server=await tx.rPServer.update({where:{id:input.id},data:{...fields,revision:{increment:1}}});result={id:server.id,revision:server.revision};
        changes={before:{name:previous.name,slug:previous.slug,maxCompanies:previous.maxCompanies,maxUsers:previous.maxUsers,visibility:previous.visibility,accessMode:previous.accessMode},after:fields};
      }
      targetId=result.id;
    }else if(input.action==="server.grant"){
      const server=await tx.rPServer.findUnique({where:{id:input.serverId}});if(!server)throw new AppError("Serveur introuvable.",404);
      const role=await tx.serverRole.findFirst({where:{id:input.roleId,serverId:input.serverId}});if(!role)throw new AppError("Rôle étranger ou introuvable.",403);
      const previous=await tx.serverDiscordGrant.findUnique({where:{serverId_discordId:{serverId:server.id,discordId:input.discordId}}});if(previous)check(input.revision??-1,previous.revision);else if(input.revision!==undefined)throw new AppError("Attribution introuvable.",404);
      const expiresAt=input.expiresAt?new Date(input.expiresAt):null;if(expiresAt&&expiresAt<=new Date()&&input.status==="ACTIVE")throw new AppError("Expiration future requise.");
      const account=await tx.account.findUnique({where:{providerId_accountId:{providerId:"discord",accountId:input.discordId}},select:{userId:true}});
      const member=account?await tx.serverMember.findUnique({where:{serverId_userId:{serverId:server.id,userId:account.userId}}}):null;
      if(input.status==="ACTIVE"&&account&&member?.status!=="ACTIVE")await assertServerCapacity(tx,server.id,account.userId);
      const grant=await tx.serverDiscordGrant.upsert({where:{serverId_discordId:{serverId:server.id,discordId:input.discordId}},create:{serverId:server.id,discordId:input.discordId,roleId:role.id,status:input.status,expiresAt},update:{roleId:role.id,status:input.status,expiresAt,revision:{increment:1}}});
      if(account)await tx.serverMember.upsert({where:{serverId_userId:{serverId:server.id,userId:account.userId}},create:{serverId:server.id,userId:account.userId,roleId:role.id,status:input.status==="ACTIVE"?"ACTIVE":"REVOKED",expiresAt},update:{roleId:role.id,status:input.status==="ACTIVE"?"ACTIVE":"REVOKED",expiresAt}});
      result={id:grant.id,revision:grant.revision};targetId=server.id;changes={grantId:grant.id,discordId:input.discordId,roleId:role.id,status:grant.status,expiresAt:expiresAt?.toISOString()??null};
    }else if(input.action==="platform.grant"){
      if(input.discordId===configuredOwner())throw new AppError("Le propriétaire configuré ne peut être modifié ni révoqué depuis un rôle secondaire.",403);
      const previous=await tx.platformGrant.findUnique({where:{discordId:input.discordId}});if(previous)check(input.revision??-1,previous.revision);else if(input.revision!==undefined)throw new AppError("Attribution introuvable.",404);
      const expiresAt=input.expiresAt?new Date(input.expiresAt):null;if(expiresAt&&expiresAt<=new Date()&&input.status==="ACTIVE")throw new AppError("Expiration future requise.");
      const grant=await tx.platformGrant.upsert({where:{discordId:input.discordId},create:{discordId:input.discordId,permissions:[...new Set(input.permissions)],status:input.status,expiresAt},update:{permissions:[...new Set(input.permissions)],status:input.status,expiresAt,revision:{increment:1}}});
      result={id:grant.id,revision:grant.revision};targetType="platformGrant";targetId=grant.id;changes={before:previous?{permissions:previous.permissions,status:previous.status}:null,after:{discordId:grant.discordId,permissions:grant.permissions,status:grant.status,expiresAt:expiresAt?.toISOString()??null}};
    }else{
      targetType=input.action==="sessions.revoke"?"user":input.target;targetId=input.id;
      if(input.confirmation!==input.id)throw new AppError("Recopiez l’identifiant de la cible pour confirmer.");
      if(targetType==="user"&&(input.id===actor.id||(!!configuredOwner()&&(await verifiedDiscordId(tx,input.id))===configuredOwner())))throw new AppError("Le propriétaire configuré et votre propre accès sont protégés.",403);
      if(input.action==="sessions.revoke"){
        if(!await tx.user.findUnique({where:{id:input.id},select:{id:true}}))throw new AppError("Utilisateur introuvable.",404);
        const revoked=await tx.session.deleteMany({where:{userId:input.id}});changes={revokedSessions:revoked.count};result={id:input.id};
      }else{
        if(input.target==="user"&&input.status==="ARCHIVED")throw new AppError("Les comptes ne peuvent pas être archivés depuis cette opération.");
        const previous=input.target==="server"?await tx.rPServer.findUnique({where:{id:input.id},select:{revision:true,status:true}}):input.target==="company"?await tx.company.findUnique({where:{id:input.id},select:{adminRevision:true,accessStatus:true}}):await tx.user.findUnique({where:{id:input.id},select:{adminRevision:true,accessStatus:true}});
        if(!previous)throw new AppError("Cible introuvable.",404);check(input.revision,"revision" in previous?previous.revision:previous.adminRevision);
        const until=input.status==="SUSPENDED"&&input.until?new Date(input.until):null;if(until&&until<=new Date())throw new AppError("La suspension doit expirer dans le futur.");
        if(input.target==="server")await tx.rPServer.update({where:{id:input.id},data:{status:input.status,suspendedUntil:until,revision:{increment:1}}});
        else if(input.target==="company")await tx.company.update({where:{id:input.id},data:{accessStatus:input.status,suspendedUntil:until,adminRevision:{increment:1}}});
        else{await tx.user.update({where:{id:input.id},data:{accessStatus:input.status,suspendedUntil:until,adminRevision:{increment:1}}});if(input.status!=="ACTIVE")await tx.session.deleteMany({where:{userId:input.id}});}
        changes={before:"status" in previous?previous.status:previous.accessStatus,after:input.status,until:until?.toISOString()??null};result={id:input.id,revision:input.revision+1};
      }
    }
    await tx.platformAudit.create({data:{actorId:actor.id,actorName:actor.name,action:input.action,targetType,targetId,reason:input.reason,changes,correlationId:key}});
    if(targetType==="server")await tx.serverAuditLog.create({data:{serverId:targetId,actorId:actor.id,actorName:actor.name,action:`Administration Nyro Dashboard : ${input.action}`,entityId:targetId}});
    await tx.platformCommand.create({data:{requestKey:key,fingerprint,result}});return result;
  },{timeout:20000}).catch(async error=>{
    // Log validated command metadata only. Never serialize raw requests, sessions or provider tokens.
    if(error instanceof AppError)await db.platformAudit.create({data:{actorId:actor.id,actorName:actor.name,action:input.action,targetType:"administrative-command",targetId:"id" in input?input.id:"serverId" in input?input.serverId:"configuration",reason:"Commande administrative refusée par les contrôles serveur",result:error.status===403?"DENIED":"FAILED",correlationId:key,changes:{status:error.status}}});
    throw error;
  });
}
