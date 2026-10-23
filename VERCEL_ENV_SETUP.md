# Nyro Dashboard — variables Vercel

Projet créé et vérifié le 23 octobre 2026 : **nyrodashboard**, identifiant `prj_0LB2Qxl47zNDEGXRFNfgqiK08RHG`, équipe `rubenlambert37240-8525s-projects`. L’API Vercel confirme que **nyrodashboard.vercel.app** est attribué à ce projet, `verified: true`. Cela confirme l’attribution, pas un déploiement fonctionnel : aucun secret de production n’a été copié et aucune publication n’est annoncée.

Ouvrir le projet dans Vercel → **Settings → Environment Variables**. Pour la première migration, sélectionner **Production**. Les valeurs secrètes sont à saisir directement dans Vercel, jamais dans le chat, Git, un `NEXT_PUBLIC_*`, une commande avec `--value` ou une capture. Garder le même compte Discord, le même propriétaire et la même base Neon.

## Variables à configurer

| Nom exact | Nécessité | Utilisation | Où récupérer la valeur | Exemple fictif / valeur publique | Environnements | Ancienne configuration Cloudflare |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Obligatoire | Prisma 6.19.3 + adaptateur pg ; sessions, droits et modules | Neon → projet existant → même branche/base → Connect → **Connection pooling activé** | `postgresql://USER:PASSWORD@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` | Production ; Development local ; Preview seulement avec un environnement de recette déjà autorisé | Même secret `DATABASE_URL`, sans Hyperdrive |
| `BETTER_AUTH_URL` | Obligatoire pour Discord et CSRF | Origine fixe de Better Auth et des écritures API | Domaine attribué dans Settings → Domains | `https://nyrodashboard.vercel.app` (sans slash final) | Production ; en Development `http://localhost:3000` ; Preview : une origine HTTPS stable explicitement configurée et enregistrée chez Discord | Remplace l’ancienne URL `rpilot.rpilot.workers.dev` sur Vercel uniquement |
| `BETTER_AUTH_SECRET` | Obligatoire, secret existant ≥ 32 caractères | Signature des cookies, état OAuth, sessions | Coffre/configuration d’origine de RPilot ; **recopier le secret existant** | `CHANGE_ME_COPY_EXISTING_SECRET` | Production ; secret distinct pour une recette isolée ; Development local | Même secret que le Worker ; ne pas le régénérer arbitrairement |
| `DISCORD_CLIENT_ID` | Obligatoire pour la connexion | Application Discord OAuth actuelle | Discord Developer Portal → application existante → OAuth2 | `123456789012345678` | Production ; Development/Preview seulement si leurs callbacks sont enregistrés | Même identifiant ; ce n’est pas un secret |
| `DISCORD_CLIENT_SECRET` | Obligatoire pour la connexion | Échange du code OAuth avec Discord | Même application Discord, secret existant dans votre coffre/paramétrage | `CHANGE_ME_EXISTING_DISCORD_SECRET` | Production ; Development/Preview autorisés | Même secret ; pas de reset chez Discord pour cette migration |
| `RPILOT_OWNER_DISCORD_ID` | Obligatoire pour conserver l’administration propriétaire | Comparaison serveur avec le compte Discord vérifié ; aucun droit depuis le navigateur | Configuration propriétaire actuelle du Worker ; Discord → mode développeur → copier l’ID du propriétaire réel si nécessaire | `123456789012345678` | Production ; Development/Preview : identité de recette si environnement séparé | Même nom et même identité ; **ne pas renommer NYRO_OWNER...** |
| `SITE_URL` | Facultative | Canonical, Open Graph, sitemap, robots ; défaut = domaine de production vérifié | Settings → Domains | `https://nyrodashboard.vercel.app` | Production ; Preview garde le canonical de production et est non indexable ; Development peut garder le défaut | Remplace le canonical Cloudflare auparavant codé en dur |
| `RPILOT_SLOT_PAYMENTS_MODE` | Facultative ; absence = désactivé | Ouverture conditionnelle du paiement des slots | Choix opérateur ; **laisser `disabled` pendant la migration** | `disabled` | Production, Preview et Development | Ancien binding texte de même nom |
| `STRIPE_SECRET_KEY` | Seulement si mode `test` autorisé | Intégration Stripe existante, aucune transaction réelle de migration | Stripe → clés API de test | `sk_test_EXEMPLE_NON_VALIDE` | Environnement de test autorisé uniquement tant que Stripe n’est pas ouvert | Ancien secret facultatif de même nom |
| `STRIPE_WEBHOOK_SECRET` | Seulement si mode `test` autorisé | Signature du webhook brut ; distincte de la clé API | Stripe → endpoint de test → signing secret ; un nouvel endpoint possède son propre secret | `whsec_EXEMPLE_NON_VALIDE` | Environnement de test autorisé uniquement | Ancien secret facultatif ; ne pas remplacer celui du Worker |
| `DIRECT_URL` | Obligatoire sur le poste opérateur pour vérifier/appliquer les migrations hors local ; **inutile aux Functions/build Vercel** | Connexion directe vers la même base, utilisée exclusivement par `scripts/migrate-database.mjs` | Neon → même projet/branche/base → Connect → pooling désactivé | `postgresql://USER:PASSWORD@ep-example.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` | Fichier local ignoré `.env.migrations.local` ; pas besoin de l’ajouter à Vercel | Nouveau nom d’exploitation, pas de nouvelle base |

Le build `npm run build` vérifie les six variables principales quand `VERCEL=1`. Il ne se connecte pas à la base pour migrer et n’applique aucune migration. Il refuse les placeholders, une origine non HTTPS sur Vercel, un propriétaire mal formé, une origine Production incohérente et l’activation Stripe live pendant cette migration. Les messages n’affichent jamais les valeurs.

Un secret Cloudflare enregistré n’est pas nécessairement relisible. Si sa valeur originale est introuvable, **ne pas inventer un remplacement** : récupérer la configuration/coffre d’origine ; une rotation éventuelle doit être traitée explicitement avec ses effets sur les sessions.

## Variables fournies automatiquement

| Nom | Lecture réelle par l’application | Action manuelle |
| --- | --- | --- |
| `VERCEL` | `1` active l’attachement du pool PostgreSQL au cycle Fluid Compute et l’en-tête IP Vercel de Better Auth | Ne pas saisir |
| `VERCEL_ENV` | Le précontrôle distingue Production/Preview ; Preview désactive l’indexation | Ne pas saisir |
| `NODE_ENV` | Next.js, contrôle de l’atelier `/dev/ui`, protection du seed | Ne pas forcer ; Vercel/Next le fournissent |
| `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_GIT_*` | Fournies par la plateforme, **pas utilisées comme origines de confiance par ce code** | Ne pas copier dans Better Auth automatiquement ; aucun wildcard `*.vercel.app` |

## Variables et bindings Cloudflare à ne pas copier

`ASSETS`, `IMAGES`, `VINEXT_KV_CACHE`, `HYPERDRIVE`, `CLOUDFLARE_INCLUDE_PROCESS_ENV`, `RPILOT_WORKER_TEST` et les types générés Workers ne sont plus nécessaires au parcours actif. Le cache vinext ne contient pas les documents, identités ou sessions métier : ceux-ci sont dans PostgreSQL. Aucun DNS Cloudflare ni Worker distant n’a été supprimé. Le namespace KV existant reste attaché à l’ancien Worker.

## Variables inutilisées ou réservées aux outils

- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` figuraient dans l’ancien exemple mais n’étaient consommées par aucun stockage implémenté. Elles ont été retirées de l’exemple actif. **Pas de compte S3/Blob ni de clé de stockage à créer pour cette migration** : logos et documents sont déjà persistants dans Neon, hors du disque des Functions.
- `DEMO_PASSWORD` présent dans un ancien fichier local n’est pas lu par l’application ; aucune authentification par mot de passe n’est activée.
- `PG_BIN` : facultatif sur un poste de test, chemin des exécutables PostgreSQL locaux (ex. `C:/Program Files/PostgreSQL/18/bin`). Pas sur Vercel.
- `RPILOT_UI_TEST`, `RPILOT_UI_ADMISSION_HISTORY`, `RPILOT_PRODUCTION_TEST`, `RPILOT_PDF_QA`, `RPILOT_STRIPE_SIGNATURE_TEST` : fixtures/tests uniquement. Ne pas les configurer sur Vercel ; ne jamais lancer les fixtures sur Neon de production.
- `DOTENV_CONFIG_PATH` : facultatif sur le poste opérateur pour charger `.env.migrations.local` avec dotenv. `NODE_OPTIONS`, `PATH`, `TEMP` et autres variables système ne sont pas des réglages applicatifs à copier. L’ancienne injection `NODE_OPTIONS` du banc workerd est archivée.
- Aucun `CRON_SECRET`, service email, `BLOB_READ_WRITE_TOKEN`, token S3 ou `NEXT_PUBLIC_*` n’est actuellement requis par les fonctionnalités actives. Ne pas créer de secrets inutilisés.

## Preview et sécurité

Ne pas copier les secrets Neon de production dans une branche Git non revue. Ne pas créer de deuxième base pour cette migration. Si aucun environnement de recette isolé n’est déjà disponible, configurer d’abord Production et conserver les Preview sans secrets ; leur build sera refusé jusqu’à configuration explicite. Les tests automatisés créent leur cluster PostgreSQL **local jetable**, sans utiliser Neon.

Les cookies de l’ancien domaine ne peuvent pas être lus sur le nouveau domaine. Une reconnexion Discord est normale ; les identités, entreprises, droits et lignes Session existantes sont conservés dans la même base. Garder provisoirement **les deux callbacks Discord**.
