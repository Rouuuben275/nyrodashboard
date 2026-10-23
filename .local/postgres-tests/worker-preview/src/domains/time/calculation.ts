import type {Prisma} from "@prisma/client";
export const timeInclude={pauses:{orderBy:{start:"asc"}},corrections:{orderBy:{revision:"desc"},take:1},reviews:{orderBy:{revision:"desc"},take:1}} satisfies Prisma.TimeEntryInclude;
export type TrackedTime=Prisma.TimeEntryGetPayload<{include:typeof timeInclude}>;
export function effectiveTime(entry:TrackedTime,now=new Date()){
  const correction=entry.corrections[0],start=correction?.start??entry.start,end=correction?.end??entry.end;
  const pauseMilliseconds=correction?correction.pauseMinutes*60000:entry.pauses.reduce((sum,p)=>sum+Math.max(0,+(p.end??end??now)-+p.start),0);
  const minutes=Math.floor(Math.max(0,+(end??now)-+start-pauseMilliseconds)/60000);
  const review=entry.reviews.find(r=>r.revision===entry.revision);
  return {start,end,minutes,pauseMinutes:Math.floor(pauseMilliseconds/60000),paused:!end&&entry.pauses.some(p=>!p.end),status:!end?"OPEN":review?.status??"PENDING",corrected:!!correction};
}
