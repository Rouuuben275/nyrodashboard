# Vérification — composants et premier lot RH, 18 octobre 2026

## Résultats exécutés

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | Réussi |
| `npm run audit:ui` | Aucune occurrence interdite détectée dans les sources TSX |
| `npm run test:postgres` | 57 tests réussis, zéro échec, sur PostgreSQL 18 dédié |
| `npm run test:postgres:http` | Parcours HTTP réussi sur un aperçu local du build de production et sa base dédiée |
| `npm run build` | Réussi ; routes `/api/employees` et privées compilées ; `/dev/ui` rend une 404 en production |
| Migrations RPilot | Six migrations appliquées, schéma à jour |
| Directions existantes | Deux grades, dix droits commerciaux chacun et deux audits d’attribution conservés, vérifiés après les migrations |

Le build final a été relancé après les derniers ajustements de clavier, de formulaires et de rafraîchissement des accès RH. Le parcours HTTP de production a ensuite été rejoué avec succès, y compris la 404 de `/dev/ui`.

## Composants et formulaires

- Sélecteurs natifs de toutes les vues existantes remplacés par les composants RPilot ; les `<option>` dans le code servent uniquement à décrire les choix et ne sont pas rendus en menu natif.
- Calendrier DayPicker français, mois et années via sélecteurs personnalisés ; sélection de dates, dates/heures, heures et périodes. Aucun calendrier Chrome/Windows utilisé.
- Entrées numériques sans flèches natives ; cases/radios dessinées par le design system ; champs texte et zones de texte avec erreurs intégrées, sans bulle de validation navigateur.
- Recherche via cmdk, multisélection avec tags et retrait individuel, tout sélectionner, menus Radix, sous-menus, infobulles, onglets, switch et slider.
- Listes de recherche rendues par lots de 80, avec recherche sur toutes les options fournies et chargement des résultats suivants. Le composant accepte aussi un chargeur asynchrone annulable. Cela ne remplace pas encore la pagination serveur des modules existants.
- Modales Radix avec focus géré, fermeture contrôlée et possibilité de bloquer la fermeture pendant une écriture ; drawer et popover réutilisables.
- Composant de dépôt de fichier : vérification locale taille/type, aperçu local révocable, transfert via callback réel, progression fournie par le transfert et annulation. **Aucun stockage de documents ni upload métier n’est livré par ce composant seul.**
- Palette de recherche globale du workspace utilisable au clavier ; seuls les modules et données déjà autorisés lui sont transmis.
- Page `/dev/ui` : atelier des seuls composants, sans données d’entreprise, sans session de secours, uniquement en développement.

## Preuves navigateur

- Sélecteur simple : choix Direction et transmission du vrai code métier.
- Champs obligatoires : soumission refusée ; erreurs RPilot visibles ; aucune soumission avec dates/choix vides.
- FormData contrôlé : `department=Direction`, `requiredChoice=Accueil`, `date=2026-10-18`, `start=2026-10-18T09:00`, `quantity=2`, `confirm=on`.
- Recherche dans 300 options : saisie `299`, sélection par Entrée, affichage « Option de contrôle 299 ».
- Multisélection : tout sélectionner, retrait du tag Accueil, compteur à deux.
- Calendrier dans modale : au-dessus de la modale, sans découpage ; Échap ferme le calendrier et restitue le focus au déclencheur, sans fermer la modale.
- Imbrication modale → calendrier → recherche d’année : sélection de 2028, février, puis du 29 février ; valeur française `29/02/2028`.
- Desktop 1280×720, tablette 768×1024, mobile 390×844. À 390 px, document de 390 px, modale de 354 px, calendrier de 316 px contenu entre x=38 et x=354. À 768 px, document de 768 px et modale de 510 px. Pas de débordement horizontal dans cet atelier. Réglage de viewport remis à sa valeur par défaut.

Captures : `docs/screenshots/composants-modal-desktop.jpg`, `composants-modal-tablette.jpg`, `composants-modal-mobile.jpg`.

## Dossiers RH et grades

- Informations RP persistées, notes RH, formations, certifications et étapes de carrière. Historique des changements de grade/département/statut ajouté au moment des nouvelles mutations ; aucun historique passé inventé.
- Projections RH en lecture seule : salaire, téléphone, présentation, notes et formations internes absents pour les utilisateurs sans gestion RH. Notes et textes privés non copiés dans l’audit général.
- API dédiée authentifiée, tenant explicite, `private, no-store`, événements paginés par 30 et curseur contrôlé dans le bon dossier.
- Informations, carrière, planning autorisé, heures personnelles ou RH, base salariale, notes et historique en onglets. Documents, évaluations et sanctions ne sont pas simulés.
- Grades : ordre persistant, modèles de sélection de droits, duplication par création préremplie, aperçu effectif tenant compte des modules désactivés.
- Suppression transactionnelle d’un grade personnalisé : remplacement obligatoire s’il est utilisé, réaffectation des membres et invitations, historique individuel et audit motivé. Direction, propre grade et remplacement par une direction refusés.
- Un gestionnaire ne peut créer/éditer un grade, inviter, affecter ou réaffecter avec des droits qu’il ne possède pas. Les tests couvrent ces refus.
- Le parcours HTTP exerce aussi les dossiers RH et la création/réorganisation/suppression d’un grade de test.

## Infrastructure de test et limites

Le moteur local Prisma Postgres embarqué a coupé plusieurs fois pendant la suite étendue sous Windows. Les exécutions interrompues ne sont pas comptées comme réussies. Leurs fixtures précisément identifiées ont été retirées ; aucune autre entreprise ni aucun compte réel n’ont été supprimés.

La commande `test:postgres` utilise les binaires PostgreSQL déjà installés, un cluster **distinct** dans `.local/postgres-tests`, un mot de passe aléatoire ignoré par Git, une écoute sur 127.0.0.1 et un port libre. Elle applique les migrations sans reset, exécute les tests puis arrête ce cluster. La variante HTTP lance et arrête aussi son aperçu de production. La base RPilot, son URL et les données utilisateurs n’y sont pas copiées. Les appels directs `npm test` restent possibles avec une base configurée fiable.

L’audit npm signale quatre alertes élevées liées à Prisma CLI et ses dépendances `@prisma/config`, `effect` et `deepmerge-ts`. Il propose une migration majeure de Prisma ; aucun `audit fix --force` n’a été appliqué. La mise à niveau et ses tests restent à planifier avant production.

La vérification visuelle de toutes les pages privées avec une connexion utilisateur réelle reste à faire. Aucun consentement Discord réel n’a été validé par l’agent. Les autres fonctions avancées des 34 modules, le stockage privé, les PDF serveur, le worker et les paiements Stripe restent suivis dans `RPILOT_PROGRESS.md` ; ce lot ne constitue pas une finalisation de la plateforme entière.
