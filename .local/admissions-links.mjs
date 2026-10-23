import fs from 'node:fs';
let p='src/app/espaces/page.tsx',s=fs.readFileSync(p,'utf8');
s=s.replace('<div className="space-grid">','<a className="btn outline" href="/serveurs">Explorer les serveurs et mes demandes</a><div className="space-grid">');
s=s.replace('>Accéder</a></article>)}','>Accéder</a>{s.administration&&<a className="btn outline" href={`/serveurs/${encodeURIComponent(s.id)}/acces`}>Gérer les admissions</a>}</article>)}');
fs.writeFileSync(p,s);
p='src/components/platform-app.tsx';s=fs.readFileSync(p,'utf8');s=s.replace('>Ouvrir les accès</button>{can("servers.manage")', '>Ouvrir les accès</button>{can("servers.manage")&&<a className="btn outline small" href={`/serveurs/${encodeURIComponent(r.id)}/acces`}>Demandes d’accès</a>}{can("servers.manage")');s=s.replace('Sur demande (parcours à venir)','Sur demande').replace('Ouvert (annuaire à venir)','Ouvert');s=s.replace('Les modes sur demande/ouvert sont enregistrés ; leur annuaire et leurs demandes restent à développer.','Les modes sur demande/ouvert sont accessibles dans l’annuaire des communautés si la visibilité est publique.');fs.writeFileSync(p,s);
