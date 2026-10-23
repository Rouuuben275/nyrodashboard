"use client";
import {ArrowUpRight,Building2,Globe2} from "lucide-react";
import {EntityLogo} from "./entity-logo";
import "./company-cards.css";
export type CompanyChoice={id:string;name:string;sector:string;serverId:string|null;role:string;isOwner:boolean;logoUrl?:string;logoAssetId?:string|null};
export function CompanyCard({company:c,serverName,current=false,onOpen}:{company:CompanyChoice;serverName?:string;current?:boolean;onOpen?:()=>void}){
 const href=`/app?company=${encodeURIComponent(c.id)}&space=${encodeURIComponent(c.serverId??"independent")}`;
 const body=<><div className="choice-card-top"><EntityLogo name={c.name} logoAssetId={c.logoAssetId} logoUrl={c.logoUrl}/><span className="choice-role">{c.role}</span></div><div className="choice-card-copy"><span className="choice-sector">{c.sector}</span><h3>{c.name}</h3><span className="choice-affiliation">{c.serverId?<Globe2 size={13}/>:<Building2 size={13}/>}<span>{serverName??(c.serverId?"Communauté RP":"Entreprise indépendante")}</span></span></div><div className="choice-card-footer"><span>{current?"Entreprise actuelle":"Ouvrir le dashboard"}</span><ArrowUpRight size={17}/></div></>;
 return onOpen?<button type="button" className={`company-choice-card ${current?"is-current":""}`} onClick={onOpen}>{body}</button>:<a className="company-choice-card" href={href}>{body}</a>;
}
