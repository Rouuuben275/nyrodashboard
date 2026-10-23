import { PrismaClient } from "@prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";
import {Pool} from "pg";
import {attachDatabasePool} from "@vercel/functions";
import {databaseRuntime} from "@/lib/database-runtime";
import {databaseConfig} from "./database-config";
const globalForPrisma=globalThis as unknown as {rpilotPrisma?:PrismaClient};
function client(){
  const runtime=databaseRuntime();
  const existing=globalForPrisma.rpilotPrisma;
  if(existing)return existing;
  const {schema,...config}=databaseConfig(runtime.env);
  const pool=new Pool({...config,connectionTimeoutMillis:10000,idleTimeoutMillis:5000,allowExitOnIdle:true});
  if(runtime.env.VERCEL==="1")attachDatabasePool(pool);
  const result=new PrismaClient({adapter:new PrismaPg(pool,{schema,disposeExternalPool:true})});
  globalForPrisma.rpilotPrisma=result;
  return result;
}
// One lazy client/pool per warm Node.js instance. No connection during import/build,
// no disconnect at the end of a request, and no sessions or permissions cached here.
export const db=new Proxy({} as PrismaClient,{
  get(_target,key){if(key==="$disconnect")return async()=>{const current=globalForPrisma.rpilotPrisma;globalForPrisma.rpilotPrisma=undefined;await current?.$disconnect();};const current=client();const value=Reflect.get(current,key);return typeof value==="function"?value.bind(current):value;},
});
