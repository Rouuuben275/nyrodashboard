import type {Metadata} from "next";
// Public canonical origin only. Never derive this from database credentials.
export const publicOrigin="https://rpilot.rpilot.workers.dev";
export function publicMetadata(title:string,description:string,pathname:string):Metadata{return {title:`${title} — Nyro Dashboard`,description,alternates:{canonical:`${publicOrigin}${pathname}`},openGraph:{title:`${title} — Nyro Dashboard`,description,url:`${publicOrigin}${pathname}`,siteName:"Nyro Dashboard",images:[{url:`${publicOrigin}/branding/nyro-logo-stacked.png`,width:1254,height:1254,alt:"Nyro Dashboard"}],locale:"fr_FR",type:"website"},robots:{index:true,follow:true}};}
