import "dotenv/config";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const uiScript=[["--ui-attachments","scripts/ui-attachments.ts"],["--ui-useful","scripts/ui-useful.ts"],["--ui-messages","scripts/ui-messages.ts"],["--ui-cash","scripts/ui-cash.ts"],['--ui-user-modules','scripts/ui-user-modules.ts'],['--ui-theme','scripts/ui-theme.ts'],['--ui-logos','scripts/ui-logos.ts'],['--ui-slots','scripts/ui-slots.ts'],['--ui-docs','scripts/ui-docs.ts'],['--ui','scripts/ui-payroll.ts']].find(([flag])=>process.argv.includes(flag))?.[1];
if(process.argv.includes("--worker"))throw new Error("Banc Cloudflare archive. Utiliser npm run test:postgres:http pour Next.js Node.js.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = path.join(root, ".local", "postgres-tests");
const data = path.join(local, "data");
const bin = process.env.PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
const executable = name => bin ? path.join(bin, name + (process.platform === "win32" ? ".exe" : "")) : name;
const run = (file, args, env = process.env) => execFileSync(file, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
const freePort = () => new Promise((resolve, reject) => { const socket = net.createServer(); socket.on("error", reject); socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolve(port)); }); });
let started = false, preview;let previewOutput="",previewOrigin="";
try {
  // This directory is exclusive to test fixtures. Never use DATABASE_URL here.
  fs.mkdirSync(local, { recursive: true });
  const credentials = path.join(local, "credentials.json");
  let password;
  if (fs.existsSync(path.join(data, "PG_VERSION"))) {
    if (!fs.existsSync(credentials)) throw new Error("Test cluster credentials missing; preserve the cluster and inspect it manually.");
    password = JSON.parse(fs.readFileSync(credentials, "utf8")).password;
  } else {
    password = randomBytes(32).toString("base64url");
    const passwordFile = path.join(local, "init-password");
    fs.writeFileSync(passwordFile, password, { mode: 0o600 });
    try { run(executable("initdb"), ["-D", data, "-U", "rpilot_test", "--encoding=UTF8", "--locale=C", "--auth=scram-sha-256", `--pwfile=${passwordFile}`]); }
    finally { fs.rmSync(passwordFile, { force: true }); }
    fs.writeFileSync(credentials, JSON.stringify({ password }), { mode: 0o600 });
  }
  const port = await freePort();
  run(executable("pg_ctl"), ["-D", data, "-l", path.join(local, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1 -c max_connections=30`, "-w", "start"]);
  started = true;
  const env = { ...process.env, DATABASE_URL: `postgresql://rpilot_test:${password}@127.0.0.1:${port}/postgres?connection_limit=5` };
  run(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], env);
  if (process.argv.includes("--http")||uiScript) {
    const httpPort = await freePort();
    const previewHost=["scripts/ui-attachments.ts","scripts/ui-messages.ts","scripts/ui-useful.ts"].includes(uiScript)?"127.0.0.1":"localhost";
    env.BETTER_AUTH_URL = `http://${previewHost}:${httpPort}`;
    previewOrigin=env.BETTER_AUTH_URL;
    env.RPILOT_PRODUCTION_TEST = "true";
    env.BETTER_AUTH_SECRET=randomBytes(32).toString("base64url");
    env.DISCORD_CLIENT_ID="123456789012345678";env.DISCORD_CLIENT_SECRET="test-only-discord-secret-not-a-real-provider-key";
    env.RPILOT_OWNER_DISCORD_ID="700000000000000001";
    env.RPILOT_SLOT_PAYMENTS_MODE="disabled";
    // Signature verification uses generated fixtures only; never a Checkout call.
    if(!uiScript){env.RPILOT_SLOT_PAYMENTS_MODE="test";env.STRIPE_SECRET_KEY="sk_test_isolated_signature_fixture";env.STRIPE_WEBHOOK_SECRET="whsec_isolated_signature_fixture";env.RPILOT_STRIPE_SIGNATURE_TEST="true";}
    preview = spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname",previewHost,"--port",String(httpPort)],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let output = "";
    const capture=bytes=>{const clean=bytes.toString().replaceAll(password,"[redacted]").replaceAll(env.BETTER_AUTH_SECRET,"[redacted]");output=(output+clean).slice(-4000);previewOutput=(previewOutput+clean).slice(-30000);};
    preview.stdout.on("data", capture);
    preview.stderr.on("data", capture);
    let ready = false;
    for (let i = 0; i < 100 && preview.exitCode === null; i++) {
      try { const response=await fetch(`${env.BETTER_AUTH_URL}/api/workspace`);ready=response.status===401;await response.arrayBuffer();if(ready)break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`Test preview did not start: ${output.replaceAll(password, "[redacted]")}`);
    console.log("HTTP verification on isolated Next.js Node.js production preview.");
    if(uiScript)run(process.execPath,[path.join(root,"node_modules/tsx/dist/cli.mjs"),uiScript],{...env,RPILOT_UI_TEST:"true"});
    else run(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--test", process.argv.includes("--cash-only")?"tests/http-cash-flow.ts":"tests/http-flow.ts"], env);
  } else {
    run(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--test", "--test-isolation=none", "--test-concurrency=1", "tests/*.test.ts"], env);
  }
} catch (error) {
  if(previewOutput){fs.mkdirSync(path.join(root,".local/qa"),{recursive:true});fs.writeFileSync(path.join(root,".local/qa/next-preview.log"),previewOutput);console.error(previewOutput.slice(-5000));}
  console.error(error instanceof Error ? error.message : "Local test database failed.");
  process.exitCode = 1;
} finally {
  if (preview && preview.exitCode === null) {
    const exited = new Promise(resolve => preview.once("exit", resolve));
    preview.kill();
    await exited;
  }
  if (started) {
    try { run(executable("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]); }
    catch { console.error("Test database shutdown failed; inspect .local/postgres-tests before another run."); process.exitCode = 1; }
  }
}
