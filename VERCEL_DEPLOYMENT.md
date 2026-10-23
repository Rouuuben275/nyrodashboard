# Déployer Nyro Dashboard sur Vercel sans recréer Neon

## État et cible vérifiée

Le 23 octobre 2026, le projet **nyrodashboard** a été créé dans l’équipe **rubenlambert37240-8525s-projects**, identifiant `prj_0LB2Qxl47zNDEGXRFNfgqiK08RHG`. L’API Domains confirme **nyrodashboard.vercel.app**, attribué au même projet et vérifié. Aucun déploiement applicatif de production n’est déclaré validé par cette seule attribution.

À la demande de l’utilisateur, la session se limite désormais à préparer le code, les fichiers et les commandes. Aucun secret de production n’est modifié et aucune publication n’est exécutée. Pour publier depuis le PC sans GitHub, suivre [VERCEL_COMMANDES_WINDOWS.md](VERCEL_COMMANDES_WINDOWS.md), qui lie explicitement le dossier au projet existant et vérifie son identifiant avant l’envoi.

Le Worker `rpilot` n’a pas été supprimé. Les modules, le propriétaire Discord, la base Neon et les permissions restent les mêmes. Le parcours actif est Next.js 16.4.2 / React 19.2 / Prisma 6.19.3 sous Node.js ; vinext et ses dépendances d’exécution sont retirés, leurs configurations archivées dans `legacy/cloudflare/`.

## Réglages exacts

| Réglage | Valeur |
| --- | --- |
| Project Name | `nyrodashboard` — réutiliser le projet déjà créé |
| Team / Scope | `rubenlambert37240-8525s-projects` |
| Framework Preset | **Next.js** |
| Root Directory | Racine du dépôt, `./`, là où se trouve `package.json` |
| Install Command | `npm ci` |
| Build Command | `npm run build` — précontrôle environnement, génération Prisma, puis `next build --webpack` |
| Output Directory | **Laisser la valeur par défaut Next.js** (`.next`, pas `dist`, pas `.cloudflare`, pas `out`) |
| Node.js | **24.x**, également imposé par `engines.node` et confirmé dans les réglages du projet |
| Functions | Runtime Node.js ; Fluid Compute selon les réglages du projet. Aucun processus permanent ni serveur personnalisé |
| Région | Choisir la région de la base Neon existante dans Settings → Functions ; vérifier la région dans Neon. L’ancienne connexion fournie indiquait Francfort ; si elle est toujours identique, choisir **fra1** |

Pas de `vercel.json` ajouté : le preset officiel, les exports Node.js et `next.config.ts` couvrent les besoins actuels. Aucune durée maximale ou mémoire supérieure au plan n’est inventée.

## 1. Enregistrer le code dans GitHub

Le dossier de travail n’était pas un dépôt Git lors de l’audit. Ne pas inventer un remote ni publier les fichiers locaux sans revue. Depuis PowerShell, dans le dossier qui contient ce guide :

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
npm.cmd ci
npm.cmd run typecheck
npm.cmd run audit:ui
npm.cmd run test:postgres
npm.cmd run build
npm.cmd run verify:vercel-artifact
npm.cmd run test:postgres:http
```

Les tests PostgreSQL requièrent PostgreSQL local ; `PG_BIN` peut désigner son dossier bin. Ils utilisent un cluster jetable et ignorent la connexion Neon pour les données de recette. Le build ne lance pas de migration et ne charge pas de seed.

Créer un dépôt GitHub **privé** pour ce code, puis suivre les instructions de GitHub pour ajouter le remote réel. Avant le premier commit, inspecter `git status`/`git diff --cached --name-only` : aucun `.env`, `.env.local`, `.env.migrations.local`, `.dev.vars`, `.vercel`, `.local`, archive ZIP ou donnée de test ne doit être versionné. Les exemples `.env.example` et `.env.vercel.example` sont fictifs et autorisés. Ne pas remplacer les données par un seed.

Dans Vercel → **projet nyrodashboard existant → Settings → Git → Connect Git Repository**, connecter ce dépôt. Choisir la branche de production souhaitée. Si vous passez par Add New → Project / Import Git Repository, **éviter de créer un second projet du même nom** : réutiliser le projet ci-dessus ou connecter Git depuis ses réglages.

## 2. Configurer les variables

Suivre **VERCEL_ENV_SETUP.md**, qui distingue les six variables indispensables, les options Stripe désactivées, les variables automatiques et les anciens bindings inutiles.

À saisir en Production : `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `RPILOT_OWNER_DISCORD_ID`. Conserver les secrets existants ; `RPILOT_SLOT_PAYMENTS_MODE=disabled` est recommandé explicitement, `SITE_URL=https://nyrodashboard.vercel.app` est facultatif. Ne pas donner les clés Neon de production à une branche de Preview non revue.

Ne pas saisir `DIRECT_URL` dans les Functions : cette valeur est réservée au poste opérateur pour les migrations. Aucune clé Blob, S3 ou email n’est requise par le stockage actif.

## 3. Contrôler les migrations sur la même base Neon

Neon → **projet existant → même branche et même base → Connect**. Copier la connexion poolée dans `DATABASE_URL`. Copier la connexion **directe** dans `DIRECT_URL`. Garder le chiffrement TLS et les identifiants d’origine. Ne pas créer une deuxième base, réinitialiser, lancer `db push`, `migrate reset` ou rejouer un seed.

Créer localement un fichier ignoré **`.env.migrations.local`** avec ces deux valeurs réelles, sans les mettre dans une commande ou dans le chat. Le modèle `.env.vercel.example` donne uniquement leur forme fictive. Vérifier une sauvegarde Neon/restauration avant toute application de migrations de production.

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
$env:DOTENV_CONFIG_PATH = '.env.migrations.local'
npm.cmd run db:migrate:status
```

`status` est une lecture. Un code de sortie 1 peut signaler des migrations en attente : lire le détail. Ne pas confondre une migration en attente avec une erreur de connexion. Le nombre de migrations réellement appliquées en production doit être constaté ici ; le succès des tests locaux ne le prouve pas.

Après revue de l’historique et sauvegarde :

```powershell
npm.cmd run db:migrate:production
Remove-Item Env:DOTENV_CONFIG_PATH
```

Le helper impose une URL directe et vérifie que les deux URLs pointent sur le même hôte/base Neon. Il lit `_prisma_migrations`, vérifie les empreintes des migrations appliquées et refuse les historiques incomplets ou absents du dépôt. Il utilise `prisma migrate deploy` seulement après ce contrôle. Les migrations restent **hors du build et hors des requêtes utilisateur**.

Le dépôt contient **34 migrations** après ce lot. La nouvelle `20261023200000_private_upload_transfers` ajoute uniquement une table de dépôt temporaire et ses clés/index. Les 33 précédentes sont conservées ; leur présence dans le dépôt ne signifie pas qu’elles sont toutes déjà appliquées sur Neon. Le déploiement Cloudflare existant reste compatible avec cette table supplémentaire.

## 4. Discord OAuth

Application Discord **existante** → OAuth2 → Redirects. Ajouter exactement :

```text
https://nyrodashboard.vercel.app/api/auth/callback/discord
```

Le chemin est déduit du handler Better Auth `/api/auth/[...all]` et des tests OAuth. Garder également le callback historique :

```text
https://rpilot.rpilot.workers.dev/api/auth/callback/discord
```

Garder celui de développement si utilisé : `http://localhost:3000/api/auth/callback/discord`. Aucun callback wildcard n’est autorisé. Ne pas changer Client ID/Secret ni le Discord ID propriétaire. Sur le nouveau domaine, une reconnexion est attendue : les cookies ne traversent pas les domaines ; les utilisateurs, sessions en base, comptes Discord et droits ne sont pas recréés.

La protection CSRF et le rate limiting Better Auth en PostgreSQL restent actifs. Sur Vercel, Better Auth utilise l’en-tête IP fourni par la plateforme. Les origines de confiance restent limitées à l’origine fixe configurée, jamais à tous les sous-domaines Vercel.

## 5. Premier déploiement et logs

Après variables, migrations et callback, déclencher **Deploy/Redeploy** dans le projet Vercel. Le build doit exécuter le précontrôle, `prisma generate` puis Next.js. Il doit détecter le preset Next.js et les Functions Node.js.

- Build Logs : vérifier les noms de variables manquantes, la version Node, TypeScript et les traces PDF/Prisma. Ne pas publier des logs contenant des valeurs sensibles.
- Runtime Logs : filtrer par chemin API, statut 500 et heure de la requête. Les erreurs OAuth attendues doivent rester des redirections/erreurs contrôlées, pas des 1101/1102 Workers.
- En cas de `FUNCTION_PAYLOAD_TOO_LARGE`, vérifier que l’interface utilise les fragments `/api/documents/upload` pour les fichiers > 1 Mo ; ne pas tenter d’augmenter une limite de requête qui dépend de la plateforme.
- Vérifier **Settings → Deployment Protection** : la production publique doit être accessible aux utilisateurs destinataires du SaaS ; ne pas désactiver la protection des previews sans nécessité. Aucun réglage de protection n’a été affaibli automatiquement par cette migration.

La création du projet et l’attribution du domaine ne constituent pas une publication testée. Tant que les vrais secrets et l’accès Git ne sont pas configurés, garder Cloudflare comme adresse fonctionnelle.

## 6. Stockage et limites

| Élément | Stockage réel conservé |
| --- | --- |
| Logos entreprise/serveur | `LogoAsset`, PNG normalisé privé en PostgreSQL, 256 Ko maximum |
| Documents et justificatifs | `DocumentVersion.data` en PostgreSQL, droits vérifiés à chaque téléchargement, versions immuables |
| Dépôts volumineux | Table `UploadTransfer`, fragments ordonnés de 1 Mo maximum, reprise privée, SHA-256 final, mêmes validations métier avant création de la version |
| Avatars Discord | URL Discord existante ; les photos RP personnalisées et images produits avancées non livrées ne sont pas annoncées ajoutées |
| Bannières serveur | URLs existantes ; le téléversement de bannières reste hors de ce lot |
| PDF | Générés en mémoire à partir de PostgreSQL ; police embarquée via les traces Next.js ; aucun disque permanent |

La limite métier reste **5 Mo par fichier et 100 Mo par entreprise**, archives/versions comprises. Les téléchargements privés et exports sont envoyés en flux. Les transferts temporaires expirent après une heure ; les opérations refusent immédiatement une reprise expirée, et un nouveau dépôt purge au plus 20 transferts expirés. Les réservations sont limitées à 10 Mo par auteur et 20 Mo par entreprise ; un dépôt terminé libère ses octets temporaires. Le nettoyage ne supprime aucun document métier ni version historique. Il n’y a pas d’antivirus ajouté.

Les tests locaux prouvent les octets, les permissions et le parcours HTTP. Tester également un vrai fichier de 5 Mo sur Vercel après publication, afin de valider la couche de streaming hébergée.

## 7. Stripe et tâches différées

Stripe reste désactivé. Endpoint à préparer uniquement si une recette Stripe de test est demandée :

```text
https://nyrodashboard.vercel.app/api/billing/webhook
```

La signature utilise le corps brut, la tolérance temporelle et les traitements idempotents existants. Un endpoint Stripe distinct possède un secret distinct ; ne pas écraser celui du Worker. Les tests locaux emploient des signatures et clés fictives sans appel Checkout ni paiement réel.

L’audit n’a trouvé aucun scheduler serveur permanent actif. Les `setInterval` utiles sont des actualisations **dans le navigateur**, pas des workers hébergés. Les modèles Automation/Job et la visibilité datée des annonces ne prouvent pas l’exécution de rappels ou rapports. Aucun faux cron n’est créé : il reste à développer les traitements durables, leur déduplication, reprise, notification et recette réelle. Pour un futur job quotidien idempotent, Vercel Cron est à évaluer ; pour une fréquence précise ou une longue tâche, une file durable est nécessaire. Aucun `CRON_SECRET` inutilisé n’est demandé aujourd’hui.

## 8. Recette de production non destructive

Après publication, utiliser les comptes réels uniquement pour vérifier la connexion Discord, déconnexion/reconnexion, sélection de communauté/entreprise, droits de la Direction et accès au propriétaire global. Comparer les effectifs et données visibles avec Cloudflare. Ne pas créer de fausses ventes, écritures, utilisateurs ou documents sur Neon pour tester.

Les ventes, stocks, comptabilité, paie, documents/PDF, messages, notifications, domaines RH, administration et thèmes sont testés automatiquement sur PostgreSQL local jetable. Les validations réelles hébergées, le callback enregistré chez Discord et l’état des migrations Neon sont à consigner dans `RPILOT_PROGRESS.md` après exécution. Ne pas présenter une validation locale comme une recette Vercel complète.

## 9. Retour à Cloudflare

Ne supprimer ni le Worker, ni les secrets, ni le namespace KV tant que Vercel n’est pas validé. Pour revenir immédiatement au service précédent, utiliser son adresse et son callback toujours conservé. Les deux hébergements pointent sur la même base, sans copie d’utilisateurs ou d’entreprises. Les migrations additives conservent les anciens modèles ; ne pas tenter de supprimer leur table de staging pour revenir en arrière.

Les anciennes procédures locales sont archivées et inactives. Ne pas réactiver leurs commandes sur le nouveau package sans revue de l’archive et des chemins. Après connexion Git, conserver un commit identifié de l’état de migration avant toute nouvelle modification.

## Références techniques vérifiées

- [Next.js : déploiement Node.js](https://nextjs.org/docs/app/getting-started/deploying)
- [Vercel : versions Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel : attachDatabasePool](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool)
- [Vercel : limites et payloads](https://vercel.com/docs/functions/limitations)
- [Vercel : streaming](https://vercel.com/docs/functions/streaming-functions)
- [Vercel : en-têtes IP](https://vercel.com/docs/headers/request-headers)
- [Neon : Prisma](https://neon.com/docs/guides/prisma)
