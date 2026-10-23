"use client";
import {useEffect,useRef,useState} from "react";
import {Trash2} from "lucide-react";
import {RPilotFileUpload} from "./ui/file-upload";
import {RPilotInput} from "./ui/input";
import {RPilotTabs} from "./ui/primitives";
import {EntityLogo} from "./entity-logo";
import {prepareLogo} from "@/lib/prepare-logo";
type Props={purpose:"company"|"server";entityId?:string;name?:string;initialAssetId?:string|null;initialUrl?:string;disabled?:boolean;onPendingChange?:(pending:boolean)=>void};
export function LogoPicker({purpose,entityId,name="Votre logo",initialAssetId,initialUrl="",disabled,onPendingChange}:Props){
 const [assetId,setAssetId]=useState(initialAssetId??null),[url,setUrl]=useState(initialUrl),[source,setSource]=useState(initialUrl&&!initialAssetId?"link":"file"),[pending,setPending]=useState(false),[generation,setGeneration]=useState(0);
 const draft=useRef<string|null>(null);
 const discard=(id:string)=>{void fetch(`/api/logos/${id}`,{method:"DELETE",keepalive:true}).catch(()=>{});};
 useEffect(()=>()=>{if(draft.current)discard(draft.current);},[]);
 function pendingChanged(v:boolean){setPending(v);onPendingChange?.(v);}
 function clear(){if(draft.current)discard(draft.current);draft.current=null;setAssetId(null);setUrl("");pendingChanged(false);setGeneration(v=>v+1);}
 async function upload(file:File,signal:AbortSignal,progress:(n:number)=>void){
  progress(10);const body=await prepareLogo(file,signal);progress(45);
  const params=new URLSearchParams({purpose,...(entityId?{entityId}:{})}),r=await fetch(`/api/logos?${params}`,{method:"POST",headers:{"Content-Type":"image/png"},body,signal});
  const result=await r.json();if(!r.ok)throw new Error(result.error||"Import du logo impossible.");
  if(signal.aborted){discard(result.id);return;}if(draft.current)discard(draft.current);draft.current=result.id;setAssetId(result.id);setSource("file");setUrl("");progress(95);
 }
 return <section className="logo-picker" aria-label="Logo"><div className="logo-picker-heading"><EntityLogo name={name} logoAssetId={source==="file"?assetId:null} logoUrl={source==="link"?url:""}/><div><strong>Logo {purpose==="company"?"de l’entreprise":"du serveur"}</strong><p>Importez une image du PC ou utilisez un lien. Le changement est enregistré avec le formulaire.</p></div></div><input type="hidden" name="logoAssetId" value={source==="file"?assetId??"":""}/><input type="hidden" name="logoUrl" value={source==="link"?url:""}/>
 <RPilotTabs aria-label="Source du logo" value={source} onValueChange={setSource} tabs={[
  {value:"file",label:"Depuis mon PC",disabled:disabled||pending,content:<RPilotFileUpload key={generation} accept={["image/png","image/jpeg","image/webp"]} maxBytes={8*1024*1024} autoUpload onPendingChange={pendingChanged} onRemove={clear} onUpload={upload} disabled={disabled}/>},
  {value:"link",label:"Lien HTTPS",disabled:disabled||pending,content:<label className="form-field"><span>Adresse du logo</span><RPilotInput type="url" value={url} onChange={e=>setUrl(e.target.value)} maxLength={2000} placeholder="https://…" disabled={disabled}/></label>},
 ]}/><div className="logo-picker-actions"><p>{pending?"Préparation et transfert du logo…":"PNG, JPEG ou WebP · 8 Mo maximum avant préparation."}</p>{(assetId||url)&&<button type="button" className="text-link" onClick={clear} disabled={disabled||pending}><Trash2 size={13}/>Retirer le logo</button>}</div></section>;
}
