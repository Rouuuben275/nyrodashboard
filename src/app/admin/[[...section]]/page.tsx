import {headers} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {activeSession} from "@/lib/active-session";
import {platformAccess} from "@/domains/platform/access";
import {db} from "@/lib/db";
import {PlatformApp} from "@/components/platform-app";
import {recordPlatformVisit} from "@/domains/platform/visit";
export const dynamic="force-dynamic";
export const metadata={title:"Administration Nyro Dashboard",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{section?:string[]}>}){
  const {section=[]}=await params;const view=section[0]??"dashboard";
  if(section.length>1||!["dashboard","servers","users","companies","administrators","audit"].includes(view))notFound();
  const session=await activeSession({headers:await headers()});if(!session)redirect("/login?returnTo=/admin");
  const access=await platformAccess(db,session.user.id);
  if(!access.role)return <main className="padded"><h1>Accès refusé</h1><p>Votre compte ne possède aucun accès à l’administration Nyro Dashboard.</p><a href="/espaces">Choisir mon espace RP</a></main>;
  await recordPlatformVisit(session.user,session.session.id);
  return <PlatformApp view={view as "dashboard"|"servers"|"users"|"companies"|"administrators"|"audit"} access={access}/>;
}
