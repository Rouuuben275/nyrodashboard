"use client";
import {useEffect,useState} from "react";
import {useWorkspace} from "./workspace-context";
import type {Serialized} from "@/domains/core/queries";
import type {WarehouseData} from "@/domains/inventory/warehouses";
import {RPilotInput} from "./ui/input";
import {RPilotSelect} from "./ui/select";
import {RPilotTextarea} from "./ui/textarea";
import {RPilotDialog} from "./ui/dialog";
import {RPilotPagination,RPilotSkeleton} from "./ui/primitives";

type Data=Serialized<WarehouseData>;
type Warehouse=Data["warehouses"][number];
function Field({name,children}:{name:string;children:React.ReactNode}){return <label className="form-field"><span>{name}</span>{children}</label>;}
const localNow=()=>{const d=new Date();return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export function WarehouseView({revision:externalRevision=0,onChanged}:{revision?:number;onChanged:()=>void}){
  const {current:c,busy,mutate}=useWorkspace();
  const [warehouseId,setWarehouseId]=useState("");const [search,setSearch]=useState("");const [page,setPage]=useState(1);const [data,setData]=useState<Data|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [revision,setRevision]=useState(0);
  const [editing,setEditing]=useState<Warehouse|"new"|null>(null);const [transfer,setTransfer]=useState<{id:string;name:string;quantity:number}|null>(null);
  const companyId=c!.company.id;
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError("");
    const timer=setTimeout(()=>{
      const query=new URLSearchParams({companyId,page:String(page),q:search,...(warehouseId?{warehouseId}:{})});
      fetch(`/api/inventory/warehouses?${query}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const value=await r.json();if(!r.ok)throw new Error(value.error);return value as Data;}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Lecture impossible.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[companyId,warehouseId,search,page,revision,externalRevision]);
  const changed=()=>{setRevision(r=>r+1);onChanged();};
  async function archive(w:Warehouse){setError("");try{await mutate({action:"stock.warehouse.save",warehouseId:w.id,code:w.code,name:w.name,archived:!w.archived});changed();}catch(e){setError(e instanceof Error?e.message:"Échec");}}
  return <section>
    <p className="finance-note">Le stock général contient les unités non rangées en entrepôt. Ventes, réceptions fournisseurs et inventaires globaux utilisent le stock général. Les transferts sont immédiats et ne changent ni le stock total ni la comptabilité. Un entrepôt contenant du stock ne peut pas être archivé.</p>
    <div className="record-filters"><RPilotSelect aria-label="Emplacement du stock" value={warehouseId} onValueChange={id=>{setWarehouseId(id);setPage(1);}} options={[{value:"",label:"Stock général"},...(data?.warehouses??[]).map(w=>({value:w.id,label:`${w.code} · ${w.name}${w.archived?" (archivé)":""}`}))]}/><RPilotInput aria-label="Rechercher une référence en entrepôt" placeholder="Nom ou référence" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>{data?.manage&&<button className="btn primary" onClick={()=>setEditing("new")}>Nouvel entrepôt</button>}</div>
    {error&&<p className="form-error-box" role="alert">{error}</p>}
    {loading?<RPilotSkeleton lines={5}/>:data&&<>
      <p>{data.units} unité(s) dans cet emplacement pour les filtres affichés.</p>
      <div className="panel table-scroll"><table><thead><tr><th>Produit</th><th>Dans cet emplacement</th><th>Total entreprise</th><th>Actions</th></tr></thead><tbody>{data.products.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small className="finance-sub">{p.sku}</small></td><td>{p.quantity}</td><td>{p.stock}</td><td>{data.manage&&<button className="btn outline small" disabled={busy||p.quantity===0||data.warehouses.find(w=>w.id===warehouseId)?.archived} onClick={()=>setTransfer({id:p.id,name:p.name,quantity:p.quantity})}>Transférer</button>}</td></tr>)}</tbody></table>{!data.products.length&&<p className="empty compact">Aucune référence pour ces filtres.</p>}</div>
      <RPilotPagination page={page} pages={Math.ceil(data.total/25)} onPageChange={setPage}/>
      <h3>Entrepôts de l’entreprise</h3><div className="panel table-scroll"><table><thead><tr><th>Code</th><th>Entrepôt</th><th>Unités</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{data.warehouses.map(w=><tr key={w.id}><td>{w.code}</td><td>{w.name}</td><td>{w.quantity}</td><td>{w.archived?"Archivé":"Actif"}</td><td>{data.manage&&<div className="row-actions"><button className="btn outline small" onClick={()=>setEditing(w)}>Modifier</button><button className="btn outline small" disabled={busy||(!w.archived&&w.quantity>0)} onClick={()=>archive(w)}>{w.archived?"Réactiver":"Archiver"}</button></div>}</td></tr>)}</tbody></table>{!data.warehouses.length&&<p className="empty compact">Créez un entrepôt, puis transférez-y les unités du stock général.</p>}</div>
      <h3>Historique des transferts</h3><p className="finance-note">Historique indépendant de la recherche produit, filtré par entrepôt lorsqu’un entrepôt est sélectionné.</p><div className="panel table-scroll"><table><thead><tr><th>Date</th><th>Produit / quantité</th><th>Source</th><th>Destination</th><th>Motif</th></tr></thead><tbody>{data.transfers.map(t=><tr key={t.id}><td>{new Date(t.movements[0]?.occurredAt??t.createdAt).toLocaleString("fr-FR",{timeZone:"Europe/Paris"})}</td><td>{t.movements[0]?.product.name}<small className="finance-sub">{t.movements[0]?.quantity} unité(s)</small></td><td>{t.sourceLabel}</td><td>{t.destinationLabel}</td><td>{t.label}</td></tr>)}</tbody></table>{!data.transfers.length&&<p className="empty compact">Aucun transfert enregistré.</p>}</div><RPilotPagination page={page} pages={Math.ceil(data.transferCount/25)} onPageChange={setPage}/>
    </>}
    <RPilotDialog open={!!editing} onOpenChange={v=>!v&&setEditing(null)} title={editing==="new"?"Créer un entrepôt":"Modifier un entrepôt"} preventClose={busy}>{editing&&<WarehouseForm key={editing==="new"?"new":editing.id} record={editing==="new"?undefined:editing} completed={()=>{setEditing(null);changed();}}/>}</RPilotDialog>
    <RPilotDialog open={!!transfer} onOpenChange={v=>!v&&setTransfer(null)} title={`Transférer ${transfer?.name??"du stock"}`} description="Les deux mouvements du transfert sont enregistrés ensemble, sans modifier le total de l’entreprise." preventClose={busy}>{transfer&&data&&<TransferForm key={`${transfer.id}-${warehouseId}`} product={transfer} sourceWarehouseId={warehouseId} warehouses={data.warehouses} completed={()=>{setTransfer(null);changed();}}/>}</RPilotDialog>
  </section>;
}
function WarehouseForm({record,completed}:{record?:Warehouse;completed:()=>void}){
  const {mutate,busy}=useWorkspace();const [error,setError]=useState("");
  return <form className="workspace-form" onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);setError("");try{await mutate({action:"stock.warehouse.save",warehouseId:record?.id,code:form.get("code"),name:form.get("name"),archived:record?.archived??false});completed();}catch(e){setError(e instanceof Error?e.message:"Échec");}}}>
    <Field name="Code unique (lettres, chiffres, tirets)"><RPilotInput name="code" required maxLength={30} pattern="[A-Za-z0-9_-]+" defaultValue={record?.code}/></Field><Field name="Nom de l’entrepôt"><RPilotInput name="name" required maxLength={160} defaultValue={record?.name}/></Field>{error&&<p className="form-error-box" role="alert">{error}</p>}<button className="btn primary" disabled={busy}>Enregistrer l’entrepôt</button>
  </form>;
}
function TransferForm({product,sourceWarehouseId,warehouses,completed}:{product:{id:string;quantity:number};sourceWarehouseId:string;warehouses:Warehouse[];completed:()=>void}){
  const {mutate,busy}=useWorkspace();const [error,setError]=useState("");const [requestKey]=useState(()=>crypto.randomUUID());const [destination,setDestination]=useState(sourceWarehouseId?"":"__choose");
  return <form className="workspace-form" onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);setError("");try{if(destination==="__choose")throw new Error("Choisissez un emplacement de destination.");await mutate({action:"stock.transfer",requestKey,productId:product.id,sourceWarehouseId:sourceWarehouseId||null,destinationWarehouseId:destination||null,quantity:Number(form.get("quantity")),reason:form.get("reason"),occurredAt:new Date(String(form.get("occurredAt"))).toISOString()});completed();}catch(e){setError(e instanceof Error?e.message:"Échec");}}}>
    <Field name="Destination"><RPilotSelect value={destination} onValueChange={setDestination} options={[{value:"__choose",label:"Choisir une destination",disabled:true},...(sourceWarehouseId?[{value:"",label:"Stock général"}]:[]),...warehouses.filter(w=>!w.archived&&w.id!==sourceWarehouseId).map(w=>({value:w.id,label:`${w.code} · ${w.name}`}))]}/></Field><Field name={`Quantité (disponible : ${product.quantity})`}><RPilotInput name="quantity" type="number" min={1} max={product.quantity} step={1} required/></Field><Field name="Date du transfert"><RPilotInput type="datetime-local" name="occurredAt" required defaultValue={localNow()}/></Field><Field name="Motif"><RPilotTextarea name="reason" required minLength={3} maxLength={500}/></Field><label className="checkbox-label"><RPilotInput type="checkbox" required/>Je confirme le déplacement physique de ces unités RP.</label>{error&&<p className="form-error-box" role="alert">{error}</p>}<button className="btn primary" disabled={busy}>Valider le transfert</button>
  </form>;
}
