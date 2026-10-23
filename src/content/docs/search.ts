import type {DocMeta} from "./registry";
export type SearchEntry=DocMeta&{text:string};
export type SearchResult=SearchEntry&{score:number;excerpt:string};
export const normalizeSearch=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export function searchDocs(index:SearchEntry[],query:string):SearchResult[]{
 const terms=normalizeSearch(query).trim().split(/\s+/).filter(Boolean).slice(0,8);if(!terms.length)return [];
 return index.flatMap(article=>{
  const title=normalizeSearch(article.title),keywords=normalizeSearch(article.keywords.join(" ")),description=normalizeSearch(article.description),body=normalizeSearch(article.text);
  // Body matches whole words/plurals: "stock" must not match "stockage".
  // Titles and keywords still support partial input while the user types.
  const bodyWords=new Set(`${description} ${body}`.match(/[\p{L}\p{N}]+/gu)??[]);
  const inBody=(t:string)=>bodyWords.has(t)||bodyWords.has(`${t}s`)||bodyWords.has(`${t}x`)||(t.endsWith("s")&&bodyWords.has(t.slice(0,-1)));
  if(!terms.every(t=>title.includes(t)||keywords.includes(t)||inBody(t)))return [];
  const score=terms.reduce((s,t)=>s+(title.includes(t)?40:0)+(keywords.includes(t)?15:0)+(description.includes(t)&&inBody(t)?8:0)+(inBody(t)?1:0),0)+(title===terms.join(" ")?100:0);
  const offset=Math.max(0,body.indexOf(terms[0])-55);return [{...article,score,excerpt:`${offset?"…":""}${article.text.slice(offset,offset+170)}${article.text.length>offset+170?"…":""}`}];
 }).sort((a,b)=>b.score-a.score||a.number.localeCompare(b.number,"fr",{numeric:true}));
}
export function highlightParts(text:string,query:string){
 const normalized=normalizeSearch(text),ranges:[number,number][]=[];
 for(const term of normalizeSearch(query).trim().split(/\s+/).filter(Boolean).slice(0,8)){
  let from=0;while(from<normalized.length){const start=normalized.indexOf(term,from);if(start<0)break;ranges.push([start,start+term.length]);from=start+term.length;}
 }
 ranges.sort((a,b)=>a[0]-b[0]);const merged:[number,number][]=[];for(const r of ranges){const last=merged.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
 const parts:{text:string;match:boolean}[]=[];let end=0;for(const [start,to] of merged){if(start>end)parts.push({text:text.slice(end,start),match:false});parts.push({text:text.slice(start,to),match:true});end=to;}if(end<text.length)parts.push({text:text.slice(end),match:false});return parts;
}
