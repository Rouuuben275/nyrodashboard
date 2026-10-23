# Administration SaaS et espaces RP — livraison du 20 octobre 2026

Cette livraison implémente le socle de sécurité, un premier panel central opérationnel et le choix des espaces autorisés. Elle ne représente pas la finalisation des sept phases demandées.

## Identité et configuration

`RPILOT_OWNER_DISCORD_ID` est lu exclusivement dans l’environnement serveur. La valeur demandée est configurée dans `.env` local ; aucun identifiant propriétaire n’est inscrit dans les composants ou le code métier. Sous Cloudflare, ce binding protégé est déclaré dans `cloudflare.config.ts`.

L’identité vient du modèle Better Auth Account, fournisseur discord, lié à l’utilisateur de la session validée. Les noms, e-mails et identifiants fournis par le navigateur ne constituent jamais une preuve. Une identité Discord ambiguë est refusée. Le propriétaire configuré possède PLATFORM_OWNER ; les délégations actives non expirées possèdent PLATFORM_ADMIN avec leurs seules permissions explicites. Ces rôles ne proviennent jamais d’un grade d’entreprise ou d’un rôle de serveur.

Le propriétaire est protégé contre suspension, révocation ou remplacement depuis un rôle secondaire. Seul le propriétaire délègue les accès plateforme. Attributions, révocations de sessions et changements de statut exigent une session de moins de trente minutes. Suspensions et révocations de sessions exigent également la recopie de l’identifiant cible et un motif. Aucun jeton OAuth/de session n’est exposé dans les projections ou l’audit.

## Fonctions livrées

- `/admin` : compteurs PostgreSQL, inscriptions par jour/période et activité administrative récente. Les revenus SaaS restent indisponibles avant intégration des paiements ; aucun argent RP n’est compté comme revenu SaaS.
- `/admin/servers` : recherche, tri, filtre et pagination serveur ; création/édition, slug unique, description, logo/bannière par URL HTTPS et quotas. Identifiant interne et date de création générés côté serveur. Six rôles par défaut pour les nouveaux serveurs ; anciens rôles conservés.
- Attributions serveur par Discord ID, rôle du même serveur, expiration, révocation et révisions. Les comptes connus sont affectés immédiatement ; les comptes non inscrits sont reconnus lors de leur première lecture authentifiée des espaces avec le bon Discord. L’activation en attente vérifie le quota. Membres historiques et attributions sont paginés séparément.
- `/admin/users` : annuaire par nom/Discord ID, avatar, inscription, dernière session encore conservée, compteurs, suspension/réactivation et révocation des sessions. Cette dernière session n’est pas présentée comme un historique exhaustif des connexions.
- `/admin/companies` : métadonnées globales, direction, affiliation, compteurs et formule existante ; suspension, archivage conservateur et réactivation. Aucun accès implicite aux données RH, conversations, documents confidentiels ou finances détaillées.
- `/admin/administrators` : propriétaire seulement, délégations explicites, expiration et révocation. Droits recalculés depuis PostgreSQL à chaque requête.
- `/admin/audit` : recherche, pagination, résultats, motifs, corrélation et changements sélectionnés. Ouverture administrative auditée une fois par session, sans son jeton ; commandes refusées par les règles métier enregistrées DENIED/FAILED. Aucune sérialisation de requête brute.
- `/espaces` : serveurs autorisés par rôle administratif actif ou appartenance légitime à une entreprise affiliée ; espace indépendant distinct. Le workspace est filtré selon l’espace choisi. Une URL ou un identifiant ne suffit pas. Callback Discord standard vers cette sélection, invitations et retours du recrutement conservés.
- Navigation pour changer d’espace, revenir à l’indépendant ou ouvrir l’administration si autorisé. Création libre de serveurs retirée de l’interface et refusée par l’ancienne API ; le propriétaire utilise le panel dédié.
- Suspensions utilisateur/entreprise/serveur temporaires ou sans échéance, archivage réversible des entreprises/serveurs. Statuts vérifiés en lecture/mutation, y compris invitations et recrutement public. Données conservées, nouvelles créations refusées en dépassement de quota. Révoquer un rôle serveur ne supprime pas un emploi légitime dans une entreprise : les périmètres restent distincts.

Complément du 21 octobre : les modes PRIVATE/REQUEST/OPEN sont désormais opérationnels. `/serveurs` présente uniquement les communautés publiques actives, avec adhésion ouverte ou demande motivée. Les serveurs privés restent limités aux attributions et appartenances légitimes. Les demandes, retraits et décisions sont conservés dans PostgreSQL, avec historique privé paginé. Un refus impose 24 heures avant une nouvelle demande ; dix demandes maximum par période de 24 heures et limite de commandes par minute. L’adhésion ne crée aucun ServerMember, rôle administratif ou emploi.

`/serveurs/[id]/acces` est réservé aux rôles serveur possédant members.manage ou server.manage, actifs/non expirés, et aux administrateurs SaaS ayant servers.manage. Acceptation/refus motivés, adhésions paginées, blocage et réactivation communautaires historisés ; un blocage interdit de se réinscrire soi-même. La révocation du droit administratif est effective dès la requête suivante. Les emplois et rôles administratifs distincts ne sont pas effacés par un blocage communautaire. L’auteur et les responsables autorisés consultent la motivation et les décisions ; aucun autre demandeur n’y accède.

Le quota serveur compte les utilisateurs distincts issus des rôles serveur, adhésions communautaires et emplois actifs d’entreprises affiliées. Un même utilisateur n’est compté qu’une fois. L’acceptation de demande, l’adhésion ouverte, les attributions, invitations d’entreprise, réactivations, embauches et affiliations respectent cette limite. Un downgrade ne supprime aucune appartenance existante. Les notifications internes des demandes sont ciblées sur les responsables serveur autorisés ; les décisions sont notifiées au demandeur, sans diffuser sa motivation.

## Migration et données

Migration additive `20261020200000_platform_administration` : quatre tables PlatformGrant, ServerDiscordGrant, PlatformAudit et PlatformCommand ; colonnes d’état/révision/expiration et paramètres serveur. Aucun reset, seed, changement de compte Discord ni transfert de données. Slugs facultatifs pour les anciens serveurs afin de ne pas réécrire leurs identifiants.

Inspection avant migration : 13 comptes, un compte Discord lié, deux sessions valides, quatre serveurs, quatre rôles et quatre appartenances serveur, trois entreprises affiliées, quatre indépendantes et sept abonnements FREE. Empreintes de **89 tables et 989 lignes originales** inchangées après migration. Droits des deux directions commerciales approuvées conservés.

## Récupération administrative

Elle requiert un accès d’opérateur à l’environnement de déploiement. Aucune route de secours publique, mot de passe maître ou élévation par e-mail n’est ajouté.

1. Depuis un compte Cloudflare légitime, vérifier le Worker et l’identifiant Discord réel du nouveau propriétaire. Conserver une trace administrative du changement dans Cloudflare.
2. Modifier le binding protégé RPILOT_OWNER_DISCORD_ID du même Worker puis publier la version attendue. Ne jamais modifier Account pour simuler une autre identité.
3. Se reconnecter avec Discord puis ouvrir `/admin`. L’ancien identifiant perd PLATFORM_OWNER après changement de configuration. Une éventuelle délégation PLATFORM_ADMIN explicitement accordée à cet ancien compte reste distincte et doit être révoquée si nécessaire.
4. En cas d’erreur, restaurer la configuration précédente depuis l’accès opérateur. Configuration absente/invalide : aucun propriétaire par défaut. Les ouvertures du panel après récupération sont inscrites dans l’audit RPilot.

## Reste de la refonte

- Fiches utilisateurs/entreprises complètes, historique de connexion durable, invitations, modifications des informations d’entreprise, affectations/transferts de direction par Discord ID et accès exceptionnel au support limité/justifié/autorisé.
- Invitations directes de membres ordinaires par Discord ID, restrictions communautaires configurables plus fines, appels/recours et gestion des départs volontaires. L’annuaire, les demandes, décisions, adhésions ouvertes et blocages communautaires sont livrés dans le complément du 21 octobre.
- Nouveau panel serveur complet, rôles personnalisés/éditeur de permissions, gestion détaillée des utilisateurs, entreprises et directions, économie RP, délégations et approbations. Panel existant conservé pour ses administrateurs légitimes.
- Offres, abonnements manuels/offerts/essais/remises, expiration, quotas des offres, droits premium et restrictions globales de modules. Formules et quotas existants conservés ; Stripe live désactivé.
- Notifications de suspension, signalements, recours/support, maintenance, paramètres globaux, statistiques et événements de sécurité enrichis.
- Upload privé des logos/bannières et documents : URL HTTPS uniquement dans ce lot, aucun bouton d’upload factice.

Vérifications réellement effectuées dans RPILOT_PROGRESS.md. Aucun déploiement Cloudflare ni migration Neon déclenché par cette livraison locale.
