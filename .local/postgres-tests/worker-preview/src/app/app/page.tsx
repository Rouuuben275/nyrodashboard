import {activeSession} from "@/lib/active-session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loginHref } from "@/lib/routes";
import { getWorkspace, type WorkspaceData } from "@/domains/core/queries";
import { WorkspaceApp } from "@/components/workspace-app";
import {AppError} from "@/domains/core/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon espace — Nyro Dashboard", robots: { index: false, follow: false } };
export default async function AppPage({ searchParams }: { searchParams: Promise<{ company?: string; invite?: string;space?:string;create?:string }> }) {
  const params = await searchParams;
  const session = await activeSession({ headers: await headers() });
  if (!session) redirect(loginHref(params.invite));
  if(!params.company&&!params.invite&&!params.space)redirect("/espaces");
  let workspace;try{workspace=await getWorkspace(session.user.id, params.company,params.space);}catch(e){if(e instanceof AppError)return <main className="padded"><h1>Accès refusé</h1><p>{e.message}</p><a href="/espaces">Choisir un autre espace RP</a></main>;throw e;}
  return <WorkspaceApp initial={JSON.parse(JSON.stringify(workspace)) as WorkspaceData} user={{ id: session.user.id, name: session.user.name, email: session.user.email }} inviteToken={params.invite} createCompany={params.create==="company"}/>;
}
