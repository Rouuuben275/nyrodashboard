import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
import {logoPng,pngChunk} from "./logo-fixture";

test("HTTP: real logo uploads persist, render and enforce origin, size and tenant permissions",async()=>{
 const origin=process.env.BETTER_AUTH_URL!,tag=`http-logo-${randomUUID()}`,users:string[]=[],companies:string[]=[],servers:string[]=[],keys:string[]=[];
 const person=async(name:string,discordId:string)=>{const u=await db.user.create({data:{name,email:`${tag}-${name}@example.test`}});users.push(u.id);await db.account.create({data:{id:randomUUID(),userId:u.id,providerId:"discord",accountId:discordId}});const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),token,userId:u.id,expiresAt:new Date(Date.now()+600000)}});const cookie=getCookies(auth.options).sessionToken;return {u,headers:{Cookie:(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0],Origin:origin}};};
 const post=(path:string,headers:Record<string,string>,body:unknown)=>fetch(`${origin}${path}`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)});
 const upload=(headers:Record<string,string>,body=logoPng(),query="purpose=company")=>fetch(`${origin}/api/logos?${query}`,{method:"POST",headers:{...headers,"Content-Type":"image/png"},body:new Uint8Array(body)});
 try{
  const a=await person("Director","891000000000000001"),b=await person("Other","891000000000000002"),owner=await person("Owner",process.env.RPILOT_OWNER_DISCORD_ID!);
  assert.equal((await upload({Origin:origin})).status,401);assert.equal((await upload({...a.headers,Origin:"https://foreign.test"})).status,403);
  assert.equal((await fetch(`${origin}/api/logos?purpose=company`,{method:"POST",headers:{...a.headers,"Content-Type":"image/svg+xml"},body:"<svg/>"})).status,415);
  assert.equal((await upload(a.headers,Buffer.alloc(262145))).status,413);assert.equal((await upload(a.headers,Buffer.from("bad"))).status,415);
  assert.equal((await upload(a.headers,logoPng(),"purpose=server")).status,403);
  const uploaded=await upload(a.headers,logoPng({extra:[pngChunk("tEXt",Buffer.from("private\0do not retain"))]}));assert.equal(uploaded.status,201,await uploaded.clone().text());const image=await uploaded.json();assert.ok(image.url);assert.equal(image.data,undefined);
  const get=(headers:Record<string,string>)=>fetch(`${origin}${image.url}`,{headers});
  assert.equal((await get({})).status,401);assert.equal((await get(b.headers)).status,404);
  const draft=await get(a.headers);assert.equal(draft.status,200);assert.match(draft.headers.get("cache-control")??"",/no-store/);assert.equal(draft.headers.get("x-content-type-options"),"nosniff");assert.deepEqual(Buffer.from(await draft.arrayBuffer()),logoPng());
  const created=await post("/api/workspace",a.headers,{action:"company.create",name:tag,sector:"Services",logoAssetId:image.id});assert.equal(created.status,200,await created.clone().text());const c=(await created.json()).data;companies.push(c.id);
  assert.equal((await db.company.findUniqueOrThrow({where:{id:c.id}})).logoAssetId,image.id);
  assert.equal((await fetch(`${origin}${image.url}`,{method:"DELETE",headers:a.headers})).status,409);
  const spaces=await fetch(`${origin}/espaces`,{headers:a.headers});assert.equal(spaces.status,200);const html=await spaces.text();assert.match(html,/Votre prochain chapitre/);assert.ok(html.includes(image.url));assert.ok(html.includes(c.id));assert.ok(!html.includes("do not retain"));
  const deep=await fetch(`${origin}/app?space=independent&create=company`,{headers:b.headers});assert.equal(deep.status,200);await deep.text();
  const serverUpload=await upload(owner.headers,logoPng(),"purpose=server");assert.equal(serverUpload.status,201);const serverLogo=await serverUpload.json(),requestKey=randomUUID();keys.push(requestKey);
  const s=await post("/api/admin",owner.headers,{action:"server.create",name:tag,slug:tag,maxCompanies:10,maxUsers:10,logoAssetId:serverLogo.id,visibility:"PUBLIC",accessMode:"OPEN",reason:"HTTP logo fixture",requestKey});assert.equal(s.status,200,await s.clone().text());servers.push((await s.json()).data.id);
  assert.equal((await fetch(`${origin}${serverLogo.url}`,{headers:b.headers})).status,200);
  const directory=await fetch(`${origin}/api/servers/access?view=directory`,{headers:b.headers}).then(r=>r.json());assert.equal(directory.directory.find((x:{id:string})=>x.id===servers[0]).logoAssetId,serverLogo.id);
  const temp=await upload(b.headers);assert.equal(temp.status,201);const tempImage=await temp.json();assert.equal((await fetch(`${origin}${tempImage.url}`,{method:"DELETE",headers:{...b.headers,Origin:"https://foreign.test"}})).status,403);assert.equal((await fetch(`${origin}${tempImage.url}`,{method:"DELETE",headers:b.headers})).status,200);assert.equal((await fetch(`${origin}${tempImage.url}`,{headers:b.headers})).status,404);
 }finally{
  await db.platformCommand.deleteMany({where:{requestKey:{in:keys}}});await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.company.deleteMany({where:{id:{in:companies}}});await db.rPServer.deleteMany({where:{id:{in:servers}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:`logo-upload:${id}`},{key:{startsWith:`app:${id}:`}},{key:{startsWith:`admin:${id}:`}}]}});
 }
});
