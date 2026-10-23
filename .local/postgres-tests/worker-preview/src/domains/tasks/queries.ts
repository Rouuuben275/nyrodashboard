import {Prisma} from "@prisma/client";
import type {z} from "zod";
import {db} from "@/lib/db";
import {membership} from "@/domains/core/service";
import {AppError} from "@/domains/core/errors";
import {parisDay} from "@/domains/planning/recurrence";
import {taskAccess} from "./service";
import {taskBuiltins} from "./constants";
import type {tasksQuery} from "./validation";
const summary={id:true,title:true,status:true,priority:true,dueAt:true,revision:true,archived:true,assigneeId:true,assignee:{select:{id:true,characterName:true,status:true}},_count:{select:{checklist:true,comments:true}},checklist:{where:{done:true},select:{id:true}}} satisfies Prisma.TaskSelect;
const order=[{dueAt:{sort:"asc",nulls:"last"}},{createdAt:"desc"},{id:"asc"}] satisfies Prisma.TaskOrderByWithRelationInput[];
export async function readTasks(userId:string,q:z.infer<typeof tasksQuery>){
  return db.$transaction(async tx=>{
    const viewer=await membership(tx,q.companyId,userId);taskAccess(viewer);const manage=viewer.role.permissions.includes("tasks.manage");
    if(["staff","columns"].includes(q.view)&&!manage)throw new AppError("Gestion des tâches requise.",403);
    const where:Prisma.TaskWhereInput={companyId:q.companyId,archived:q.archived==="true",...(q.status?{status:q.status}:{}),...(q.priority?{priority:q.priority}:{}),...(q.assignee?{assigneeId:q.assignee==="none"?null:q.assignee==="mine"?viewer.id:q.assignee}:{}),...(q.q?{OR:[{title:{contains:q.q,mode:"insensitive"}},{description:{contains:q.q,mode:"insensitive"}},{assignee:{characterName:{contains:q.q,mode:"insensitive"}}}]}:{})};
    const due:Prisma.DateTimeNullableFilter={...(q.from?{gte:parisDay(q.from)}:{}),...(q.to?{lt:parisDay(q.to,1)}:{})};
    if(q.overdue==="true"){due.lt=q.to?new Date(Math.min(+parisDay(q.to,1),Date.now())):new Date();where.AND=[{status:{not:"DONE"}}];}
    if(q.from||q.to||q.overdue==="true")where.dueAt=due;
    const activeColumns=await tx.taskStatus.findMany({where:{companyId:q.companyId,archived:false},orderBy:[{position:"asc"},{name:"asc"},{id:"asc"}]});
    const historical=q.view==="board"&&q.archived==="true"?await tx.task.groupBy({by:["status"],where}):[];
    const historicColumns=historical.length?await tx.taskStatus.findMany({where:{companyId:q.companyId,archived:true,id:{in:historical.map(t=>t.status)}},orderBy:[{position:"asc"},{id:"asc"}],take:51}):[];
    if(historicColumns.length>50)throw new AppError("Utilisez la vue Liste pour consulter plus de 50 anciens statuts.",413);
    const columns=[...taskBuiltins.slice(0,2).map(c=>({...c,archived:false})),...activeColumns.map(c=>({id:c.id,name:c.name,archived:false})),...historicColumns.map(c=>({id:c.id,name:c.name,archived:true})),{...taskBuiltins[2],archived:false}];
    const staffWhere:Prisma.CompanyMemberWhereInput={companyId:q.companyId,status:"ACTIVE",role:{permissions:{has:"tasks.read"}},...(q.q?{characterName:{contains:q.q,mode:"insensitive"}}:{})};
    const columnWhere={companyId:q.companyId,...(q.q?{name:{contains:q.q,mode:"insensitive" as const}}:{})};
    const [rows,total,board,staff,staffCount,statusRows,statusCount,selected]=await Promise.all([
      q.view==="list"?tx.task.findMany({where,select:summary,orderBy:order,take:25,skip:(q.page-1)*25}):[],
      ["list","board"].includes(q.view)?tx.task.count({where}):0,
      q.view==="board"?Promise.all(columns.filter(c=>!q.status||c.id===q.status).map(async column=>{const lane={...where,status:column.id};const [rows,total]=await Promise.all([tx.task.findMany({where:lane,select:summary,orderBy:order,take:25,skip:(q.page-1)*25}),tx.task.count({where:lane})]);return {...column,rows,total};})):[],
      q.view==="staff"?tx.companyMember.findMany({where:staffWhere,select:{id:true,characterName:true,department:true},orderBy:[{characterName:"asc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],
      q.view==="staff"?tx.companyMember.count({where:staffWhere}):0,
      q.view==="columns"?tx.taskStatus.findMany({where:columnWhere,orderBy:[{archived:"asc"},{position:"asc"},{name:"asc"},{id:"asc"}],take:25,skip:(q.page-1)*25}):[],
      q.view==="columns"?tx.taskStatus.count({where:columnWhere}):0,
      q.taskId?tx.task.findFirst({where:{companyId:q.companyId,id:q.taskId},select:{id:true,title:true,description:true,status:true,priority:true,dueAt:true,revision:true,archived:true,assigneeId:true,createdAt:true,updatedAt:true,assignee:{select:{id:true,characterName:true,status:true}},checklist:{orderBy:{position:"asc"},select:{id:true,title:true,done:true}}}}):null,
    ]);
    if(q.taskId&&!selected)throw new AppError("Tâche introuvable.",404);
    const taskId=selected?.id??"";
    const [comments,commentCount,events,eventCount,missingColumns]=await Promise.all([
      selected?tx.taskComment.findMany({where:{companyId:q.companyId,taskId},select:{id:true,authorName:true,body:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.commentPage-1)*25}):[],
      selected?tx.taskComment.count({where:{companyId:q.companyId,taskId}}):0,
      selected?tx.taskEvent.findMany({where:{companyId:q.companyId,taskId},select:{id:true,actorName:true,action:true,reason:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:25,skip:(q.eventPage-1)*25}):[],
      selected?tx.taskEvent.count({where:{companyId:q.companyId,taskId}}):0,
      tx.taskStatus.findMany({where:{companyId:q.companyId,id:{in:[...rows.map(t=>t.status),...(selected?[selected.status]:[])].filter(s=>!columns.some(c=>c.id===s))}},select:{id:true,name:true,archived:true}}),
    ]);
    return {rows,total,board,columns:[...columns,...missingColumns],staff,staffCount,statusRows,statusCount,selected,comments,commentCount,events,eventCount,manage,participate:manage||selected?.assigneeId===viewer.id,viewerId:viewer.id};
  },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type TasksData=Awaited<ReturnType<typeof readTasks>>;
