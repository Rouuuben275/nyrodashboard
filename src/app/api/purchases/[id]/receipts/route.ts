import {activeSession} from "@/lib/active-session";
import {z,ZodError} from "zod";
import {auth} from "@/lib/auth";
import {AppError} from "@/domains/core/errors";
import {readReceipts} from "@/domains/purchasing/queries";
const query=z.object({companyId:z.string().min(1).max(100),page:z.coerce.number().int().min(1).max(100000).default(1)});
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const session=await activeSession({headers:req.headers});
    if(!session)return Response.json({error:"Connexion requise."},{status:401});
    const {id}=await params;
    const q=query.parse(Object.fromEntries(new URL(req.url).searchParams));
    if(id.length>100)throw new AppError("Commande introuvable.",404);
    return Response.json(await readReceipts(session.user.id,q.companyId,id,q.page),{headers:{"Cache-Control":"private, no-store"}});
  } catch(e) {
    if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});
    if(e instanceof ZodError)return Response.json({error:"Filtres invalides."},{status:400});
    console.error("Purchase receipts read failed",e instanceof Error?e.message:"Unknown");
    return Response.json({error:"Chargement des réceptions impossible."},{status:500});
  }
}
