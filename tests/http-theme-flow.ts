import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
test("HTTP: Nyro branding and theme preferences survive a new session without changing account permissions",async()=>{
 const origin=process.env.BETTER_AUTH_URL!,users:string[]=[];
 const cookie=async(userId:string)=>{const token=randomBytes(32).toString("hex"),id=randomUUID();await db.session.create({data:{id,token,userId,expiresAt:new Date(Date.now()+600000)}});const config=getCookies(auth.options).sessionToken;return {id,value:(await serializeSignedCookie(config.name,token,process.env.BETTER_AUTH_SECRET!,config.attributes)).split(";")[0]};};
 try{
  const u=await db.user.create({data:{name:"Theme HTTP",email:`theme-http-${randomUUID()}@example.test`}});users.push(u.id);const first=await cookie(u.id),headers={Cookie:first.value,Origin:origin,"Content-Type":"application/json"};
  const path=`${origin}/api/profile/theme`,save=(body:unknown,h=headers)=>fetch(path,{method:"PATCH",headers:h,body:JSON.stringify(body)});
  assert.equal((await fetch(path)).status,401);assert.equal((await save({theme:"light"},{...headers,Cookie:""})).status,401);assert.equal((await save({theme:"dark"},{...headers,Origin:"https://foreign.test"})).status,403);
  assert.equal((await save({theme:"unexpected"})).status,400);assert.equal((await save({theme:"light",userId:"foreign"})).status,400);assert.equal((await save({theme:"light",padding:"x".repeat(1100)})).status,413);
  const r=await save({theme:"light"});assert.equal(r.status,200,await r.clone().text());assert.match(r.headers.get("cache-control")??"",/no-store/);assert.equal((await r.json()).themePreference,"light");
  await save({theme:"dark",initialize:true});assert.equal((await db.user.findUniqueOrThrow({where:{id:u.id}})).themePreference,"light");
  await db.session.delete({where:{id:first.id}});const second=await cookie(u.id);const read=await fetch(path,{headers:{Cookie:second.value}});assert.equal(read.status,200);assert.deepEqual(await read.json(),{themePreference:"light"});
  const manifest=await fetch(`${origin}/manifest.webmanifest`).then(r=>r.json());assert.equal(manifest.name,"Nyro Dashboard");assert.equal(manifest.short_name,"Nyro");for(const icon of manifest.icons){const response=await fetch(`${origin}${icon.src}`);assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"image/png");}
  const home=await fetch(origin).then(r=>r.text());assert.match(home,/<title>[^<]*Nyro Dashboard/);assert.match(home,/\/branding\/nyro-logo.png/);assert.ok(!home.includes('/brand/rpilot-logo.png'));
  assert.equal(await db.companyMember.count({where:{userId:u.id}}),0);assert.equal(await db.serverMember.count({where:{userId:u.id}}),0);
 }finally{await db.user.deleteMany({where:{id:{in:users}}});await db.rateLimit.deleteMany({where:{key:{in:users.map(id=>`theme:${id}`)}}});}
});
