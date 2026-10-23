"use client";
import {useEffect,useState} from "react";
import {useWorkspace} from "./workspace-context";
import type {Serialized} from "@/domains/core/queries";
import type {TimeData} from "@/domains/time/queries";
import {RPilotInput} from "./ui/input";
import {RPilotSelect} from "./ui/select";
import {RPilotTextarea} from "./ui/textarea";
import {RPilotDatePicker} from "./ui/date-picker";
import {RPilotDialog} from "./ui/dialog";
import {RPilotPagination,RPilotSkeleton} from "./ui/primitives";
type Data=Serialized<TimeData>;
type Row=Data["rows"][number];
type Operation="correct"|"approve"|"reject"|"reopen"|"stop";
const labels:Record<string,string>={OPEN:"En service",PENDING:"À valider",APPROVED:"Validé",REJECTED:"Refusé"};
const date=(v:string|null)=>v?new Date(v).toLocaleString("fr-FR",{timeZone:"Europe/Paris"}):"En cours";
const duration=(v:number)=>`${Math.floor(v/60)} h ${v%60} min`;
const localDate=(v:string)=>{const d=new Date(v);return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="form-field"><span>{label}</span>{children}</label>;}
export function TimeView(){
  const {current:c,mutate,busy}=useWorkspace();
  const [data,setData]=useState<Data|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  const [memberId,setMemberId]=useState("");const [from,setFrom]=useState("");const [to,setTo]=useState("");const [status,setStatus]=useState("");const [page,setPage]=useState(1);const [entryId,setEntryId]=useState("");const [revision,setRevision]=useState(0);const [operation,setOperation]=useState<Operation|null>(null);
  const params=new URLSearchParams({companyId:c!.company.id,page:String(page),...(memberId?{memberId}:{}),...(from?{from}:{}),...(to?{to}:{}),...(status?{status}:{}),...(entryId?{entryId}:{})}).toString();
  useEffect(()=>{
    const abort=new AbortController();setLoading(true);setError("");
    fetch(`/api/time?${params}`,{signal:abort.signal,cache:"no-store"}).then(async r=>{const value=await r.json();if(!r.ok)throw new Error(value.error);return value as Data;}).then(value=>{if(!abort.signal.aborted)setData(value);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Lecture impossible.");}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
  },[params,revision]);
  useEffect(()=>{if(!data?.active||entryId)return;const timer=setInterval(()=>setRevision(r=>r+1),30000);return()=>clearInterval(timer);},[data?.active?.id,entryId]);
  const changed=()=>{setOperation(null);setRevision(r=>r+1);};
  async function run(payload:Record<string,unknown>){setError("");try{await mutate({...payload,requestKey:crypto.randomUUID()});changed();}catch(e){setError(e instanceof Error?e.message:"Échec");}}
  const filter=(setter:(v:string)=>void)=>(value:string)=>{setter(value);setPage(1);};
  const active=data?.active,selected=data?.selected;
  async function download(format:"csv"|"pdf"){setError("");try{const response=await fetch(`/api/time/export?${params}&format=${format}`,{cache:"no-store"});if(!response.ok)throw new Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=`pointage-rp.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e instanceof Error?e.message:"Export impossible.");}}
  return <>
    <div className="page-heading"><div><div className="mini-label">POINTAGE AUTONOME</div><h1>Votre temps, avec un historique clair.</h1><p>Services, pauses, corrections motivées et validation des heures RP.</p></div><button className="btn outline" disabled={loading} onClick={()=>setRevision(r=>r+1)}>Actualiser</button></div>
    {error&&<p role="alert" className="form-error-box">{error}</p>}
    {!data&&loading?<RPilotSkeleton lines={6}/>:data&&<>
      <div className="panel time-hero"><div><span className="mini-label">VOTRE SERVICE ACTUEL</span><h2>{active?(active.paused?"Vous êtes en pause.":"Vous êtes en service."):"Prêt pour un nouveau service ?"}</h2><p>{active?`Depuis le ${date(active.start)} · ${duration(active.minutes)} nettes · ${active.pauseMinutes} min de pause` :"Les pauses sont déduites du temps net. L’arrêt ferme aussi une pause en cours."}</p></div><div className="row-actions">{active?<><button className="btn outline" disabled={busy||loading} onClick={()=>run({action:"time.pause",entryId:active.id,revision:active.revision,paused:!active.paused})}>{active.paused?"Reprendre":"Prendre une pause"}</button><button className="btn primary" disabled={busy||loading} onClick={()=>run({action:"time.stop",entryId:active.id,revision:active.revision})}>Terminer mon service</button></>:<button className="btn primary" disabled={busy||loading} onClick={()=>run({action:"time.start"})}>Prendre mon service</button>}</div></div>
      <div className="stats-grid"><div className="panel kpi"><small>Temps net terminé, filtré</small><strong>{duration(data.summary.minutes)}</strong></div><div className="panel kpi"><small>Dont heures validées</small><strong>{duration(data.summary.approvedMinutes)}</strong></div><div className="panel kpi"><small>Services à valider</small><strong>{data.summary.pending}</strong></div></div>
      <p className="finance-note">Les filtres portent sur la date de début retenue, en heure de Paris. Les services en cours sont exclus des totaux. Les heures validées ne déclenchent aucun versement RP automatique.</p>
      <div className="finance-export"><span>Exporter tous les pointages filtrés, au-delà de la page affichée.</span><button className="btn outline small" disabled={loading} onClick={()=>download("csv")}>Exporter CSV</button><button className="btn outline small" disabled={loading} onClick={()=>download("pdf")}>Exporter PDF</button></div>
      {data.manage&&data.departments.length>0&&<section className="panel padded"><h3>Heures par département actuel</h3>{data.departments.map(d=><div className="finance-category-total" key={d.department}><span>{d.department}</span><span>{duration(d.minutes)} nettes</span><span>{duration(d.approvedMinutes)} validées</span></div>)}</section>}
      <div className="finance-filters">{data.manage&&<Field label="Employé"><RPilotSelect value={memberId} onValueChange={filter(setMemberId)} options={[{value:"",label:"Toute l’équipe"},...data.staff.map(m=>({value:m.id,label:m.characterName}))]}/></Field>}<Field label="Statut"><RPilotSelect value={status} onValueChange={filter(setStatus)} options={[{value:"",label:"Tous les statuts"},...Object.entries(labels).map(([value,label])=>({value,label}))]}/></Field><Field label="Du"><RPilotDatePicker value={from} onValueChange={filter(setFrom)}/></Field><Field label="Au"><RPilotDatePicker value={to} onValueChange={filter(setTo)}/></Field></div>
      {data.staffTruncated&&<p className="finance-note">Les 500 premiers employés sont proposés dans le filtre ; le tableau Toute l’équipe conserve tous les pointages accessibles.</p>}
      <div className="panel table-scroll"><table><thead><tr><th>Employé</th><th>Début / fin retenus</th><th>Pauses</th><th>Temps net</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{data.rows.map(r=><tr key={r.id}><td>{r.characterName}</td><td>{date(r.start)}<small className="finance-sub">{date(r.end)}{r.corrected?" · Corrigé":""}</small></td><td>{r.pauseMinutes} min</td><td>{duration(r.minutes)}</td><td><span className="badge neutral">{r.paused?"En pause":labels[r.status]}</span></td><td><button className="btn outline small" onClick={()=>{setOperation(null);setEntryId(r.id);}}>Consulter</button></td></tr>)}</tbody></table>{!data.rows.length&&<p className="empty compact">Aucun pointage pour ces filtres.</p>}</div><RPilotPagination page={page} pages={Math.ceil(data.total/25)} onPageChange={setPage}/>
    </>}
    <RPilotDialog open={!!entryId} onOpenChange={v=>{if(!v){setEntryId("");setOperation(null);}}} title="Détail du pointage" description="L’enregistrement d’origine reste conservé ; les corrections et décisions sont historisées." preventClose={busy}>
      {loading||!selected||selected.id!==entryId?<RPilotSkeleton lines={5}/>:<>
        <h3>{selected.characterName} · {labels[selected.status]}</h3><p>Horaires d’origine : {date(selected.originalStart)} — {date(selected.originalEnd)}</p><p>Horaires retenus : {date(selected.start)} — {date(selected.end)}<br/>{duration(selected.minutes)} nettes, {selected.pauseMinutes} min de pause.</p>
        {operation?<TimeOperation key={`${selected.id}-${selected.revision}-${operation}`} row={selected} operation={operation} completed={changed} cancel={()=>setOperation(null)}/>:data?.manage&&<div className="form-actions">{!selected.end?<button className="btn outline" onClick={()=>setOperation("stop")}>Clôturer ce service</button>:<>
          {selected.status!=="APPROVED"&&<button className="btn outline" onClick={()=>setOperation("correct")}>Corriger les horaires</button>}
          {selected.status==="PENDING"&&selected.memberId!==data.viewerId&&<><button className="btn outline" onClick={()=>setOperation("reject")}>Refuser</button><button className="btn primary" onClick={()=>setOperation("approve")}>Valider les heures</button></>}
          {selected.status!=="PENDING"&&<button className="btn outline" onClick={()=>setOperation("reopen")}>Rouvrir la validation</button>}
        </>}</div>}
        {data?.manage&&selected.end&&selected.memberId===data.viewerId&&<p className="finance-note">Un autre responsable doit valider ou refuser vos propres heures.</p>}
        <h3>Pauses enregistrées</h3>{data?.details?.pauses.map(p=><p key={p.id}>{date(p.start)} — {date(p.end)} · {p.actorName}</p>)}{!data?.details?.pauses.length&&<p>Aucune pause enregistrée.</p>}
        <h3>Corrections conservées</h3>{data?.details?.corrections.map(r=><article key={r.id}><strong>{date(r.start)} — {date(r.end)} · {r.pauseMinutes} min de pause</strong><p>{r.reason}</p><small>Saisie le {date(r.createdAt)} par {r.actorName}</small></article>)}{!data?.details?.corrections.length&&<p>Aucune correction.</p>}
        <h3>Décisions conservées</h3>{data?.details?.reviews.map(r=><article key={r.id}><strong>{labels[r.status]} · {duration(r.workedMinutes)}</strong><p>{r.reason}</p><small>{date(r.createdAt)} · {r.actorName} · {r.revision===selected.revision?"Décision actuelle":"Version antérieure"}</small></article>)}{!data?.details?.reviews.length&&<p>Aucune décision.</p>}<p className="finance-note">Les 100 dernières pauses, corrections et décisions sont affichées pour ce service. Les enregistrements plus anciens restent en base.</p>
      </>}
    </RPilotDialog>
  </>;
}
function TimeOperation({row,operation,completed,cancel}:{row:Row;operation:Operation;completed:()=>void;cancel:()=>void}){
  const {mutate,busy}=useWorkspace();const [error,setError]=useState("");const [requestKey]=useState(()=>crypto.randomUUID());
  return <form className="workspace-form receipt-confirmation" onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);setError("");try{
    const payload={entryId:row.id,revision:row.revision,requestKey,reason:String(form.get("reason")||"")};
    const action=operation==="correct"?{action:"time.correct",start:new Date(String(form.get("start"))).toISOString(),end:new Date(String(form.get("end"))).toISOString(),pauseMinutes:Number(form.get("pauseMinutes"))}:operation==="approve"||operation==="reject"?{action:"time.review",status:operation==="approve"?"APPROVED":"REJECTED"}:{action:`time.${operation}`};
    await mutate({...payload,...action});completed();
  }catch(e){setError(e instanceof Error?e.message:"Échec");}}}>
    <h3>{operation==="correct"?"Corriger le temps retenu":operation==="approve"?"Valider les heures":operation==="reject"?"Refuser les heures":operation==="reopen"?"Rouvrir la validation":"Clôturer le service maintenant"}</h3>
    {operation==="correct"&&<><Field label="Début retenu"><RPilotInput name="start" type="datetime-local" required defaultValue={localDate(row.start)}/></Field><Field label="Fin retenue"><RPilotInput name="end" type="datetime-local" required defaultValue={localDate(row.end!)}/></Field><Field label="Pauses retenues, en minutes"><RPilotInput name="pauseMinutes" type="number" min={0} max={10080} step={1} required defaultValue={row.pauseMinutes}/></Field><p>La correction remplace les horaires et pauses retenus pour le calcul, sans effacer les pointages et pauses d’origine.</p></>}
    <Field label="Motif"><RPilotTextarea name="reason" required minLength={3} maxLength={500}/></Field><label className="checkbox-label"><RPilotInput type="checkbox" required/>Je confirme cette opération sur les heures RP.</label>{error&&<p className="form-error-box" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="btn outline" onClick={cancel}>Revenir</button><button className="btn primary" disabled={busy}>Confirmer</button></div>
  </form>;
}
