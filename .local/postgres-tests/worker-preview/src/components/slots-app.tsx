"use client";
import {ThemeSelector} from "./theme-selector";
import {useEffect,useState} from "react";
import {Building2,CreditCard,RefreshCw} from "lucide-react";
import type {Serialized} from "@/domains/core/queries";
import type {billingOverview} from "@/domains/billing/service";
import {Brand} from "./brand";
import {RPilotPagination,RPilotSkeleton} from "./ui/primitives";
import "./platform.css";
import "./slots.css";
type Data=Serialized<Awaited<ReturnType<typeof billingOverview>>>;
const states:Record<string,string>={PENDING:"En attente de confirmation",PAID:"Payé — slot ajouté",TEST_PAID:"Test réussi — aucun slot réel ajouté",EXPIRED:"Expiré",REFUNDED:"Remboursé — capacité retirée",DISPUTED:"Paiement contesté — capacité suspendue"};
export function SlotsApp({result}:{result?:"success"|"cancel"}){
  const [data,setData]=useState<Data|null>(null),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false),[requestKey]=useState(()=>crypto.randomUUID());
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");fetch(`/api/billing/slots?page=${page}`,{cache:"no-store",signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error);return body as Data;}).then(d=>{if(!controller.signal.aborted)setData(d);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Chargement impossible.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[page,refresh]);
  async function buy(){setBusy(true);setError("");try{
    const r=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestKey})}),body=await r.json();if(!r.ok)throw new Error(body.error);
    const url=new URL(body.url);if(url.origin!=="https://checkout.stripe.com")throw new Error("Destination du paiement invalide.");window.location.assign(url.href);
  }catch(e){setError(e instanceof Error?e.message:"Paiement indisponible.");setBusy(false);}}
  return <main className="spaces-page slots-page"><header><Brand/><ThemeSelector/><a className="btn outline" href="/espaces">Mes espaces</a></header><div className="page-heading"><div><span className="mini-label">VOTRE COMPTE DISCORD</span><h1>Mes slots d’entreprise</h1><p>Une entreprise incluse. Ajoutez de la capacité quand vous en avez besoin.</p></div><button className="btn outline" disabled={loading} onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={16}/>Actualiser</button></div>
    {result==="success"&&<p className="info-note" role="status">Retour du paiement. Le slot apparaît uniquement après confirmation sécurisée de Stripe. Actualisez si le traitement est encore en cours.</p>}
    {result==="cancel"&&<p className="info-note" role="status">Vous avez quitté le paiement. Aucun slot n’est attribué sans confirmation de paiement.</p>}
    {error&&<p className="form-error-box" role="alert">{error}</p>}{loading?<RPilotSkeleton lines={5}/>:data&&<>
    <div className="space-grid"><section className="panel padded"><Building2 size={24}/><h2>{data.slots.owned} / {data.slots.total} entreprises possédées</h2><p>{data.slots.remaining} slot(s) disponible(s)</p><p>1 inclus · {data.slots.granted} attribué(s) par l’administration · {data.slots.purchased} acheté(s)</p>{data.slots.overLimit&&<p className="info-note">Vos entreprises existantes sont conservées. Le quota bloque seulement les nouvelles créations jusqu’à disposer de suffisamment de slots.</p>}<a className="btn outline" href="/espaces">Choisir une entreprise</a></section>
    <section className="panel padded"><CreditCard size={24}/><h2>Un slot supplémentaire · 5 €</h2><p>Achat unique, sans abonnement. Un slot permet de posséder une entreprise supplémentaire sur votre compte Discord, indépendante ou affiliée.</p>{!data.slots.remaining&&<p className="finance-note">Il vous manque {data.slots.owned+1-data.slots.total} slot(s) pour créer une entreprise supplémentaire, compte tenu de vos entreprises existantes.</p>}{data.payments.enabled&&data.slots.discordVerified?<><button className="btn primary" onClick={buy} disabled={busy}>{busy?"Ouverture du paiement…":data.payments.mode==="test"?"Tester le paiement de 5 €":"Ajouter un slot — 5 €"}</button>{data.payments.mode==="test"&&<p className="finance-note">Mode test Stripe : aucun débit réel et aucun slot réel attribué.</p>}</>:<p className="info-note">L’achat n’est pas encore ouvert. L’administration Nyro Dashboard peut vous attribuer des slots. Aucun paiement n’est demandé ici.</p>}</section></div>
    <section className="panel padded"><h2>Historique de vos achats</h2>{!data.purchases.length?<p>Aucun achat enregistré.</p>:<div className="table-scroll"><table><thead><tr><th>Date</th><th>Référence</th><th>Montant</th><th>État</th></tr></thead><tbody>{data.purchases.map(p=><tr key={p.id}><td>{new Date(p.createdAt).toLocaleString("fr-FR")}</td><td>{p.id}</td><td>5 €{p.mode==="test"?" · Test":""}</td><td>{states[p.status]??"À vérifier"}</td></tr>)}</tbody></table></div>}<RPilotPagination page={page} pages={Math.ceil(data.total/25)} onPageChange={setPage}/></section>
    <p className="finance-note">Rejoindre une équipe comme employé ne consomme pas de slot. Les entreprises archivées ou suspendues restent comptées. Un slot ne donne aucun droit d’administration ni accès aux données d’une autre entreprise. Un remboursement intégral retire la capacité achetée et conserve vos entreprises.</p></>}
  </main>;
}
