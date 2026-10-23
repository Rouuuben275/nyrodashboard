# RPilot — suivi de la refonte du 18 octobre 2026

Le suivi courant de finalisation et ses preuves se trouvent dans `RPILOT_PROGRESS.md` et `docs/verification-finalisation.md`. Ce document conserve le détail de la refonte initiale.

Ce document suit le cahier des charges « Refonte UI/UX complète + développement de tous les modules ». Une fonctionnalité existante n’est pas pour autant complète au regard de ce nouveau cahier des charges. Ne jamais activer un module factice.

## Architecture et règles conservées

- Next.js 16.4, React 19, Prisma/PostgreSQL, Better Auth/Discord, Lucide, Radix, Recharts.
- `/` vitrine ; `/login` identité Discord ; `/app` espace protégé ; `/api/workspace` lecture et mutations authentifiées.
- Validation Zod, permissions et modules vérifiés dans le service, transactions et verrou par entreprise, centimes entiers, audit et projections filtrées. Les données existantes sont conservées.
- Trois niveaux à distinguer : entreprise, serveur RP, plateforme SaaS. Les privilèges de plateforme doivent être attribués côté serveur et ne peuvent pas provenir d’un grade d’entreprise.
- Tokens communs : `src/app/design-system.css`. Les sélecteurs historiques de `globals.css` restent pour la compatibilité des écrans existants ; leurs couleurs ont été neutralisées. Nouvelle vitrine : `landing-page.tsx` / `landing.css`.
- Logo fourni intact : `public/brand/rpilot-logo.png`, affiché en niveaux de gris par le composant commun `Brand`.
- Les nouveaux domaines doivent étendre le service transactionnel et ses contrôles, sans créer de seconde voie d’accès moins protégée. Relations composites tenant/identifiant pour les liens entre modules.

## Audit initial

13 modules exposés avant cette refonte : dashboard, employés, grades, planning, pointage, absences, ventes, finance, dépenses, produits, stocks, tâches, audit. Fondation de modèles CRM/fournisseurs/documents/contrats/automatisations, sans écrans ni flux opérationnels. Gestion multi-entreprises/invitations et espace serveur limité déjà présents. Aucun panel SaaS, paiement, upload privé ou moteur d’automatisation opérationnel.

## Phases

1. **Audit effectué** : routes, modèles, permissions, projections, transactions et composants examinés.
2. **Refonte appliquée** : nouvelle vitrine monochrome, logo commun, thème neutre appliqué aux écrans, sidebar compacte persistée, création rapide autorisée, répertoire des entreprises, page formule/quotas. Les offres payantes restent explicitement indisponibles.
3. **Socle existant à compléter**, selon le tableau ci-dessous.
4. **Modules avancés à développer** par flux cohérents ; priorité CRM → devis/factures → fournisseurs/réception → RH avancées → organisation → espaces serveur/SaaS.
5. **Vérification de chaque lot** : TypeScript, tests, migrations, build, navigateur desktop/mobile. Les preuves actuelles sont dans `docs/verification.md` ; les anciens résultats sont archivés dans `docs/verification-v0.1.md`.

## État fonctionnel détaillé

| Domaine | Opérationnel au début du lot | Reste du nouveau cahier des charges |
| --- | --- | --- |
| Authentification | Discord configuré dans le code, sessions protégées, invitations conservées à la connexion | Identifiants Discord présents ; démarrage vers Discord vérifié. Consentement et retour d’un compte réel restent à vérifier |
| Tableau de bord | CA, dépenses, solde, effectif, services, ventes, activité, stocks, périodes graphiques réelles | Bénéfice dédié, événements, demandes, widgets persistés par utilisateur |
| Employés | Invitations, affectations, dossier RP, notes privées, formations/certifications, historique, planning/heures autorisés et agrégats | Photo privée, évaluations/sanctions structurées, documents et départs détaillés |
| Grades | Création/édition, ordre, duplication, modèles de droits, aperçu effectif, suppression/réaffectation transactionnelle et audit | Hiérarchie métier plus fine, modèles avancés et permissions par action plus détaillées |
| Recrutement | Non disponible | Offres, formulaires, candidatures, entretiens, conversion en employé |
| Planning | Jour/semaine/mois, services modifiables, conflits horaires/absences, filtres employés/départements, absences autorisées, suppression, CSV, impression | Récurrence, disponibilités, échanges, pagination serveur et navigation exhaustive sur grands historiques |
| Pointage | Prise/fin de service, historique, durée | Chronomètre, pauses, correction autorisée, validation, statistiques |
| Absences | Périodes/motif, validation/refus, notifications, historique | Types, justificatifs privés, calendrier |
| Paie | Salaire individuel renseigné uniquement | Calcul horaire/fixe, commissions, primes/retenues, fiches RP, validation/écritures |
| Ventes | Caisse, panier/quantités, paiements RP, annulation avec reprise stock et contre-écriture, CSV | Réductions, remboursements partiels, statistiques vendeur, objectifs |
| Catalogue | Création/modification produits et prestations, catégories, prix/coûts, marges, seuils, archivage/réactivation avec conservation de l’historique | Descriptions enrichies, images et variantes |
| Stocks | Ajustements tracés, seuils, vente/annulation transactionnelles | Emplacements, inventaires physiques, transferts, réception fournisseurs |
| Comptabilité | Journal, solde agrégé, revenus/dépenses, CSV | Catégories, rapports complets, corrections explicites, PDF |
| Dépenses | Création, catégorie, seuil, validation et écriture unique | Justificatifs, remboursements, plafonds individuels |
| Devis/factures | Brouillons, numérotation, lignes/remises, statuts, décision RP, conversion unique, règlement/contre-écriture, lien client, page privée imprimable/PDF navigateur | Modèles personnalisés, génération PDF serveur et envoi explicite avec destinataires/consentement |
| CRM | Répertoire, édition, contacts, notes, segments, archivage, documents accessibles liés | Rendez-vous, historique d’achats lié aux ventes et segmentation avancée |
| Fournisseurs/commandes | Répertoire et édition, contacts/notes, archivage, commandes/bons RP, statuts, réception complète idempotente avec stock/mouvements/dépense transactionnels, CSV | Réceptions partielles, historique détaillé des livraisons, bons imprimables/PDF et livraison interentreprises |
| Documents/contrats | Modèles de base seulement | Stockage privé, dossiers, upload validé, modèles, signatures RP, PDF |
| Tâches | Création, priorité, échéance, deux colonnes, terminer/rouvrir | Assignation, commentaires, checklists, vue liste, statut en cours |
| Communication | Notifications personnelles seulement | Annonces, discussions département, messagerie et permissions |
| Événements | Non disponible | Calendrier, invitations, participation, rappels, récurrence |
| Matériel/véhicules | Non disponible | Registre, affectation, état, entretien, historique |
| Succursales | Non disponible | Établissements, responsables, membres, stocks localisés, transferts/stats |
| Relations entreprises | Non disponible | Annuaire, demandes bilatérales, partenariat, docs et commandes/livraisons |
| Mini-site | Non disponible | Vitrine publique par entreprise, offres, contact, devis et rendez-vous |
| Automatisations | Modèles sans exécution | Moteur durable, déclencheurs/conditions/actions, retries, historique, rappels |
| Rapports | Exports CSV de certains modules | Rapports transversaux RH/finance/commercial, comparaisons, PDF |
| Audit | Auteur, date, action, recherche ; détails avant/après de certaines actions stockés | Lecture des différences, filtres auteur/module/période, étendre la couverture |
| Entreprise | Informations, affiliation, seuil dépenses, modules | Logo propre, type modifiable, notifications, archivage/transfert de propriété |
| Modules | Catalogue catégorisé, dépendances, activation serveur, conservation données | Paramètres spécifiques et accès direct aux permissions de chaque module |
| Serveur RP | Création, affiliation autorisée, entreprises accessibles, journal serveur | Membres/rôles, demandes, délégation direction, économie/validations/stats/settings/formules |
| Administration SaaS | Non disponible | Privilèges serveur séparés, utilisateurs/serveurs/entreprises/plans/quotas/modules, signalements/suspensions/audit |

## Critères de validation pour les prochains lots

- Toute mutation : cas autorisé + refus sans permission + mauvais tenant + module désactivé + audit.
- Toute opération financière : centimes, limites, transaction, annulation/contre-écriture, rejouer sans double comptabilisation.
- Toute réception : stock lié au bon tenant, transaction, impossibilité de recevoir deux fois.
- Aucun secret, document privé ou salaire exposé par une projection non autorisée.
- Une vue disponible doit proposer un vrai flux métier ; les options inachevées restent indiquées et désactivées.
- Ne jamais réinitialiser la base existante. Inspecter la migration additive avant application.

## Prochaine reprise

Poursuivre le socle RH, les tâches et les fonctions avancées du catalogue selon la liste prioritaire ci-dessous. Mettre à jour ce document après chaque lot avec les migrations et preuves réellement exécutées.

## Lots réalisés pendant cette session

- Vitrine et connexion recréées, logo fourni commun, tokens monochromes appliqués aux écrans existants ; navigation compacte persistée, création rapide filtrée, entreprises et quotas. Le mini aperçu de la vitrine illustre le design partagé et porte explicitement la mention de données illustratives.
- Planning : mois, modification, filtres, absences autorisées, impression et refus serveur de chevauchement avec une absence approuvée.
- CRM/devis/factures : migration additive `20261018170000_commercial_documents`, services séparés avec permissions, snapshots clients, centimes et décisions auditables, page privée imprimable.
- Fournisseurs/achats : migration additive `20261018180000_purchase_orders`, réception intégralement transactionnelle, rollback de toutes les lignes si une référence échoue, rejouage concurrent sans double stock/dépense.
- 18 modules disponibles sur les 34 entrées du registre. Aucun des autres modules n’a été activé artificiellement.
- Plan d’accès des entreprises existantes : `docs/commerce-access-plan.json`, entreprises « Benny’s Original Motor Works » et « Benny's ». Dix nouvelles permissions propres à l’entreprise ; application exécutée après accord explicite de l’utilisateur ; deux grades et deux audits vérifiés dans `docs/commerce-access-applied.json`. Ni accès SaaS/serveur ni grades employés concernés ; modules non activés automatiquement.
- Les six entreprises temporaires des trois tests interrompus de cette session ont été retirées après inspection des UUID/comptes `example.test`. Les données réelles et fixtures antérieures ont été conservées.

### Vérification de ce lot

42 tests unitaires/intégration passent, plus le test HTTP complet (sessions, protection, écritures, impression privée et module désactivé). Build de production réussi après le complément catalogue et les corrections de validation ; détails dans `docs/verification.md`. Accueil et connexion vérifiés en navigateur à 390 et 1440 px ; menu mobile, FAQ, logos et absence de débordement horizontal. Le démarrage OAuth mène à Discord avec `identify`/`email` et retour localhost ; aucun consentement/compte réel validé par l’agent. La vérification visuelle du panel authentifié reste à faire après connexion utilisateur : aucun contournement d’authentification ni copie privée publique n’a été ajouté.

### Suite prioritaire

1. Les droits approuvés sont appliqués. Les directions peuvent activer les modules souhaités dans leur catalogue.
2. Compléter le socle : descriptions/images/variantes du catalogue, grades/hiérarchie, fiches RH, pauses/corrections/validation des heures, tâches assignées/commentaires/checklists.
3. Développer paie et recrutement avec données RP et identité Discord réelle ; calendrier/événements et communication.
4. Développer documents privés, mini-sites, succursales, matériel, relations, automatisations durables et rapports.
5. Étendre le panel serveur et créer l’administration SaaS avec privilèges distincts attribués côté serveur.
6. Terminer les fonctions avancées encore indiquées dans le tableau ; vérifier chaque flux et son isolation.

### Complément catalogue

Édition des prix/coûts/références/seuils, marges, archivage et réactivation disponibles. Les mutations de catalogue ignorent toute tentative de changer le stock ; les prix des anciennes lignes de vente restent immuables. Une référence liée à un achat en attente ne peut pas être archivée. Les ajustements de stock respectent désormais une borne de 0 à 1 000 000 et refusent les prestations non stockées. Les tests couvrent ces garanties.
