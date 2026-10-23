import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {activeSession} from "@/lib/active-session";
import {ServerAccess} from "@/components/server-access";
export const dynamic="force-dynamic";
export const metadata={title:"Communautés RP — Nyro Dashboard",robots:{index:false,follow:false}};
export default async function Page(){if(!await activeSession({headers:await headers()}))redirect("/login?returnTo=/serveurs");return <ServerAccess/>;}
