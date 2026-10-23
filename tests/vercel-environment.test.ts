import test from "node:test";
import assert from "node:assert/strict";
import {checkVercelEnvironment} from "../scripts/check-vercel-env.mjs";
test("Vercel build preflight rejects missing secrets, bad URLs, owner substitution and live payments",()=>{
 const env={VERCEL:"1",VERCEL_ENV:"production",DATABASE_URL:"postgresql://u:p@ep-example-pooler.eu.neon.tech/db?sslmode=require",BETTER_AUTH_URL:"https://nyrodashboard.vercel.app",BETTER_AUTH_SECRET:"isolated-test-only-secret-32-characters",DISCORD_CLIENT_ID:"123456789012345678",DISCORD_CLIENT_SECRET:"isolated-test-only-discord-secret",RPILOT_OWNER_DISCORD_ID:"123456789012345678",RPILOT_SLOT_PAYMENTS_MODE:"disabled"};
 assert.deepEqual(checkVercelEnvironment(env),[]);for(const [key,value] of [["BETTER_AUTH_SECRET",""],["DATABASE_URL","not-a-database"],["BETTER_AUTH_URL","http://localhost:3000"],["RPILOT_OWNER_DISCORD_ID","browser-owner"],["RPILOT_SLOT_PAYMENTS_MODE","live"]])assert.ok(checkVercelEnvironment({...env,[key]:value}).length);
 assert.ok(checkVercelEnvironment({...env,DISCORD_CLIENT_SECRET:"CHANGE_ME"}).some(v=>v.includes("DISCORD_CLIENT_SECRET")));
});
