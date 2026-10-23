import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {recordDocFeedback} from "../src/domains/documentation/feedback";
test("PostgreSQL: documentation feedback is unique, editable, account-scoped and throttled",async()=>{
 const users:string[]=[],hashes:string[]=[];
 try{
  for(let i=0;i<2;i++){const u=await db.user.create({data:{name:"Docs fixture",email:`docs-${randomUUID()}@example.test`}});users.push(u.id);hashes.push(createHash("sha256").update(`rpilot-docs-v1:${u.id}`).digest("hex"));}
  await Promise.all([recordDocFeedback(users[0],{article:"stocks",helpful:true}),recordDocFeedback(users[0],{article:"stocks",helpful:true})]);
  assert.equal(await db.documentationFeedback.count({where:{voterHash:hashes[0]}}),1);
  await recordDocFeedback(users[0],{article:"stocks",helpful:false});assert.equal((await db.documentationFeedback.findFirstOrThrow({where:{voterHash:hashes[0]}})).helpful,false);
  await recordDocFeedback(users[1],{article:"stocks",helpful:true});assert.equal(await db.documentationFeedback.count({where:{article:"stocks",voterHash:{in:hashes}}}),2);
  await assert.rejects(recordDocFeedback(users[0],{article:"missing",helpful:true}),/introuvable/);
  await assert.rejects(recordDocFeedback(users[0],{article:"stocks",helpful:true,userId:users[1]}));
  await db.user.update({where:{id:users[1]},data:{accessStatus:"SUSPENDED"}});await assert.rejects(recordDocFeedback(users[1],{article:"paie",helpful:true}),/suspendu/);
  for(let i=3;i<10;i++)await recordDocFeedback(users[0],{article:"stocks",helpful:!!(i%2)});
  await assert.rejects(recordDocFeedback(users[0],{article:"paie",helpful:true}),/Trop de retours/);
  assert.equal(await db.rateLimit.count({where:{key:`docs-feedback:${hashes[0]}`}}),1);
  await db.rateLimit.update({where:{key:`docs-feedback:${hashes[0]}`},data:{lastRequest:BigInt(Date.now()-61000)}});
  await recordDocFeedback(users[0],{article:"paie",helpful:true});assert.equal((await db.rateLimit.findUniqueOrThrow({where:{key:`docs-feedback:${hashes[0]}`}})).count,1);
 }finally{await db.documentationFeedback.deleteMany({where:{voterHash:{in:hashes}}});await db.rateLimit.deleteMany({where:{key:{in:hashes.map(h=>`docs-feedback:${h}`)}}});await db.user.deleteMany({where:{id:{in:users}}});}
});
