import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import {databaseRuntime} from "@/lib/database-runtime";

export const discordEnabled = () => {const {env}=databaseRuntime();return Boolean(env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET);};
function createAuth(){const {env,worker}=databaseRuntime();return betterAuth({
  appName: "Nyro Dashboard",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: false },
  socialProviders: discordEnabled() ? { discord: { clientId: env.DISCORD_CLIENT_ID!, clientSecret: env.DISCORD_CLIENT_SECRET!, prompt: "consent" } } : {},
  rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  account: { accountLinking: { enabled: false } },
  onAPIError: { errorURL: "/login" },
  ...(worker?{advanced:{ipAddress:{ipAddressHeaders:["cf-connecting-ip"]}}}:{}),
  plugins: [nextCookies()],
});}
type Auth=ReturnType<typeof createAuth>;
let nodeAuth:Auth|undefined;const requests=new WeakMap<object,Auth>();
function getAuth(){const {key}=databaseRuntime();const previous=key?requests.get(key):nodeAuth;if(previous)return previous;const result=createAuth();if(key)requests.set(key,result);else nodeAuth=result;return result;}
export const auth=new Proxy({} as Auth,{get(_target,key){const current=getAuth();const value=Reflect.get(current,key);return typeof value==="function"?value.bind(current):value;},has(_target,key){return key in getAuth();}});
