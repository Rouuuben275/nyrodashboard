import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {db} from "../src/lib/db";
import {readTheme,saveTheme} from "../src/domains/profile/theme";
import {isTheme,resolveTheme,themeBootstrap,watchSystemTheme,type ThemePreference} from "../src/lib/theme";
import manifest from "../src/app/manifest";
import {publicOrigin} from "../src/lib/public-metadata";

test("theme: first paint, explicit priority, system fallback and unavailable storage",()=>{
 for(const pref of [null,"garbage","dark","light","system"]){for(const dark of [true,false]){
  const root={dataset:{} as Record<string,string>,style:{} as Record<string,string>};runInNewContext(themeBootstrap,{localStorage:{getItem:()=>pref},matchMedia:()=>({matches:dark}),document:{documentElement:root}});
  const valid=isTheme(pref)?pref:"system";assert.equal(root.dataset.theme,resolveTheme(valid,dark));assert.equal(root.dataset.themePreference,valid);assert.equal(root.style.colorScheme,root.dataset.theme);
 }}
 const root={dataset:{} as Record<string,string>,style:{}};runInNewContext(themeBootstrap,{localStorage:{getItem:()=>{throw Error("blocked")}},document:{documentElement:root}});assert.equal(root.dataset.theme,"light");
});
test("theme: live system change subscription respects explicit choice and cleans up",()=>{
 let listener:(()=>void)|undefined,removed=false,changes=0,preference:ThemePreference="system";
 const media={addEventListener:(_type:string,fn:()=>void)=>{listener=fn;},removeEventListener:(_type:string,fn:()=>void)=>{removed=fn===listener;}};
 const stop=watchSystemTheme(()=>preference,()=>changes++,media as unknown as MediaQueryList);
 listener!();assert.equal(changes,1);preference="light";listener!();assert.equal(changes,1);preference="dark";listener!();assert.equal(changes,1);preference="system";listener!();assert.equal(changes,2);stop();assert.equal(removed,true);
});
test("branding: manifest, supplied images and canonical OAuth origin preserved",()=>{
 const m=manifest();assert.equal(m.name,"Nyro Dashboard");assert.equal(m.short_name,"Nyro");assert.equal(m.icons?.length,2);assert.equal(publicOrigin,new URL(process.env.SITE_URL||"https://nyrodashboard.vercel.app").origin);
 for(const i of m.icons??[])assert.deepEqual([...readFileSync(`public${i.src}`).subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const css=readFileSync("src/app/theme.css","utf8");assert.match(css,/:root\[data-theme="light"\]/);assert.match(css,/--primary-foreground/);assert.doesNotMatch(css,/body[^}]*filter:\s*invert/);
});
test("PostgreSQL: per-account theme persists, initialization cannot overwrite an existing choice",async()=>{
 const users:string[]=[];try{
  const a=await db.user.create({data:{name:"Theme fixture",email:`theme-${randomUUID()}@example.test`}}),b=await db.user.create({data:{name:"Other theme",email:`theme-${randomUUID()}@example.test`}});users.push(a.id,b.id);
  assert.equal((await readTheme(a.id)).themePreference,null);
  await Promise.all([saveTheme(a.id,{theme:"light",initialize:true}),saveTheme(a.id,{theme:"dark",initialize:true})]);
  const initialized=(await readTheme(a.id)).themePreference;assert.ok(initialized==="dark"||initialized==="light");
  await saveTheme(a.id,{theme:"system"});await saveTheme(a.id,{theme:"dark",initialize:true});assert.equal((await readTheme(a.id)).themePreference,"system");assert.equal((await readTheme(b.id)).themePreference,null);
  for(const raw of [{theme:"wrong"},{theme:"dark",userId:b.id},{theme:"dark",admin:true}])await assert.rejects(saveTheme(a.id,raw));
  await db.user.update({where:{id:a.id},data:{accessStatus:"SUSPENDED"}});await assert.rejects(readTheme(a.id));await assert.rejects(saveTheme(a.id,{theme:"light"}));
 }finally{await db.user.deleteMany({where:{id:{in:users}}});await db.rateLimit.deleteMany({where:{key:{in:users.map(id=>`theme:${id}`)}}});}
});
