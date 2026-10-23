import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {activeSession} from "@/lib/active-session";
import {db} from "@/lib/db";
import {requireServerManager} from "@/domains/servers/access";
import {AppError} from "@/domains/core/errors";
import {ServerAccess} from "@/components/server-access";
export const dynamic="force-dynamic";
export const metadata={title:"Admissions du serveur — Nyro Dashboard",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const session=await activeSession({headers:await headers()});if(!session)redirect(`/login?returnTo=${encodeURIComponent(`/serveurs/${id}/acces`)}`);try{await requireServerManager(db,id,session.user.id);}catch(e){if(e instanceof AppError)return <main className="padded"><h1>Accès refusé</h1><p>{e.message}</p><a href="/espaces">Mes espaces RP</a></main>;throw e;}return <ServerAccess serverId={id}/>;}
