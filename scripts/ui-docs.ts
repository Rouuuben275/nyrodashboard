import {createServer} from "node:http";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {existsSync,rmSync} from "node:fs";
import {db} from "../src/lib/db";
import {auth} from "../src/lib/auth";
import {getCookies} from "better-auth/cookies";
import {serializeSignedCookie} from "better-call";
const database=new URL(process.env.DATABASE_URL!);
if(process.env.RPILOT_UI_TEST!=="true"||database.hostname!=="127.0.0.1"||database.username!=="rpilot_test")throw new Error("UI docs requires the isolated fixture database.");
const stopFile=".local/qa/docs-ui.stop";if(existsSync(stopFile))rmSync(stopFile);
let userId="",voterHash="";const user=await db.user.create({data:{name:"Lecteur documentation de recette",email:`docs-ui-${randomUUID()}@example.test`}});userId=user.id;
try{
 voterHash=createHash("sha256").update(`rpilot-docs-v1:${userId}`).digest("hex");
 const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId,token,expiresAt:new Date(Date.now()+15*60000)}});
 const cookie=getCookies(auth.options).sessionToken,signed=await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes);
 const server=createServer((_req,res)=>{res.writeHead(302,{"Set-Cookie":signed,Location:`${process.env.BETTER_AUTH_URL}/docs/stocks`,"Cache-Control":"no-store"});res.end();});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("UI bootstrap unavailable");
 console.log(`Documentation UI fixture: http://localhost:${address.port}/ (isolated test session; no production data).`);
 await new Promise<void>(resolve=>{const started=Date.now(),timer=setInterval(()=>{if(existsSync(stopFile)||Date.now()-started>10*60000){clearInterval(timer);resolve();}},500);});
 await new Promise<void>(resolve=>server.close(()=>resolve()));
 const feedback=await db.documentationFeedback.findMany({where:{voterHash},select:{article:true,helpful:true}});console.log("Persisted fixture feedback:",JSON.stringify(feedback));
}finally{
 if(voterHash){await db.documentationFeedback.deleteMany({where:{voterHash}});await db.rateLimit.deleteMany({where:{key:`docs-feedback:${voterHash}`}});}
 if(userId)await db.user.delete({where:{id:userId}});await db.$disconnect();
}
