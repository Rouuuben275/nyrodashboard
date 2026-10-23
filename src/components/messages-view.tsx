"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {Archive,ArrowLeft,Check,MessageSquare,Plus,RefreshCw,Send,Users} from "lucide-react";
import type {MessagesData} from "@/domains/messages/queries";
import type {Serialized} from "@/domains/core/queries";
import {useWorkspace} from "./workspace-context";
import {RPilotInput} from "./ui/input";
import {RPilotTextarea} from "./ui/textarea";
import {RPilotSelect} from "./ui/select";
import {RPilotDialog} from "./ui/dialog";
import {RPilotPagination,RPilotSkeleton} from "./ui/primitives";
import "./messages.css";
type Data=Serialized<MessagesData>;
const date=(value:string)=>new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",dateStyle:"short",timeStyle:"short"}).format(new Date(value));
const title=(thread:{kind:string;title:string;participants:{id:string;name:string}[]},viewer:string)=>thread.kind==="PRIVATE"?thread.participants.find(p=>p.id!==viewer)?.name??"Conversation privée":thread.title;
async function read(params:URLSearchParams,signal:AbortSignal){const r=await fetch(`/api/messages?${params}`,{cache:"no-store",signal});const data=await r.json();if(!r.ok)throw new Error(data.error);return data as Data;}
export function MessagesView(){
 const {current}=useWorkspace(),companyId=current!.company.id;
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [q,setQ]=useState(""),[archived,setArchived]=useState("false"),[page,setPage]=useState(1),[threadId,setThreadId]=useState(""),[messagePage,setMessagePage]=useState(1),[search,setSearch]=useState("");
 const [dialog,setDialog]=useState<"new"|"group"|null>(null),[revision,setRevision]=useState(0);
 const command=useRef({signature:"",key:""}),pending=useRef(false);
 const history=useRef<HTMLDivElement>(null),followLatest=useRef(true),lastThread=useRef("");
 useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setRevision(n=>n+1);},20000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);const timer=setTimeout(()=>{
  const params=new URLSearchParams({companyId,q,archived,page:String(page),messagePage:String(messagePage),messageSearch:search,...(threadId?{threadId}:{})});
  read(params,controller.signal).then(d=>{if(!controller.signal.aborted){setData(d);setError("");}}).catch(e=>{if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:"Messagerie indisponible.");}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
 },q||search?250:0);return()=>{clearTimeout(timer);controller.abort();};},[companyId,q,archived,page,threadId,messagePage,search,revision]);
 const selected=data?.selected?.id===threadId?data.selected:null;
 const lastMessageId=data?.messages.at(-1)?.id;
 useEffect(()=>{
  if(!selected){lastThread.current="";return;}
  const changed=lastThread.current!==selected.id;
  if(history.current&&!search&&messagePage===1&&(changed||followLatest.current))history.current.scrollTop=history.current.scrollHeight;
  if(changed)followLatest.current=true;lastThread.current=selected.id;
 },[selected?.id,lastMessageId,messagePage,search]);
 const open=(id:string)=>{setThreadId(id);setMessagePage(1);setSearch("");};
 async function perform(payload:Record<string,unknown>){
  if(pending.current)throw new Error("Une opération est déjà en cours.");pending.current=true;setBusy(true);setError("");
  const body={companyId,...payload},signature=JSON.stringify(body);if(command.current.signature!==signature)command.current={signature,key:crypto.randomUUID()};
  try{const r=await fetch("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,requestKey:command.current.key})});const result=await r.json();if(!r.ok)throw new Error(result.error);command.current={signature:"",key:""};setRevision(n=>n+1);return result as {id:string};}
  catch(e){setError(e instanceof Error?e.message:"Action impossible.");throw e;}finally{pending.current=false;setBusy(false);}
 }
 const filter=(value:string)=>{setArchived(value);setPage(1);};
 return <div className="messages-view">
  <div className="view-heading"><div><p className="eyebrow">ESPACE PRIVÉ DE L’ÉQUIPE</p><h2>Messagerie interne</h2><p>Échangez avec les personnes que vous choisissez, dans votre entreprise.</p></div><div className="form-actions"><button className="btn outline" disabled={busy||loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={15}/>Actualiser</button>{data?.canSend&&<button className="btn primary" disabled={busy} onClick={()=>setDialog("new")}><Plus size={16}/>Nouvelle conversation</button>}</div></div>
  {error&&<p className="form-error-box" role="alert">{error}</p>}
  <div className={`messages-layout ${threadId?"has-thread":""}`} aria-busy={loading}>
   <aside className="panel messages-inbox" aria-label="Conversations">
    <div className="messages-inbox-head"><div className="messages-between"><h3>Conversations</h3><span className="badge neutral">{data?.unread??0} non lu{data?.unread===1?"":"s"}</span></div><RPilotInput aria-label="Rechercher des conversations" placeholder="Nom, groupe ou message…" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/><RPilotSelect aria-label="État des conversations" value={archived} onValueChange={filter} options={[{value:"false",label:"Boîte de réception"},{value:"true",label:"Mes archives"}]}/></div>
    {loading&&!data?<RPilotSkeleton lines={5}/>:<div className="messages-threads">{data?.rows.map(row=><button key={row.id} className={`messages-thread ${threadId===row.id?"selected":""}`} aria-current={threadId===row.id?"true":undefined} onClick={()=>open(row.id)}><span className="messages-avatar">{row.kind==="GROUP"?<Users size={19}/>:<MessageSquare size={19}/>}</span><span className="messages-thread-copy"><strong>{title(row,data.viewerId)}</strong><small>{row.kind==="GROUP"?`${row.participants.length} participants` :"Conversation privée"} · {date(row.updatedAt)}</small></span>{row.unread>0&&<span className="messages-count" aria-label={`${row.unread} messages non lus`}>{row.unread}</span>}</button>)}{!data?.rows.length&&<p className="empty compact">Aucune conversation dans cette sélection.</p>}</div>}
    {data&&<RPilotPagination page={page} pages={Math.ceil(data.total/25)} onPageChange={setPage}/>}
   </aside>
   <section className="panel messages-discussion" aria-label="Discussion">
    {!selected?<div className="messages-welcome"><span className="messages-welcome-icon"><MessageSquare size={30}/></span><h3>Une conversation, les bonnes personnes.</h3><p>Ouvrez un échange ou créez un groupe pour votre équipe. Seuls ses participants peuvent le consulter.</p><small>La Direction ne dispose pas d’un accès global aux conversations.</small></div>:<>
     <header className="messages-discussion-head"><button className="btn ghost small messages-back" aria-label="Retour aux conversations" onClick={()=>open("")}><ArrowLeft size={17}/></button><div><h3>{title(selected,data!.viewerId)}</h3><p>{selected.participants.map(p=>`${p.name}${p.status!=="ACTIVE"?" (emploi inactif)":""}`).join(" · ")}</p></div><div className="form-actions">{data!.canSend&&selected.kind==="GROUP"&&selected.ownerMemberId===data!.viewerId&&<button className="btn outline small" disabled={busy||loading} onClick={()=>setDialog("group")}><Users size={14}/>Gérer le groupe</button>}<button className="btn outline small" disabled={busy||loading} onClick={()=>void perform({action:"archive",threadId:selected.id,archived:!selected.archived}).then(()=>open("")).catch(()=>{})}><Archive size={14}/>{selected.archived?"Restaurer":"Archiver pour moi"}</button></div></header>
     <div className="messages-search"><RPilotInput aria-label="Rechercher dans la discussion" value={search} placeholder="Rechercher dans cet historique…" onChange={e=>{setSearch(e.target.value);setMessagePage(1);}}/>{!search&&messagePage===1&&selected.lastReadSequence<selected.lastSequence&&<button className="btn ghost small" disabled={busy||loading} onClick={()=>void perform({action:"read",threadId:selected.id,through:selected.lastSequence}).catch(()=>{})}><Check size={14}/>Marquer comme lu</button>}</div>
     <div ref={history} className="messages-history" aria-label="Historique des messages" onScroll={e=>{const el=e.currentTarget;followLatest.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>{data!.messages.map(message=><article key={message.id} className={`messages-bubble ${message.senderMemberId===data!.viewerId?"mine":""}`}><div><strong>{message.senderName}</strong><time dateTime={message.createdAt}>{date(message.createdAt)}</time></div><p>{message.body}</p></article>)}{!data!.messages.length&&<p className="empty compact">{search?"Aucun message correspondant.":"Commencez la conversation."}</p>}</div>
     <div className="messages-history-pages"><small>{data!.messageCount} message{data!.messageCount===1?"":"s"} · page 1 : les plus récents</small><RPilotPagination page={messagePage} pages={Math.ceil(data!.messageCount/25)} onPageChange={setMessagePage}/></div>
     {data!.canSend?<MessageComposer key={selected.id} busy={busy||loading} onSend={async body=>{await perform({action:"send",threadId:selected.id,body});setMessagePage(1);setSearch("");}}/>:<p className="finance-note">Votre grade permet la lecture. La permission Envoyer des messages est nécessaire pour répondre.</p>}
    </>}
   </section>
  </div>
  <p className="finance-note">Actualisation toutes les 20 secondes lorsque cette page est visible. L’archivage est personnel ; un nouveau message replace l’échange dans les boîtes de réception. Les messages sont conservés, sans modification ni suppression depuis cette interface.</p>
  <RPilotDialog open={dialog!==null} onOpenChange={v=>{if(!v)setDialog(null);}} title={dialog==="group"?"Gérer le groupe":"Nouvelle conversation"} description="Participants de cette entreprise disposant de la lecture de la messagerie." preventClose={busy}>
   {dialog&&data&&<ConversationForm key={`${dialog}:${dialog==="group"?selected?.id:"new"}`} companyId={companyId} viewerId={data.viewerId} thread={dialog==="group"?selected??null:null} busy={busy} error={error} onSave={async payload=>{const result=await perform(payload);setDialog(null);setArchived("false");setQ("");setPage(1);open(result.id);}}/>}
  </RPilotDialog>
 </div>;
}
function MessageComposer({busy,onSend}:{busy:boolean;onSend:(body:string)=>Promise<void>}){
 const [body,setBody]=useState(""),lock=useRef(false);
 async function submit(e:FormEvent){e.preventDefault();if(lock.current||!body.trim())return;lock.current=true;try{await onSend(body.trim());setBody("");}catch{}finally{lock.current=false;}}
 return <form className="messages-composer" onSubmit={submit}><label htmlFor="message-body">Votre message</label><RPilotTextarea id="message-body" value={body} disabled={busy} onChange={e=>setBody(e.target.value)} placeholder="Écrivez votre message…" maxLength={4000} required/><div className="messages-between"><small>{body.length}/4 000 · texte uniquement</small><button className="btn primary" type="submit" disabled={busy||!body.trim()}><Send size={15}/>Envoyer</button></div></form>;
}
function ConversationForm({companyId,viewerId,thread,busy,error,onSave}:{companyId:string;viewerId:string;thread:Data["selected"];busy:boolean;error:string;onSave:(payload:Record<string,unknown>)=>Promise<void>}){
 const [kind,setKind]=useState(thread?.kind??"PRIVATE"),[name,setName]=useState(thread?.title??""),[members,setMembers]=useState(thread?.participants.filter(p=>p.id!==viewerId).map(p=>({id:p.id,name:p.name}))??[]);
 const [baseRevision]=useState(thread?.revision);
 const [q,setQ]=useState(""),[page,setPage]=useState(1),[data,setData]=useState<Data|null>(null),[loadError,setLoadError]=useState(""),[loading,setLoading]=useState(true),lock=useRef(false);
 useEffect(()=>{const controller=new AbortController();setLoading(true);const timer=setTimeout(()=>{read(new URLSearchParams({companyId,view:"staff",q,page:String(page)}),controller.signal).then(d=>{if(!controller.signal.aborted){setData(d);setLoadError("");}}).catch(e=>{if(!controller.signal.aborted){setData(null);setLoadError(e instanceof Error?e.message:"Participants indisponibles.");}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);return()=>{clearTimeout(timer);controller.abort();};},[companyId,q,page]);
 return <form className="workspace-form" onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;try{await onSave({action:thread?"group":"create",...(thread?{threadId:thread.id,revision:baseRevision}:{kind}),title:name,memberIds:members.map(p=>p.id)});}catch{}finally{lock.current=false;}}}>
  {!thread&&<label>Type d’échange<RPilotSelect aria-label="Type de conversation" value={kind} disabled={busy} onValueChange={v=>{setKind(v);if(v==="PRIVATE")setMembers(m=>m.slice(0,1));}} options={[{value:"PRIVATE",label:"Conversation privée · 2 personnes"},{value:"GROUP",label:"Groupe · 25 personnes maximum"}]}/></label>}
  {kind==="GROUP"&&<label>Nom du groupe<RPilotInput aria-label="Nom du groupe" value={name} onChange={e=>setName(e.target.value)} maxLength={100} required disabled={busy}/></label>}
  <p className="finance-note">Vous participez automatiquement. Un membre ajouté à un groupe peut consulter tout son historique. Un membre retiré perd accès à cet historique.</p>
  <div className="messages-chips" aria-label="Participants sélectionnés">{members.map(p=><button className="btn outline small" key={p.id} type="button" disabled={busy} aria-label={`Retirer ${p.name}`} onClick={()=>setMembers(m=>m.filter(i=>i.id!==p.id))}>{p.name} ×</button>)}{!members.length&&<small>Sélectionnez {kind==="PRIVATE"?"une personne":"au moins une personne"}.</small>}</div>
  <RPilotInput aria-label="Rechercher un participant" value={q} placeholder="Nom RP d’un participant…" disabled={busy} onChange={e=>{setQ(e.target.value);setPage(1);}}/>
  {loadError&&<p className="form-error-box" role="alert">{loadError}</p>}
  <div className="messages-picker" aria-busy={loading}>{data?.staff.map(person=><label className="checkbox-label" key={person.id}><RPilotInput type="checkbox" checked={members.some(m=>m.id===person.id)} disabled={busy||loading||(!members.some(m=>m.id===person.id)&&kind==="GROUP"&&members.length>=24)} onChange={e=>setMembers(m=>e.target.checked?(kind==="PRIVATE"?[{id:person.id,name:person.characterName}]:[...m,{id:person.id,name:person.characterName}]):m.filter(i=>i.id!==person.id))}/><span>{person.characterName}<small>{person.department}</small></span></label>)}{loading&&!data?<RPilotSkeleton lines={3}/>:!data?.staff.length&&<p className="empty compact">Aucun participant autorisé trouvé.</p>}</div>
  {data&&<RPilotPagination page={page} pages={Math.ceil(data.staffCount/25)} onPageChange={setPage}/>}
  {error&&<p className="form-error-box" role="alert">{error}</p>}
  <button className="btn primary" type="submit" disabled={busy||!members.length||(kind==="GROUP"&&!name.trim())}>{thread?"Enregistrer le groupe":"Ouvrir la conversation"}</button>
 </form>;
}
