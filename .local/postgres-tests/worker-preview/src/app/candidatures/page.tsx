import {activeSession} from "@/lib/active-session";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/lib/auth";
import {loginHref} from "@/lib/routes";
import {MyApplications} from "@/components/recruitment-public";
export const dynamic="force-dynamic";
export const metadata={title:"Mes candidatures RP — Nyro Dashboard",robots:{index:false,follow:false}};
export default async function Page(){const session=await activeSession({headers:await headers()});if(!session)redirect(loginHref(undefined,"/candidatures"));return <MyApplications/>;}
