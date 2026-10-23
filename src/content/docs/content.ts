import {docArticles,docBySlug} from "./registry";
import {moduleGuide} from "./module-guides";
import {userGuide} from "./user-guides";
export function getDocContent(slug:string){const article=docBySlug.get(slug);if(!article)return null;return article.module?moduleGuide(article):userGuide(slug);}
export function createSearchIndex(){return docArticles.map(a=>({...a,text:getDocContent(a.slug)!.sections.flatMap(s=>[s.title,...s.paragraphs??[],...s.steps??[],...s.items??[],s.callout??"",s.example??"",...s.faq?.flatMap(f=>[f.question,f.answer])??[]]).join(" ")}));}
