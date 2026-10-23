"use client";
import {ThemeSelector} from "./theme-selector";

import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Boxes, Check, Loader2, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { workspaceHref, loginHref, safeReturnTo } from "@/lib/routes";
import { DiscordIcon } from "./discord-icon";
import { Brand } from "./brand";
import "./landing.css";

export function Login({ discordEnabled, inviteToken, oauthFailed, returnTo }: { discordEnabled: boolean; inviteToken?: string; oauthFailed?: boolean; returnTo?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(oauthFailed ? "La connexion Discord n’a pas abouti. Vous pouvez réessayer." : "");
  async function connect() {
    if (pending || !discordEnabled) return;
    setPending(true); setError("");
    try {
      const callbackURL = inviteToken ? workspaceHref({ invite: inviteToken }) : safeReturnTo(returnTo) ?? "/espaces";
      const failureBase = loginHref(inviteToken, returnTo);
      const failure = `${failureBase}${failureBase.includes("?") ? "&" : "?"}error=discord`;
      const result = await authClient.signIn.social({ provider: "discord", callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL: failure });
      if (result.error || !result.data?.url) throw new Error("OAuth unavailable");
    } catch {
      setError("Impossible de démarrer la connexion Discord. Réessayez dans un instant."); setPending(false);
    }
  }
  return <div className="login-page discord-login"><section className="login-story"><Brand/><div className="story-main"><span className="eyebrow"><span className="status-dot"/> VOTRE PROCHAINE HISTOIRE COMMENCE ICI</span><h1>Votre communauté.<br/>Votre entreprise.<br/><span>Votre compte Discord.</span></h1><p>Un seul compte pour retrouver vos personnages,<br/>vos équipes et toutes vos entreprises RP.</p><div className="story-checks">{["Un espace personnel, plusieurs entreprises", "Des accès propres à chaque équipe", "Aucune installation sur votre serveur de jeu"].map(t => <div key={t}><Check size={16}/>{t}</div>)}</div></div><footer>CONÇU POUR VOS HISTOIRES. PENSÉ POUR VOTRE AMBITION.<span>Nyro Dashboard © 2026</span></footer></section><section className="login-form-wrap"><div className="login-appearance"><ThemeSelector/></div><div className="login-form"><a className="auth-back" href="/"><ArrowLeft size={14}/>Retour à l’accueil</a><span className="auth-discord-mark"><DiscordIcon width={31} height={31}/></span><div className="mini-label">BIENVENUE À BORD</div><h2>Un compte Discord.<br/>Tout votre espace RP.</h2><p>{inviteToken ? "Connectez-vous pour accepter votre invitation et rejoindre votre équipe." : "Connectez-vous ou créez votre compte en quelques clics avec Discord."}</p><button className="btn discord discord-connect" onClick={connect} disabled={!discordEnabled || pending}>{pending ? <Loader2 size={20} className="spin"/> : <DiscordIcon width={20} height={20}/>} {pending ? "Redirection vers Discord…" : "Continuer avec Discord"}<ArrowUpRight size={17}/></button>{!discordEnabled && <p className="auth-unavailable" role="status">La connexion Discord n’est pas encore activée sur cette plateforme. Revenez dans un instant.</p>}{error && <div className="form-error-box" role="alert">{error}</div>}<p className="auth-explainer">Première visite ? Votre espace personnel sera créé lors de votre connexion. Vous pourrez ensuite créer une entreprise ou rejoindre votre équipe.</p><div className="secure-note"><ShieldCheck size={16}/>Votre mot de passe reste chez Discord.</div><p className="auth-access-note">Nyro Dashboard utilise votre identité Discord pour vous reconnaître. Aucun bot ni accès à votre serveur de jeu n’est nécessaire.</p></div><div className="login-footer">Indépendant du jeu. Connecté à votre communauté.</div></section></div>;
}

