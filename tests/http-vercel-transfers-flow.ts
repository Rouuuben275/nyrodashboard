import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import {execute} from "../src/domains/core/service";
test("HTTP Node.js: 5 MiB private upload crosses only 1 MiB requests and downloads as an authenticated stream",async()=>{
 const origin=process.env.BETTER_AUTH_URL!,users:string[]=[],companies:string[]=[];
 try{
  const owner=await db.user.create({data:{name:"Transfert HTTP",email:`large-http-${randomUUID()}@example.test`}});users.push(owner.id);
  const company=await execute(owner,undefined,{action:"company.create",name:`Transfert HTTP ${randomUUID()}`,sector:"Services"}) as {id:string};companies.push(company.id);
  await db.companyModule.updateMany({where:{companyId:company.id,key:"documents"},data:{enabled:true}});
  const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:owner.id,token,expiresAt:new Date(Date.now()+600000)}});const c=getCookies(auth.options).sessionToken,cookie=(await serializeSignedCookie(c.name,token,process.env.BETTER_AUTH_SECRET!,c.attributes)).split(";")[0],headers={Origin:origin,Cookie:cookie};
  const command=async(body:unknown,h:Record<string,string>=headers)=>{const r=await fetch(`${origin}/api/documents/upload`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const bytes=Buffer.alloc(5*1024*1024,120),payload={action:"start",kind:"LIBRARY",metadata:{companyId:company.id,requestKey:randomUUID(),name:"Preuve complète 5 Mo",audience:"MANAGERS",fileName:"preuve.txt",note:"Dépôt privé compatible Vercel"},size:bytes.length,digest:createHash("sha256").update(bytes).digest("hex"),mimeType:"text/plain"};
  assert.equal((await command(payload,{Origin:origin})).status,401);assert.equal((await command(payload,{...headers,Origin:"https://foreign.test"})).status,403);
  const start=await command(payload);assert.equal(start.status,200,JSON.stringify(start.data));const id=start.data.id;
  assert.equal((await command({action:"finish",id})).status,409);
  const put=(index:number,body:Buffer,h:Record<string,string>=headers)=>fetch(`${origin}/api/documents/upload?${new URLSearchParams({id,index:String(index)})}`,{method:"PUT",headers:{...h,"Content-Type":"application/octet-stream"},body:new Uint8Array(body)});
  const oversized=await put(0,Buffer.alloc(1024*1024+1));assert.equal(oversized.status,413);await oversized.arrayBuffer();
  for(let index=0;index<5;index++){const part=bytes.subarray(index*1024*1024,(index+1)*1024*1024),r=await put(index,part);assert.equal(r.status,200,await r.clone().text());await r.arrayBuffer();}
  const [a,b]=await Promise.all([command({action:"finish",id}),command({action:"finish",id})]);assert.equal(a.status,200,JSON.stringify(a.data));assert.equal(b.status,200,JSON.stringify(b.data));assert.equal(a.data.result.id,b.data.result.id);
  const path=`${origin}/api/documents/file?companyId=${company.id}&documentId=${a.data.result.id}`;
  const anonymous=await fetch(path);assert.equal(anonymous.status,401);await anonymous.arrayBuffer();
  const download=await fetch(path,{headers});assert.equal(download.status,200);assert.equal(download.headers.has("content-length"),false);assert.match(download.headers.get("cache-control")??"",/no-store/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  assert.equal(await db.documentVersion.count({where:{companyId:company.id}}),1);assert.equal((await db.uploadTransfer.findUniqueOrThrow({where:{id}})).data.length,0);
 }finally{await db.company.deleteMany({where:{id:{in:companies}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`documents:${id}:`}},{key:{startsWith:`app:${id}:`}}]}});}
});
