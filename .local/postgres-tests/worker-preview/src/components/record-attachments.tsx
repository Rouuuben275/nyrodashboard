"use client";
import {useEffect,useRef,useState} from "react";
import {Download,FileText,LockKeyhole,Paperclip} from "lucide-react";
import type {AttachmentsData} from "@/domains/attachments/service";
import type {AttachmentTarget} from "@/domains/attachments/validation";
import type {DocumentsData} from "@/domains/documents/queries";
import type {Serialized} from "@/domains/core/queries";
import {documentTypes} from "@/domains/documents/validation";
import {useWorkspace} from "./workspace-context";
import {RPilotInput} from "./ui/input";
import {RPilotFileUpload} from "./ui/file-upload";
import {RPilotPagination,RPilotSkeleton} from "./ui/primitives";
import "./record-attachments.css";
type Data=Serialized<AttachmentsData>;
type Doc=Data["rows"][number];
type Props={targetType:AttachmentTarget["targetType"];targetId:string;onChange?:()=>void};
const visibility:Record<AttachmentTarget["targetType"],string>={EMPLOYEE:"Documents partagés avec l’employé concerné et les responsables RH autorisés.",LEAVE:"Justificatifs réservés à l’employé concerné et aux responsables des absences.",EXPENSE:"Justificatifs réservés à l’auteur et aux responsables de validation des dépenses.",CLAIM:"Justificatifs réservés à l’auteur et aux responsables de validation des dépenses.",TASK:"Documents accessibles aux membres autorisés à consulter cette tâche dans l’entreprise."};
const date=(v:string)=>new Date(v).toLocaleString("fr-FR",{timeZone:"Europe/Paris"});
export function RecordAttachments(props:Props){
 const {current:c}=useWorkspace();return c?<Attachments key={`${c.company.id}:${props.targetType}:${props.targetId}:${c.permissions.toSorted().join(",")}:${c.company.modules.map(m=>`${m.key}:${m.enabled}`).toSorted().join(",")}`} {...props}/>:null;
}
function Attachments({targetType,targetId,onChange}:Props){
 const {current:c}=useWorkspace();const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[version,setVersion]=useState(0),[archived,setArchived]=useState(false),[page,setPage]=useState(1),[busy,setBusy]=useState(false);
 const [upload,setUpload]=useState<Doc|"new"|null>(null),[link,setLink]=useState(false),[note,setNote]=useState("");
 const pending=useRef(false),keys=useRef(new Map<string,string>());
 const target={companyId:c!.company.id,targetType,targetId};
 const params=new URLSearchParams({...target,archived:String(archived),page:String(page)}).toString();
 useEffect(()=>{const abort=new AbortController();setData(null);setLoading(true);setError("");fetch(`/api/attachments?${params}`,{cache:"no-store",signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d as Data;}).then(d=>{if(!abort.signal.aborted)setData(d);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Lecture impossible.");}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[params,version]);
 const refresh=()=>{setVersion(v=>v+1);onChange?.();};
 async function command(payload:Record<string,unknown>){
  if(pending.current)throw new Error("Un transfert est déjà en cours.");pending.current=true;setBusy(true);setError("");
  const body={...target,...payload},fingerprint=JSON.stringify(body);let key=keys.current.get(fingerprint);if(!key){key=crypto.randomUUID();keys.current.set(fingerprint,key);}
  try{const r=await fetch("/api/attachments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,requestKey:key})});const d=await r.json();if(!r.ok)throw new Error(d.error);keys.current.delete(fingerprint);refresh();return d;}
  finally{pending.current=false;setBusy(false);}
 }
 async function archive(doc:Doc){try{await command({action:"archive",documentId:doc.id,revision:doc.revision,archived:!doc.archived,note});setNote("");}catch(e){setError(e instanceof Error?e.message:"Action impossible.");}}
 return <section className="record-attachments" aria-label="Pièces jointes privées"><div className="attachment-heading"><div><h3><Paperclip size={17}/>Pièces jointes privées</h3><p><LockKeyhole size={13}/>L’accès suit les droits de ce dossier, y compris pour les anciennes versions.</p></div><button className="btn outline small" type="button" disabled={busy} onClick={()=>{setArchived(v=>!v);setPage(1);setUpload(null);setLink(false);}}>{archived?"Voir les pièces actives":"Voir les archives"}</button></div>
 <p className="finance-note">{visibility[targetType]}</p>{error&&<p className="form-error-box" role="alert">{error}<button className="btn outline small" type="button" onClick={refresh}>Réessayer</button></p>}
 {loading?<RPilotSkeleton lines={2}/>:data&&<>
  {data.writable&&<><div className="form-actions"><button className="btn outline small" type="button" disabled={busy} onClick={()=>{setUpload("new");setLink(false);}}>Ajouter depuis mon ordinateur</button>{c?.permissions.includes("documents.manage")&&<button className="btn outline small" type="button" disabled={busy} onClick={()=>{setLink(true);setUpload(null);}}>Rattacher un document privé existant</button>}</div><label className="form-field"><span>Motif d’archivage ou de restauration (3 caractères minimum)</span><RPilotInput value={note} onChange={e=>setNote(e.target.value)} minLength={3} maxLength={500} placeholder="Pourquoi conserver cette pièce dans les archives ?" disabled={busy}/></label></>}
  {!data.writable&&<p className="finance-note">Pièces en lecture seule : votre rôle ou l’état du dossier ne permet pas leur modification.</p>}
  {upload&&data.writable&&<AttachmentUpload key={upload==="new"?"new":`${upload.id}:${upload.revision}`} target={target} doc={upload==="new"?undefined:upload} disabled={busy} onPending={setBusy} done={()=>{setUpload(null);refresh();}}/>}
  {link&&data.writable&&<LinkPrivateDocument companyId={target.companyId} disabled={busy} submit={async(doc,versionId)=>{await command({action:"link",sourceId:doc.id,versionId,name:doc.name,note:"Copie privée rattachée depuis la bibliothèque"});setLink(false);}}/>}
  <div className="attachment-list">{data.rows.map(doc=><article className="attachment-card" key={doc.id}><div className="attachment-heading"><div><h4><FileText size={16}/>{doc.name}</h4><small>{Math.ceil(doc.size/1024)} Ko · {doc.versions.length} version(s){doc.archived?" · Archivée":""}</small></div><div className="form-actions">{doc.versions[0]&&<a className="btn outline small" href={`/api/documents/file?${new URLSearchParams({companyId:target.companyId,documentId:doc.id,versionId:doc.versions[0].id})}`}><Download size={14}/>Télécharger</a>}{data.writable&&<><button className="btn outline small" type="button" disabled={busy||note.trim().length<3} onClick={()=>void archive(doc)}>{doc.archived?"Restaurer":"Archiver"}</button>{!doc.archived&&<button className="btn outline small" type="button" disabled={busy} onClick={()=>{setUpload(doc);setLink(false);}}>Nouvelle version</button>}</>}</div></div>
   <details><summary>Versions et traçabilité</summary>{doc.versions.map(v=><div className="attachment-version" key={v.id}><a href={`/api/documents/file?${new URLSearchParams({companyId:target.companyId,documentId:doc.id,versionId:v.id})}`}>Version {v.number} · {v.fileName}</a><small>{v.authorName} · {date(v.createdAt)}</small><p>{v.note}</p></div>)}{doc.events.map(e=><p className="finance-note" key={e.id}>{e.action} · {e.actorName} · {date(e.createdAt)} · {e.details}</p>)}<small>Les 10 derniers événements de cette pièce sont affichés ; toutes ses versions restent conservées.</small></details>
  </article>)}</div>{!data.total&&<p className="empty compact">{archived?"Aucune pièce archivée.":"Aucune pièce jointe. Ajoutez un justificatif depuis votre ordinateur."}</p>}<RPilotPagination page={page} pages={Math.ceil(data.total/25)} onPageChange={setPage}/>
 </>}
 </section>;
}
function AttachmentUpload({target,doc,disabled,onPending,done}:{target:AttachmentTarget;doc?:Doc;disabled:boolean;onPending:(v:boolean)=>void;done:()=>void}){
 const [name,setName]=useState(doc?.name??""),[note,setNote]=useState(""),[key]=useState(()=>crypto.randomUUID());const intent=useRef<{fingerprint:string;key:string}|null>(null);
 return <div className="attachment-editor"><h4>{doc?`Nouvelle version · ${doc.name}`:"Déposer une pièce privée"}</h4><label className="form-field"><span>Nom du document</span><RPilotInput value={name} onChange={e=>setName(e.target.value)} maxLength={160} disabled={disabled||!!doc}/></label><label className="form-field"><span>Note sur le justificatif</span><RPilotInput value={note} onChange={e=>setNote(e.target.value)} maxLength={500} disabled={disabled}/></label><RPilotFileUpload accept={[...documentTypes]} disabled={disabled||!name.trim()||note.trim().length<3} onUpload={async(file,signal,progress)=>{
  onPending(true);try{
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("");
   const fields={...target,name,fileName:file.name,note,...(doc?{documentId:doc.id,revision:String(doc.revision)}:{})},fingerprint=JSON.stringify({fields,hash});
   if(intent.current?.fingerprint!==fingerprint)intent.current={fingerprint,key:intent.current?crypto.randomUUID():key};
   const params=new URLSearchParams({...fields,requestKey:intent.current.key});progress(20);
   const r=await fetch(`/api/attachments?${params}`,{method:"POST",headers:{"Content-Type":file.type},body:file,signal});const d=await r.json();if(!r.ok)throw new Error(d.error);progress(100);done();
  }finally{onPending(false);}
 }}/><p className="finance-note">PDF, PNG, JPEG ou texte UTF-8 · 5 Mo par fichier · 100 Mo par entreprise, toutes versions et archives comprises.</p></div>;
}
function LinkPrivateDocument({companyId,disabled,submit}:{companyId:string;disabled:boolean;submit:(doc:Serialized<DocumentsData>["rows"][number],versionId:string)=>Promise<void>}){
 const [q,setQ]=useState(""),[page,setPage]=useState(1),[data,setData]=useState<Serialized<DocumentsData>|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const choosing=useRef(false);const [linking,setLinking]=useState(false);
 useEffect(()=>{const abort=new AbortController();setLoading(true);fetch(`/api/documents?${new URLSearchParams({companyId,q,audience:"MANAGERS",page:String(page)})}`,{cache:"no-store",signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(d=>{if(!abort.signal.aborted)setData(d);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Lecture impossible.");}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[companyId,q,page]);
 return <div className="attachment-editor"><h4>Rattacher une copie privée</h4><p>Une copie de la version choisie sera protégée par ce dossier. L’original conserve ses droits et ses versions dans Documents.</p><RPilotInput aria-label="Rechercher un document privé" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} maxLength={120}/>{error&&<p role="alert">{error}</p>}{loading?<RPilotSkeleton lines={2}/>:data?.rows.map(doc=><div className="attachment-heading" key={doc.id}><span>{doc.name}</span><button className="btn outline small" type="button" disabled={disabled||linking||!doc._count.versions} onClick={async()=>{if(choosing.current)return;choosing.current=true;setLinking(true);setError("");try{const r=await fetch(`/api/documents?${new URLSearchParams({companyId,documentId:doc.id})}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);if(!d.versions?.[0])throw new Error("Aucun fichier enregistré.");await submit(doc,d.versions[0].id);}catch(e){setError(e instanceof Error?e.message:"Rattachement impossible.");}finally{choosing.current=false;setLinking(false);}}}>Rattacher la dernière version</button></div>)}{data&&!data.total&&!loading&&<p>Aucun document privé actif pour cette recherche.</p>}<RPilotPagination page={page} pages={Math.ceil((data?.total??0)/25)} onPageChange={setPage}/></div>;
}
