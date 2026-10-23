import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {activeSession} from "@/lib/active-session";
import {readSpaces} from "@/domains/platform/spaces";
import {SpacesDashboard} from "@/components/spaces-dashboard";
import "@/components/platform.css";
export const dynamic="force-dynamic";
export const metadata={title:"Choisissez votre espace RP — Nyro Dashboard",robots:{index:false,follow:false}};
export default async function Page(){
  const session=await activeSession({headers:await headers()});if(!session)redirect("/login");const data=await readSpaces(session.user.id);
  return <SpacesDashboard data={data} name={session.user.name}/>;
}
