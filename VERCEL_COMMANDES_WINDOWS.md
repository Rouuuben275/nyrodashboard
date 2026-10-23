# Nyro Dashboard — commandes PowerShell pour Vercel

Préparées le 23 octobre 2026. **Aucune de ces commandes de publication n’a été exécutée par l’agent.** Les secrets Vercel et Neon ne sont pas modifiés. Le projet `nyrodashboard` et son domaine ont déjà été attribués ; le Worker Cloudflare est conservé.

Exécuter les blocs dans l’ordre. Après chaque commande npm/npx, vérifier sa réussite ; ne pas poursuivre après une erreur. Ne pas relancer les anciennes commandes Wrangler/vinext sur ce package.

## 1. Vérifier localement

Arrêter un éventuel aperçu qui utilise le même dossier `.next` avant de reconstruire. Vérifier `node --version` : **24.x**.

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
node --version
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Installation echouee.' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'TypeScript en erreur.' }
npm.cmd run audit:ui
if ($LASTEXITCODE -ne 0) { throw 'Audit UI en erreur.' }
npm.cmd run test:postgres
if ($LASTEXITCODE -ne 0) { throw 'Tests PostgreSQL en erreur.' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build en erreur.' }
npm.cmd run verify:vercel-artifact
if ($LASTEXITCODE -ne 0) { throw 'Artefact incomplet.' }
npm.cmd run test:postgres:http
if ($LASTEXITCODE -ne 0) { throw 'Tests HTTP en erreur.' }
```

`test:postgres` et `test:postgres:http` créent leur propre cluster local jetable. Ils nécessitent les binaires PostgreSQL installés ; `PG_BIN` peut désigner leur dossier. Ils ne doivent pas être remplacés par `npm test` avec les identifiants de production.

## 2. Variables et callback — saisie manuelle

Dans Vercel → **nyrodashboard → Settings → Environment Variables → Production**, copier les six valeurs existantes, sans les afficher dans un terminal :

| Nom | Valeur à utiliser |
| --- | --- |
| `DATABASE_URL` | Connexion Neon **poolée**, même projet/branche/base, TLS activé |
| `BETTER_AUTH_URL` | `https://nyrodashboard.vercel.app` |
| `BETTER_AUTH_SECRET` | Secret actuel de l’application, inchangé, au moins 32 caractères |
| `DISCORD_CLIENT_ID` | Client ID de l’application Discord actuelle |
| `DISCORD_CLIENT_SECRET` | Client Secret actuel, sans reset |
| `RPILOT_OWNER_DISCORD_ID` | ID Discord du propriétaire actuel |

Ajouter aussi `RPILOT_SLOT_PAYMENTS_MODE=disabled`. Facultatif : `SITE_URL=https://nyrodashboard.vercel.app`. Laisser les clés Stripe vides/absentes. Ne pas ajouter de variable `NEXT_PUBLIC_*` contenant un secret. Le tableau complet et les sources sont dans **VERCEL_ENV_SETUP.md**.

Dans Discord Developer Portal → application existante → OAuth2 → Redirects, **ajouter** :

```text
https://nyrodashboard.vercel.app/api/auth/callback/discord
```

Conserver la redirection Cloudflare existante pendant la transition. Ne pas changer le Client ID, le secret ou le propriétaire.

## 3. Migrations Neon, séparées de la publication

Dans Neon → même projet/branche/base → Connect, récupérer **la connexion poolée et la connexion directe**. Les placer localement dans un fichier ignoré `.env.migrations.local` :

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://USER:PASSWORD@ep-example.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

Ces deux exemples sont fictifs : copier les valeurs réelles complètes depuis Neon, sans les écrire dans le chat ou dans l’historique PowerShell. Ce fichier n’est ni commité ni envoyé à Vercel. Vérifier la sauvegarde/restauration Neon avant l’application.

```powershell
$env:DOTENV_CONFIG_PATH = '.env.migrations.local'
npm.cmd run db:migrate:status
```

Lire l’état : le code 1 peut simplement indiquer des migrations en attente. Arrêter si l’URL, l’historique ou la connexion est en erreur. Après vérification de la base cible et des migrations annoncées :

```powershell
try {
    npm.cmd run db:migrate:production
    if ($LASTEXITCODE -ne 0) { throw 'Migration non validee : ne pas publier.' }
} finally {
    Remove-Item Env:DOTENV_CONFIG_PATH -ErrorAction SilentlyContinue
}
```

Le helper contrôle l’historique et les empreintes avant `prisma migrate deploy`. Il ne remet pas la base à zéro, ne charge aucun seed et ne crée pas d’autre base. Le dépôt contient 34 migrations ; seules celles absentes de l’historique Neon seront appliquées. La nouvelle table de transfert privé est additive. Ne jamais lancer `migrate reset` ou `db push --force-reset`.

## 4. Lier le dossier au projet déjà existant

Cette option CLI publie les sources du PC, sans exiger un dépôt GitHub. Les étapes GitHub sont dans **VERCEL_DEPLOYMENT.md** si vous préférez ensuite les mises à jour par push.

```powershell
npx.cmd vercel@latest login
if ($LASTEXITCODE -ne 0) { throw 'Connexion Vercel non terminee.' }
npx.cmd vercel@latest link --yes --project nyrodashboard --scope rubenlambert37240-8525s-projects
if ($LASTEXITCODE -ne 0) { throw 'Liaison Vercel echouee.' }
$nyroLink = Get-Content -LiteralPath '.vercel/project.json' -Raw | ConvertFrom-Json
if ($nyroLink.projectId -ne 'prj_0LB2Qxl47zNDEGXRFNfgqiK08RHG' -or $nyroLink.orgId -ne 'team_zRQXgsvCuDAyLCYdJwnumTod') {
    throw 'Projet ou equipe differents de la cible verifiee : ne pas publier.'
}
npx.cmd vercel@latest project inspect --non-interactive
if ($LASTEXITCODE -ne 0) { throw 'Contexte du projet non verifie.' }
```

Vérifier que l’inspection affiche **nyrodashboard**, l’équipe indiquée et **Next.js / Node.js 24.x**. La connexion peut ouvrir une page Vercel à valider. Ne pas choisir un autre compte/projet pour contourner une erreur d’accès.

## 5. Publier lorsque les étapes précédentes sont validées

Cette commande déclenche réellement la publication ; elle est fournie pour votre exécution manuelle.

```powershell
npx.cmd vercel@latest deploy --prod --scope rubenlambert37240-8525s-projects
if ($LASTEXITCODE -ne 0) { throw 'Publication Vercel echouee : consulter les logs.' }
```

Vercel reconstruit les sources avec `npm ci` puis `npm run build` sous Linux/Node.js. Ne pas utiliser `--prebuilt` pour envoyer un build Windows. `.vercelignore` exclut les dépendances, builds, `.env*`, fixtures locales, ZIP et archives historiques ; aucun secret n’est mis dans les sources.

## 6. Contrôler le résultat

```powershell
npx.cmd vercel@latest inspect https://nyrodashboard.vercel.app --scope rubenlambert37240-8525s-projects
npx.cmd vercel@latest logs https://nyrodashboard.vercel.app --scope rubenlambert37240-8525s-projects
```

Ouvrir `https://nyrodashboard.vercel.app/login` et effectuer une **nouvelle** connexion Discord. Vérifier l’entreprise existante, les accès Direction/propriétaire, la déconnexion et la reconnexion. Tester un téléchargement privé existant et un fichier de 5 Mo dans un environnement de recette autorisé ; ne pas créer de fausses ventes/écritures sur Neon.

Le domaine de production doit être accessible aux utilisateurs destinataires. Vérifier la protection du projet dans Vercel sans désactiver celle des previews. En cas de problème, conserver l’adresse Cloudflare et son callback ; ne pas supprimer le Worker ou les données.
