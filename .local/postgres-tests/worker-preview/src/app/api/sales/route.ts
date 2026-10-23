import {activeSession} from "@/lib/active-session";
import {AppError} from "@/domains/core/errors";
import {readSales} from "@/domains/sales/queries";
import {billingFailure,billingHeaders} from "@/domains/billing/http";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{const session=await activeSession({headers:req.headers});if(!session)throw new AppError("Connexion requise.",401);return Response.json(await readSales(session.user.id,Object.fromEntries(new URL(req.url).searchParams)),{headers:billingHeaders});}catch(e){return billingFailure(e);}}
