import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {readTasks} from "../src/domains/tasks/queries";
import {tasksQuery} from "../src/domains/tasks/validation";
test("PostgreSQL: collaborative tasks, guarded assignments, checklists and persistent history",async t=>{
  const prefix=`tasks-${randomUUID()}`,users:string[]=[],companies:string[]=[];
  try{
    const make=async(name:string)=>{const u=await db.user.create({data:{name,email:`${prefix}-${name}@example.test`}});users.push(u.id);return u;};
    const owner=await make("owner"),employee=await make("employee"),peer=await make("peer"),stranger=await make("foreign");
    const company=await execute(owner,undefined,{action:"company.create",name:prefix,sector:"Garage"}) as {id:string};companies.push(company.id);
    const foreign=await execute(stranger,undefined,{action:"company.create",name:`${prefix}-foreign`,sector:"Services"}) as {id:string};companies.push(foreign.id);
    const role=await db.companyRole.findFirstOrThrow({where:{companyId:company.id,isOwner:false}});
    const member=await db.companyMember.create({data:{companyId:company.id,userId:employee.id,roleId:role.id,characterName:"Employé assigné"}});
    const unassigned=await db.companyMember.create({data:{companyId:company.id,userId:peer.id,roleId:role.id,characterName:"Lecteur"}});
    const foreignMember=await db.companyMember.findFirstOrThrow({where:{companyId:foreign.id,userId:stranger.id}});
    const act=(payload:Record<string,unknown>,actor=owner)=>execute(actor,company.id,{requestKey:randomUUID(),...payload}) as Promise<{id:string;revision:number}>;
    const read=(extra:Record<string,unknown>={},actor=owner)=>readTasks(actor.id,tasksQuery.parse({companyId:company.id,...extra}));
    const content={title:"Préparer un moteur RP",description:"Procédure collective RP",priority:"HIGH",assigneeId:member.id,dueAt:"2026-01-31T23:30:00Z",checklist:["Contrôler les pièces","Préparer l’outillage"]};
    let taskId="",rev=0,columnId="";
    await t.test("legacy tasks remain readable without fabricated history",async()=>{
      const legacy=await db.task.create({data:{companyId:company.id,title:"Ancienne tâche",priority:"NORMAL",status:"DONE"}});
      const view=await read({taskId:legacy.id});assert.equal(view.selected?.revision,0);assert.equal(view.selected?.status,"DONE");assert.equal(view.eventCount,0);assert.equal(view.commentCount,0);
      await execute(owner,company.id,{action:"task.toggle",taskId:legacy.id});assert.equal((await read({taskId:legacy.id})).selected?.status,"TODO");
    });
    await t.test("tenant, read and management permissions cannot be bypassed",async()=>{
      await assert.rejects(act({action:"task.create",...content},employee),/Gestion/);
      await assert.rejects(act({action:"task.create",...content,assigneeId:foreignMember.id}),/Employé actif/);
      await assert.rejects(read({},stranger),/inaccessible/);await assert.rejects(read({view:"staff"},employee),/Gestion/);
      await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(act({action:"task.create",...content}),/Employé actif/);await db.companyMember.update({where:{id:member.id},data:{status:"ACTIVE"}});
      const noRead=await db.companyRole.create({data:{companyId:company.id,name:"Sans tâches",permissions:[]}});await db.companyMember.update({where:{id:unassigned.id},data:{roleId:noRead.id}});await assert.rejects(read({},peer),/Lecture/);await db.companyMember.update({where:{id:unassigned.id},data:{roleId:role.id}});
      await act({action:"module.toggle",key:"tasks",enabled:false});await assert.rejects(read(),/désactivé/);await assert.rejects(act({action:"task.create",...content}),/désactivé/);await act({action:"module.toggle",key:"tasks",enabled:true});
    });
    await t.test("concurrent create replay assigns once and creates one internal notification",async()=>{
      const payload={action:"task.create",...content,requestKey:randomUUID()};const [a,b]=await Promise.all([act(payload),act(payload)]);assert.deepEqual(a,b);taskId=a.id;rev=a.revision;
      assert.equal(await db.task.count({where:{companyId:company.id,title:content.title}}),1);assert.equal(await db.notification.count({where:{userId:employee.id,title:"Une tâche vous a été assignée"}}),1);
      assert.equal((await read({taskId})).selected?.checklist.length,2);await assert.rejects(act({...payload,title:"Autre titre"}),/Clé déjà/);
    });
    await t.test("assignees collaborate while other readers cannot mutate",async()=>{
      await assert.rejects(act({action:"task.status",taskId,revision:rev,status:"IN_PROGRESS"},peer),/assignation/);
      rev=(await act({action:"task.status",taskId,revision:rev,status:"IN_PROGRESS"},employee)).revision;
      await assert.rejects(act({action:"task.status",taskId,revision:rev-1,status:"DONE"}),/changé/);
      await assert.rejects(act({action:"task.status",taskId,revision:rev,status:"DONE"},employee),/checklist/);
      await assert.rejects(act({action:"task.check",taskId,revision:rev,itemId:"foreign-item",done:true},employee),/Étape/);
      const items=(await read({taskId},employee)).selected!.checklist;
      rev=(await act({action:"task.check",taskId,revision:rev,itemId:items[0].id,done:true},employee)).revision;
      const before=await read({taskId});await assert.rejects(act({action:"task.update",taskId,revision:rev,...content,checklist:[{id:"foreign-item",title:"Injection"}]}),/Checklist/);assert.equal((await read({taskId})).selected?.revision,before.selected?.revision);
      rev=(await act({action:"task.update",taskId,revision:rev,...content,checklist:items.map(i=>({id:i.id,title:`${i.title} confirmé`}))})).revision;assert.equal((await read({taskId})).selected?.checklist[0].done,true);
      rev=(await act({action:"task.check",taskId,revision:rev,itemId:items[1].id,done:true},employee)).revision;
      rev=(await act({action:"task.status",taskId,revision:rev,status:"DONE"},employee)).revision;
      await assert.rejects(act({action:"task.check",taskId,revision:rev,itemId:items[0].id,done:false}),/Rouvrez/);
      await assert.rejects(act({action:"task.update",taskId,revision:rev,...content,checklist:[{title:"Nouvelle étape"}]}),/Rouvrez/);
    });
    await t.test("custom statuses keep archived tasks accessible and cannot orphan active work",async()=>{
      const column=await act({action:"task.column",name:"Contrôle qualité",position:1});columnId=column.id;
      await assert.rejects(act({action:"task.column",name:"en cours",position:0}),/réservé/);
      await assert.rejects(act({action:"task.column",name:"CONTRÔLE QUALITÉ",position:0}),/existe/);
      const foreignColumn=await execute(stranger,foreign.id,{action:"task.column",requestKey:randomUUID(),name:"Statut étranger",position:0}) as {id:string};await assert.rejects(act({action:"task.status",taskId,revision:rev,status:foreignColumn.id}),/Statut actif/);
      rev=(await act({action:"task.status",taskId,revision:rev,status:column.id})).revision;
      await assert.rejects(act({action:"task.column",id:column.id,revision:0,name:"Contrôle qualité",position:1,archived:true}),/Déplacez/);
      rev=(await act({action:"task.archive",taskId,revision:rev,archived:true,reason:"Conserver le dossier RP"})).revision;
      await act({action:"task.column",id:column.id,revision:0,name:"Contrôle qualité",position:1,archived:true});
      const board=await read({view:"board",archived:"true"});assert.equal(board.board.find(c=>c.id===column.id)?.rows[0].id,taskId);
      await assert.rejects(act({action:"task.archive",taskId,revision:rev,archived:false,reason:"Restaurer le dossier RP"}),/Réactivez/);
      await act({action:"task.column",id:column.id,revision:1,name:"Contrôle qualité",position:1,archived:false});rev=(await act({action:"task.archive",taskId,revision:rev,archived:false,reason:"Restaurer le dossier RP"})).revision;
    });
    await t.test("comments replay once, history is paginated and raw snapshots are never returned",async()=>{
      const payload={action:"task.comment",taskId,revision:rev,body:"Commentaire RP <script>non exécuté</script>",requestKey:randomUUID()};const [a,b]=await Promise.all([act(payload,employee),act(payload,employee)]);assert.deepEqual(a,b);rev=a.revision;
      assert.equal(await db.taskComment.count({where:{taskId,companyId:company.id}}),1);assert.equal((await read({taskId},peer)).comments[0].body,payload.body);
      await assert.rejects(act({action:"task.comment",taskId,revision:rev,body:"Commentaire non autorisé"},peer),/assignation/);
      await db.taskComment.createMany({data:Array.from({length:26},(_,i)=>({companyId:company.id,taskId,authorId:owner.id,authorName:owner.name,body:`Commentaire paginé ${i}`}))});
      await db.taskEvent.createMany({data:Array.from({length:26},(_,i)=>({companyId:company.id,taskId,actorId:owner.id,actorName:owner.name,action:"COMMENT",reason:`Événement ${i}`,snapshot:{secret:"private-event-payload"}}))});
      const detail=await read({taskId,commentPage:2,eventPage:2},employee);assert.equal(detail.commentCount,27);assert.equal(detail.comments.length,2);assert.equal(detail.events.length,detail.eventCount-25);assert.ok(!JSON.stringify(detail).includes("private-event-payload"));assert.ok(detail.events.every(e=>!("snapshot" in e)));
    });
    await t.test("list and each Kanban lane paginate server-side with exact counters and Paris dates",async()=>{
      await db.task.createMany({data:Array.from({length:27},(_,i)=>({companyId:company.id,title:`Recherche pagination ${i}`,priority:"NORMAL",status:"TODO",dueAt:new Date("2026-02-01T00:00:00Z")}))});
      const list=await read({q:"Recherche pagination",page:2});assert.equal(list.total,27);assert.equal(list.rows.length,2);
      const board=await read({view:"board",q:"Recherche pagination",page:2});assert.equal(board.board.find(c=>c.id==="TODO")?.total,27);assert.equal(board.board.find(c=>c.id==="TODO")?.rows.length,2);
      assert.equal((await read({taskId,from:"2026-02-01",to:"2026-02-01",assignee:"mine"},employee)).total,1);assert.equal((await read({from:"2026-01-31",to:"2026-01-31",assignee:"mine"},employee)).total,0);
      assert.equal((await read({status:columnId,priority:"HIGH",overdue:"true"})).total,1);
      const workspace=await getWorkspace(owner.id,company.id);assert.ok(workspace.current!.openTaskCount>=28);assert.ok(!JSON.stringify(workspace.current!.tasks).includes(content.description));
      assert.equal((await read({view:"staff",q:"assigné"})).staffCount,1);
    });
    await t.test("revisions serialize distinct concurrent commands, and former members cannot act",async()=>{
      const attempts=await Promise.allSettled([act({action:"task.status",taskId,revision:rev,status:"TODO"},employee),act({action:"task.status",taskId,revision:rev,status:"IN_PROGRESS"},employee)]);assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);
      await db.companyMember.update({where:{id:member.id},data:{status:"INACTIVE"}});await assert.rejects(read({},employee),/inaccessible/);await assert.rejects(act({action:"task.comment",taskId,revision:rev,body:"Refusé"},employee),/inaccessible/);
    });
  }finally{
    await db.task.deleteMany({where:{companyId:{in:companies}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const userId of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${userId}:`}}});await db.$disconnect();
  }
});
