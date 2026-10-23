import {utilityWrite} from "@/domains/utilities/write";
import {AppError} from "@/domains/core/errors";
import {layoutAction} from "./validation";
export async function saveStatisticsLayout(actor:{id:string;name:string},raw:unknown){const input=layoutAction.parse(raw);return utilityWrite(actor,"statistics","statistics.read",input,async(tx,member)=>{
 const where={companyId_memberId:{companyId:input.companyId,memberId:member.id}},old=await tx.statisticsLayout.findUnique({where});
 if((old?.revision??0)!==input.revision)throw new AppError("La disposition a changé dans un autre onglet. Rouvrez la personnalisation.",409);
 const row=await tx.statisticsLayout.upsert({where,create:{companyId:input.companyId,memberId:member.id,widgets:input.widgets,revision:1},update:{widgets:input.widgets,revision:{increment:1}}});return {id:member.id,revision:row.revision};
});}
