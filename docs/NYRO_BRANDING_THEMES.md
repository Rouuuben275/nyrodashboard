# Nyro Dashboard — identité et apparence

Les logos fournis sont conservés dans `public/branding/`. L’icône carrée et le logo horizontal sont recadrés/redimensionnés depuis les fichiers utilisateur ; le logo complet empilé reste disponible. Aucun dessin généré ou remplacement par un logo inventé. Les tailles 32/180/192/512 servent au favicon, au raccourci Apple et au manifest. Les documents imprimés utilisent les images sur fond blanc. Les images des entreprises/serveurs ne sont jamais inversées.

## Compatibilité conservée

Le Worker et son domaine `rpilot.rpilot.workers.dev`, les callbacks Discord, les variables `RPILOT_*`, les clés de paiement/idempotence, le préfixe documentaire, les composants `RPilot*` et les clés locales `rpilot:sidebar` / `rpilot:theme` sont techniques. Ils restent inchangés. Les anciennes lignes d’audit et données utilisateur ne sont pas renommées ; le préfixe des anciens événements système serveur est adapté uniquement à l’affichage.

La nouvelle marque couvre les composants, pages publiques/privées, guides, textes de sécurité, métadonnées Open Graph, manifest et en-têtes/attributions des PDF et exports. L’ancienne capture de documentation est conservée sur disque mais n’est plus exposée : le guide utilise une illustration documentaire explicitement identifiée, sans publier une capture portant l’ancien logo.

## Règle des préférences

1. Avant le premier affichage, le script du layout lit la clé locale existante. Valeur inconnue ou stockage bloqué : `system`.
2. `system` résout le signal standard `prefers-color-scheme`. Un abonnement `change` adapte l’apparence sans rechargement ; un choix explicite `dark`/`light` reste prioritaire.
3. Après identification, une préférence PostgreSQL existante prime sur le choix de l’appareil. Sans préférence de compte, le choix local est adopté par une initialisation conditionnelle qui ne peut pas écraser un choix enregistré entre-temps.
4. Le header et Mon profil → Préférences → Apparence partagent le même contexte. Les écritures sont sérialisées ; le choix local est appliqué immédiatement et la sauvegarde distante est signalée en cas d’échec.
5. Le choix persiste après rafraîchissement, déconnexion et nouvelle session. Les onglets du même navigateur suivent les événements `storage`, sans provoquer de boucle d’écriture.

Les pages publiques ne font pas de lecture de session dans leur layout serveur pour l’apparence ; elles restent compatibles avec leur stratégie de rendu/cache. Le script initial applique la préférence locale avant l’affichage ; la préférence distante est synchronisée après résolution de la session. Aucune préférence, cookie d’authentification ou information de compte n’est placée dans le HTML public mis en cache.

## Tokens et composants

`src/app/theme.css` centralise les palettes monochromes clair/sombre et les tokens sémantiques. Les couleurs historiques des écrans utilisent une rampe neutre commune calibrée pour les surfaces/bordures/textes clairs, sans filtre d’inversion de page. Les composants, graphiques et portails utilisent ces variables. `color-scheme`, focus, scrollbars et Sonner suivent le thème résolu. Les feuilles d’impression/PDF gardent une surface blanche stable.

## API et migration

`GET /api/profile/theme` et `PATCH /api/profile/theme` : session active, préférence du seul compte courant, origine des mutations, JSON strict de 1 Ko maximum, trois valeurs possibles et limitation des changements. Aucune modification de grade ou d’accès.

Migration additive `20261022160000_theme_preference` : un champ facultatif avec contrainte PostgreSQL, sans mise à jour/suppression d’anciennes lignes. Appliquer les migrations manquantes sur la bonne base Neon avant publication. Aucun nouveau secret ou paiement activé. Voir `CLOUDFLARE_DEPLOIEMENT.md`.

## Vérification

Les résultats exécutés, captures et limites de recette sont consignés dans `RPILOT_PROGRESS.md`. Les changements du signal système sont testables par une MediaQueryList simulée ; le navigateur de recette vérifie aussi sa préférence système effective. Cela ne constitue pas une modification physique des réglages Windows ni une certification sur tous les navigateurs. Le manifest est vérifié ; l’installation native et le fonctionnement hors ligne ne sont pas déclarés testés.
