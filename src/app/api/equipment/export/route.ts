export const runtime="nodejs";
import {activeSession} from "@/lib/active-session";
import {AppError} from "@/domains/core/errors";
import {billingFailure} from "@/domains/billing/http";
import {readEquipment} from "@/domains/equipment/queries";
import {privateReport} from "@/domains/utilities/export";
export const dynamic="force-dynamic";
const states:Record<string,string>={READY:"Disponible",MAINTENANCE:"En entretien",OUT_OF_SERVICE:"Hors service"};
export async function GET(req:Request){try{
 const s=await activeSession({headers:req.headers});if(!s)throw new AppError("Connexion requise.",401);const params=new URL(req.url).searchParams,format=params.get("format")??"csv";if(!["pdf","csv"].includes(format))throw new AppError("Format invalide.");params.delete("format");const max=format==="pdf"?200:5000;
 const data=await readEquipment(s.user.id,Object.fromEntries(params),max+1);if(data.total>max)throw new AppError(`Plus de ${max} biens : affinez les filtres avant l’export.`,413);
 return await privateReport(format,data.company.name,"Registre des véhicules et équipements",`${data.today} · état actuel · ${params.get("archived")==="true"?"Archives":"Biens actifs"}`,"Registre interne RP. Aucune écriture financière ou de stock n’est créée par ce registre.",["Code","Type","Nom","Immatriculation","N° de série","État","Responsable","Localisation","Compteur km","Prochain entretien"],data.rows.map(r=>[r.code,r.kind==="VEHICLE"?"Véhicule":"Équipement",r.name,r.registration,r.serial,states[r.state],r.custodian?.characterName??"Non affecté",r.location,r.mileage,r.nextServiceOn]),"nyro-registre-biens");
}catch(e){return billingFailure(e);}}
