# RPilot

Première version utilisable d’un espace SaaS de gestion d’entreprises Roleplay. Next.js App Router, TypeScript, PostgreSQL et Prisma. Aucun script FiveM ni accès à une base de jeu n’est nécessaire. L’authentification utilise exclusivement Discord OAuth.

## Lancer le projet

Prérequis : Node.js 24.15+ (version utilisée pour la suite de tests), npm et PostgreSQL 16+ ou la base locale Prisma. Sous PowerShell, utiliser `npm.cmd` / `npx.cmd` si la politique d’exécution bloque les scripts `.ps1`.

```sh
npm ci
cp .env.example .env
# Renseigner DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET (32+ caractères)
# et les identifiants DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET.
npm run db:generate
npm run db:migrate
npm run dev
```

Ouvrir [localhost:3000](http://localhost:3000) pour découvrir l’accueil public et les fonctionnalités. Les boutons « Commencer » et « Se connecter » mènent à `/login`, puis à Discord. Le compte est créé à la première connexion et l’espace privé s’ouvre sous `/app`. Une entreprise nouvellement créée est **vide**. Le propriétaire reçoit un grade Direction avec toutes les permissions déclarées. Le grade Employé est personnalisé séparément dans chaque entreprise. Le modèle vierge active uniquement les modules essentiels ; les deux modèles de secteur activent les mêmes modules disponibles, sans injecter de faux produits.

### PostgreSQL local sans Docker

```sh
npx prisma dev --name rpilot --detach
node scripts/setup-env.mjs
```

`setup-env.mjs` crée un `.env` absent avec un secret aléatoire et le port local par défaut 51214. Il ne remplace jamais un fichier existant. Vérifier le port affiché par Prisma et adapter `DATABASE_URL` si nécessaire. L’instance est persistante et réservée au développement. Pour son protocole TCP local, utiliser `connection_limit=1&pgbouncer=true&statement_cache_size=0` afin d’éviter la réutilisation des prepared statements entre clients. Une vraie instance PostgreSQL est requise en production et pour les tests de charge.

```sh
npm run db:migrate
npm run dev
# Gestion de l’instance locale
npx prisma dev ls
npx prisma dev stop rpilot
```

Le compilateur Webpack est choisi explicitement : Turbopack a rencontré un plantage de sous-processus sur l’environnement Windows utilisé pour cette livraison. La compilation Webpack de Next.js fonctionne.

Sous Windows, arrêter `npm run dev` ou `npm start` avant `npm run build` : le serveur peut maintenir le moteur Prisma en cours d’utilisation et empêcher sa régénération (`EPERM`).

### Démonstration facultative

Pour créer des fixtures métier de développement :

```sh
npm run seed:demo
```

Cette commande crée Benny’s Original Motor Works, un serveur RP, une équipe fictive, des produits, des écritures de démonstration en base et leur historique. Le compte fixture `demo@rpilot.local` ne possède **aucun moyen de connexion** ; le seed ne crée plus de mot de passe. Le seed refuse `NODE_ENV=production` et ne modifie pas un compte de démonstration existant. L’accueil présente un aperçu du design du panel avec des données explicitement illustratives, sans ouvrir l’accès à ces données privées. Les anciennes données locales sont conservées, mais l’ancien accès par mot de passe est désactivé côté serveur.

## Périmètre livré

| Domaine | Fonctionnement disponible |
| --- | --- |
| Accueil public | Présentation, aperçu réel du logiciel étiqueté démonstration, fonctionnalités, catalogue des 34 modules avec disponibilités, multi-entreprises, serveurs, modèles, comparaison Free/offres à venir, FAQ et connexion Discord. Logo fourni affiché en niveaux de gris, original conservé. |
| Compte | Discord OAuth exclusivement, création à la première connexion, session en base, déconnexion, ajout de personnages RP. Les endpoints de connexion et d’inscription par mot de passe sont désactivés. |
| Entreprises | Création indépendante ou affiliée, informations, affiliation, sélection entre plusieurs entreprises sans déconnexion. |
| Serveur RP | Création, rôle de propriétaire en base, liste des entreprises affiliées, création de plusieurs entreprises et historique des créations/affiliations/désaffiliations. L’accès aux données d’une entreprise nécessite aussi une adhésion à cette entreprise. |
| Permissions | Grades propres à chaque entreprise, création et édition de grades avec permissions sélectionnées, affectation des employés, accès serveur vérifiés à chaque mutation et lecture. La direction ne peut être réaffectée ou suspendue par le formulaire employé, ni privée de ses permissions par l’édition des grades. |
| Modules | Catalogue de 34 modules, 18 activables/essentiels avec flux opérationnels. Les fonctionnalités avancées encore manquantes sont détaillées dans `docs/REFONTE-SUIVI.md`. Recherche, catégories, dépendances et blocage serveur des actions désactivées. La caisse est intégrée aux ventes ; le module Caisse distinct reste à venir. |
| Équipe | Liste, recherche, tri, pagination, grade, département, salaire de référence, statut actif/inactif. Suspension d’accès immédiate après désactivation. Invitation par lien privé, validation de l’e-mail, expiration, acceptation unique et refus. |
| Planning | Services individuels, vues jour/semaine/mois, filtres employé/département, modification, détection de chevauchement et d’absence validée, suppression, CSV et impression. Les absences affichées respectent les droits de consultation. |
| Pointage | Début et fin de service, heures horodatées, durée et historique. Un employé consulte ses propres pointages ; un gestionnaire voit ceux de l’équipe. |
| Absences | Demande, motif, période, acceptation/refus motivé, notification. Aucune auto-validation de sa propre demande. |
| Catalogue | Création et modification des références, catégories, prix/coûts, marges, prestations sans stock, seuils et archivage réversible. Stock modifié uniquement par un mouvement motivé ; prix historiques conservés. |
| Ventes | Panier, quantités, client RP, trois modes de paiement RP, référence unique et clé d’idempotence. Prix lus côté serveur. Annulation motivée, restitution du stock et contre-écriture. |
| Stocks | Décrément conditionnel en transaction, historique, ajustements motivés et alertes de seuil. |
| Finances | Journal issu des opérations, solde agrégé sur **toutes** les écritures, CA du mois, dépenses du mois, courbe réelle sur 7/30/90 jours, export CSV. Les montants sont des centimes entiers. |
| Dépenses | Enregistrement, seuil configurable, validation/refus et comptabilisation unique après validation. |
| Clients et CRM | Répertoire, création/édition, coordonnées, notes internes, segments, archivage et documents accessibles liés. Rendez-vous et rapprochement des anciennes ventes à venir. |
| Devis et factures RP | Brouillons, numérotation, lignes/remises, émission interne, décision, conversion unique, règlement RP et contre-écriture unique à l’annulation. Page privée imprimable/enregistrable en PDF par le navigateur. Aucun envoi automatique ou paiement réel. |
| Fournisseurs et achats | Répertoire, contacts, archivage, bons de commande RP, édition des brouillons, statuts, réception complète transactionnelle : stock, mouvements et dépense RP. Rejouer une réception ne double aucun effet. CSV du lot chargé. Réceptions partielles et livraisons avancées à venir. |
| Organisation | Tâches à faire/terminées, priorité et échéance. |
| Notifications | Centre personnel, non-lues, marquage comme lu, invitation/service/absence, actualisation toutes les 60 secondes quand l’onglet est visible. |
| Audit | Journal append-only dans l’application, auteur, action, entité et date. Écrit dans la même transaction que les mutations métier. |
| Interface | Français, sombre par défaut, clair mémorisé, palette monochrome, sidebar repliable par groupe et réductible en icônes, mobile, création rapide filtrée, répertoire des entreprises, page de formule/quotas, recherche globale, formulaires accessibles Radix, toasts, états vides, chargement et erreurs. TanStack Table, Recharts, React Hook Form et Zod. Aucun flou/backdrop-filter. |

Les données ne sont pas stockées dans `localStorage` : le thème et la préférence de sidebar compacte y sont enregistrés. Les tableaux sont paginés et filtrés côté navigateur sur un lot limité fourni par le serveur (500 lignes généralement ; 1 000 produits/services/écritures ; 100 audits/mouvements). Les indicateurs financiers et le graphique sont agrégés côté base sur l’ensemble de la période, indépendamment de ces limites. Les exports portent sur le lot chargé, pas sur un export exhaustif du tenant. Une pagination serveur et des exports par tâche asynchrone sont nécessaires à plus grande échelle.

## Discord OAuth

Créer une application dans le portail développeur Discord et renseigner :

```env
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"
```

1. Créer une application sur [Discord Developer Portal](https://discord.com/developers/applications).
2. Dans OAuth2, enregistrer la redirection exacte `http://localhost:3000/api/auth/callback/discord` (ou le domaine HTTPS de production).
3. Copier le **Client ID** et le **Client Secret** dans `.env` : `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET`. Ce n’est pas un token de bot.
4. Redémarrer Next.js après modification des variables.

Le bouton « Continuer avec Discord » reste visible mais désactivé tant que les deux variables ne sont pas renseignées. Aucun accès alternatif n’est activé. Better Auth traite l’échange OAuth, l’état, les cookies et la session ; seuls les scopes par défaut `identify` et `email` sont demandés, avec consentement Discord. Aucun scope bot ou accès aux serveurs Discord n’est demandé. Le rapprochement automatique avec d’anciens comptes e-mail reste désactivé ; une reprise de compte doit être effectuée explicitement par l’administrateur après vérification d’identité, jamais sur la simple déclaration du navigateur.

Après consentement, l’utilisateur rejoint `/app`, ou `/app?invite=...` lorsqu’il suit une invitation. Un refus/échec revient sur `/login` avec un message et la possibilité de réessayer. Les liens d’invitation émis sous l’ancienne racine restent compatibles. Le flux Discord externe n’a pas été testé avec des identifiants réels dans cette livraison : la configuration et les protections locales ont été vérifiées, sans simuler de connexion OAuth réussie.

## Architecture

```text
src/app/                       Pages serveur, API et thème
src/components/                Shell et vues interactives, formulaires, tableaux
src/components/ui/             Primitives Button/Dialog compatibles shadcn/Radix
src/domains/core/validation.ts Entrées Zod et limites des montants
src/domains/core/service.ts    Orchestration transactionnelle, contrôles et opérations métier
src/domains/core/queries.ts    Projections de données selon les permissions
src/domains/commerce/         CRM, devis, factures et règlements RP
src/domains/purchasing/       Fournisseurs, commandes et réceptions transactionnelles
src/domains/modules/registry.ts Modules, routes déclarées, dépendances et permissions
src/lib/auth.ts                Better Auth + adaptateur Prisma
src/lib/db.ts                  Client Prisma partagé
prisma/                       Schéma normalisé et migration SQL versionnée
scripts/                      Initialisation locale et seed explicite
tests/                        Unitaire et intégration PostgreSQL
```

`/` est l’accueil public, `/login` la connexion Discord et `/app` le shell privé, avec le tenant conservé dans `?company=...`. Les routes du registre sont des identifiants de navigation préparant de futures pages par module ; elles ne sont pas encore des URLs Next.js individuelles. La couche métier ne dépend ni de la navigation React ni de FiveM.

`POST /api/workspace` authentifie la session, contrôle l’origine, valide les entrées puis appelle le service. `GET /api/workspace` ne retourne que les domaines autorisés ; les salaires sont exclus pour les grades sans gestion des employés. Les références entre ressources métier utilisent des clés étrangères composites `(companyId, id)` pour empêcher les associations entre tenants. Chaque recherche ou mutation métier filtre le tenant autorisé.

Les écritures critiques sont sérialisées par entreprise avec un verrou transactionnel PostgreSQL. La baisse du stock est aussi conditionnelle à la quantité disponible. Pour les ventes en caisse, le prix est relu en base ; les devis, factures et commandes acceptent les prix saisis par les personnes autorisées, validés en centimes côté serveur. Les ventes et écritures ont des contraintes d’unicité pour les doublons. Le journal n’a aucun endpoint de modification ni de suppression. Les clés d’invitation sont hachées ; le lien brut est renvoyé uniquement à sa création.

Le schéma prévoit les documents privés, contrats, plans, abonnements, automations et jobs dédupliqués. Ces tables constituent des fondations ; elles n’impliquent **aucun worker, paiement, upload ou signature fonctionnel**.

## Validation

```sh
npm run typecheck
npm test
npm run build
npm start
# Dans un autre terminal, avec le serveur lancé :
npm run test:http
```

`npm test` nécessite la base configurée et migrée. Les tests créent leurs propres comptes temporaires sans identifiants de connexion, puis les retirent dans l’ordre des dépendances. Utiliser une base de développement/test dédiée, jamais une base de production.

La suite vérifie les montants et validations, le catalogue de modules, les dépendances, l’isolation en lecture/écriture, l’affiliation autorisée, les invitations, les projections sans salaire/comptabilité, l’édition effective des permissions, la protection de la direction, les quotas de plan, la suspension immédiate, les ventes concurrentes sans survente, la répétition idempotente, les produits d’un autre tenant, le remboursement unique, le blocage d’un module désactivé, les dépenses à valider, les services et chevauchements, les pointages, les absences, l’audit sans secret et les destinations de retour après connexion.

Le test HTTP vérifie l’accueil public, `/app` protégé, la conservation des invitations, le refus de connexion/inscription par mot de passe, puis le cookie de session, la création persistante d’une entreprise vide, le refus d’une origine étrangère, l’isolation par URL et la déconnexion. La partie authentifiée utilise une session fixture signée créée uniquement dans le test avec accès direct à sa base : elle ne simule pas un consentement Discord et n’ajoute aucun endpoint de contournement dans l’application.

## À poursuivre

- Photo privée, évaluations/sanctions structurées, documents et départs détaillés ; transfert de propriété et permissions salaire dédiées. Les dossiers RP, notes, formations/certifications, historique et suppression/réaffectation des grades sont disponibles.
- Invitations/rôles d’administrateurs serveur, demandes d’affiliation bilatérales, administration consolidée et suspension/archivage des entreprises.
- Disponibilités, récurrences, échanges de services, retards et notifications de changement du planning ; les vues jour/semaine/mois et la modification sont disponibles.
- Images/variantes du catalogue, historique CRM lié aux ventes, remises en caisse, remboursements partiels, modèles et génération PDF serveur, commissions, paie comptabilisée, réceptions partielles et inventaires physiques. L’édition/archivage des produits et clients, les devis/factures et les achats avec réception complète sont disponibles.
- Documents S3 privés (upload contrôlé, antivirus, URL signée), contrats et validations RP traçables, export PDF. Les variables S3 sont réservées, sans code d’upload actif.
- Relations interentreprises avec acceptation bilatérale, mini-sites publics et candidatures.
- Annonces, messagerie, calendrier, équipements et succursales.
- Moteur d’automatisation durable avec worker, reprise, déduplication, dead-letter et planification ; les modèles Automation/Job seuls ne suffisent pas.
- Abonnements payants et webhooks Stripe vérifiés, aucun paiement ni abonnement payant simulé. Les limites Free sont contrôlées lors de l’adhésion et la création ; le provisionnement et la configuration des offres ne sont pas exposés.
- Super-administration SaaS séparée avec privilèges exclusivement attribués côté serveur. Aucun compte super-admin ni bypass client n’existe.
- Profil modifiable, association des personnages à l’adhésion, gestion/révocation des sessions et préférences de notification. L’authentification reste exclusivement Discord.
- Pagination serveur, ressources chargées à la demande, quotas de stockage et automatisations, tests de charge et politiques de rétention. Cette version n’est pas validée pour plusieurs milliers d’utilisateurs simultanés.

## Exploitation et Vercel

Utiliser PostgreSQL managé et TLS ; renseigner les variables privées dans l’environnement Vercel. Exécuter `prisma migrate deploy` dans une étape de release contrôlée et `npm run build` pour le build. Ne pas déployer la base Prisma locale et ne pas charger le seed de démonstration. Pour l’accès depuis un reverse proxy, `BETTER_AUTH_URL` doit correspondre à l’origine publique HTTPS ; vérifier les en-têtes proxy d’origine et d’adresse IP pour le rate limiting.

Le rate limiter d’authentification est stocké en base. Les requêtes de mutation métier ont une limite de 80 tentatives par utilisateur et minute, y compris les opérations refusées. Les compteurs sont validés séparément pour qu’un rollback métier ne les efface pas. Les entrées applicatives de rate limiting expirées doivent être purgées régulièrement (clé préfixée `app:`, `lastRequest` en millisecondes). Les limites de création d’entreprises, d’espaces serveur et d’employés se configurent côté base dans `Plan.limits` (`companies`, `servers`, `employees`) ; aucun formulaire client ne peut les modifier. L’envoi massif d’invitations et les demandes de création doivent aussi être surveillés avant ouverture publique.

Sauvegardes : PostgreSQL managé avec PITR, sauvegarde quotidienne chiffrée, rétention définie et restauration répétée sur une instance séparée. Pour un PostgreSQL autonome, `pg_dump --format=custom` puis restauration testée avec `pg_restore` ; ne jamais inclure les secrets `.env` dans un dépôt. Définir les objectifs RPO/RTO, vérifier les clés étrangères et rapprocher somme des écritures, ventes, annulations et mouvements après restauration. L’audit en base n’est pas une preuve cryptographique ni une protection contre un administrateur SQL ; une rétention externe immuable est une évolution distincte.

Cette livraison est locale. Aucun site, abonnement ou service payant n’a été publié/provisionné.

## Refonte du 18 octobre 2026

Le cahier des charges complet dépasse les fonctionnalités actuellement livrées. Le suivi détaillé de tous les domaines et des prochaines étapes est dans [docs/REFONTE-SUIVI.md](docs/REFONTE-SUIVI.md). Le catalogue marque les modules indisponibles et les écrans indiquent leurs limites. Les 18 modules disponibles ne signifient pas que chaque fonction avancée du nouveau cahier des charges est achevée.

Les migrations `20261018170000_commercial_documents` et `20261018180000_purchase_orders` ajoutent la structure sans supprimer de données ni modifier les droits existants. Les nouvelles entreprises reçoivent les permissions actuelles. Pour les entreprises anciennes, un plan de droits commerciaux est préparé dans `docs/commerce-access-plan.json`. `npx tsx scripts/commerce-access.ts` prépare ce plan sans mutation. Son application avec `--apply` est réservée à une opération explicitement approuvée, auditée et limitée aux grades Direction nommés ; les grades employés et les activations des modules ne changent pas. L’attribution automatique initialement envisagée a été refusée par le contrôle d’approbation. Après accord explicite de l’utilisateur, le plan ciblé a été appliqué aux deux directions nommées et ses deux écritures d’audit ont été vérifiées (`docs/commerce-access-applied.json`). Les modules peuvent maintenant être activés dans le catalogue selon les besoins de chaque entreprise.

Sur le moteur PostgreSQL local Windows, les tests sont exécutés en série et dans un seul processus (`--test-isolation=none`) : cela a évité les arrêts observés entre workers. Les scénarios de mutations concurrentes restent exécutés avec `Promise.all` dans les tests. Les vérifications de navigateur de ce lot portent sur l’accueil et la connexion ; les routes privées et leurs flux ont été testés par HTTP avec de vraies sessions temporaires. Aucun export d’écran privé dans le dossier public n’est fourni.


## Finalisation des composants et premier lot RH

Le suivi courant des **34 modules** est dans [RPILOT_PROGRESS.md](RPILOT_PROGRESS.md), avec dépendances, priorités et limites. La plateforme entière n’est pas encore terminée.

Les vues existantes utilisent désormais les sélecteurs RPilot, un calendrier français personnalisé, des champs et erreurs cohérents, des infobulles et une palette de commande au clavier. La bibliothèque est dans `src/components/ui/`. Pour les valeurs de dates contrôlées, employer `RPilotDatePicker` / `RPilotDateTimePicker` avec `value` et `onValueChange` ; `RPilotInput` conserve la compatibilité des anciens formulaires non contrôlés. `npm run audit:ui` vérifie les sources contre la réintroduction de contrôles interdits. `/dev/ui` présente uniquement des composants de contrôle en développement et rend une 404 dans le build de production.

Les dossiers employés ajoutent informations RP, notes privées, formations, certifications et historique paginé. Leur API dédiée applique les permissions et masque les textes RH/salaires aux autres lecteurs. Les grades proposent un ordre persistant, la duplication, des modèles de droits, un aperçu effectif et une suppression transactionnelle avec réaffectation. L’ordre ne confère aucun privilège. Aucun gestionnaire ne peut déléguer un accès absent de ses propres droits.

Les migrations additives `20261018190000_employee_dossiers` et `20261018200000_role_hierarchy` préservent les accès et données. Les anciennes lignes de carrière ne sont pas reconstruites artificiellement.

Sous Windows, le moteur PostgreSQL embarqué a coupé pendant les suites longues. Une base PostgreSQL de test distincte peut être lancée avec `npm run test:postgres`, puis `npm run test:postgres:http` après un build. Ces commandes utilisent les binaires PostgreSQL installés (`PG_BIN` configurable), un cluster ignoré dans `.local/postgres-tests`, une authentification SCRAM et une écoute locale, puis l’arrêtent à la fin. Elles ne réinitialisent ni ne copient la base RPilot. Le second script arrête aussi son aperçu de production temporaire. Les résultats actuels et limites sont dans [docs/verification-finalisation.md](docs/verification-finalisation.md).
