import type {MetadataRoute} from "next";
import {publicOrigin} from "@/lib/public-metadata";
export default function robots():MetadataRoute.Robots{if(process.env.VERCEL_ENV==="preview")return {rules:{userAgent:"*",disallow:"/"}};return {rules:{userAgent:"*",allow:["/","/docs/","/tarifs","/legal/"],disallow:["/api/","/app","/admin","/espaces","/serveurs","/candidatures","/compte/","/login"]},sitemap:`${publicOrigin}/sitemap.xml`};}
