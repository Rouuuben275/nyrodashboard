import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
const root=process.cwd(),pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
assert.equal(pkg.engines.node,"24.x");assert.ok(!pkg.dependencies.vinext&&!pkg.dependencies["@vinext/cloudflare"]);
assert.ok(!fs.existsSync("vercel.json"),"Review any new Vercel configuration explicitly.");
assert.match(fs.readFileSync("prisma/schema.prisma","utf8"),/engineType\s*=\s*"client"/);
const routes=["api/auth/[...all]/route.js","api/documents/file/route.js","api/documents/upload/route.js","api/finance/export/route.js","api/payroll/pdf/route.js","api/sales/ticket/route.js","app/page.js"];
for(const route of routes){
 const file=path.join(root,".next/server/app",route+".nft.json"),traced=JSON.parse(fs.readFileSync(file,"utf8")).files.map(p=>path.resolve(path.dirname(file),p));
 assert.ok(traced.some(p=>p.replaceAll("\\","/").endsWith("/.prisma/client/query_compiler_bg.wasm")),`${route}: missing Prisma WASM compiler`);
 // pg includes its optional pg-cloudflare transport in tracing; the standard
 // Node driver does not select it. Reject the old application adapters instead.
 assert.ok(traced.every(p=>!/[\\/]\.env(?:\.|$)|[\\/](?:@cloudflare|@vinext|vinext)[\\/]|database-runtime\.cloudflare|query_engine-|libquery_engine/i.test(p)),`${route}: unexpected runtime file`);
 for(const p of traced)assert.ok(fs.existsSync(p),`${route}: missing traced asset`);
 if(/finance\/export|payroll\/pdf|sales\/ticket/.test(route))assert.ok(traced.some(p=>p.endsWith("report-font.ttf")),`${route}: missing PDF font`);
}
const env=fs.existsSync(".env")?dotenv.parse(fs.readFileSync(".env")):{};
const secrets=["DATABASE_URL","BETTER_AUTH_SECRET","DISCORD_CLIENT_SECRET","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET"];
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(".next/static").filter(p=>p.endsWith(".js"))){const code=fs.readFileSync(file,"utf8");for(const key of secrets)if(env[key]?.length>=12)assert.ok(!code.includes(env[key]),`Client bundle contains configured ${key}; value withheld`);}
console.log("Next.js Node artifact verified: Prisma WASM and PDF fonts traced, no Worker runtime or native engine, no local secrets in browser bundles.");
