import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile,writeFile,mkdir } from "node:fs/promises";
import { db } from "../src/lib/db";
type Table={name:string;columns:string[];count:number;hash:string};
const file=process.argv.find(arg=>arg.startsWith("--snapshot="))?.slice("--snapshot=".length)??".local/pre-finance-data.json";
if(!/^\.local\/[a-zA-Z0-9_-]+\.json$/.test(file))throw new Error("Use a snapshot file directly inside .local.");
const quote=(v:string)=>`"${v.replaceAll('"','""')}"`;
async function digest(name:string,columns:string[]):Promise<Table>{
  const rows=await db.$queryRawUnsafe<{row:string}[]>(`SELECT row_to_json(t)::text AS row FROM (SELECT ${columns.map(quote).join(",")} FROM ${quote(name)}) t ORDER BY row_to_json(t)::text`);
  return {name,columns,count:rows.length,hash:createHash("sha256").update(rows.map(r=>r.row).join("\n")).digest("hex")};
}
async function main(){
  if(process.argv.includes("--before")){
    const schema=await db.$queryRaw<{table_name:string;column_name:string}[]>`SELECT table_name::text,column_name::text FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name,ordinal_position`;
    const tables:Table[]=[];
    for(const name of new Set(schema.map(s=>s.table_name)))tables.push(await digest(name,schema.filter(s=>s.table_name===name).map(s=>s.column_name)));
    await mkdir(".local",{recursive:true});await writeFile(file,JSON.stringify(tables,null,2));console.log(`Preservation snapshot: ${tables.length} tables, ${tables.reduce((s,t)=>s+t.count,0)} rows (hashes only).`);
  }else{
    const before=JSON.parse(await readFile(file,"utf8")) as Table[];
    for(const table of before){const after=await digest(table.name,table.columns);if(after.hash!==table.hash||after.count!==table.count)throw new Error(`Existing data changed in ${table.name}; inspect before proceeding.`);}
    console.log(`Preserved: all original columns and rows in ${before.length} tables unchanged.`);
  }
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Verification failed");process.exitCode=1;}).finally(()=>db.$disconnect());
