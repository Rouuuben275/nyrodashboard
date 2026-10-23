# Nyro Dashboard — ce qu’il reste à développer

État du dépôt local au 23 octobre 2026, après les lots Documents de dossiers / Notes de frais et préparation de la migration Vercel. **29 modules disponibles sur 34 ne veut pas dire 29 modules intégralement finalisés.** Les validations et limites précises de chaque livraison sont dans `RPILOT_PROGRESS.md`. Les nouvelles migrations de cette session sont locales ; la production n’est pas déclarée mise à jour. La publication et les secrets restent à configurer manuellement selon `VERCEL_COMMANDES_WINDOWS.md`.

## Les cinq modules encore indisponibles

| Module | À développer réellement |
| --- | --- |
| Contrats RP | Modèles, rédaction, participants autorisés, versions figées, approbations, signature RP, PDF privé et archives. Le modèle DB existant ne constitue pas un parcours utilisateur. |
| Automatisations | Règles configurables utiles : stock faible, échéances, services, factures, candidatures, rapport hebdomadaire. Exécution durable, déduplication, reprises, historique et notifications au bon moment. Les modèles Automation/Job seuls ne suffisent pas. |
| Succursales | Établissements, responsables locaux, employés, droits par site, rattachement des stocks, transferts et statistiques de site. Un entrepôt n’est pas une succursale. |
| Mini-site d’entreprise | Publication explicite des seuls champs publics : logo, présentation, catalogue, horaires et recrutement ; contact, demandes de devis et rendez-vous avec protection antispam. La vitrine Nyro existante est distincte. |
| Relations interentreprises | Annuaire, demandes et accord des deux entreprises, droits de partage, commandes/factures/contrats/livraisons et historique commun. Une fiche client ou fournisseur ne donne aucun accès à une autre entreprise. |

## Compléments des 29 modules déjà disponibles

### RH et équipe

- **Employés** : photo RP personnalisée, procédure détaillée de départ/licenciement avec conservation de l’ancien dossier. Les emplois inactivés perdent déjà leurs accès.
- **Grades** : hiérarchie métier plus fine, modèles avancés et permissions supplémentaires par action. Création, édition, ordre, duplication, aperçu et contrôles serveur existent déjà.
- **Planning** : modèles de services, échanges, remplacements et validation par responsable ; notifications plus complètes. Les récurrences et conflits de base sont déjà livrés.
- **Pointage** : demandes de correction initiées par l’employé et validation du responsable ; règles calendaires avancées d’heures supplémentaires. Les corrections motivées par responsables, pauses et validations existent ; les statistiques des services validés sont désormais disponibles.
- **Absences** : politiques et soldes de congés, notifications étendues. Les justificatifs privés sont rattachés à la demande ; ils deviennent non modifiables après décision.
- **Recrutement** : formulaires personnalisables, pièces jointes privées, relances, recherche RH avancée et historique au-delà des 100 événements actuellement exposés.
- **Paie** : régularisations après versement ou remboursement commercial, permissions financières plus fines et recette complète des enchaînements RH. Les versements RP uniques et bulletins privés existent ; aucun paiement bancaire réel.
- **Évaluations** : permissions par action plus fines, restitution détaillée des anciennes versions et restauration des brouillons archivés.
- **Sanctions RP** : pièces jointes privées, permissions plus fines et restitution détaillée des anciennes versions.

### Commerce, comptabilité et stocks

- **Ventes** : remboursements partiels, avoirs, promotions automatiques, objectifs commerciaux et régularisations des commissions déjà versées. Remise autorisée et remboursement intégral sont disponibles.
- **Caisse** : réutiliser ces futurs remboursements partiels/avoirs/promotions et choisir l’entrepôt de vente. La caisse actuelle utilise le stock général et le même service de vente.
- **Comptabilité** : justificatifs des autres opérations comptables manuelles, rapprochement vente-facture, régularisations de paie et clôtures avancées. Les notes de frais sont désormais reliées au journal lors de leur remboursement RP unique.
- **Dépenses** : plafonds par catégorie/employé/période, notes à plusieurs lignes et ventilation, remboursements partiels, export dédié/PDF et circuits de validation configurables. Le parcours livré couvre un montant par note, plusieurs justificatifs privés, soumission, retrait pour correction, décision indépendante, annulation du brouillon et remboursement RP intégral unique.
- **Produits** : descriptions et images, variantes, imports avec aperçu/validation, exports et recherche serveur plus complète.
- **Stocks** : sous-emplacements, inventaires physiques par entrepôt, rattachement aux futurs établissements, import avec aperçu et retours partiels. Allocations, entrepôts et transferts atomiques existent déjà.
- **CRM** : rendez-vous, suivi et relances, historique d’achats lié et recherche serveur avancée.
- **Devis** : modèles, PDF serveur privé et partage/envoi contrôlé.
- **Factures RP** : modèles, PDF serveur privé, partage/envoi et historique avancé. Elles restent des documents RP, sans facture fiscale SaaS.
- **Fournisseurs** : historique commercial/achats enrichi et suivi détaillé des livraisons.
- **Commandes d’achat** : liste intégralement paginée côté serveur (le workspace charge encore les 500 récentes), retours fournisseurs, PDF, pièces jointes et suivi de livraison. Les réceptions partielles et leur historique paginé existent.

### Organisation et pilotage

- **Dashboard d’accueil** : demandes et événements pertinents, disposition persistée des widgets sur cet accueil. La nouvelle personnalisation de widgets concerne actuellement la page Statistiques.
- **Tâches** : glisser-déposer du Kanban et rappels durables d’échéance. Les pièces jointes suivent maintenant les droits de la tâche et restent conservées avec leurs versions.
- **Documents** : aperçu PDF intégré, rattachement aux autres fiches métier (recrutement, sanctions, commandes, équipements…), dossiers imbriqués, analyse antivirus et évolution du stockage selon les volumes. Les PDF sont actuellement téléchargeables ; les images/texte ont un aperçu.
- **Messagerie** : pièces jointes, départ volontaire et transfert de propriété d’un groupe, blocage/signalement, éventuels accusés individuels et temps réel. Le créateur reste seul gestionnaire ; les conversations s’actualisent toutes les 20 secondes quand la page est visible.
- **Annonces** : notifications réellement exécutées à la date de publication programmée, avec déduplication et reprise. La visibilité datée existe ; elle ne remplace pas un moteur de tâches différées.
- **Calendrier** : rappels différés durables, alertes avancées de conflits et échanges de calendrier externes.
- **Historique et audit** : enrichir les actions qui ne produisent pas encore de différences avant/après ; index/recherche adaptés à de gros volumes.
- **Statistiques** : rapports programmés, consolidation interentreprises autorisée, marges historiques avec coûts figés, stock historique et analyses supplémentaires selon les besoins. Les sources gardent leurs permissions. Les stocks/emplois/statuts de commande actuels et les produits avant remise sont explicitement identifiés ; aucun prorata d’heures n’est inventé.
- **Véhicules et équipements** : photos et documents privés liés, catégories personnalisées, carburant, correction exceptionnelle et motivée d’un compteur, rappels différés et éventuels liens comptables explicitement validés. Le registre actuel n’impute aucun stock ni dépense automatiquement.

## Espaces transversaux à compléter

- **Panel des communautés RP** : espace dédié complet pour les administrateurs de communauté, rôles personnalisés/éditeur de droits, gestion détaillée des entreprises et dirigeants, restrictions de modules, statistiques et économie consolidées selon les droits. Admissions, annuaire et blocages existants sont conservés.
- **Communautés** : invitations nominatives ordinaires par Discord ID, restrictions plus fines, départs volontaires et recours. Ne pas confondre adhésion communautaire, grade d’entreprise et rôle administratif.
- **Bannières serveur** : téléversement depuis le PC ; le logo local est déjà disponible, la bannière reste une URL.
- **Profil personnel** : informations modifiables autorisées, présentation du compte Discord lié, liste personnelle des sessions et révocation, historique personnel. Préférences de thème, personnages et déconnexion existent. La révocation globale par l’administration SaaS ne remplace pas cette interface personnelle.
- **Paramètres entreprise** : archivage utilisateur conservateur, transfert de propriété avec consentement et contrôles de capacité, préférences et sécurité plus complètes. Logo local, description, secteur, modules et grades existent.
- **Notifications** : rappels différés et éventuels canaux externes autorisés. Le centre personnel paginé, les filtres, non-lus et préférences sont déjà livrés ; ne pas le reconstruire.

## Mise en production et exploitation — hors modules métier

- Appliquer les migrations manquantes sur **la bonne base Neon**, publier le build vérifié, puis tester en production avec les vrais comptes : Discord, sessions, droits, écritures et fichiers. Ne pas rejouer de seed ni réinitialiser la base.
- Finaliser la bascule sur Vercel : six variables de production, callback Discord, historique/migrations Neon, publication puis recette hébergée et fichier privé de 5 Mo. Le code utilise désormais Next.js Node.js ; le Worker historique reste conservé jusqu’à validation. Aucun succès local n’est présenté comme la résolution de l’ancien incident 1102 sur ce Worker.
- Traiter séparément les trois alertes npm élevées de la chaîne Prisma CLI / `@prisma/config` / `deepmerge-ts` constatées le 23 octobre ; le correctif proposé par npm implique Prisma 7 et doit être testé comme une migration dédiée.
- Préparer une sauvegarde/restauration PostgreSQL vérifiée, la supervision, les alertes et une recette de charge adaptée aux volumes. Les empreintes de conservation ne constituent pas une sauvegarde restaurable.
- Renseigner l’identité légale réelle de l’éditeur et le contact officiel de support encore signalés dans les pages publiques.
- **Slots à 5 €** : le parcours existant reste désactivé. Compte Stripe, configuration prestataire, recette externe et activation explicite de vrais paiements restent nécessaires si cette offre doit être ouverte. Aucune clé secrète ne doit être mise dans le code ou le chat.
- L’administration globale Nyro, les offres premium, les factures fiscales et les outils internes de maintenance ne sont pas des fonctionnalités supplémentaires à développer dans la mission utilisateur actuelle.

## Priorités conseillées pour les prochains lots

**Livré localement le 23 octobre** : rattachement privé aux employés, absences, dépenses et tâches ; justificatifs versionnés et notes de frais jusqu’au remboursement RP. Les plafonds et autres limites restent décrits ci-dessus.

1. Compléter les plafonds de frais et les justificatifs des autres opérations comptables selon les besoins.
2. Terminer les échanges/remplacements de planning et les demandes de correction de pointage.
3. Livrer les PDF commerciaux et la pagination complète des commandes, puis les retours fournisseurs.
4. Développer les contrats RP et leurs approbations/signatures sur une version précise.
5. Exécuter réellement les automatisations/rappels, puis compléter les espaces personnels et le panel communautaire.
6. Poursuivre succursales, mini-sites et partenariats selon les usages concrets des entreprises.
