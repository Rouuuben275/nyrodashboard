# RPilot — reste à faire et prompt de développement autonome

État vérifié le 18 octobre 2026 à partir du code et de RPILOT_PROGRESS.md. Ce fichier est un cahier de développement prêt à transmettre ; sa création n’implémente pas les fonctionnalités décrites.

## 1. Règle de fonctionnement

**Comptabilité et stocks doivent être entièrement utilisables dans le navigateur, sans ressource FiveM, connexion au serveur de jeu, accès à sa base, bot Discord ou serveur RP affilié obligatoire.**

Le site conserve son propre backend Next.js et sa base PostgreSQL. Les membres autorisés saisissent les opérations RP et les quantités depuis le site. Le solde et les stocks sont ceux suivis par RPilot ; leur concordance avec les opérations en jeu dépend des saisies et contrôles des utilisateurs. Une action RPilot ne transfère pas d’argent et ne crée pas d’objet dans le jeu.

Déjà opérationnels sans connexion au jeu : produits, caisse et ventes, annulation de vente avec contre-écriture et remise en stock, ajustement motivé du stock, dépenses/validation, commandes avec réception complète, factures réglées RP, journal financier et CSV. Les automatismes entre ces modules s’exécutent dans le backend du site.

## 2. Liste exhaustive des 34 entrées

18 modules sont disponibles, avec des fonctions encore partielles. Les 16 autres entrées sont indisponibles ou à l’état de fondation. La caisse intégrée existe ; l’entrée « caisse dédiée » désigne une vue distincte encore indisponible.

| # | Module | État actuel | Reste à développer |
|---|---|---|---|
| 1 | Dashboard `dashboard` | Partiel | Bénéfice, demandes, événements, widgets persistés |
| 2 | Employés `employees` | Partiel | Photo personnalisée, évaluations/sanctions structurées, documents et licenciement détaillé |
| 3 | Grades `roles` | Partiel | Hiérarchie métier plus fine, modèles avancés, permissions plus détaillées par action |
| 4 | Planning `planning` | Partiel | Disponibilités, récurrences, modèles, remplacements/échanges, notifications |
| 5 | Pointage `time` | Partiel | Pauses, corrections motivées, validation, heures supplémentaires, statistiques |
| 6 | Absences `leaves` | Partiel | Types, justificatifs privés, calendrier et conflits étendus |
| 7 | Ventes `sales` | Partiel | Remises/promos, remboursements partiels, avoirs, vendeur/objectifs/commissions |
| 8 | Caisse dédiée `cash` | Indisponible | Décider et implémenter le flux distinct avant activation |
| 9 | Comptabilité `finance` | Partiel | Catégories, corrections traçables, bilan, périodes, PDF |
| 10 | Dépenses `expenses` | Partiel | Justificatifs, notes de frais, plafonds, workflows, remboursements |
| 11 | Produits `products` | Partiel | Descriptions, images, variantes, import/export, recherche |
| 12 | Stocks `inventory` | Partiel | Entrepôts/emplacements, inventaires, écarts, transferts, établissements |
| 13 | Tâches `tasks` | Partiel | Assignation, en cours, liste/Kanban, checklists, commentaires, PJ, notifications |
| 14 | Audit `audit` | Partiel | Filtres serveur, pagination, différences avant/après |
| 15 | CRM `crm` | Partiel | Rendez-vous, suivi, relances, achats liés et recherche serveur |
| 16 | Devis `quotes` | Partiel | Modèles, PDF serveur, envoi sécurisé |
| 17 | Factures `invoices` | Partiel | Modèles, PDF serveur, envoi, historique avancé |
| 18 | Fournisseurs `suppliers` | Partiel | Historique commercial et livraisons enrichis |
| 19 | Achats `orders` | Partiel | Réceptions partielles, livraisons, PDF et documents |
| 20 | Recrutement `recruitment` | Indisponible | Offres, formulaire, candidatures, entretiens, décision, embauche, historique |
| 21 | Paie `payroll` | Indisponible | Calcul fixe/horaire, primes/retenues/commissions, périodes, validation, versement RP, PDF |
| 22 | Évaluations `reviews` | Indisponible | Critères, évaluations, suivi, accès et historique |
| 23 | Sanctions `sanctions` | Indisponible | Motifs, décisions RP, historique et accès |
| 24 | Contrats `contracts` | Fondation | Modèles, création, validation/signature RP, PDF et archive |
| 25 | Statistiques `statistics` | Indisponible | Rapports RH/finance/commerce/présence/stocks, périodes, PDF/CSV, programmation |
| 26 | Documents `documents` | Fondation | Stockage privé, dossiers, upload validé, autorisations, historique |
| 27 | Annonces `announcements` | Indisponible | Générales/département, importance, publication, archive et notification |
| 28 | Messagerie `messages` | Indisponible | Conversations, membres autorisés, pagination, abus, notifications |
| 29 | Calendrier `calendar` | Indisponible | Événements, invitations/RSVP, rappels, récurrence et annulation |
| 30 | Matériel `equipment` | Indisponible | Registre, catégories, affectations, état, entretien, incidents, documents |
| 31 | Succursales `branches` | Indisponible | Établissements, responsables, équipes, stocks, transferts et stats |
| 32 | Automatisations `automations` | Fondation | Déclencheurs, conditions/actions, worker, planning, reprises, déduplication, logs |
| 33 | Mini-site `public` | Indisponible | Vitrine entreprise, produits, horaires, recrutement, contact/devis/RDV, publication |
| 34 | Partenaires `partners` | Indisponible | Annuaire, accord bilatéral, contrats/commandes/factures/livraisons partagés |

## 3. Espaces transversaux encore à terminer

- **Entreprise** : logo, activité modifiable, archivage, transfert de propriété, paramètres des modules et notifications, préférences et sécurité.
- **Profil** : édition, comptes connectés, personnages RP associés aux adhésions, sessions actives/révocation, notifications et sécurité.
- **Serveur RP** : dashboard consolidé, membres/rôles/permissions, invitations, demandes d’affiliation, validation des dirigeants, transferts/délégations, économie, validations, statistiques, paramètres, modules autorisés et abonnement. Cet espace reste indépendant de FiveM.
- **Administration SaaS** : dashboard global, utilisateurs/entreprises/serveurs, plans/quotas/modules, signalements, suspensions, journaux, statistiques et paramètres ; privilèges contrôlés côté serveur.
- **Abonnements** : Entreprise+, Serveur RP et offres personnalisées, historique, gestion de souscription, Stripe Checkout, webhooks signés/idempotents, renouvellement, annulation et échecs. Ne pas activer de facturation réelle sans configuration et vérification explicites.
- **UI et responsive** : revue exhaustive des pages privées après connexion réelle, ordinateur/tablette/mobile, tableaux, formulaires, menus et modales ; compléter les usages des composants communs lorsque les nouveaux modules arriveront.
- **Performance** : pagination/filtres serveur, chargement par domaine, index vérifiés, listes longues, bundle/images, cache tenant-safe, mémoire et tests de charge.
- **Sécurité et exploitation** : tests RBAC et multi-serveurs, fichiers privés, protections des formulaires publics, migrations de compatibilité, quatre alertes npm liées à la chaîne Prisma CLI, sauvegarde/restauration, rétention et préparation du déploiement.
- **Validation** : consentement et retour Discord avec un vrai compte, vérification visuelle privée, puis workflows complets RH, paie, ventes/stocks/finance, partenaires, administration serveur/SaaS et mobile.

Les contrôles précédents ont réussi : 57 tests, un parcours HTTP de production, TypeScript et build. Ils ne couvrent pas les fonctions qui restent à développer.

## 4. Priorité nouvelle : comptabilité autonome

Ces exigences précisent le prochain développement ; elles ne sont pas toutes présentes aujourd’hui.

- Ajouter depuis le site une recette RP libre et une dépense RP, avec date d’opération, libellé, catégorie, montant, mode de règlement et compte RP.
- Gérer les catégories et les comptes suivis : caisse, compte bancaire RP et autres comptes personnalisés. Ils représentent des registres internes.
- Enregistrer une reprise de solde au démarrage par une écriture d’ouverture motivée, après prise en compte de l’historique existant. Ne pas additionner une seconde fois les anciennes écritures.
- Transférer un montant entre deux comptes d’une même entreprise : deux mouvements liés, un débit et un crédit, dans une seule transaction ; aucun effet sur les revenus, charges ou résultat.
- Brouillons, validation/refus motivé selon les droits et seuils, règlements partiels et soldes restant dus si ces fonctions sont implémentées.
- Justificatifs privés, notes de frais, remboursements et plafonds employés/grades.
- Corriger une écriture validée par une contre-écriture liée, datée et motivée ; conserver l’original et l’historique. Refuser les annulations multiples.
- Relier ventes, devis/factures, achats et paie sans doubler les montants. Une facture liée à une vente déjà comptabilisée ne doit pas générer un deuxième revenu. Une réception fournisseur déjà comptabilisée ne doit pas produire une deuxième charge lors d’une saisie de règlement.
- Distinguer la date métier de l’opération, sa date de saisie et son auteur ; utiliser un fuseau explicite pour les rapports.
- Afficher soldes par compte, revenus/charges nets, résultat RP selon une formule visible, comparaison des périodes, catégories et rapprochement manuel. Les écritures d’ouverture et transferts sont exclus du résultat.
- Ajouter recherche/filtres/pagination serveur, export CSV complet et PDF serveur selon les permissions, sans limite silencieuse aux lignes chargées dans le navigateur.
- Ne jamais permettre de modifier directement un champ « solde » pour contourner le journal. Calculer les totaux sur l’ensemble des écritures autorisées.

## 5. Priorité nouvelle : stocks autonomes

- Créer et modifier produits/prestations, catégories, références, descriptions, images et variantes avec leurs prix et quantités. Les prestations non suivies ne doivent pas recevoir de mouvements de stock.
- Déclarer le stock de départ, entrer/sortir du stock avec date, motif et auteur, sans toucher directement à une quantité hors du service transactionnel.
- Catégoriser les mouvements : stock initial, réception, vente, retour, perte/casse RP, consommation, transfert et correction d’inventaire.
- Ajouter entrepôts, emplacements et stocks par établissement ; les quantités de chaque emplacement doivent se rapprocher du total de l’entreprise.
- Préparer un inventaire physique RP : périmètre, quantités attendues, quantités comptées, écarts, motif et validation. Enregistrer uniquement les écarts validés, une seule fois. Refuser ou recontrôler une validation si le stock a changé depuis le comptage.
- Transférer entre emplacements : sortie et entrée liées et atomiques ; le stock total de l’entreprise reste inchangé.
- Recevoir partiellement une commande : cumuler les quantités reçues sans dépasser les quantités commandées ; n’ajouter que les quantités et coûts effectivement reçus. Empêcher les doublons de réception.
- Prévoir retours et remboursements partiels avec règles explicites de remise en stock, sans remettre deux fois les mêmes unités.
- Définir et afficher la méthode de valorisation. Conserver les prix historiques des ventes et réceptions ; ne pas annoncer un coût moyen/FIFO tant qu’il n’est pas implémenté et testé.
- Alertes de seuil, recherche/filtres/pagination serveur, historique complet, import CSV avec prévisualisation et rapport d’erreurs, exports CSV/PDF complets.
- Une entrée de stock manuelle n’est pas forcément une dépense : stock initial, transfert et correction sont distincts d’un achat. Une dépense ne crée pas de stock sans réception explicitement liée.
- Empêcher les quantités négatives et hors limites, y compris lors de ventes, transferts ou inventaires concurrents. Conserver les mouvements validés et corriger par mouvements compensatoires.

## 6. Prompt complet prêt à transmettre

Copier le texte ci-dessous, en donnant accès au dépôt et à ce fichier.

---

Tu travailles sur le dépôt RPilot existant. Lis AGENTS.md, les guides de la version Next.js installée, RPILOT_PROGRESS.md et docs/RPILOT_RESTE_A_FAIRE_ET_PROMPT_AUTONOME.md. Vérifie le code avant de déclarer une fonction absente ou terminée.

Mission : poursuivre la finalisation des 34 modules et des espaces transversaux. La liste exhaustive du présent fichier fait partie de la demande. Commence maintenant par la comptabilité et les stocks autonomes, puis poursuis les autres fonctions restantes par lots métier cohérents.

RÈGLE PRIORITAIRE : toutes les fonctions de comptabilité et de stocks doivent être accessibles et persistantes directement sur le site, avec un compte Discord et une entreprise indépendante. Aucun script FiveM, accès au serveur de jeu, bot, framework RP ou connecteur n’est nécessaire. Les services backend de RPilot assurent les opérations et automatismes internes. Ne développe pas de connecteur FiveM comme prérequis. Explique dans l’interface que les saisies sont des opérations RP internes et ne déplacent ni monnaie ni objets en jeu.

CONSERVER : base et données actuelles, Discord, comptes, entreprises, serveurs RP, employés, grades, multi-entreprises, permissions existantes, deux directions déjà approuvées et logique de ventes/finances/stock. Ne réinitialise pas la base. Fais uniquement des migrations de préservation contrôlées, sans supprimer l’historique ni recomptabiliser les anciennes opérations.

LOT A — COMPTABILITÉ : implémente les exigences de la section 4 de ce fichier : recettes/dépenses manuelles, comptes et catégories, reprise de solde par écriture, transferts internes équilibrés, validation, corrections par contre-écritures, liens aux ventes/factures/achats/paie, calculs cohérents et exports complets. Les anciennes dépenses et réceptions gardent leurs effets financiers ; prévois explicitement la transition vers les comptes sans double comptabilisation.

LOT B — STOCKS : implémente les exigences de la section 5 : stocks initiaux, entrées/sorties typées, emplacements, inventaires avec écarts, transferts, réceptions partielles, retours, valorisation définie, seuils, import/export et historique. Vérifie toutes les mutations concurrentes et les cas de stock modifié entre comptage et validation.

LOT C — LIAISONS : une vente ne sort le stock et ne produit le revenu qu’une fois ; un remboursement ne restaure que les unités prévues et n’inverse que le montant remboursé. Une facture liée ne double pas le revenu de la vente. Une réception partielle ne poste que son coût propre et ne peut pas être rejouée. Les transferts de comptes ou d’emplacements ne changent pas respectivement le résultat ou le stock total. Une correction conserve son lien vers l’opération originale.

SÉCURITÉ : contrôle côté serveur la session, l’adhésion active, le tenant, le module et le droit précis de chaque lecture/mutation. Aucun accès supplémentaire ne doit être accordé automatiquement aux grades existants. Prépare les éventuelles nouvelles permissions et leur plan d’attribution séparément. Protège les documents par autorisation à chaque accès. Respecte les contrôles d’origine, le rate limiting, la validation Zod, l’audit et les contraintes d’unicité/composites.

FIABILITÉ : montants en centimes entiers, quantités bornées et règles d’arrondi explicites. Transactions pour toutes les écritures liées, verrouillage ou contrôles conditionnels contre la concurrence, clés d’idempotence et contraintes d’unicité. Conserver l’auteur, la date métier, la date de saisie, le motif, le type et les références d’origine. Ne pas inventer de données ni exposer de textes privés dans un audit général.

UI : réutilise src/components/ui et le design system noir/blanc/gris. Menus opaques, calendrier français personnalisé, aucune interface native incohérente, aucun backdrop-filter. Prévoir états vides/chargement/erreur, confirmations utiles, navigation clavier et responsive. Aucun bouton décoratif ou module faussement disponible.

PERFORMANCE : endpoints avec pagination et filtres serveur, agrégats sur les données complètes, index justifiés, chargement à la demande et exports autorisés portant sur la sélection complète. Ne charge pas des milliers de lignes dans le navigateur pour les filtrer.

TESTS À AJOUTER : recettes/dépenses/soldes d’ouverture ; transferts de comptes conservant le résultat ; corrections et annulations uniques ; vente liée à une facture sans double revenu ; réception et règlement sans double charge ; entrées/sorties ; transferts de stock conservant le total ; inventaire rejoué ou devenu obsolète ; réceptions partielles concurrentes ; remboursements partiels ; tenant incorrect, droits insuffisants, module désactivé, accès privé et audit. Vérifier aussi les saisies entièrement depuis le navigateur sans serveur de jeu.

VALIDATION : utiliser une base de test dédiée, notamment npm run test:postgres sur cet environnement ; npm run audit:ui, TypeScript, tests métier adaptés, build, puis npm run test:postgres:http. Ne jamais traiter une exécution interrompue comme réussie. Tester les vrais écrans sur ordinateur, tablette et mobile, et conserver les preuves. Ne pas contourner la connexion Discord pour obtenir une capture privée publique.

ENSUITE : poursuivre les fonctions restantes de la section 2 et les espaces de la section 3 : RH/recrutement/paie, commerce, organisation, fichiers privés, succursales/matériel, partenariats/mini-sites, automatisations/rapports, profil/dashboard/audit, serveur RP, administration SaaS, abonnements et préparation production. Les paiements Stripe réels restent désactivés sans configuration et vérification explicites.

MÉTHODE : auditer, préciser le flux, migrer sans perte, implémenter backend et interface, vérifier puis actualiser RPILOT_PROGRESS.md après chaque lot. Poursuivre automatiquement dans les limites de la session. À une limite de session, laisser les changements enregistrés, les serveurs de test arrêtés et un état exact permettant la reprise. Ne pas déclarer la mission entière achevée tant qu’une exigence manque.

LIVRABLE : fonctions réelles et persistantes, migrations, tests exécutés, preuve visuelle, documentation utilisateur et liste exacte des limites. Commence le développement ; ne t’arrête pas à une maquette ou à un plan.

---
