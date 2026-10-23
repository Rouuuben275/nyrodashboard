import {notFound} from "next/navigation";
import {docArticles,docBySlug,docHref} from "@/content/docs/registry";
import {getDocContent} from "@/content/docs/content";
import {DocArticle} from "@/components/docs/article";
import {publicMetadata} from "@/lib/public-metadata";
export const dynamicParams=false;
export const dynamic="force-static";
export function generateStaticParams(){return docArticles.map(({slug})=>({slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const a=docBySlug.get(slug);return a?publicMetadata(a.title,a.description,docHref(slug)):{};}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const article=docBySlug.get(slug),content=getDocContent(slug);if(!article||!content)notFound();return <DocArticle article={article} content={content}/>;}
