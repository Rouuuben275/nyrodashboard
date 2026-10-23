# RPilot — Cloudflare Workers / vinext depuis Windows

Le dépôt utilise **Cloudflare Vite plugin v2** et `cloudflare.config.ts` (configuration typée `cf/config`), pas un projet Wrangler v1. Le CLI `vinext-cloudflare` utilise `cf` pour ce format. Ne créez pas un deuxième fichier Wrangler concurrent pour le déploiement.

Prisma CLI, client et adaptateur PostgreSQL sont alignés en **6.19.3**. `engineType = "client"` active le compilateur sans moteur natif. Le build Vite choisit explicitement l’entrée Workers/WASM de Prisma, car son résolveur SSR pourrait sinon choisir l’entrée Node et lire un fichier WASM sur disque. `@prisma/adapter-pg` + `pg` assurent les connexions PostgreSQL. `nodejs_compat` est conservé, avec la date de compatibilité du 18 octobre 2026.

Les imports existants de `db` restent valides. Sous Workers, les clients et pools sont propres au contexte de requête vinext et sont fermés après la réponse ; sous Next.js et les scripts Windows, un singleton Node est réutilisé. Better Auth reste sur PostgreSQL : sessions, état OAuth et rate limiting en base. Les contrôles d’origine et de permissions restent actifs. En production Cloudflare, l’adresse IP de limitation vient de `CF-Connecting-IP`.

## Configuration indispensable

Dans Cloudflare Dashboard → Workers & Pages → **rpilot** → Settings → Variables and Secrets, configurer les six bindings suivants. Utiliser **Secret** pour les valeurs sensibles et la configuration propriétaire, et les bindings déclarés par `cloudflare.config.ts`. Ne pas copier `.env` dans un build et ne pas mettre les secrets dans `vars` ou dans le code.

- `DATABASE_URL` : URL `postgresql://…` d’une base PostgreSQL **hébergée et accessible depuis Workers**, avec les paramètres TLS du fournisseur. Une connexion `localhost:51214` ne peut pas joindre le PC Windows depuis Cloudflare. Ce pilote n’accepte pas une URL `prisma+postgres://` d’Accelerate : utiliser la connexion PostgreSQL directe du fournisseur. Le code accepte aussi une future liaison Hyperdrive `HYPERDRIVE.connectionString`, si elle est réellement configurée ; aucune liaison factice n’est ajoutée.
- `BETTER_AUTH_URL` : `https://rpilot.rpilot.workers.dev` (ou votre domaine canonique configuré).
- `BETTER_AUTH_SECRET` : conserver le secret existant pour conserver les signatures des sessions.
- `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` : identifiants de l’application Discord existante.
- `RPILOT_OWNER_DISCORD_ID` : identifiant Discord réel du propriétaire demandé, comme binding protégé. Il est configuré localement dans `.env` ; il doit aussi être ajouté au Worker avant cette mise à jour. Le backend le compare au compte Discord lié par Better Auth, jamais à une valeur envoyée par le navigateur.

Dans le portail Discord, enregistrer exactement `https://rpilot.rpilot.workers.dev/api/auth/callback/discord` comme URI de redirection (adapter au domaine canonique si nécessaire). Ne pas utiliser l’URL éphémère d’une version prévisualisée.

**Diagnostic initial, désormais résolu :** le binding DATABASE_URL manquait et les valeurs sensibles étaient en texte brut. L’utilisateur a depuis configuré Neon et les trois secrets ; le Worker a été publié avec succès le 19 octobre 2026. Les lectures PostgreSQL et le démarrage OAuth Discord ont répondu HTTP 200 en production. Les données locales ne sont pas transférées automatiquement par les migrations.

Un identifiant sensible présent dans `.env.example` a été remplacé par un champ vide. Le secret Discord précédemment présent doit être régénéré dans le portail Discord et mis à jour localement et dans Cloudflare.

## Procédure Windows unique — tous les lots précédents inclus

Cette procédure **remplace les commandes des précédentes livraisons**. Il n’y a pas une série de commandes par module. Le dépôt contient désormais **26 migrations** ; Prisma applique automatiquement toutes celles qui manquent dans la base choisie, sans rejouer celles déjà appliquées.

1. Arrêter le serveur local lancé dans votre terminal avec Ctrl+C avant `npm ci` (Windows peut verrouiller les fichiers des dépendances).
2. Dans le tableau de bord Cloudflare, ouvrir **Workers & Pages → rpilot → Settings → Variables and Secrets**. Configurer `DATABASE_URL` vers un PostgreSQL hébergé accessible depuis Workers. Convertir `BETTER_AUTH_SECRET` et `DISCORD_CLIENT_SECRET` en secrets chiffrés en conservant les valeurs nécessaires aux sessions ; vérifier également `BETTER_AUTH_URL` et `DISCORD_CLIENT_ID`. Ne jamais saisir les secrets dans le code, l’historique PowerShell ou le chat.
3. Vérifier l’URI de callback Discord : `https://rpilot.rpilot.workers.dev/api/auth/callback/discord` (adapter si domaine personnalisé).
4. Exécuter ce bloc dans PowerShell depuis le poste actuel :

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Installation échouée.' }
npx.cmd cf auth login
if ($LASTEXITCODE -ne 0) { throw 'Connexion Cloudflare échouée.' }
npm.cmd run cf:check
if ($LASTEXITCODE -ne 0) { throw 'Configurer les bindings Cloudflare indiqués avant de continuer.' }
.\scripts\update-cloudflare.ps1 -Migrate -Publish -RunTests
```

Le script génère Prisma, vérifie TypeScript et les composants UI, exécute les tests métier PostgreSQL isolés, compile vinext, contrôle l’artefact et exécute le parcours HTTP sous workerd. Avec `-Migrate`, il demande et valide d’abord l’URL de production avec une **saisie masquée**, avant toute compilation. Après les vérifications locales et distantes, il applique `prisma migrate deploy`, effectue un dry-run et publie. Tout échec arrête la suite. Saisir l’URL de la **même base** que celle du binding `DATABASE_URL`. La variable de connexion précédente est restaurée après les migrations. Les tests utilisent un autre cluster isolé, jamais cette base.

`-RunTests` nécessite PostgreSQL natif ; il est déjà installé sur ce poste. Sur un autre poste, installer PostgreSQL et définir `PG_BIN` si son dossier bin est différent. Pour une vérification sans publication ni migration distante, utiliser `.\scripts\update-cloudflare.ps1 -RunTests`.

**DATABASE_URL est désormais présent et la lecture PostgreSQL en production a été vérifiée.** Les commandes ne peuvent pas créer une base hébergée ni transférer automatiquement les données de la base Windows. Si la base de production doit reprendre les données locales, leur transfert conservateur reste à préparer avant le changement de connexion. Ne pas utiliser `migrate reset`, `db push --accept-data-loss` ou le seed de démonstration pour une mise à jour.

Le déploiement de ce dépôt utilise **vinext-cloudflare et cf**, avec `cloudflare.config.ts` (Cloudflare Vite v2). Ne pas ajouter une configuration Wrangler concurrente ni substituer un `wrangler deploy` générique à cette commande.

Après publication : vérifier la connexion Discord réelle, la reconnexion et les sessions sur le domaine canonique. Le module Recrutement doit être activé dans **Modules** par la direction pour exposer ses offres ; les activations des entreprises existantes ne sont pas modifiées automatiquement.

## Vérifications reproductibles

Le lot Admissions du 21 octobre ajoute `20261021170000_server_admissions` : adhésions communautaires distinctes des rôles administratifs, demandes et historique privé, commandes idempotentes. `/serveurs` permet l’adhésion aux communautés ouvertes et les demandes motivées ; `/serveurs/[id]/acces` permet aux responsables autorisés de décider et de gérer les adhésions. Les quotas comptent les utilisateurs distincts via rôles serveur, communauté et emplois affiliés. Aucun nouveau secret ni binding supplémentaire par rapport au lot Administration ; les 22 migrations sont additives et aucune donnée n’est supprimée. Les serveurs déjà existants restent privés jusqu’à modification explicite de leur visibilité et mode d’accès.

Le lot Administration ajoute `20261020200000_platform_administration`, quatre tables et des colonnes additives. Les données et rôles historiques sont conservés. Il ajoute `/admin` et `/espaces` ; la création libre de serveurs est désormais refusée. Les fonctionnalités et limites sont détaillées dans [ADMINISTRATION_SAAS.md](ADMINISTRATION_SAAS.md). Les offres, Stripe et nouveau panel serveur complet restent à développer ; les admissions ont été ajoutées dans le lot suivant.

**Une seule nouvelle configuration distante est nécessaire avant publication** : ajouter `RPILOT_OWNER_DISCORD_ID` comme Secret dans Cloudflare → rpilot → Settings → Variables and Secrets, avec l’identifiant indiqué dans la demande propriétaire. Ne modifier aucun des cinq bindings existants. `cf:check` signale précisément ce binding s’il manque ; il ne peut pas vérifier une valeur chiffrée. Après cette configuration, la commande unique `update-cloudflare.ps1 -Migrate -Publish -DatabaseFromClipboard` applique toutes les migrations manquantes et publie. Lors de la première connexion, ouvrir `/espaces`, puis **Administration globale** ; `/admin` est aussi accessible directement au compte autorisé.

Le lot Calendrier partagé ajoute `20261020030000_calendar` (cinq nouvelles tables), appliqué localement sans migration Neon ni publication de ce lot. Après mise à jour, activer volontairement **Calendrier** dans Modules pour les entreprises existantes. Lecture avec dashboard.read ; gestion avec company.manage en plus de la lecture, sans ajout automatique de droits aux grades. Les événements privés sont limités à la direction et aux invités actifs ; réponses et observations personnelles restent accessibles à la direction et à l’invité concerné. Les récurrences conservent les heures de Paris ; les annulations gardent les événements et leur historique. Invitations et annulations génèrent des notifications internes immédiates. Les rappels différés restent à développer : aucun cron, secret ou binding supplémentaire à configurer pour ce lot.

Le lot Annonces internes ajoute `20261020020000_announcements` (quatre nouvelles tables), appliqué localement sans publication ni migration Neon de ce lot. Après mise à jour, activer volontairement **Annonces internes** dans Modules pour les entreprises existantes. Aucun droit de grade n’est ajouté : lecture avec dashboard.read, rédaction/publication avec company.manage en plus de la lecture. Les annonces départementales suivent le département actuel du membre ; les brouillons et publications futures restent réservés à la direction. Les dates de visibilité et d’expiration sont appliquées aux lectures PostgreSQL, sans nouvelle configuration Cloudflare ; les notifications différées à l’heure programmée ne sont pas implémentées et aucun cron n’est ajouté. Les notifications immédiates sont internes et ciblées.

Le lot Tâches avancées du 20 octobre ajoute `20261020010000_advanced_tasks` : extension additive des tâches et cinq tables pour statuts, étapes, commentaires, événements et idempotence. Migration locale vérifiée ; aucune migration Neon ni publication de ce lot. Les tâches existantes, leurs titres/statuts/priorités/dates et les droits des grades restent conservés. Aucun nouvel accès à accorder : tasks.read pour consulter, tasks.manage pour gérer ; les employés assignés peuvent commenter, suivre l’état et cocher leur checklist avec leur accès tasks.read existant. Les nouvelles fonctions sont accessibles dans le module Tâches déjà activé ; aucune pièce jointe privée ni relance programmée d’échéance n’est annoncée comme livrée.

Le lot Évaluations et sanctions RP ajoute la migration additive `20261019220000_reviews_sanctions` (cinq nouvelles tables). Elle est appliquée localement, sans migration Neon ni publication de ce lot. La même commande de mise à jour ci-dessous applique aussi cette migration. Après publication, activer **Évaluations** et **Sanctions internes** dans Modules si souhaité. Les activations et droits des entreprises existantes sont conservés : lecture sous employees.read, gestion sous employees.manage, lecture personnelle des seuls dossiers publiés ; notes internes réservées aux RH. Aucun changement automatique de grade, de statut ou de salaire à la publication d’une sanction.

Le lot Paie et exports du pointage ajoute la migration additive `20261019100000_payroll`. Il est appliqué à la base locale, mais n’a pas été publié ni migré sur Neon par cette session. Pour le mettre en production depuis ce dépôt déjà installé :

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-cloudflare.ps1 -Migrate -Publish
```

Utiliser la connexion Neon de la même branche/base que le Worker dans la saisie masquée. Après publication, activer **Salaires et primes** depuis Modules si souhaité : les activations existantes et les permissions des grades ne sont pas modifiées automatiquement. La gestion utilise employees.manage ; le versement exige en plus company.manage, finance.read et expenses.approve, avec le module Finance actif. Un autre responsable RH doit valider son propre bulletin.

```powershell
npm.cmd run test:postgres
npm.cmd run build:vinext
npm.cmd run verify:worker-artifact
npm.cmd run test:workers
npm.cmd run audit:ui
```

Ces tests utilisent un cluster PostgreSQL natif **isolé**, jamais DATABASE_URL de production. Sur ce poste, le harness utilise PostgreSQL 18 dans `C:\Program Files\PostgreSQL\18\bin` ; ailleurs, définir `PG_BIN` avec le dossier des exécutables PostgreSQL. Il démarre et arrête lui-même le cluster et l’aperçu workerd.

Le parcours HTTP teste le démarrage OAuth Discord (URL, callback, cookie et état persisté), les sessions sur plusieurs requêtes, la révocation, les permissions, les refus d’origine, le rate limiting 429 et les opérations finance/stocks. Les identifiants Discord sont des fixtures réservées à ce test ; aucun consentement externe n’est simulé comme réussi. Un vrai consentement Discord et son retour final restent à vérifier sur le déploiement, une fois sa base configurée.

Sources : [Prisma 6 sans moteur Rust](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/no-rust-engine), [Prisma 6 sur Workers](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/edge/deploy-to-cloudflare), documentation incluse avec les versions installées de vinext et `@vinext/cloudflare`.

## Slots Discord et audit — 22 octobre 2026

Ce lot remplace le quota personnel de dix entreprises par **une entreprise possédée incluse par compte Discord plus ses slots attribués/achetés**, sans modifier les entreprises déjà créées ni les JSON historiques des plans. Il ajoute `/compte/slots`, les attributions depuis `/admin/users` et les filtres, détails autorisés et exports serveur de l’audit d’entreprise. La migration additive `20261022100000_company_slots` ajoute trois tables, soit 24 migrations cumulées. Elle a été appliquée localement seulement.

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
npm.cmd install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-cloudflare.ps1 -Migrate -Publish -DatabaseFromClipboard
```

Lancer d’abord la commande, puis copier la connexion complète de la bonne branche Neon lorsqu’elle est demandée et appuyer sur Entrée. Aucun secret à envoyer dans le chat. Le paiement reste désactivé : l’utilisateur n’a pas encore de compte Stripe, aucun encaissement n’est activé et aucun secret Stripe n’est nécessaire pour déployer les quotas et attributions. Les étapes séparées de recette prestataire puis d’activation sont dans `docs/SLOTS_ENTREPRISES.md`. Le prix confirmé est 5 € en achat unique par slot, sans abonnement. Ne pas réinitialiser Neon.

## Lot accueil et documentation — 22 octobre 2026

Ce lot ajoute les routes publiques `/docs`, les 74 articles, `/tarifs`, trois pages `/legal/*`, le sitemap, les robots et une refonte de `/`. La migration additive `20261021210000_documentation_feedback` crée uniquement la table des avis documentaires (23 migrations cumulées). Lecture et recherche des guides sans connexion ; vote avec session active, unicité par compte/article et limitation des abus. Aucun nouveau secret ou binding Cloudflare.

La migration a été appliquée et vérifiée localement seulement. Pour publier ce lot sur la branche Neon de production déjà utilisée par le Worker :

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-cloudflare.ps1 -Migrate -Publish -DatabaseFromClipboard
```

Lancer la commande d’abord. Lorsqu’elle attend la connexion, copier ensuite l’URL complète depuis Neon → Connect, revenir dans PowerShell et appuyer uniquement sur Entrée. Ne pas copier une autre commande entre ces deux opérations. Le script applique les migrations manquantes et publie l’artefact vérifié ; il ne recrée pas la base. Si seule la publication échoue après migration, reprendre la publication sans refaire les migrations comme indiqué plus bas.

Les tests Next.js et vinext/workerd de ce lot sont validés localement ; aucune publication ni migration Neon n’est effectuée par cette session. Le diagnostic de ressources Workers Free décrit dans ce guide reste une condition de production distincte : le nouveau contenu public ne constitue pas une validation de résolution de l’erreur 1102. Le nom public des pages d’information est Équipe RPilot ; les coordonnées légales et le canal officiel d’assistance restent à fournir avant une publication commerciale complète.

## Si Neon affiche « URL PostgreSQL invalide »

Ouvrir le projet Neon, cliquer sur **Connect**, sélectionner la branche de production, la base et le rôle utilisés par RPilot, puis copier la connexion PostgreSQL complète avec le bouton Copier. Le lecteur accepte l’URL seule, les guillemets, `psql 'postgresql://...'`, `DATABASE_URL='postgresql://...'`, `export DATABASE_URL=...` et `$env:DATABASE_URL = '...'`. Il extrait seulement la valeur sans exécuter le texte collé. Les guillemets typographiques et caractères invisibles en bordure sont normalisés ; aucun caractère du mot de passe n’est modifié. Les espaces/retours ou caractères invisibles à l’intérieur de l’URL sont refusés avec un diagnostic précis, sans afficher la saisie.

Si le collage masqué échoue encore, utiliser directement la procédure **-DatabaseFromClipboard** ci-dessous : lancer la commande d’abord, copier ensuite depuis Neon, puis revenir appuyer uniquement sur Entrée. Ne pas copier une autre commande entre la copie de l’URL et cette confirmation. Ne pas coller une page de tableau de bord, plusieurs lignes de configuration ni une valeur dont le mot de passe est encore masqué.

Le secret `DATABASE_URL` de Cloudflare doit lui-même contenir **l’URL seule**. La présence d’un secret chiffré ne permet pas à `cf:check` d’en vérifier la valeur. Pour les migrations Neon, une connexion directe à la même branche/base peut être utilisée même si l’application utilise l’hôte pooler. Ne pas changer de branche ou créer une autre base pour contourner l’erreur.

Validation locale du parseur, sans connexion ni migration : `powershell.exe -NoProfile -File scripts/test-database-url.ps1`.

Documentation : [connexion Neon](https://neon.com/docs/get-started/connect-neon).

## Si le collage dans la saisie masquée échoue

Une étoile affichée ne prouve pas à elle seule la cause de l’erreur. Le script propose une lecture locale du presse-papiers pour éviter les difficultés de collage des consoles Windows :

```powershell
.\scripts\update-cloudflare.ps1 -Migrate -Publish -DatabaseFromClipboard
```

**Lancer d’abord la commande**, puis, lorsqu’elle attend : ouvrir Neon → Connect, copier l’URL PostgreSQL complète avec son mot de passe, revenir au terminal et **appuyer seulement sur Entrée**, sans coller l’URL. Le script lit alors le texte du presse-papiers, le valide et le conserve en SecureString jusqu’aux migrations. Ni le contenu du presse-papiers ni l’URL ne sont affichés ou écrits dans un fichier. Ne pas copier une autre commande entre la copie Neon et la confirmation. La saisie de confirmation est elle-même masquée pour éviter d’afficher une URL collée par erreur.

Le presse-papiers n’est pas effacé automatiquement ; le script n’en lit le contenu que si cette option est explicitement utilisée avec `-Migrate`. Les tests mockent cette lecture et ne consultent jamais le presse-papiers réel.

## Conflit de configuration pendant la publication

Le mode strict du CLI a refusé la publication lorsque `cloudflare.config.ts` déclarait `BETTER_AUTH_URL` et `DISCORD_CLIENT_ID` comme secrets alors que le Worker les possédait comme variables publiques, et lorsque les logs étaient activés dans le tableau de bord mais absents de la configuration locale.

La configuration locale conserve désormais les deux valeurs publiques actuelles avec `bindings.text(...)`, les trois secrets sensibles avec `bindings.secret()`, et `observability.logs.enabled = true`. Aucun retrait de `--strict` et aucun remplacement des secrets sensibles n’est nécessaire. Si le domaine canonique ou l’application Discord publique change, adapter les valeurs publiques dans la configuration et les réglages Discord avant publication.

Le contrôle d’artefact vérifie également le maintien des logs et refuse une URL locale de callback. Les tests workerd utilisent une copie de l’artefact avec leurs propres bindings ; l’artefact de production reste inchangé pendant ces tests.

Si les migrations sont déjà terminées et que seule la publication doit être reprise, après une compilation réussie et le contrôle d’artefact :

```powershell
npm.cmd run deploy:vinext -- --skip-build
```

Ne pas relancer `-Migrate` uniquement pour reprendre une publication. Le script de mise à jour publie désormais l’artefact qu’il vient de compiler et vérifier, sans une seconde compilation implicite.

## Conflit strict sur le namespace KV — 21 octobre 2026

Après le premier provisionnement, `bindings.kv()` sans identifiant produisait un artefact sans l’ID du namespace existant. Le mode strict refusait alors la publication avec un écart sur `kv_namespaces[].id`. La configuration déclare désormais `VINEXT_KV_CACHE` avec l’ID existant `635fab443de1423cb34546dc94bb1adc`, confirmé par lecture des métadonnées du Worker rpilot. Cet identifiant de ressource n’est pas un secret. Aucun namespace n’est créé, supprimé ou vidé ; le contrôle strict est conservé.

Il faut reconstruire l’artefact qui contenait l’ancienne configuration avant de reprendre la publication. Si les migrations ont déjà réussi, exécuter ce bloc dans PowerShell, sans `-Migrate` ni nouvelle saisie Neon :

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
npm.cmd run build:vinext
if ($LASTEXITCODE -ne 0) { throw 'Compilation echouee.' }
npm.cmd run verify:worker-artifact
if ($LASTEXITCODE -ne 0) { throw 'Artefact Worker invalide.' }
npm.cmd run deploy:vinext -- --skip-build
if ($LASTEXITCODE -ne 0) { throw 'Publication echouee.' }
```

Le contrôle d’artefact refuse désormais un build qui perd ce binding ou change son namespace. Une autre instance Cloudflare doit déclarer son propre namespace existant et adapter ce contrôle avant publication. Ne pas retirer `--strict` pour contourner un écart distant.

## Erreur 1102 : budget CPU de Workers Free — 21 octobre 2026

Diagnostic distant en lecture seule : les invocations `/admin/servers` à 19:56:42 et 19:56:43 UTC ont pour résultat `exceededCpu`, dont une à 10 ms de CPU. D’autres invocations `/admin` échouent aussi à 10 ms. Les invocations réussies du même déploiement consomment environ 83–111 ms pour le démarrage/retour Discord, 130 ms pour `/admin`, 203–313 ms pour `/espaces` et 472 ms pour `/app`. Ce sont des temps CPU, distincts de l’attente réseau/PostgreSQL. La lecture des abonnements du compte connecté ne renvoie que Cloudflare Free Plan ; aucun abonnement n’a été créé ou modifié.

Workers Free garantit seulement 10 ms de CPU par requête. La tolérance ponctuelle explique que certaines requêtes dépassent ce temps avec succès ; elle ne permet pas d’exploiter durablement cette application SSR/Prisma. Aucun dépassement mémoire n’est attesté dans les événements examinés. Ni une migration Neon, ni la modification de binaryTargets, ni la désactivation du rate limiting ne corrige ce plafond.

Pour conserver l’architecture actuelle sur Cloudflare, le propriétaire du compte doit activer **Workers Paid** depuis le tableau de bord Cloudflare, rubrique Workers & Pages / offre Workers (et non une offre Pro de zone DNS). Le tarif officiel commence à 5 USD/mois, avec facturation selon l’usage au-delà des volumes inclus. Cette activation payante n’est pas effectuée par les scripts RPilot. Workers Paid donne par défaut 30 000 ms de CPU ; dans rpilot → Settings → CPU Limits, vérifier qu’aucune limite personnalisée basse n’est conservée. L’option typée du projet serait `worker.limits.cpuMs`, équivalente à `limits.cpu_ms` dans Wrangler ; elle n’est volontairement pas ajoutée pour tenter de dépasser le plafond Free.

Après activation, recharger `/admin/servers`, puis vérifier le résultat et les temps CPU dans les journaux. L’activation seule ne demande aucune migration ni secret supplémentaire et la configuration locale n’impose pas de limite CPU personnalisée. Si une publication est souhaitée ensuite, utiliser `update-cloudflare.ps1 -Publish`, sans `-Migrate` lorsque les migrations sont déjà appliquées. Le budget payant ne dispense pas d’optimiser les requêtes et exports ; il ne garantit pas à lui seul l’absence de tout autre défaut.

Sources : [limites CPU Workers](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), [tarification Workers](https://developers.cloudflare.com/workers/platform/pricing/). **Aucune correction de production 1102 n’est déclarée validée avant l’activation et une nouvelle vérification des pages concernées.**

## Publication vérifiée — 19 octobre 2026

Publication réussie sur https://rpilot.rpilot.workers.dev, version `b035df82-2b84-4ef0-84fe-a1d873928977`, avec le contrôle strict conservé. Le namespace KV déclaré par le projet a été provisionné par le CLI. Aucune migration n’a été relancée pendant cette correction de publication et aucune valeur des trois secrets sensibles n’a été modifiée. Les tentatives de conversion des deux bindings publics ont été refusées sans changement ; la correction retenue est locale : conserver leur type texte et les logs existants.

Vérifications de production : accueil, connexion et recrutement HTTP 200 ; espace privé anonyme HTTP 401 ; liste publique des offres PostgreSQL HTTP 200 ; session anonyme nulle ; démarrage Discord HTTP 200 avec callback canonique, état OAuth et cookie présents. Les cookies et jetons n’ont pas été affichés. Le consentement Discord réel et la persistance d’une session de compte après ce consentement restent à vérifier par connexion du compte utilisateur.

## Erreur 1101 au retour de Discord : correctif publié

La version `cd8c050f-3d8e-4333-8050-7bfc9272a6b7` corrige la boucle de redirection provoquée par le transport du cache vinext. Le statut 302 et ses cookies sont renvoyés au navigateur au lieu de rejouer le callback en interne. La protection OAuth n’a pas été désactivée. Source technique : [vinext #3243](https://github.com/cloudflare/vinext/issues/3243).

Après publication, repartir de **https://rpilot.rpilot.workers.dev/login** et lancer une nouvelle connexion Discord. Une ancienne URL de callback contient un code/état à usage unique ; la recharger ne peut pas terminer une nouvelle connexion. Les erreurs expirées ou annulées reviennent désormais à la page de connexion, sans boucle 1101.

Le correctif est une transformation de build versionnée dans le dépôt, avec tests et garde dans `verify:worker-artifact`. Il survit à `npm ci` ; aucun patch manuel dans node_modules n’est nécessaire. Une mise à jour de la dépendance qui change le transport demande une revue explicite de la transformation. Aucune migration supplémentaire requise pour ce correctif.

**Validation utilisateur du 19 octobre 2026 :** une nouvelle connexion Discord a réussi et l’espace authentifié s’est ouvert en production. Le retour OAuth réel est confirmé après le correctif 1101.

## Logos du PC et sélection des entreprises — 22 octobre 2026

Migration additive `20261022130000_uploaded_logos` : images normalisées en PostgreSQL (table LogoAsset), références facultatives des entreprises et serveurs, sans modification des anciennes lignes. Aucun binding de stockage ni secret supplémentaire. Le client prépare un PNG de 512 px maximum et 256 Ko maximum depuis une image PNG/JPEG/WebP de 8 Mo maximum. Validation serveur des pixels/CRC, accès authentifié et isolation par entreprise/serveur, limite d’import et stockage borné. Les anciens liens HTTPS restent utilisables. Les logos enregistrés remplacés restent conservés.

Accès : `/espaces` après Discord ; création ou Paramètres de l’entreprise ; création/édition du serveur depuis son administration. Appliquer les migrations manquantes sur la bonne base Neon avant de publier le nouvel artefact.

## Nyro Dashboard et apparence — 22 octobre 2026

La marque affichée devient Nyro Dashboard. Le nom du Worker, les URL, les callbacks Discord, les six bindings existants et les clés techniques restent inchangés. Ne renommez pas le Worker et ne recréez pas l’application Discord pour ce rebranding. Si son nom commercial dans le portail Discord affiche encore RPilot, le propriétaire pourra modifier uniquement ce nom, en conservant ID, secret et callback.

La migration additive `20261022160000_theme_preference` ajoute `User.themePreference`, facultatif et borné à dark/light/system. Aucun compte n’est réécrit. Les comptes sans préférence adoptent leur choix local une seule fois ; une préférence déjà enregistrée sur le compte prime après connexion. Aucun nouveau secret ou service de stockage. Les logos utilisateur ne sont pas recolorés ; seules les images officielles Nyro fournies sont adaptées par présentation CSS au fond.
