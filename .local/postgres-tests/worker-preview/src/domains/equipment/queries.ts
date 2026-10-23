import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {moduleAccess} from "@/domains/utilities/write";
import {equipmentStaff} from "./service";
import {equipmentQuery} from "./validation";
export const parisToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const fields={id:true,code:true,kind:true,name:true,registration:true,serial:true,location:true,notes:true,state:true,mileage:true,acquiredOn:true,nextServiceOn:true,custodianId:true,revision:true,archived:true,createdAt:true,updatedAt:true,custodian:{select:{id:true,characterName:true,status:true}},_count:{select:{works:{where:{status:"OPEN"}}}}} satisfies Prisma.EquipmentItemSelect;
export async function readEquipment(userId:string,raw:unknown,exportLimit?:number){
 const q=equipmentQuery.parse(raw);return db.$transaction(async tx=>{
  const member=await membership(tx,q.companyId,userId);moduleAccess(member,"equipment","equipment.read");const manage=member.role.permissions.includes("equipment.manage");
  if(q.view==="staff"&&!manage)throw new AppError("Gestion des équipements requise.",403);
  const today=parisToday();
  const where:Prisma.EquipmentItemWhereInput={companyId:q.companyId,archived:q.archived==="true",...(q.kind?{kind:q.kind}:{}),...(q.state?{state:q.state}:{}),...(q.assigned==="mine"?{custodianId:member.id}:q.assigned==="none"?{custodianId:null}:{}),AND:[...(q.q?[{OR:[...(["name","code","registration","serial","location"] as const).map(k=>({[k]:{contains:q.q,mode:"insensitive" as const}})),{custodian:{characterName:{contains:q.q,mode:"insensitive" as const}}}]}]:[]),...(q.due==="due"?[{OR:[{nextServiceOn:{lte:today}},{works:{some:{status:"OPEN",dueOn:{lte:today}}}}]}]:[])]};
  const staffWhere={...equipmentStaff(q.companyId),...(q.q?{characterName:{contains:q.q,mode:"insensitive" as const}}:{})};
  const [rows,total,selected,staff,staffCount,states,due]=await Promise.all([
   q.view==="list"?tx.equipmentItem.findMany({where,select:fields,orderBy:[{updatedAt:"desc"},{id:"asc"}],take:exportLimit??25,skip:exportLimit?0:(q.page-1)*25}):[],
   q.view==="list"?tx.equipmentItem.count({where}):0,
   q.itemId?tx.equipmentItem.findFirst({where:{companyId:q.companyId,id:q.itemId},select:fields}):null,
   q.view==="staff"?tx.companyMember.findMany({where:staffWhere,select:{id:true,characterName:true,department:true},orderBy:[{characterName:"asc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],
   q.view==="staff"?tx.companyMember.count({where:staffWhere}):0,
   tx.equipmentItem.groupBy({by:["state"],where:{companyId:q.companyId,archived:false},_count:true}),
   tx.equipmentItem.count({where:{companyId:q.companyId,archived:false,OR:[{nextServiceOn:{lte:today}},{works:{some:{status:"OPEN",dueOn:{lte:today}}}}]}}),
  ]);
  if(q.itemId&&!selected)throw new AppError("Équipement introuvable.",404);
  const workWhere={companyId:q.companyId,itemId:selected?.id??"",...(q.workStatus!=="all"?{status:q.workStatus}:{})};
  const [works,workCount,events,eventCount]=selected?await Promise.all([
   tx.equipmentWork.findMany({where:workWhere,orderBy:[{status:"desc"},{createdAt:"desc"},{id:"asc"}],take:25,skip:(q.workPage-1)*25}),tx.equipmentWork.count({where:workWhere}),
   tx.equipmentEvent.findMany({where:{companyId:q.companyId,itemId:selected.id},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.eventPage-1)*25}),tx.equipmentEvent.count({where:{companyId:q.companyId,itemId:selected.id}}),
  ]):[[],0,[],0];
  return {rows,total,selected,works,workCount,events,eventCount,staff,staffCount,manage,viewerId:member.id,today,company:{id:member.company.id,name:member.company.name},summary:{total:states.reduce((s,c)=>s+c._count,0),ready:states.find(c=>c.state==="READY")?._count??0,maintenance:states.find(c=>c.state==="MAINTENANCE")?._count??0,unavailable:states.find(c=>c.state==="OUT_OF_SERVICE")?._count??0,due}};
 },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type EquipmentData=Awaited<ReturnType<typeof readEquipment>>;
