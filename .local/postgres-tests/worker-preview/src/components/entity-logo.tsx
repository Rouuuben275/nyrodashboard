"use client";
import {useState} from "react";
import {logoHref} from "@/lib/logo";
import {initials} from "@/lib/utils";
import "./entity-logo.css";
export function EntityLogo({name,logoAssetId,logoUrl,className=""}:{name:string;logoAssetId?:string|null;logoUrl?:string|null;className?:string}){
 const src=logoHref({logoAssetId,logoUrl}),[failed,setFailed]=useState("");
 return <span className={`entity-logo ${className}`} aria-hidden="true">{src&&failed!==src?<img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:<span>{initials(name)||"RP"}</span>}</span>;
}
