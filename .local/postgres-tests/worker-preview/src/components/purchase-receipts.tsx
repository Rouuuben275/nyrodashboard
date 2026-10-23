"use client";
import {useEffect,useState} from "react";
import type {Current} from "./workspace-context";
import {useWorkspace} from "./workspace-context";
import {RPilotInput} from "./ui/input";
import {RPilotTextarea} from "./ui/textarea";
import {money} from "@/lib/utils";
import type {readReceipts} from "@/domains/purchasing/queries";

type Order=Current["purchaseOrders"][number];
export function receivedQuantity(order:Order,item:Order["items"][number]) {
  // Old full receipts are left intact; their additive counters intentionally stay zero.
  return order.status==="RECEIVED"?item.quantity:item.receivedQuantity;
}
function localNow(){const date=new Date();return new Date(+date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}

export function ReceiptForm({order,close}:{order:Order;close:()=>void}) {
  const {mutate,busy}=useWorkspace();
  const [requestKey]=useState(()=>crypto.randomUUID());
  const [quantities,setQuantities]=useState<Record<string,string>>(()=>Object.fromEntries(order.items.map(i=>[i.id,String(i.quantity-receivedQuantity(order,i))])));
  const [error,setError]=useState("");
  const total=order.items.reduce((sum,i)=>sum+Number(quantities[i.id]||0)*i.unitCost,0);
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setError("");const form=new FormData(e.currentTarget);
    try {
      const date=new Date(String(form.get("occurredAt")));
      if(!Number.isFinite(+date))throw new Error("Choisissez une date de réception.");
      const items=order.items.map(i=>({itemId:i.id,quantity:Number(quantities[i.id]||0)})).filter(i=>i.quantity!==0);
      if(!items.length)throw new Error("Saisissez au moins une quantité reçue.");
      await mutate({action:"purchase.receive",orderId:order.id,requestKey,occurredAt:date.toISOString(),reference:form.get("reference"),notes:form.get("notes"),items},"Livraison enregistrée. Stocks et comptabilité actualisés.");
      close();
    } catch(e){setError(e instanceof Error?e.message:"Échec de la réception.");}
  }
  return <form className="workspace-form receipt-confirmation" onSubmit={submit}>
    <h3>Enregistrer une livraison</h3><p>Indiquez uniquement les unités reçues aujourd’hui. Le reliquat reste en attente. Chaque livraison ajoute son stock et son coût en comptabilité.</p>
    {order.items.filter(i=>i.quantity>receivedQuantity(order,i)).map(i=><label className="form-field" key={i.id}><span>{i.name} · reste {i.quantity-receivedQuantity(order,i)}</span><RPilotInput type="number" min={0} max={i.quantity-receivedQuantity(order,i)} step={1} required value={quantities[i.id]} onChange={e=>setQuantities(q=>({...q,[i.id]:e.target.value}))}/></label>)}
    <div className="form-grid"><label className="form-field"><span>Date et heure de réception</span><RPilotInput type="datetime-local" name="occurredAt" aria-label="Date et heure de réception" required defaultValue={localNow()} max={localNow()}/></label><label className="form-field"><span>Référence du bon de livraison</span><RPilotInput name="reference" maxLength={160}/></label></div>
    <label className="form-field"><span>Notes de réception</span><RPilotTextarea name="notes" maxLength={2000}/></label>
    <p>Coût reçu : <strong>{money(total)}</strong></p>
    <label className="checkbox-label"><RPilotInput type="checkbox" required/>Je confirme les quantités réellement reçues.</label>
    {error&&<p className="form-error-box" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="btn outline" disabled={busy} onClick={close}>Revenir</button><button className="btn primary" disabled={busy}>Enregistrer la livraison</button></div>
  </form>;
}

type History=Awaited<ReturnType<typeof readReceipts>>;
export function ReceiptHistory({companyId,orderId,version}:{companyId:string;orderId:string;version:string}) {
  const [page,setPage]=useState(1);const [data,setData]=useState<History|null>(null);const [error,setError]=useState("");const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();setData(null);setError("");
    fetch(`/api/purchases/${encodeURIComponent(orderId)}/receipts?${new URLSearchParams({companyId,page:String(page)})}`,{signal:abort.signal,cache:"no-store"}).then(async r=>{const payload=await r.json();if(!r.ok)throw new Error(payload.error||"Chargement impossible.");return payload as History;}).then(setData).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Chargement impossible.");});
    return()=>abort.abort();
  },[companyId,orderId,page,version,retry]);
  return <section className="client-documents" aria-label="Historique des livraisons"><h3>Historique des livraisons</h3>{error?<p role="alert">{error} <button className="btn outline small" onClick={()=>setRetry(r=>r+1)}>Réessayer</button></p>:!data?<p role="status">Chargement des livraisons…</p>:<>
    {data.legacy&&<p>Réception complète historique du {new Date(data.legacy).toLocaleString("fr-FR")}. Les mouvements et l’écriture d’origine sont conservés.</p>}
    {!data.count&&!data.legacy&&<p>Aucune livraison enregistrée.</p>}
    {data.receipts.map(r=><article key={r.id} className="receipt-confirmation"><p><strong>{r.reference||"Livraison sans référence"}</strong> · {new Date(r.occurredAt).toLocaleString("fr-FR")} · {money(r.total)}</p><small>Saisie par {r.actorName} le {new Date(r.createdAt).toLocaleString("fr-FR")}</small><ul>{r.lines.map(i=><li key={i.id}>{i.name} : {i.quantity} × {money(i.unitCost)}</li>)}</ul>{r.notes&&<p>{r.notes}</p>}</article>)}
    {data.pages>1&&<div className="form-actions"><button className="btn outline small" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Précédent</button><span>Page {page} / {data.pages}</span><button className="btn outline small" disabled={page>=data.pages} onClick={()=>setPage(p=>p+1)}>Suivant</button></div>}
  </>}</section>;
}
