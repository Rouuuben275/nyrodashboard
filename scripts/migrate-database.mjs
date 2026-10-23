import "dotenv/config";
import {spawnSync} from "node:child_process";
import {Pool} from "pg";
import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
const command=process.argv[2],production=process.argv.includes("--production");
if(!["status","deploy"].includes(command))throw new Error("Utiliser status ou deploy uniquement.");
const runtime=process.env.DATABASE_URL,direct=process.env.DIRECT_URL;
if(!runtime)throw new Error("DATABASE_URL manquante. Aucune valeur ne doit etre collee dans le chat.");
let pooled,target;try{pooled=new URL(runtime);target=new URL(direct||runtime);}catch{throw new Error("URL PostgreSQL invalide, valeur non affichee.");}
const local=["localhost","127.0.0.1"].includes(target.hostname);
if(production||!local){
 if(!direct)throw new Error("DIRECT_URL requise hors du PostgreSQL local ; reprendre la connexion directe de la meme base Neon.");
 if(pooled.hostname.replace(/-pooler(?=\.)/,"")!==target.hostname||pooled.pathname!==target.pathname)throw new Error("Les connexions directe et poolee ne designent pas la meme base. Aucune migration executee.");
 if(target.hostname.includes("-pooler.")||!["require","verify-ca","verify-full"].includes(target.searchParams.get("sslmode")))throw new Error("DIRECT_URL doit etre directe et proteger la connexion avec TLS.");
 if(command==="deploy"&&!production)throw new Error("Ajouter --production explicitement apres verification de l’etat et sauvegarde de la base existante.");
}
console.log(`Prisma migrate ${command} : connexion ${local?"locale":"directe configuree"}, aucune reinitialisation ni seed.`);
if(command==="deploy"){
 const pool=new Pool({connectionString:direct||runtime,max:1,connectionTimeoutMillis:10000});
 try{
  const history=await pool.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
  const migrations=new Set(await readdir("prisma/migrations"));
  for(const row of history.rows){
   if(row.rolled_back_at)continue;
   if(!row.finished_at)throw new Error("Migration historique incomplete : intervention requise, aucune application automatique.");
   if(!migrations.has(row.migration_name))throw new Error("L’historique de la base contient une migration absente du depot.");
   const checksum=createHash("sha256").update(await readFile(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex");
   if(checksum!==row.checksum)throw new Error("Une migration deja appliquee a ete modifiee. Aucune application executee.");
  }
  console.log(`${history.rowCount} lignes d’historique lues ; empreintes des migrations appliquees verifiees.`);
 }finally{await pool.end();}
}
const run=cmd=>spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate",cmd],{env:{...process.env,DATABASE_URL:direct||runtime},stdio:"inherit",windowsHide:true});
// Status lists the applied/pending migrations before every deployment attempt.
const status=run("status");if(command==="status"){process.exitCode=status.status??1;}else if(status.error){throw new Error("Lecture de l’etat des migrations impossible.");}else{const result=run("deploy");process.exitCode=result.status??1;}
