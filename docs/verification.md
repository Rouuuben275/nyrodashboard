# Vérification — refonte RPilot du 18 octobre 2026

Résultats de la livraison initiale. Les vérifications plus récentes sont dans [verification-finalisation.md](verification-finalisation.md).

## Résultats du dernier lot

| Contrôle | Résultat |
| --- | --- |
| `npm test` | **42 tests réussis, 0 échec** : validations, permissions, isolation et transactions |
| `npm run test:http` | **1 parcours complet réussi**, après le dernier build |
| `npm run typecheck` / TypeScript du build | Réussis |
| `npm run build` | Build Webpack de production réussi, y compris `/app/billing/[id]` |
| `prisma migrate status` | 4 migrations appliquées ; schéma à jour |
| Données existantes | Migrations additives, aucun reset ; pas de changement automatique des droits |

Les fichiers de test sont chargés dans un seul processus avec `--test-isolation=none`, en série. Cela a permis d’éviter les coupures du moteur PostgreSQL local observées lors des changements de workers Windows. Les tests de ventes, conversions, règlements et réceptions concurrentes utilisent toujours des requêtes concurrentes réelles.

## Flux vérifiés

- Contrôles initiaux conservés : isolation par entreprise, refus d’affiliation sans droit serveur, invitations destinées au bon compte, expiration/réutilisation, projections sans salaires ni finance pour un employé, grade Direction protégé, quotas, suspension immédiate, ventes sans survente, annulation et reprise de stock, dépenses validées une seule fois, pointage/absences, audit sans secret.
- CRM : création/édition/archivage, refus sans permission ou avec identifiant d’un autre tenant, notes privées absentes du journal d’audit.
- Devis : montants en centimes, remise bornée, brouillon modifiable, émission immuable, transitions autorisées, conversion concurrente vers une facture unique.
- Factures : émission, règlement RP comptabilisé une seule fois, annulation motivée avec une seule contre-écriture, agrégats financiers réels, conservation des données quand le module est désactivé. Les snapshots clients ne changent pas après modification/archivage de la fiche.
- Fournisseurs/achats : références et contacts cloisonnés, produits d’un autre tenant refusés, brouillon sans effet financier, commandes confirmées immuables, réception sans double comptabilisation, stock et coûts mis à jour dans la même transaction.
- Réception échouée à la seconde ligne : rollback de la première ligne, des mouvements, du statut et de la dépense vérifié. Réception concurrente : quantités et écriture ajoutées une seule fois.
- Planning : modification autorisée, refus de chevauchement, refus de changement d’un service d’un autre tenant et refus de planifier pendant une absence validée.

- Catalogue : modifications sans changement de stock, prix historiques conservés, archivage/réactivation, référence archivée invendable, refus sans droit ou tenant incorrect, achat en attente bloquant l’archivage et borne de stock vérifiés.

## Vérification HTTP

Accueil public, connexion Discord exclusivement, protection de `/app`, conservation des invitations, endpoints mot de passe désactivés, cookie falsifié refusé, création d’une entreprise vide, origine étrangère refusée, JSON invalide ou `null` refusé en 400, persistance d’une tâche.

Création client/facture par API, rendu privé de la facture imprimable, absence du jeton de session et des notes internes CRM dans le HTML, redirection d’un visiteur anonyme, émission/règlement et écriture de 24 690 centimes RP. La page imprimable cesse de divulguer le document lorsque le module Factures est désactivé. Déconnexion invalidant la session.

Les sessions de cette vérification sont des fixtures signées créées uniquement depuis le test local puis supprimées. Aucun endpoint de connexion de secours ni export de page privée dans `public/` n’a été ajouté.

## Vérification navigateur

- Accueil et connexion : logo utilisateur intact, affichage en niveaux de gris, interface monochrome.
- Accueil : 1440 × 1000 et 390 × 844. Largeur du document respectivement 1435 et 385 px ; aucun débordement horizontal.
- Menu mobile : ouverture, lien FAQ et fermeture après sélection vérifiés. FAQ native ouverte et contenu accessible.
- Connexion : 390 × 844 et 1440 × 1000. Bouton Discord actif, page sans débordement ; retour accueil accessible.
- Démarrage OAuth vérifié : redirection effective vers Discord, scopes `identify` / `email`, callback local `/api/auth/callback/discord`, demande de consentement. Arrêt à la connexion Discord ; aucun mot de passe entré, aucun consentement validé, aucun compte réel connecté par l’agent.

Captures : [accueil desktop](screenshots/refonte-accueil-desktop.png), [accueil mobile](screenshots/refonte-accueil-mobile.png), [connexion desktop](screenshots/refonte-connexion-desktop.png), [connexion mobile](screenshots/refonte-connexion-mobile.png).

## Limites et traçabilité des accès

- Le panel privé a été compilé, testé par services et par HTTP. Sa vérification visuelle interactive après la refonte reste à effectuer avec une vraie connexion utilisateur. La capture d’un écran authentifié dans le dossier public a été refusée par le contrôle automatique ; cette méthode a été abandonnée et aucun fichier public privé n’a été créé.
- L’attribution automatique des nouveaux droits avait été refusée par le contrôle automatique. L’utilisateur a ensuite autorisé explicitement le plan limité aux directions de « Benny’s Original Motor Works » et « Benny's ». **Plan appliqué et vérifié : deux grades, dix permissions par grade et deux écritures d’audit.** Preuve : `commerce-access-applied.json`. Les grades employés et les activations de modules restent inchangés.
- Pas de validation du consentement/retour OAuth réel, de génération PDF serveur, d’envoi externe, de stockage privé de fichiers, de paiement, de workers d’automatisation ou de charge de production.
- Les vues paginent côté client un lot borné de données. Les limites des nouveaux modules sont affichées dans leurs écrans ; les fonctionnalités restantes de l’ensemble du cahier des charges sont suivies dans `REFONTE-SUIVI.md`.

L’historique de la version précédente est conservé dans `verification-v0.1.md` ; ses captures et résultats ne décrivent pas l’interface actuelle.
