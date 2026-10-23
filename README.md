# Nyro Dashboard

Gestion d’entreprises Roleplay autonome, anciennement RPilot : Next.js App Router, TypeScript, PostgreSQL Neon, Prisma et connexion Discord avec Better Auth. Aucun script FiveM n’est nécessaire. Le design, les logos et les thèmes existants sont conservés.

**Cible actuelle : Next.js officiel sous Node.js 24.x sur Vercel.** La publication Vercel et la saisie des secrets sont à effectuer par l’opérateur. Le Worker historique reste disponible pendant la transition. Les configurations Cloudflare/vinext devenues inactives sont conservées dans `legacy/cloudflare/` ; les anciens guides Workers ne décrivent plus le build actif.

## Configuration et publication

- [Variables exactes, sources et environnements](VERCEL_ENV_SETUP.md)
- [Déploiement Vercel, Neon, Discord, stockage et retour arrière](VERCEL_DEPLOYMENT.md)
- [Commandes Windows dans l’ordre](VERCEL_COMMANDES_WINDOWS.md)
- [Exemple sans secrets](.env.vercel.example)
- [Audit et résultats de la migration](VERCEL_MIGRATION_AUDIT.md)

Projet Vercel existant : **nyrodashboard**, domaine attribué et vérifié **nyrodashboard.vercel.app**. Cette attribution ne vaut pas validation de production. Réutiliser ce projet ; ne pas créer de deuxième base Neon ni de nouveau propriétaire.

## Développement local

Node.js 24.x, npm et PostgreSQL sont nécessaires. Sous PowerShell :

```powershell
npm.cmd ci
# Première installation seulement : copier .env.example vers .env si absent.
# Compléter les variables locales sans remplacer une configuration existante.
npm.cmd run db:generate
npm.cmd run db:migrate:status
# Sur une base locale existante uniquement, après contrôle de l’état :
node scripts/migrate-database.mjs deploy
npm.cmd run dev
```

L’accueil est sur `http://localhost:3000`, Discord sur `/login`, les entreprises sur `/app`, les communautés sur `/espaces` et `/serveurs`, l’administration autorisée sur `/admin`. Enregistrer le callback local exact `http://localhost:3000/api/auth/callback/discord` chez Discord. Une entreprise créée est vide ; aucune donnée de démonstration n’est injectée à l’inscription.

Une base locale persistante peut être démarrée avec `npx.cmd prisma dev --name rpilot --detach`. `node scripts/setup-env.mjs` peut créer un `.env` absent ; il ne remplace pas un fichier existant. Vérifier le port de connexion affiché par Prisma. La base locale ne doit jamais être publiée.

Webpack est sélectionné explicitement pour les builds Windows. Éviter de lancer un build en parallèle d’un serveur qui utilise le même dossier `.next`.

## Validation isolée

```powershell
npm.cmd run typecheck
npm.cmd run audit:ui
npm.cmd run test:postgres
npm.cmd run build
npm.cmd run verify:vercel-artifact
npm.cmd run test:postgres:http
```

Les deux suites `test:postgres` utilisent un PostgreSQL local jetable avec un utilisateur dédié, puis nettoient les fixtures et arrêtent le cluster. PostgreSQL installé ou `PG_BIN` est nécessaire. La suite HTTP lance son propre aperçu Next.js ; elle ne nécessite pas le serveur utilisateur. Les tests ne contactent pas Neon ni Discord. Les sessions signées de recette sont créées uniquement dans le banc de test ; aucun accès de contournement n’existe dans l’application.

`npm test` utilise directement la base de l’environnement : préférer les suites isolées ci-dessus et ne jamais le lancer avec les identifiants de production. `seed:demo` est un outil facultatif de développement, jamais une étape de migration ou de déploiement.

## Architecture et données

- `src/app/` : App Router, pages serveur, API Node.js et proxy.
- `src/components/` : vues et bibliothèque UI personnalisée, thèmes clair/sombre/système.
- `src/domains/` : règles métier, projections autorisées, transactions et idempotence.
- `src/lib/db.ts` : Prisma 6.19.3 sans moteur natif, adaptateur pg et pool partagé par instance Node.js.
- `src/lib/auth.ts` : Discord exclusivement, sessions et rate limiting en PostgreSQL.
- `prisma/` : schéma et migrations historiques conservées ; migrations manuelles hors build/requêtes.
- `scripts/`, `tests/` : contrôles opérateur et recettes isolées, vérifiés par `typecheck` séparément du build applicatif.

Chaque lecture/mutation recontrôle l’utilisateur, l’entreprise, le module et les permissions. Les identités propriétaires reposent sur le compte Discord vérifié et `RPILOT_OWNER_DISCORD_ID` côté serveur. Les directions existantes et leurs droits commerciaux approuvés ne sont pas réécrits.

Les fichiers privés persistants restent dans PostgreSQL (`LogoAsset`, `DocumentVersion`) avec contrôles d’accès et versions. Les fichiers de plus de 1 Mo passent par des fragments privés, pour conserver la limite métier de 5 Mo sur Vercel. Aucun stockage permanent dans le disque des Functions ; aucune clé S3/Blob nécessaire. Les téléchargements et exports sont envoyés en flux, les polices PDF sont embarquées dans les traces Next.js.

## État fonctionnel et limites

**29 modules disponibles sur 34**, avec des compléments avancés encore manquants. L’état détaillé et les résultats par lot sont dans [RPILOT_PROGRESS.md](RPILOT_PROGRESS.md) ; la liste actuelle des fonctions restantes est dans [NYRO_RESTE_A_FAIRE.md](NYRO_RESTE_A_FAIRE.md). Ces deux fichiers remplacent les anciens états de 18/24 modules.

Documents privés liés aux employés, absences, dépenses et tâches, notes de frais, RH, ventes, stocks, comptabilité, paie, recrutement, messagerie, calendrier, statistiques et équipements disposent de parcours métier. Les opérations monétaires internes restent RP. Le stockage conserve ses limites de 5 Mo/fichier et 100 Mo/entreprise. Aucun antivirus ni moteur durable d’automatisation n’est annoncé livré. Certains chargements du workspace sont encore bornés ; les gros exports et tâches différées restent à compléter.

Stripe reste désactivé. Les slots supplémentaires à 5 € et leur webhook existant sont conservés, sans activation de paiements réels. L’identité légale complète et le contact officiel du responsable restent à renseigner ; aucun contact fictif n’est inventé.

Les sauvegardes restaurables, la supervision, la recette de charge et les tests réels Vercel/Neon/Discord restent des opérations de production distinctes. Les empreintes locales de conservation ne sont pas une sauvegarde.
