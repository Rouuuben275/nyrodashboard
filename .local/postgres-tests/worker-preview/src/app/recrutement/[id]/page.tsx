import {PublicRecruitment} from "@/components/recruitment-public";
export const dynamic="force-dynamic";
export const metadata={title:"Offre de recrutement RP — Nyro Dashboard"};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PublicRecruitment jobId={id}/>;}
