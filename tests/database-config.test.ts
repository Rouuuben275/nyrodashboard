import test from "node:test";
import assert from "node:assert/strict";
import {databaseConfig} from "../src/lib/database-config";
test("Node PostgreSQL: TLS, schema and bounded shared connection pool",()=>{
 const config=databaseConfig({DATABASE_URL:"postgresql://user:password@db.example.test:5432/rpilot?sslmode=verify-full&schema=rp&connection_limit=8"});
 assert.equal(config.schema,"rp");assert.equal(config.max,8);const url=new URL(config.connectionString);assert.equal(url.searchParams.get("sslmode"),"verify-full");assert.equal(url.searchParams.has("schema"),false);
 for(const [limit,max] of [["999",10],["0",5],["-1",5],["0.5",5],["Infinity",5],["bad",5]] as const)assert.equal(databaseConfig({DATABASE_URL:`postgresql://u:p@db.example.test/rp?connection_limit=${limit}`}).max,max);
 assert.throws(()=>databaseConfig({}),/DATABASE_URL/);assert.throws(()=>databaseConfig({DATABASE_URL:"prisma+postgres://example.test/?api_key=not-a-real-key"}),/connexion PostgreSQL directe/);
});
