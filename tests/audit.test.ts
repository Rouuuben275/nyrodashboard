import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {execute} from "../src/domains/core/service";
import {getWorkspace} from "../src/domains/core/queries";
import {auditQuery,readAudit,auditCsv,safeAuditDetails} from "../src/domains/audit/queries";

test("PostgreSQL: audit pagination, filters, private details, exports and tenant permissions",async t=>{
 const tag=`audit-${randomUUID()}`,users:string[]=[],companies:string[]=[];
 const person=async(name:string)=>{const u=await db.user.create({data:{name,email:`${tag}-${name}@example.test`}});users.push(u.id);return u;};
 try{
  const owner=await person("Owner"),outsider=await person("Outsider"),viewer=await person("Viewer");
  const company=await execute(owner,undefined,{action:"company.create",name:tag,sector:"Services"}) as {id:string};companies.push(company.id);
  const role=await db.companyRole.create({data:{companyId:company.id,name:"Audit only",permissions:["audit.read"]}});await db.companyMember.create({data:{companyId:company.id,userId:viewer.id,roleId:role.id,characterName:"Auditeur RP"}});
  const q=(rest:Record<string,unknown>={})=>auditQuery.parse({companyId:company.id,...rest});
  await db.auditLog.createMany({data:Array.from({length:31},(_,i)=>({companyId:company.id,actorId:i%2?owner.id:viewer.id,actorName:i%2?"Owner":"Viewer",action:i%2?"Stock ajusté":"Grade modifié",entityId:`target-${i}`,createdAt:new Date(`2026-10-21T12:${String(i).padStart(2,"0")}:00Z`),details:{before:{name:"Ancien nom",stock:3,price:100,privateNotes:"PRIVATE HR NOTE",accessToken:"PRIVATE TOKEN"},after:{name:"Nouveau nom",stock:4,price:150},reason:"PRIVATE REASON",email:"private@example.test"}}))});
  await t.test("stable pages, combined text/actor/action/date filtering and Paris day boundaries",async()=>{
   const first=await readAudit(owner.id,q({q:"target-"})),second=await readAudit(owner.id,q({q:"target-",page:2}));assert.equal(first.total,31);assert.equal(first.rows.length,25);assert.equal(second.rows.length,6);assert.ok(!first.rows.some(a=>second.rows.some(b=>a.id===b.id)));
   assert.equal((await readAudit(owner.id,q({actor:"Owner",action:"Stock",from:"2026-10-21",to:"2026-10-21"}))).total,15);
   assert.equal((await readAudit(owner.id,q({q:"missing"}))).total,0);assert.equal((await readAudit(owner.id,q({from:"2026-10-22"}))).rows.some(r=>r.entityId?.startsWith("target-")),false);
   assert.throws(()=>q({from:"2026-02-30"}));assert.throws(()=>q({from:"2026-10-22",to:"2026-10-21"}));
  });
  await t.test("foreign, inactive and disabled reads and exports are refused",async()=>{
   await assert.rejects(readAudit(outsider.id,q()),/inaccessible/);await assert.rejects(readAudit(outsider.id,q(),true),/inaccessible/);
   await db.companyModule.update({where:{companyId_key:{companyId:company.id,key:"audit"}},data:{enabled:false}});await assert.rejects(readAudit(owner.id,q()),/désactivé/);await db.companyModule.update({where:{companyId_key:{companyId:company.id,key:"audit"}},data:{enabled:true}});
   await db.companyMember.update({where:{companyId_userId:{companyId:company.id,userId:viewer.id}},data:{status:"INACTIVE"}});await assert.rejects(readAudit(viewer.id,q()),/inaccessible/);await db.companyMember.update({where:{companyId_userId:{companyId:company.id,userId:viewer.id}},data:{status:"ACTIVE"}});
  });
  await t.test("safe differences preserve recorded fields without leaking private details or financial data",async()=>{
   const data=await readAudit(viewer.id,q({q:"target-"})),text=JSON.stringify(data);assert.doesNotMatch(text,/PRIVATE|private@example|stock|price/);assert.equal(data.rows[0].details.before.name,"Ancien nom");
   const manager=await readAudit(owner.id,q({q:"target-"}));assert.equal(manager.rows[0].details.before.stock,3);assert.equal(manager.rows[0].details.after.price,150);assert.doesNotMatch(JSON.stringify(manager),/PRIVATE/);
   await db.companyModule.update({where:{companyId_key:{companyId:company.id,key:"inventory"}},data:{enabled:false}});assert.ok(!("stock" in (await readAudit(owner.id,q({q:"target-"}))).rows[0].details.before));await db.companyModule.update({where:{companyId_key:{companyId:company.id,key:"inventory"}},data:{enabled:true}});
   const workspace=await getWorkspace(owner.id,company.id);assert.ok(workspace.current);assert.ok(!("details" in workspace.current.audit[0]));
   assert.deepEqual(safeAuditDetails(["PRIVATE"],[]),{before:{},after:{},context:{}});
  });
  await t.test("exports above 5000 rows require filters instead of silently truncating",async()=>{
   await db.auditLog.createMany({data:Array.from({length:5001},()=>({companyId:company.id,actorId:owner.id,actorName:"Owner",action:"Bulk export fixture",details:{}}))});
   await assert.rejects(readAudit(owner.id,q({action:"Bulk export fixture"}),true),/5 000/);
   const page=await readAudit(owner.id,q({action:"Bulk export fixture"}));assert.equal(page.total,5001);assert.equal(page.rows.length,25);
  });
  await t.test("filtered server CSV covers all matching pages and escapes spreadsheet formulas",async()=>{
   const data=await readAudit(owner.id,q({q:"target-"}),true);assert.equal(data.rows.length,31);assert.equal(auditCsv(data).split("\r\n").length,32);
   const event=await db.auditLog.create({data:{companyId:company.id,actorId:owner.id,actorName:"=HYPERLINK(1)",action:"+formula",details:{}}});
   const csv=auditCsv(await readAudit(owner.id,q({q:event.id}),true));assert.match(csv,/'=HYPERLINK/);assert.match(csv,/'\+formula/);assert.doesNotMatch(auditCsv(data),/PRIVATE/);
  });
 }finally{await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});}
});
