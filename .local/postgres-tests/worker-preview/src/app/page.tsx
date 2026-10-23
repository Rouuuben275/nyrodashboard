import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing-page";
import { workspaceHref } from "@/lib/routes";
import {publicMetadata} from "@/lib/public-metadata";
export const metadata=publicMetadata("Pilotez votre entreprise RP","Employés, planning, ventes, stocks et finances dans un seul espace. Découvrez Nyro Dashboard et ses guides, sans script FiveM obligatoire.","/");

export default async function Home({ searchParams }: { searchParams: Promise<{ company?: string; invite?: string }> }) {
  const params = await searchParams;
  // Preserve invitation and company links issued before the public homepage.
  if (params.invite || params.company) redirect(workspaceHref(params));
  return <LandingPage/>;
}
