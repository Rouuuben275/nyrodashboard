import type {MetadataRoute} from "next";
import {docArticles,docHref} from "@/content/docs/registry";
import {publicOrigin} from "@/lib/public-metadata";
export default function sitemap():MetadataRoute.Sitemap{return ["/","/docs","/tarifs","/legal/conditions","/legal/confidentialite","/legal/mentions-legales",...docArticles.map(a=>docHref(a.slug))].map(path=>({url:`${publicOrigin}${path}`,lastModified:"2026-10-21",changeFrequency:"weekly" as const,priority:path==="/"?1:path==="/docs"?.9:.6}));}
