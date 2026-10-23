import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {activeSession} from "@/lib/active-session";
import {SlotsApp} from "@/components/slots-app";
export const dynamic="force-dynamic";
export const metadata={title:"Mes slots d’entreprise — Nyro Dashboard",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{result?:string}>}){
  if(!await activeSession({headers:await headers()}))redirect("/login?returnTo=%2Fcompte%2Fslots");
  const {result}=await searchParams;return <SlotsApp result={result==="success"||result==="cancel"?result:undefined}/>;
}
