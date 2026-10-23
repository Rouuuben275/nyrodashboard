import {DocsShell} from "@/components/docs/shell";
import "@/components/public/public.css";
import "@/components/docs/docs.css";
export default function Layout({children}:{children:React.ReactNode}){return <DocsShell>{children}</DocsShell>;}
