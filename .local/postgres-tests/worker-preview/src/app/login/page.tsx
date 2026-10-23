import {activeSession} from "@/lib/active-session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, discordEnabled } from "@/lib/auth";
export const dynamic="force-dynamic";
import { Login } from "@/components/login";
import { workspaceHref, safeReturnTo } from "@/lib/routes";
export const metadata = { title: "Connexion Discord — Nyro Dashboard", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string; error?: string; returnTo?: string }> }) {
  const params = await searchParams;
  const session = await activeSession({ headers: await headers() });
  const returnTo = safeReturnTo(params.returnTo);
  if (session) redirect(params.invite ? workspaceHref({ invite: params.invite }) : returnTo ?? "/espaces");
  return <Login discordEnabled={discordEnabled()} inviteToken={params.invite} returnTo={returnTo} oauthFailed={Boolean(params.error)}/>;
}
