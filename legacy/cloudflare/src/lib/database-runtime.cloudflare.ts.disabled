import {env} from "cloudflare:workers";
import {getRequestExecutionContext} from "vinext/shims/request-context";
import {after} from "next/server";
import type {DatabaseRuntime,RuntimeEnvironment} from "./database-runtime";
export function databaseRuntime():DatabaseRuntime{
  const context=getRequestExecutionContext();
  if(!context)throw new Error("Accès PostgreSQL hors du contexte d’une requête Worker.");
  return {key:context,env:env as RuntimeEnvironment,worker:true,onComplete:cleanup=>after(cleanup)};
}
