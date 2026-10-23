"use client";
import { Brand } from "@/components/brand";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="loading-screen"><Brand/><h1>Votre espace n’est pas disponible.</h1><p>Impossible de charger votre espace pour le moment. Réessayez dans un instant.</p><button className="btn primary" onClick={reset}>Réessayer</button></div>; }
