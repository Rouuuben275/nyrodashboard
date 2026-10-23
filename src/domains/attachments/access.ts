import type {Prisma} from "@prisma/client";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import type {AttachmentTarget} from "./validation";
// A document administrator gains no access to HR or expense evidence through
// documents.manage. Every operation, including an old-version download, checks its parent.
export async function attachmentAccess(tx:Prisma.TransactionClient,userId:string,q:AttachmentTarget,write=false){
 const member=await membership(tx,q.companyId,userId),p=member.role.permissions;
 const need=(module:string,permission:string)=>{if(!p.includes(permission)||!member.company.modules.some(m=>m.key===module&&m.enabled))throw new AppError("Dossier privé inaccessible ou module désactivé.",403);};
 if(!member.company.modules.some(m=>m.key==="documents"&&m.enabled))throw new AppError("Module Documents désactivé.",403);
 let writable=false;
 if(q.targetType==="EMPLOYEE"){
  need("employees","employees.read");const row=await tx.companyMember.findFirst({where:{companyId:q.companyId,id:q.targetId}});
  if(!row)throw new AppError("Employé introuvable.",404);if(row.id!==member.id&&!p.includes("employees.manage"))throw new AppError("Dossier employé privé.",403);
  writable=p.includes("employees.manage")||row.id===member.id;
 }else if(q.targetType==="LEAVE"){
  need("leaves","leaves.read");const row=await tx.leaveRequest.findFirst({where:{companyId:q.companyId,id:q.targetId}});
  if(!row)throw new AppError("Absence introuvable.",404);if(row.memberId!==member.id&&!p.includes("leaves.manage"))throw new AppError("Justificatifs d’absence privés.",403);
  writable=row.status==="PENDING";
 }else if(q.targetType==="TASK"){
  need("tasks","tasks.read");const row=await tx.task.findFirst({where:{companyId:q.companyId,id:q.targetId}});
  if(!row)throw new AppError("Tâche introuvable.",404);writable=!row.archived&&row.status!=="DONE"&&(p.includes("tasks.manage")||row.assigneeId===member.id);
 }else if(q.targetType==="EXPENSE"){
  need("expenses","expenses.read");const row=await tx.expense.findFirst({where:{companyId:q.companyId,id:q.targetId},include:{claim:true}});
  if(!row)throw new AppError("Dépense introuvable.",404);if(row.actorId!==userId&&!p.includes("expenses.approve"))throw new AppError("Justificatifs de dépense privés.",403);
  // Reimbursed claims retain their frozen evidence on the claim, never on this legacy record.
  writable=!row.claim&&(p.includes("expenses.approve")||(row.actorId===userId&&p.includes("expenses.create")));
 }else{
  need("expenses","expenses.read");const row=await tx.expenseClaim.findFirst({where:{companyId:q.companyId,id:q.targetId}});
  if(!row)throw new AppError("Note de frais introuvable.",404);if(row.actorId!==userId&&!p.includes("expenses.approve"))throw new AppError("Note de frais privée.",403);
  writable=row.actorId===userId&&row.status==="DRAFT"&&p.includes("expenses.create");
 }
 if(write&&!writable)throw new AppError("Pièces verrouillées ou modification non autorisée.",403);
 return {member,writable};
}
