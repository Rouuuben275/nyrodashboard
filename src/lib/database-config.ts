import type {RuntimeEnvironment} from "./database-runtime";
export function databaseConfig(env:RuntimeEnvironment){
  const connectionString=env.DATABASE_URL;
  if(!connectionString)throw new Error("DATABASE_URL doit être configurée dans l’environnement du serveur.");
  let url:URL;try{url=new URL(connectionString);}catch{throw new Error("DATABASE_URL doit être une URL PostgreSQL valide.");}
  if(!["postgres:","postgresql:"].includes(url.protocol))throw new Error("Le pilote pg requiert une connexion PostgreSQL directe (postgresql://), pas une URL Prisma Accelerate.");
  const configured=Number(url.searchParams.get("connection_limit")||0);
  const max=Number.isFinite(configured)&&configured>=1?Math.min(Math.floor(configured),10):5;
  const schema=url.searchParams.get("schema")||"public";
  // Prisma pool settings are not pg connection parameters. TLS settings remain
  // in the URL and are enforced by pg; certificate checks are never disabled here.
  for(const name of ["connection_limit","pool_timeout","schema"])url.searchParams.delete(name);
  return {connectionString:url.toString(),max,schema};
}
