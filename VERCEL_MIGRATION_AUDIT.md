# Nyro Dashboard — livraison de la migration Vercel

23 octobre 2026. Code et commandes préparés ; **publication applicative et configuration des secrets non exécutées**, conformément au dernier choix utilisateur. Le projet et son domaine ont été créés/vérifiés avant cette restriction. Aucun accès à Neon de production ni changement de ses données dans ce lot. L’ancien déploiement Cloudflare est conservé.

## A. Variables exactes

L’inventaire complet, avec nécessité, exemple fictif, source, environnement et correspondance Cloudflare, est dans [VERCEL_ENV_SETUP.md](VERCEL_ENV_SETUP.md). Le fichier [.env.vercel.example](.env.vercel.example) ne contient que des exemples fictifs.

| À configurer en Production | Valeur attendue / source |
| --- | --- |
| `DATABASE_URL` | Même Neon, connexion poolée avec TLS, Neon → Connect |
| `BETTER_AUTH_URL` | `https://nyrodashboard.vercel.app`, domaine attribué au projet |
| `BETTER_AUTH_SECRET` | Secret existant ≥ 32 caractères, coffre/configuration actuelle |
| `DISCORD_CLIENT_ID` | Client ID de l’application OAuth actuelle, Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | Secret actuel de cette application, coffre/configuration actuelle |
| `RPILOT_OWNER_DISCORD_ID` | ID du propriétaire actuel, configuration existante ; identité vérifiée côté serveur |

Facultatives : `SITE_URL` (défaut = domaine confirmé), `RPILOT_SLOT_PAYMENTS_MODE` (**disabled**), les deux clés Stripe uniquement pour une future recette de test autorisée. `DIRECT_URL` reste sur le poste opérateur pour les migrations de la même base. Automatiques : `VERCEL`, `VERCEL_ENV`, `NODE_ENV` ; ne pas les forcer.

Bindings Workers, ancien cache vinext, anciennes variables S3 non consommées, secrets email/cron/Blob inexistants : **ne pas les copier**. Aucun secret ne doit être exposé dans `NEXT_PUBLIC_*`, Git, l’historique shell ou le chat. Pas de secrets Production transmis aux branches Preview non revues.

## B. Configuration Vercel

| Réglage | Valeur |
| --- | --- |
| Projet | `nyrodashboard`, `prj_0LB2Qxl47zNDEGXRFNfgqiK08RHG` |
| Équipe | `rubenlambert37240-8525s-projects`, `team_zRQXgsvCuDAyLCYdJwnumTod` |
| Domaine attribué | `nyrodashboard.vercel.app`, confirmé `verified: true` par l’API Domains |
| Preset / racine | Next.js / `./` |
| Installation | `npm ci` |
| Build | `npm run build` (précontrôle, `prisma generate`, Next.js Webpack) |
| Sortie | Défaut Next.js `.next` ; pas `dist`, `out` ou `.cloudflare` |
| Node.js | 24.x, projet et package alignés ; tests locaux sous 24.15.0 |
| Runtime | Node.js ; aucun adaptateur applicatif Workers actif |

Next.js installé : **16.4.2**, React **19.2**, Prisma/adapter-pg **6.19.3**, pg **8.20.0**, `@vercel/functions` **3.10.3**. Aucun `vercel.json` nécessaire au périmètre actuel. Régler la région Functions près de la base existante après vérification de sa région Neon.

## C. Discord

Callback déduit de Better Auth et du handler `/api/auth/[...all]` :

```text
https://nyrodashboard.vercel.app/api/auth/callback/discord
```

Ajouter dans l’application Discord existante, sans supprimer `https://rpilot.rpilot.workers.dev/api/auth/callback/discord`. Aucune rotation arbitraire du secret ni changement du propriétaire. Les cookies ne traversent pas les domaines : une nouvelle connexion est normale, sans nouveau compte métier.

Les tests locaux vérifient les redirections, états/erreurs, origines, sessions signées, révocation et rate limiting ; ils ne remplacent pas le consentement Discord externe sur Vercel. Le nouvel hôte utilise l’IP de plateforme Vercel pour Better Auth et garde une origine fixe, sans wildcard de confiance.

## D. Neon et conservation

Prisma conserve `engineType="client"` et l’adaptateur pg, sans moteur natif Linux/Windows. Pool partagé par instance chaude, taille par défaut 5, borne 1–10 ; délais d’inactivité/connexion, `attachDatabasePool` sur Vercel. Aucun cache de session/permission ajouté et aucun `$disconnect` par requête.

`DATABASE_URL` poolée pour les Functions. `DIRECT_URL` directe pour le helper manuel de migration, même endpoint Neon sans suffixe pooler et même base. TLS conservé. Pas de nouvelle base, reset, `db push` ou seed. Build et requêtes utilisateur ne migrent jamais.

Localement : les **33 migrations antérieures** et leurs empreintes ont été lues, puis la migration additive **20261023200000_private_upload_transfers** appliquée. Le dépôt contient **34 migrations**. La nouvelle table temporaire complète le stockage privé existant ; aucune ancienne table métier supprimée. Les **117 tables et 989 lignes originales** du snapshot local sont inchangées après les vérifications. Ce sont des empreintes, pas une sauvegarde restaurable.

L’état des migrations et les données **Neon de production n’ont pas été interrogés**. L’opérateur doit vérifier sauvegarde/restauration et historique avec les commandes documentées, puis appliquer seulement les migrations manquantes. Le helper refuse une connexion incohérente ou un historique connu modifié/incomplet.

## E. Fichiers principaux modifiés ou ajoutés

| Ensemble | Fichiers |
| --- | --- |
| Package et packaging | `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `.vercelignore`, `.env.example`, `.env.vercel.example` |
| Runtime / base / auth | `src/lib/database-runtime.ts`, `database-config.ts`, `db.ts`, `auth.ts`, `report-font.ts` ; `src/app/layout.tsx`, `src/proxy.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/api/billing/webhook/route.ts` |
| Origines publiques | `src/lib/public-metadata.ts`, `src/app/robots.ts`, `src/content/public-pages.ts` ; sitemap et canonical utilisent l’origine partagée |
| Fichiers privés | `prisma/schema.prisma`, `prisma/migrations/20261023200000_private_upload_transfers/migration.sql`, `src/domains/documents/transfers.ts`, `src/app/api/documents/upload/route.ts`, `src/components/private-upload.ts`, `documents-view.tsx`, `record-attachments.tsx` |
| Réponses en flux | `src/lib/stream-response.ts`, `src/domains/utilities/export.ts` ; routes `api/audit`, `documents/file`, `finance/export`, `inventory/export`, `payroll/pdf`, `sales/export`, `sales/ticket`, `time/export`, `equipment/export`, `statistics/export` |
| Outils et tests | `scripts/check-vercel-env.mjs`, `migrate-database.mjs`, `verify-vercel-artifact.mjs`, `test-postgres.mjs` ; `tests/database-config.test.ts`, `theme.test.ts`, `http-slots-flow.ts`, `http-flow.ts`, `vercel-environment.test.ts`, `vercel-transfers.test.ts`, `http-vercel-transfers-flow.ts` |
| Guides et suivi | `README.md`, `VERCEL_ENV_SETUP.md`, `VERCEL_DEPLOYMENT.md`, `VERCEL_COMMANDES_WINDOWS.md`, présent audit, `RPILOT_PROGRESS.md`, `NYRO_RESTE_A_FAIRE.md` |
| Archive inactive | Anciennes configurations Vite/Cloudflare, package/lock originaux, runtime et police Workers, types de bindings, outils de publication/transport/artefact et tests spécifiques vinext dans `legacy/cloudflare/*.disabled`, avec README d’archive |

Les dépendances actives vinext, `@vinext/cloudflare`, plugins Vite/Cloudflare, cf et le transport React spécifique vinext ont été retirés. Les anciennes commandes de publication ne sont plus exposées dans npm. Le paquet pg conserve sa dépendance facultative `pg-cloudflare`, qui peut apparaître dans les traces : elle n’est pas le runtime sélectionné sous Node.js. L’ancien Worker distant n’est pas touché.

## F. Vérifications réellement exécutées

| Vérification | Résultat |
| --- | --- |
| Prisma generate 6.19.3 et build Next.js Webpack | Réussis, `.local/vercel-build-final.log` |
| `typecheck` et `audit:ui` | Réussis, aucun contrôle UI interdit détecté |
| `verify:vercel-artifact` | Réussi : WASM Prisma et polices présents dans les traces des routes sensibles et `/app`, aucun moteur natif ou adaptateur applicatif Workers, aucune valeur secrète locale trouvée dans les JS navigateur |
| Suite PostgreSQL isolée | **294 réussis**, 0 échoué ; `.local/vercel-postgres-final.log` |
| Suite HTTP Next.js Node.js isolée | **18 réussis**, 0 échoué ; `.local/vercel-http.log` |
| Conservation des données originales locales | Réussie, 117 tables vérifiées après migration additive |
| Recette visuelle | Sombre/clair/système, rechargement, 1366×900, 768×1024 et 390×844 ; pas de débordement horizontal mesuré ; dialogue mobile 354 px ; aucune erreur/warning console observée |
| Guide PowerShell et aperçu utilisateur | Syntaxe des 6 blocs vérifiée sans exécution ; aperçu final redémarré, `/login` HTTP 200 sur localhost:3000 |
| Audit npm de production | **3 alertes élevées**, non résolues dans ce lot ; `.local/vercel-npm-audit.json` |
| Connexion réelle Neon / migrations de production | Non exécutées ; aucune donnée de production utilisée pour les fixtures |
| Déploiement applicatif et limites réelles Vercel | Non exécutés selon la demande utilisateur |
| Consentement Discord externe / cookies réels du nouveau domaine | Non exécutés ; nécessitent secrets, callback et publication manuels |
| Stripe prestataire / paiements réels | Non exécutés ; paiements désactivés |
| Déclenchements réels d’automatisations | Non exécutables avec le socle actuel, moteur durable encore absent |

Les tests couvrent les modules métier existants : permissions et isolation, propriétaire/administrateurs, communautés, capacité des entreprises, RH, ventes concurrentes, stocks, comptabilité, paie/recrutement, documents et versions, notifications, messagerie, calendrier, rapports, équipements et PDF. Le webhook est testé avec des signatures fictives sur corps brut, rejet d’une signature/heure invalide et idempotence en base ; aucun appel Checkout. Le nouveau test HTTP envoie **5 Mo réels par fragments ≤ 1 Mo**, refuse un fragment trop gros/une finalisation prématurée, valide deux finalisations concurrentes sans doublon puis compare les octets du téléchargement authentifié sans Content-Length.

Échecs intermédiaires corrigés avant les suites finales : typage Fetch du corps binaire, nom de grade fixture déjà réservé, comparaison UTC de l’expiration temporaire et omission initiale du compilateur WASM dans les traces API imbriquées. Le premier contrôle d’artefact rejetait trop largement le transport facultatif `pg-cloudflare` ; il vérifie désormais les véritables adaptateurs applicatifs retirés. Les résultats finaux ci-dessus sont ceux des relances après correction.

Captures : `.local/qa/vercel-node-desktop.png`, `vercel-node-tablet.png`, `vercel-node-mobile-light.png`. Les fixtures et le cluster isolé ont été nettoyés/arrêtés, le viewport restauré et l’onglet fermé.

## G. Limites et étapes externes restantes

1. Exécuter manuellement les étapes de **VERCEL_COMMANDES_WINDOWS.md** : secrets existants, callback, sauvegarde/état Neon, migrations manquantes, liaison explicite au projet puis publication. L’envoi depuis Windows reconstruit les sources sur Vercel ; pas d’artefact Windows précompilé envoyé.
2. Faire une vraie connexion/déconnexion/reconnexion Discord sur le nouveau domaine, contrôler Direction/propriétaire, données visibles et téléchargement privé. Valider un fichier de 5 Mo sur Vercel : le test local prouve le protocole/octets, pas la couche de streaming hébergée. Vérifier les règles de protection de la production sans affaiblir les previews.
3. Les trois alertes npm viennent de Prisma CLI / `@prisma/config` / `deepmerge-ts` : [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). npm propose Prisma 7.10.1, mise à jour majeure à traiter séparément. Aucun `audit fix --force` ni changement majeur automatique.
4. Automatisations et jobs restent des fondations de modèle. Aucun processus permanent ni faux cron déployé ; rappels, rapports et notifications programmées nécessitent exécution durable, déduplication, retries et recette. Les intervalles actuels sont dans le navigateur.
5. Stockage : PostgreSQL persistant conservé, plafonds 5 Mo/fichier et 100 Mo/entreprise ; uploads temporaires bornés, expiration 1 h et purge opportuniste de 20 lignes maximum. Pas d’antivirus, aperçu PDF intégré, photos RP/produits avancées ou téléversement de bannière ajoutés. Les gros rapports et exports asynchrones restent à compléter.
6. Stripe désactivé, aucune activation live. URL future de webhook de test : `https://nyrodashboard.vercel.app/api/billing/webhook`. Recette fournisseur distincte nécessaire si demandée.
7. Sauvegarde/restauration, supervision, alertes, charge, identité légale et contact officiel restent à finaliser. Les cinq modules indisponibles et compléments des 29 existants restent listés dans **NYRO_RESTE_A_FAIRE.md**.

Le retour au service précédent utilise le Worker et le callback conservés. Ne pas effacer la base ou retirer les migrations additives pour revenir à Cloudflare. Les archives locales des anciennes configurations ne constituent ni une sauvegarde de Neon ni un mécanisme de redéploiement automatique.
