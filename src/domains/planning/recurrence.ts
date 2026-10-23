import {AppError} from "@/domains/core/errors";
const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
function localStamp(date:Date){const parts=Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=="literal").map(p=>[p.type,Number(p.value)]));return Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second,date.getUTCMilliseconds());}
function resolveNominal(nominal:number){
  const offsets=new Set([-86400000,0,86400000].map(delta=>localStamp(new Date(nominal+delta))-(nominal+delta)));
  const candidates=[...offsets].map(offset=>new Date(nominal-offset)).filter(candidate=>localStamp(candidate)===nominal);
  if(candidates.length!==1)throw new AppError("Un créneau tombe dans une heure ambiguë ou inexistante lors du changement d’heure de Paris. Choisissez d’autres horaires.");
  return candidates[0];
}
function plusLocalDays(date:Date,days:number){return resolveNominal(localStamp(date)+days*86400000);}
export function parisDay(day:string,offsetDays=0){return resolveNominal(+new Date(`${day}T00:00:00.000Z`)+offsetDays*86400000);}
export function recurringDates(start:string,end:string,occurrences:number,intervalWeeks:number){
  const first=new Date(start),last=new Date(end);
  if(first<new Date("2000-01-01T00:00:00Z")||last<=first||+last-+first>86400000)throw new AppError("Un service récurrent doit durer au maximum 24 heures et commencer après 2000.");
  return Array.from({length:occurrences},(_,i)=>({start:i?plusLocalDays(first,i*7*intervalWeeks):first,end:i?plusLocalDays(last,i*7*intervalWeeks):last}));
}
