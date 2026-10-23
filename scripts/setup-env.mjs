import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  writeFileSync(".env", [
    'DATABASE_URL="postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable&connection_limit=1&pgbouncer=true&statement_cache_size=0"',
    'BETTER_AUTH_URL="http://localhost:3000"',
    `BETTER_AUTH_SECRET="${randomBytes(32).toString("hex")}"`,
    "",
  ].join("\n"));
  console.log("Created .env with a random session secret. Check the local database port before migrating.");
} else console.log("Existing .env retained.");
