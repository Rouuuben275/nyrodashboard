"use client";
import {useEffect,useState,type ReactNode} from "react";
import type {Serialized} from "@/domains/core/queries";
import type {PeopleData} from "@/domains/people/queries";
import {peopleKinds} from "@/domains/people/constants";
import {useWorkspace} from "./workspace-context";
import {RPilotInput} from "./ui/input";
import {RPilotTextarea} from "./ui/textarea";
import {RPilotSelect} from "./ui/select";
import {RPilotDatePicker} from "./ui/date-picker";
import {RPilotPagination} from "./ui/primitives";
export type PeopleClientData=Serialized<PeopleData>;
type Template=PeopleClientData["templates"][number];type Campaign=PeopleClientData["campaigns"][number];type Staff=PeopleClientData["staff"][number];
type RecordData=NonNullable<PeopleClientData["selected"]>;
export type PeopleOperation={type:"template";template?:Template}|{type:"campaign";campaign?:Campaign;template?:Template}|{type:"record";template?:Template;campaign?:Campaign}|{type:"transition";decision:"PUBLISH"|"ARCHIVE"|"REVOKE"}|{type:"ack"}|{type:"note"}|{type:"goal";goalKey:string};
export const peopleOperationTitle=(op:PeopleOperation)=>op.type==="template"?"Modèle / type RH":op.type==="campaign"?"Campagne d’évaluation":op.type==="record"?"Préparer le dossier RH":op.type==="ack"?"Accuser lecture":op.type==="note"?"Note RH privée":op.type==="goal"?"Suivre un objectif":op.decision==="PUBLISH"?"Publier à l’employé":op.decision==="ARCHIVE"?"Archiver le dossier":"Révoquer la décision";
export function PeopleField({label,children}:{label:string;children:ReactNode}){return <label className="form-field"><span>{label}</span>{children}</label>;}
type PickerItem=Template|Campaign|Staff;
function labelOf(item:PickerItem){return "characterName" in item?`${item.characterName} · ${item.department}`:item.name;}
function PeoplePicker({kind,view,label,value,onChoose}:{kind:"REVIEW"|"SANCTION";view:"templates"|"campaigns"|"staff";label:string;value:PickerItem|null;onChoose:(value:PickerItem)=>void}){
  const {current:c}=useWorkspace();const [q,setQ]=useState(""),[page,setPage]=useState(1),[items,setItems]=useState<PickerItem[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const params=new URLSearchParams({companyId:c!.company.id,kind,view,q,page:String(page)}).toString();
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{setLoading(true);setError("");fetch(`/api/people?${params}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d as PeopleClientData;}).then(d=>{if(!controller.signal.aborted){setItems(d[view]);setTotal(view==="staff"?d.staffCount:view==="templates"?d.templateCount:d.campaignCount);}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Recherche impossible.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},180);return()=>{controller.abort();clearTimeout(timer);};},[params,view]);
  const options=[...(value&&!items.some(i=>i.id===value.id)?[value]:[]),...items];
  return <div className="people-picker"><PeopleField label={`Rechercher : ${label.toLocaleLowerCase("fr")}`}><RPilotInput value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="Recherche serveur…"/></PeopleField><PeopleField label={label}><RPilotSelect aria-label={label} value={value?.id??""} loading={loading} onValueChange={id=>{const found=options.find(i=>i.id===id);if(found)onChoose(found);}} options={[{value:"",label:"Sélectionner…",disabled:true},...options.map(item=>({value:item.id,label:labelOf(item),disabled:"archived" in item?item.archived:"templateId" in item?item.status!=="OPEN":false}))]}/></PeopleField><RPilotPagination page={page} pages={Math.ceil(total/25)} onPageChange={setPage}/>{error&&<p role="alert" className="form-error-box">{error}</p>}</div>;
}
export function PeopleForm({kind,op,selected,fixedMemberId,onDone,onCancel}:{kind:"REVIEW"|"SANCTION";op:PeopleOperation;selected:RecordData|null;fixedMemberId?:string;onDone:(result:Record<string,unknown>)=>void;onCancel:()=>void}){
  const {mutate,busy,current:c}=useWorkspace();const [error,setError]=useState(""),[requestKey]=useState(()=>crypto.randomUUID());
  const [template,setTemplate]=useState<Template|null>("template" in op?op.template??null:null);
  const [campaign,setCampaign]=useState<Campaign|null>("campaign" in op?op.campaign??null:null);
  const [staff,setStaff]=useState<Staff|null>(null),[source,setSource]=useState<"TEMPLATE"|"CAMPAIGN">(op.type==="record"&&op.campaign?"CAMPAIGN":"TEMPLATE");
  const originalTemplate=op.type==="template"?op.template:undefined;
  const [templateCards,setTemplateCards]=useState(()=>(originalTemplate?.criteria??[]).map(card=>({uiKey:card.key,label:card.label,weight:card.weight})));
  const [goalRows,setGoalRows]=useState(()=>(selected?.goals??[]).map(g=>({uiKey:g.key,key:g.key as string|undefined,title:g.title,due:g.due??""})));
  const cards=selected?.criteria??(source==="CAMPAIGN"?campaign?.criteria:template?.criteria)??[];
  const localDate=(v:string)=>{const d=new Date(v);return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const fixedName=c?.members.find(m=>m.id===fixedMemberId)?.characterName;
  return <form className="workspace-form" onSubmit={async e=>{e.preventDefault();setError("");const f=new FormData(e.currentTarget),value=(key:string)=>String(f.get(key)??"");try{
    let payload:Record<string,unknown>;
    if(op.type==="template")payload={action:"hr.template.save",id:originalTemplate?.id,revision:originalTemplate?.revision,name:value("name"),instructions:value("instructions"),criteria:kind==="REVIEW"?templateCards.map(({label,weight})=>({label,weight})):[],archived:f.has("archived")};
    else if(op.type==="campaign"){
      const base=op.campaign;
      payload={action:"hr.campaign.save",id:base?.id,revision:base?.revision,templateId:base?.templateId??template?.id,name:value("name"),from:value("from"),to:value("to"),status:value("status")};
    }else if(op.type==="record"){
      const memberId=selected?.memberId??fixedMemberId??staff?.id;
      if(!memberId||!selected&&!(source==="CAMPAIGN"?campaign:template))throw new Error("Choisissez l’employé et un modèle ou une campagne.");
      payload={action:"hr.record.save",id:selected?.id,revision:selected?.revision,memberId,templateId:!selected&&source==="TEMPLATE"?template?.id:undefined,campaignId:selected?.campaignId??(source==="CAMPAIGN"?campaign?.id:undefined),title:value("title"),occurredAt:new Date(value("occurredAt")).toISOString(),content:value("content"),conclusion:value("conclusion"),privateNote:value("privateNote"),scores:cards.map(card=>({key:card.key,score:value(`score:${card.key}`)===""?null:Number(value(`score:${card.key}`)),comment:value(`comment:${card.key}`)})),goals:kind==="REVIEW"?goalRows.map(g=>({key:g.key,title:g.title,due:g.due||null})):[]};
    }else{
      if(!selected)throw new Error("Dossier requis.");
      const target={id:selected.id,revision:selected.revision};
      payload=op.type==="transition"?{action:"hr.record.transition",...target,decision:op.decision,reason:value("reason")}:op.type==="ack"?{action:"hr.record.ack",...target,comment:value("comment")}:op.type==="note"?{action:"hr.record.note",...target,note:value("privateNote")}:{action:"hr.goal",...target,goalKey:op.goalKey,status:value("goalStatus"),note:value("reason")};
    }
    onDone(await mutate({...payload,kind,requestKey}));
  }catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}}}>
    {op.type==="template"&&<>
      <PeopleField label="Nom"><RPilotInput name="name" required minLength={3} maxLength={120} defaultValue={originalTemplate?.name}/></PeopleField>
      <PeopleField label="Consignes réservées aux RH"><RPilotTextarea name="instructions" maxLength={2000} defaultValue={originalTemplate?.instructions}/></PeopleField>
      {kind==="REVIEW"&&<><h3>Critères pondérés · notes de 0 à 5</h3>{templateCards.map((card,index)=><div className="people-card" key={card.uiKey}><PeopleField label={`Critère ${index+1}`}><RPilotInput value={card.label} required maxLength={100} onChange={e=>setTemplateCards(rows=>rows.map((r,i)=>i===index?{...r,label:e.target.value}:r))}/></PeopleField><PeopleField label="Poids relatif"><RPilotInput type="number" min={1} max={100} step={1} required value={card.weight} onChange={e=>setTemplateCards(rows=>rows.map((r,i)=>i===index?{...r,weight:Number(e.target.value)}:r))}/></PeopleField><button type="button" className="btn outline small" onClick={()=>setTemplateCards(rows=>rows.filter((_,i)=>i!==index))}>Retirer ce critère</button></div>)}<button type="button" className="btn outline" disabled={templateCards.length>=12} onClick={()=>setTemplateCards(rows=>[...rows,{uiKey:crypto.randomUUID(),label:"",weight:1}])}>Ajouter un critère</button></>}
      <label className="checkbox-label"><RPilotInput name="archived" type="checkbox" defaultChecked={originalTemplate?.archived}/>Archiver ce modèle / type pour les nouvelles saisies</label><p className="finance-note">Les dossiers et campagnes existants conservent leur nom et leurs critères d’origine.</p>
    </>}
    {op.type==="campaign"&&<>
      {!op.campaign&&<PeoplePicker kind="REVIEW" view="templates" label="Modèle d’évaluation" value={template} onChoose={item=>setTemplate(item as Template)}/>}
      {op.campaign&&<p>Modèle figé : {op.campaign.templateName}</p>}
      <PeopleField label="Nom de la campagne"><RPilotInput name="name" required minLength={3} maxLength={120} defaultValue={op.campaign?.name}/></PeopleField>
      <div className="form-grid"><PeopleField label="Du, inclus"><RPilotDatePicker name="from" defaultValue={op.campaign?.from.slice(0,10)} required/></PeopleField><PeopleField label="Au, inclus"><RPilotDatePicker name="to" defaultValue={op.campaign?.to.slice(0,10)} required/></PeopleField></div>
      <PeopleField label="État"><RPilotSelect name="status" defaultValue={op.campaign?.status??"OPEN"} options={[{value:"OPEN",label:"Ouverte"},{value:"CLOSED",label:"Fermée"}]}/></PeopleField><p className="finance-note">Une évaluation par employé et campagne. Dates figées dès le premier dossier ; fermeture conservant les évaluations et objectifs.</p>
    </>}
    {op.type==="record"&&<>
      {selected?<p><strong>{selected.employeeName}</strong> · {selected.templateName}</p>:<>
        {fixedMemberId?<p>Employé : {fixedName??"Employé du dossier ouvert"}</p>:<PeoplePicker kind={kind} view="staff" label="Employé" value={staff} onChoose={item=>setStaff(item as Staff)}/>}
        {kind==="REVIEW"&&<PeopleField label="Source des critères"><RPilotSelect value={source} onValueChange={v=>setSource(v as "TEMPLATE"|"CAMPAIGN")} options={[{value:"TEMPLATE",label:"Évaluation individuelle depuis un modèle"},{value:"CAMPAIGN",label:"Évaluation dans une campagne"}]}/></PeopleField>}
        {source==="CAMPAIGN"?<PeoplePicker kind="REVIEW" view="campaigns" label="Campagne ouverte" value={campaign} onChoose={item=>setCampaign(item as Campaign)}/>:<PeoplePicker kind={kind} view="templates" label={peopleKinds[kind].template} value={template} onChoose={item=>setTemplate(item as Template)}/>}
      </>}
      <PeopleField label="Titre du dossier"><RPilotInput name="title" required minLength={3} maxLength={160} defaultValue={selected?.title}/></PeopleField>
      <PeopleField label={kind==="REVIEW"?"Date et heure de l’entretien RP":"Date et heure des faits RP"}><RPilotInput name="occurredAt" type="datetime-local" required defaultValue={localDate(selected?.occurredAt??new Date().toISOString())}/></PeopleField>
      <PeopleField label="Faits / commentaires visibles après publication"><RPilotTextarea name="content" maxLength={4000} defaultValue={selected?.content}/></PeopleField>
      <PeopleField label={kind==="REVIEW"?"Conclusion et pistes de progression":"Décision RP"}><RPilotTextarea name="conclusion" maxLength={4000} defaultValue={selected?.conclusion}/></PeopleField>
      {cards.map(card=><div className="people-card" key={card.key}><strong>{card.label} · poids {card.weight}</strong><PeopleField label="Note"><RPilotSelect name={`score:${card.key}`} defaultValue={card.score===null?"":String(card.score)} options={[{value:"",label:"À renseigner"},...[0,1,2,3,4,5].map(n=>({value:String(n),label:`${n} / 5`}))]}/></PeopleField><PeopleField label="Commentaire sur le critère"><RPilotTextarea name={`comment:${card.key}`} maxLength={600} defaultValue={card.comment}/></PeopleField></div>)}
      {kind==="REVIEW"&&<><h3>Objectifs</h3>{goalRows.map((goal,index)=><div className="people-card" key={goal.uiKey}><PeopleField label={`Objectif ${index+1}`}><RPilotInput required minLength={3} maxLength={200} value={goal.title} onChange={e=>setGoalRows(rows=>rows.map((r,i)=>i===index?{...r,title:e.target.value}:r))}/></PeopleField><PeopleField label="Échéance facultative"><RPilotDatePicker value={goal.due} onValueChange={due=>setGoalRows(rows=>rows.map((r,i)=>i===index?{...r,due}:r))}/></PeopleField><button type="button" className="btn outline small" onClick={()=>setGoalRows(rows=>rows.filter((_,i)=>i!==index))}>Retirer du brouillon</button></div>)}<button type="button" className="btn outline" disabled={goalRows.length>=10} onClick={()=>setGoalRows(rows=>[...rows,{uiKey:crypto.randomUUID(),key:undefined,title:"",due:""}])}>Ajouter un objectif</button></>}
      <PeopleField label="Note interne RH, jamais publiée à l’employé"><RPilotTextarea name="privateNote" maxLength={4000} defaultValue={selected&&"privateNote" in selected?String(selected.privateNote??""):""}/></PeopleField>
      <p className="finance-note">Enregistrement en brouillon. La publication est distincte, requiert tous les champs et doit être réalisée par un autre responsable pour votre propre dossier. Aucune décision ne change les accès ou la paie.</p>
    </>}
    {op.type==="note"&&<PeopleField label="Note privée aux responsables RH"><RPilotTextarea name="privateNote" maxLength={4000} defaultValue={selected&&"privateNote" in selected?String(selected.privateNote??""):""}/></PeopleField>}
    {op.type==="ack"&&<><p>Cet accusé indique uniquement que vous avez lu le dossier RP. Il ne vaut pas acceptation de la décision.</p><PeopleField label="Votre commentaire facultatif, visible des RH"><RPilotTextarea name="comment" maxLength={1000}/></PeopleField></>}
    {op.type==="goal"&&<><p>{selected?.goals.find(g=>g.key===op.goalKey)?.title}</p><PeopleField label="État de l’objectif"><RPilotSelect name="goalStatus" defaultValue={selected?.goals.find(g=>g.key===op.goalKey)?.status} options={[{value:"OPEN",label:"À poursuivre"},{value:"DONE",label:"Atteint"}]}/></PeopleField></>}
    {(op.type==="transition"||op.type==="goal")&&<><PeopleField label="Motif / suivi visible de l’employé"><RPilotTextarea name="reason" required minLength={3} maxLength={1000}/></PeopleField>{op.type==="transition"&&<p>Le dossier original reste conservé. Aucun changement automatique de grade, d’accès, de statut employé ou de salaire.</p>}</>}
    <label className="checkbox-label"><RPilotInput type="checkbox" required/>Je confirme cette opération sur le dossier RP.</label>
    {error&&<p role="alert" className="form-error-box">{error}</p>}<div className="form-actions"><button type="button" className="btn outline" disabled={busy} onClick={onCancel}>Revenir</button><button className="btn primary" disabled={busy}>{busy?"Enregistrement…":op.type==="record"?"Enregistrer le brouillon":"Confirmer"}</button></div>
  </form>;
}
