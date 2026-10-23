"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {Toaster} from "sonner";
import {isTheme,resolveTheme,themeStorageKey,watchSystemTheme,type ThemePreference} from "@/lib/theme";
type ThemeContextValue={preference:ThemePreference;resolved:"dark"|"light";change:(value:ThemePreference)=>void;saving:boolean;error:string};
const ThemeContext=createContext<ThemeContextValue|null>(null);
export function ThemeProvider({children}:{children:ReactNode}){
 const [preference,setPreference]=useState<ThemePreference>("system"),[resolved,setResolved]=useState<"dark"|"light">("dark"),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const current=useRef<ThemePreference>("system"),changes=useRef(0),authenticated=useRef(false),queue=useRef(Promise.resolve()),pending=useRef(0);
 const apply=useCallback((value:ThemePreference,store=true)=>{current.current=value;setPreference(value);const mode=resolveTheme(value,typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches);setResolved(mode);document.documentElement.dataset.theme=mode;document.documentElement.dataset.themePreference=value;document.documentElement.style.colorScheme=mode;if(store)try{localStorage.setItem(themeStorageKey,value);}catch{/* Blocked storage leaves this tab usable. */}},[]);
 const persist=useCallback((theme:ThemePreference,initialize=false)=>{
  pending.current++;setSaving(true);setError("");
  queue.current=queue.current.then(async()=>{try{
   const response=await fetch("/api/profile/theme",{method:"PATCH",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({theme,initialize})});
   if(response.status===401){authenticated.current=false;setError("Session expirée. Votre choix reste conservé sur cet appareil.");return;}const result=await response.json();if(!response.ok)throw new Error(result.error);
   if(initialize&&current.current===theme&&isTheme(result.themePreference))apply(result.themePreference);
  }catch{setError("Apparence appliquée sur cet appareil. La sauvegarde du compte a échoué ; sélectionnez à nouveau votre choix pour réessayer.");}finally{pending.current--;setSaving(pending.current>0);}});
 },[apply]);
 const change=useCallback((value:ThemePreference)=>{changes.current++;setError("");apply(value);if(authenticated.current)persist(value);},[apply,persist]);
 useEffect(()=>{
  let local:ThemePreference="system";try{const value=localStorage.getItem(themeStorageKey);if(isTheme(value))local=value;}catch{}apply(local,false);
  const media=typeof matchMedia==="function"?matchMedia("(prefers-color-scheme: dark)"):null;
  const unwatch=watchSystemTheme(()=>current.current,()=>apply("system",false),media);
  const storage=(e:StorageEvent)=>{if(e.key===themeStorageKey)apply(isTheme(e.newValue)?e.newValue:"system",false);};window.addEventListener("storage",storage);
  const controller=new AbortController();
  fetch("/api/profile/theme",{cache:"no-store",signal:controller.signal}).then(async r=>{if(r.status===401)return;if(!r.ok)throw new Error("Synchronization failed");const data=await r.json();if(controller.signal.aborted)return;authenticated.current=true;if(changes.current>0)persist(current.current);else if(isTheme(data.themePreference))apply(data.themePreference);else persist(current.current,true);}).catch(()=>{if(!controller.signal.aborted)setError("Préférence du compte indisponible. L’apparence locale reste active.");});
  return()=>{controller.abort();unwatch();window.removeEventListener("storage",storage);};
 },[apply,persist]);
 return <ThemeContext.Provider value={{preference,resolved,change,saving,error}}>{children}{error&&<p className="nyro-theme-notice" role="status">{error}</p>}<Toaster theme={resolved} position="bottom-right" closeButton/></ThemeContext.Provider>;
}
export function useTheme(){const context=useContext(ThemeContext);if(!context)throw new Error("ThemeProvider requis.");return context;}
