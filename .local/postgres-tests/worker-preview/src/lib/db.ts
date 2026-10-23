import { PrismaClient } from "@prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";
import {databaseRuntime} from "@/lib/database-runtime";
import {databaseConfig} from "./database-config";
const globalForPrisma=globalThis as unknown as {rpilotPrisma?:PrismaClient};
const requests=new WeakMap<object,PrismaClient>();
function client(){
  const runtime=databaseRuntime();
  const existing=runtime.key?requests.get(runtime.key):globalForPrisma.rpilotPrisma;
  if(existing)return existing;
  const {schema,...config}=databaseConfig(runtime.env,runtime.worker);
  const result=new PrismaClient({adapter:new PrismaPg({...config,connectionTimeoutMillis:10000,idleTimeoutMillis:1000},{schema})});
  if(runtime.key){requests.set(runtime.key,result);runtime.onComplete?.(()=>result.$disconnect());}
  else globalForPrisma.rpilotPrisma=result;
  return result;
}
// Preserve existing imports and transaction boundaries. Resolve delegates lazily
// so each Worker request gets its own client/pool, never another request's sockets.
export const db=new Proxy({} as PrismaClient,{
  get(_target,key){const current=client();const value=Reflect.get(current,key);return typeof value==="function"?value.bind(current):value;},
});
