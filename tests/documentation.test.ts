import test from "node:test";
import assert from "node:assert/strict";
import {docArticles,docChapters,docBySlug,docHref,docModuleState} from "../src/content/docs/registry";
import {getDocContent,createSearchIndex} from "../src/content/docs/content";
import {moduleGuideCoverage} from "../src/content/docs/module-guides";
import {highlightParts,searchDocs} from "../src/content/docs/search";
import {modules} from "../src/domains/modules/registry";
import sitemap from "../src/app/sitemap";
import {publicOrigin} from "../src/lib/public-metadata";
const index=createSearchIndex();
test("documentation: ten chapters and 74 uniquely numbered articles with real content",()=>{
 assert.equal(docChapters.length,10);assert.equal(docArticles.length,74);assert.equal(new Set(docArticles.map(a=>a.slug)).size,74);
 for(const c of docChapters)for(const [i,a] of c.articles.entries()){assert.equal(a.number,`${c.number}.${i+1}`);assert.ok(a.description.length>30);const content=getDocContent(a.slug)!;assert.ok(content.sections.length>=5);assert.equal(new Set(content.sections.map(s=>s.id)).size,content.sections.length);for(const slug of content.related)assert.ok(docBySlug.has(slug),`${a.slug}: broken related ${slug}`);for(const s of content.sections)for(const link of s.links??[])assert.ok(docBySlug.has(link.slug),`${a.slug}: broken link ${link.slug}`);}
 assert.equal(getDocContent("missing"),null);
});
test("documentation: all 34 modules are covered with ten sections and accurate activation state",()=>{
 assert.equal(moduleGuideCoverage().length,34);assert.ok(moduleGuideCoverage().every(g=>g.documented&&g.content));
 for(const a of docArticles.filter(a=>a.module)){assert.equal(getDocContent(a.slug)!.sections.length,10);const m=modules.find(m=>m.key===a.module)!;assert.equal(docModuleState(m.key).startsWith("Disponible"),m.available);const text=index.find(e=>e.slug===a.slug)!.text;if(!m.available)assert.match(text,/développement/);}
});
test("documentation: accents, rank, title and full content search",()=>{
 for(const [q,slug] of [["Employé","employes"],["Facture","factures"],["Stock","stocks"],["Discord","connexion-discord"],["Serveur RP","serveurs-rp"],["Absence","absences"],["Permissions","permissions-entreprise"],["Paie","paie"]])assert.ok(searchDocs(index,q).slice(0,10).some(a=>a.slug===slug),`${q} should find ${slug}`);
 assert.deepEqual(searchDocs(index,"évaluation").map(a=>a.slug),searchDocs(index,"evaluation").map(a=>a.slug));
 assert.equal(searchDocs(index,"factures")[0].slug,"factures");assert.ok(searchDocs(index,"105 minutes").some(a=>a.slug==="pointage"));
 assert.ok(!searchDocs(index,"stock").some(a=>a.slug==="documents"||a.slug==="contrats"),"stock must not match unrelated stockage text");
 assert.deepEqual(searchDocs(index,"   "),[]);assert.deepEqual(searchDocs(index,"termeinexistantzz"),[]);
});
test("documentation: highlighting preserves text and does not interpolate HTML",()=>{
 const value="Évaluation et évaluations <script>";const parts=highlightParts(value,"evaluation");assert.equal(parts.map(p=>p.text).join(""),value);assert.equal(parts.filter(p=>p.match).length,2);assert.equal(highlightParts(value,"<script>").find(p=>p.match)?.text,"<script>");
});
test("documentation: public index excludes internal administration and secrets",()=>{
 const content=JSON.stringify(index);assert.doesNotMatch(content,/\/admin(?:\/|["\s])|PLATFORM_OWNER|BETTER_AUTH_SECRET|DATABASE_URL|RPILOT_OWNER_DISCORD_ID|DISCORD_CLIENT_SECRET/);
 assert.ok(index.every(a=>a.text.length>400));
});
test("documentation: sitemap covers every article and excludes private spaces",()=>{
 const urls=sitemap().map(v=>v.url);for(const a of docArticles)assert.ok(urls.includes(`${publicOrigin}${docHref(a.slug)}`));assert.ok(urls.includes(`${publicOrigin}/tarifs`));assert.ok(urls.every(u=>!new URL(u).pathname.startsWith("/admin")&&!new URL(u).pathname.startsWith("/app")));
});
