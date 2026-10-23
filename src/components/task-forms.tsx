"use client";
import {useEffect,useState,type ReactNode} from "react";
import type {Serialized} from "@/domains/core/queries";
import type {TasksData} from "@/domains/tasks/queries";
import {useWorkspace} from "./workspace-context";
import {RPilotInput} from "./ui/input";
import {RPilotTextarea} from "./ui/textarea";
import {RPilotSelect} from "./ui/select";
import {RPilotPagination} from "./ui/primitives";
export type TaskClientData=Serialized<TasksData>;
export type TaskDetail=NonNullable<TaskClientData["selected"]>;
export type TaskOp={type:"edit"}|{type:"status"}|{type:"archive"}|{type:"column";column?:TaskClientData["statusRows"][number]};
export function TaskField({label,children}:{label:string;children:ReactNode}){return <label className="form-field"><span>{label}</span>{children}</label>;}
function AssigneePicker({value,onChange}:{value:{id:string;characterName:string}|null;onChange:(v:{id:string;characterName:string}|null)=>void}){
  const {current:c}=useWorkspace();const [q,setQ]=useState(""),[page,setPage]=useState(1),[rows,setRows]=useState<TaskClientData["staff"]>([]),[total,setTotal]=useState(0),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  const params=new URLSearchParams({companyId:c!.company.id,view:"staff",q,page:String(page)}).toString();
  useEffect(()=>{const controller=new AbortController();setLoading(true);const timer=setTimeout(()=>{fetch(`/api/tasks?${params}`,{cache:"no-store",signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d as TaskClientData;}).then(d=>{if(!controller.signal.aborted){setRows(d.staff);setTotal(d.staffCount);setError("");}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Recherche impossible.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},180);return()=>{controller.abort();clearTimeout(timer);};},[params]);
  const choices=[...(value&&!rows.some(r=>r.id===value.id)?[value]:[]),...rows];
  return <section className="task-assignee"><TaskField label="Rechercher un employé"><RPilotInput value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></TaskField><TaskField label="Employé assigné"><RPilotSelect value={value?.id??""} loading={loading} onValueChange={v=>onChange(choices.find(r=>r.id===v)??null)} options={[{value:"",label:"Non assignée"},...choices.map(r=>({value:r.id,label:r.characterName}))]}/></TaskField><RPilotPagination page={page} pages={Math.ceil(total/25)} onPageChange={setPage}/>{error&&<p className="form-error-box" role="alert">{error}</p>}</section>;
}
const localDate=(v:string|null|undefined)=>{if(!v)return "";const d=new Date(v);return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export function TaskForm({op,selected,columns,onDone,onCancel}:{op:TaskOp;selected:TaskDetail|null;columns:TaskClientData["columns"];onDone:(r:Record<string,unknown>)=>void;onCancel:()=>void}){
  const {mutate,busy}=useWorkspace();const [error,setError]=useState(""),[requestKey]=useState(()=>crypto.randomUUID());
  const [assignee,setAssignee]=useState<{id:string;characterName:string}|null>(selected?.assignee??null);
  const [items,setItems]=useState(()=>(selected?.checklist??[]).map(item=>({key:item.id,id:item.id as string|undefined,title:item.title})));
  const column=op.type==="column"?op.column:undefined;
  return <form className="workspace-form" onSubmit={async e=>{e.preventDefault();setError("");const form=new FormData(e.currentTarget),v=(k:string)=>String(form.get(k)??"");try{
    let payload:Record<string,unknown>;
    if(op.type==="edit"){
      const data={title:v("title"),description:v("description"),priority:v("priority"),dueAt:v("dueAt")?new Date(v("dueAt")).toISOString():null,assigneeId:assignee?.id??null};
      payload=selected?{action:"task.update",taskId:selected.id,revision:selected.revision,...data,checklist:items.map(i=>({id:i.id,title:i.title}))}:{action:"task.create",...data,checklist:items.map(i=>i.title)};
    }else if(op.type==="column")payload={action:"task.column",id:column?.id,revision:column?.revision,name:v("name"),position:Number(v("position")),archived:form.has("archived")};
    else{if(!selected)throw new Error("Tâche requise.");payload={taskId:selected.id,revision:selected.revision,...(op.type==="status"?{action:"task.status",status:v("status")}:{action:"task.archive",archived:!selected.archived,reason:v("reason")})};}
    onDone(await mutate({...payload,requestKey},"Tâche enregistrée"));
  }catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}}}>
    {op.type==="edit"&&<><TaskField label="Titre"><RPilotInput name="title" required maxLength={160} defaultValue={selected?.title??""}/></TaskField><TaskField label="Description"><RPilotTextarea name="description" maxLength={4000} defaultValue={selected?.description??""}/></TaskField><div className="form-grid"><TaskField label="Priorité"><RPilotSelect name="priority" defaultValue={selected?.priority??"NORMAL"} options={[{value:"NORMAL",label:"Normale"},{value:"HIGH",label:"Haute"}]}/></TaskField><TaskField label="Échéance facultative"><RPilotInput name="dueAt" aria-label="Échéance facultative" type="datetime-local" defaultValue={localDate(selected?.dueAt)}/></TaskField></div><AssigneePicker value={assignee} onChange={setAssignee}/><h3>Checklist · 20 étapes maximum</h3>{items.map((item,index)=><div className="task-check-edit" key={item.key}><TaskField label={`Étape ${index+1}`}><RPilotInput required maxLength={200} value={item.title} onChange={e=>setItems(old=>old.map(i=>i.key===item.key?{...i,title:e.target.value}:i))}/></TaskField><button type="button" className="btn outline small" onClick={()=>setItems(old=>old.filter(i=>i.key!==item.key))}>Retirer l’étape {index+1}</button></div>)}<button className="btn outline small" type="button" disabled={items.length>=20} onClick={()=>setItems(old=>[...old,{key:crypto.randomUUID(),id:undefined,title:""}])}>Ajouter une étape</button><p className="finance-note">Une checklist doit être entièrement cochée avant de terminer la tâche. Les modifications restent dans l’historique.</p></>}
    {op.type==="status"&&<TaskField label="Nouvel état"><RPilotSelect name="status" defaultValue={selected?.status??"TODO"} options={columns.filter(c=>!c.archived).map(c=>({value:c.id,label:c.name}))}/></TaskField>}
    {op.type==="archive"&&<><p>L’original, les commentaires et l’historique restent conservés. {selected?.archived?"La tâche sera réaffichée dans sa colonne.":"La tâche quittera les listes actives."}</p><TaskField label="Motif"><RPilotTextarea name="reason" required minLength={3} maxLength={500}/></TaskField></>}
    {op.type==="column"&&<><TaskField label="Nom du statut"><RPilotInput name="name" required minLength={2} maxLength={60} defaultValue={column?.name??""}/></TaskField><TaskField label="Ordre après En cours"><RPilotInput name="position" type="number" min={0} max={100} required defaultValue={column?.position??0}/></TaskField><label className="checkbox-label"><RPilotInput name="archived" type="checkbox" defaultChecked={column?.archived??false}/>Archiver ce statut</label><p className="finance-note">Dix statuts personnalisés actifs maximum. Déplacez ses tâches actives avant d’archiver une colonne. Les états À faire, En cours et Terminées restent disponibles.</p></>}
    {error&&<p className="form-error-box" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="btn outline" disabled={busy} onClick={onCancel}>Revenir</button><button type="submit" className="btn primary" disabled={busy}>{busy?"Enregistrement…":"Enregistrer"}</button></div>
  </form>;
}
