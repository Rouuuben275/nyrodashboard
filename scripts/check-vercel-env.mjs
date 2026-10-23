import "dotenv/config";
export function checkVercelEnvironment(env){
 const errors=[];const required=["DATABASE_URL","BETTER_AUTH_URL","BETTER_AUTH_SECRET","DISCORD_CLIENT_ID","DISCORD_CLIENT_SECRET","RPILOT_OWNER_DISCORD_ID"];
 for(const key of required)if(!env[key]||/CHANGE_ME|REPLACE_ME|example\.invalid|YOUR_/i.test(env[key]))errors.push(`${key}: valeur reelle manquante`);
 try{const u=new URL(env.DATABASE_URL);if(!["postgres:","postgresql:"].includes(u.protocol))throw Error();if(!["localhost","127.0.0.1"].includes(u.hostname)&&!["require","verify-ca","verify-full"].includes(u.searchParams.get("sslmode")))errors.push("DATABASE_URL: TLS requis");}catch{errors.push("DATABASE_URL: URL PostgreSQL invalide");}
 try{const u=new URL(env.BETTER_AUTH_URL);if(u.username||u.password||u.search||u.hash||u.pathname!=="/")throw Error();if(u.protocol!=="https:"&&env.VERCEL==="1")throw Error();}catch{errors.push("BETTER_AUTH_URL: origine HTTPS fixe requise sur Vercel");}
 if((env.BETTER_AUTH_SECRET?.length??0)<32)errors.push("BETTER_AUTH_SECRET: conserver le secret existant de 32 caracteres minimum");
 if(!/^\d{15,22}$/.test(env.RPILOT_OWNER_DISCORD_ID??""))errors.push("RPILOT_OWNER_DISCORD_ID: Discord ID du proprietaire requis");
 if(!/^\d{15,22}$/.test(env.DISCORD_CLIENT_ID??""))errors.push("DISCORD_CLIENT_ID: identifiant OAuth Discord invalide");
 if(env.VERCEL_ENV==="production"&&env.BETTER_AUTH_URL!==(env.SITE_URL||"https://nyrodashboard.vercel.app"))errors.push("BETTER_AUTH_URL et l’origine publique de production doivent correspondre");
 if(env.RPILOT_SLOT_PAYMENTS_MODE==="live")errors.push("RPILOT_SLOT_PAYMENTS_MODE: live interdit pendant la migration");
 if(env.RPILOT_SLOT_PAYMENTS_MODE==="test"&&(!env.STRIPE_SECRET_KEY?.startsWith("sk_test_")||!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")))errors.push("Stripe test: configuration incomplete");
 return [...new Set(errors)];
}
if(process.argv[1]?.replaceAll("\\","/").endsWith("/check-vercel-env.mjs")){
 if(process.env.VERCEL!=="1"&&!process.argv.includes("--strict"))console.log("Build Next.js local : aucune migration ni validation de secrets de production.");
 else {const errors=checkVercelEnvironment(process.env);if(errors.length){console.error(errors.join("\n"));process.exitCode=1;}else console.log("Configuration Vercel valide (noms controles, valeurs non affichees).");}
}
