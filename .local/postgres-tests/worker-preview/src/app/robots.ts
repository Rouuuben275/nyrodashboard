import type {MetadataRoute} from "next";
import {publicOrigin} from "@/lib/public-metadata";
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:"*",allow:["/","/docs/","/tarifs","/legal/"],disallow:["/api/","/app","/admin","/espaces","/serveurs","/candidatures","/compte/","/login"]},sitemap:`${publicOrigin}/sitemap.xml`};}
