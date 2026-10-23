import {notFound} from "next/navigation";
import {PublicHeader,PublicFooter} from "@/components/public/chrome";
import {publicPages} from "@/content/public-pages";
import {publicMetadata} from "@/lib/public-metadata";
import "@/components/public/public.css";
export const dynamicParams=false;
export const dynamic="force-static";
export function generateStaticParams(){return Object.keys(publicPages).map(slug=>({slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const p=publicPages[slug as keyof typeof publicPages];return p?publicMetadata(p.title,p.description,`/legal/${slug}`):{};}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const p=publicPages[slug as keyof typeof publicPages];if(!p)notFound();return <div className="public-site"><PublicHeader/><main className="public-width public-reading" id="contenu"><span className="public-eyebrow">INFORMATIONS PUBLIQUES · 21 OCTOBRE 2026</span><h1>{p.title}</h1><p>{p.description}</p>{p.sections.map(s=><section key={s.title}><h2>{s.title}</h2><p>{s.text}</p></section>)}<p><a href="/docs/support" className="public-text-link">Consulter l’assistance →</a></p></main><PublicFooter/></div>;}
