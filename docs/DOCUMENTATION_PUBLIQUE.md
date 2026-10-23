# Accueil et documentation publique RPilot

Les pages publiques utilisent les données éditoriales du dépôt, sans lecture des entreprises ni des dossiers RH. Routes : `/`, `/docs`, `/docs/[slug]`, `/tarifs` et `/legal/[slug]`. Le nom public retenu est **Équipe RPilot**. Aucun contact e-mail ou Discord fictif n’est configuré ; `/docs/support` décrit l’assistance actuellement possible. Les pages légales signalent les renseignements d’éditeur encore manquants et ne sont pas présentées comme une validation juridique complète.

## Modifier un guide

- `src/content/docs/registry.ts` : dix chapitres, 74 articles, slugs stables, titres, descriptions, mots-clés et date. La numérotation est générée à partir de l’ordre des chapitres/articles.
- `src/content/docs/module-guides.ts` : fonctions réellement disponibles, permissions, configuration, étapes, exemple et limites propres aux 34 modules. Les états d’activation proviennent du registre métier ; une fonction en développement ne reçoit pas de faux tutoriel.
- `src/content/docs/user-guides.ts` : connexion, communautés, entreprises, abonnements, compte et assistance. Ne pas ajouter les procédures de l’administration globale à ces contenus publics.
- `src/content/docs/types.ts` : sections structurées, étapes, encadrés, tableaux, FAQ, illustrations et liens. Le sommaire utilise ces mêmes titres et identifiants d’ancre.
- `src/content/docs/content.ts` : contenu d’article et index de recherche dérivés du même registre. Ne pas créer une seconde liste manuelle de navigation.

Un nouvel article doit avoir un slug unique et un contenu correspondant. Garder les slugs des articles existants afin de conserver les liens partagés. Mettre à jour sa date lorsque son contenu change. Les tests vérifient couverture, numérotation, liens croisés, recherche et exclusion des procédures internes.

## Illustrations et captures

Les aperçus interactifs de l’accueil sont identifiés comme démonstrations et ne modifient aucune entreprise. Les schémas documentaires ne sont pas présentés comme des captures.

Les captures réelles publiées sont déclarées dans `src/content/docs/screenshots.ts`, avec chemin, dimensions, texte alternatif et légende. Les fichiers résident dans `public/docs/screenshots/`. Pour actualiser une capture : utiliser un environnement de recette isolé, vérifier qu’elle ne contient aucune donnée réelle ou secret, remplacer l’image puis mettre à jour manifeste et légende. La capture d’historique d’admission provient du parcours réel sur comptes fictifs ; aucun écran d’administration globale n’est publié.

## Recherche et interface

La sidebar charge seulement les métadonnées nécessaires. L’index textuel complet est récupéré à la première utilisation de la recherche via `/api/docs/search` puis partagé entre filtre et palette ; le navigateur peut le garder en cache public. Les pages ne transportent pas tous les articles complets dans leurs composants client. Les résultats respectent les accents, pondèrent titre/mots-clés/contenu et évitent la correspondance de « stock » avec le seul mot « stockage » dans le corps d’un article.

La palette s’ouvre avec Ctrl+K ou Cmd+K ; les flèches, Entrée, Tab et Échap permettent la navigation. La recherche conserve les catégories parentes et les ouvre temporairement. Après navigation, le filtre est remis à zéro pour rendre le nouvel article visible. Le sommaire suit les titres avec IntersectionObserver. Les liens et les boutons Copier utilisent les ancres du registre de sections.

Les pages documentaires, légales et tarifaires sont déclarées statiques. L’accueil conserve les anciens liens d’invitation et de société. Aucun changement de Better Auth, des permissions des grades ou de l’architecture Prisma/Cloudflare n’est requis pour afficher ces pages.

## Avis sur les articles

`POST /api/docs/feedback` exige une session active, la bonne origine, du JSON borné et un article connu. Une empreinte de compte et l’article forment une clé unique ; un second choix remplace le précédent. Le plafond est de dix actions par minute et par compte, avec une seule ligne de limitation par compte. Aucun texte libre ni IP n’est ajouté aux avis. Le retour négatif ouvre un lien vers l’assistance et ne prétend pas créer un ticket.

La migration additive `20261021210000_documentation_feedback` crée une seule table. Elle est nécessaire pour enregistrer les avis en production, pas pour lire les guides. Aucun secret ou binding Cloudflare supplémentaire.

## Vérifications

```powershell
npx.cmd tsx --test tests/documentation.test.ts
npm.cmd run typecheck
npm.cmd run audit:ui
npm.cmd run test:postgres
npm.cmd run build
npm.cmd run test:postgres:http
npm.cmd run build:vinext
npm.cmd run verify:worker-artifact
npm.cmd run test:workers
```

Exécuter les builds Next.js et vinext **successivement** : les deux outils génèrent `.next/types/routes.d.ts` avec des formats différents. Ne pas lancer les harnesses PostgreSQL simultanément. `node scripts/test-postgres.mjs --ui-docs` prépare une session fictive locale pour la recette des avis ; le processus de bootstrap n’est pas une route de l’application et refuse les bases non isolées. Le fichier `.local/qa/docs-ui.stop` termine cette recette et nettoie ses données.

La publication utilise le script Cloudflare existant avec `-Migrate -Publish` pour appliquer la nouvelle migration, en fournissant la connexion de la bonne branche de production. Ne pas réinitialiser Neon. Le problème de budget CPU Workers Free diagnostiqué précédemment reste une condition d’exploitation distincte ; ce lot public ne déclare pas l’erreur 1102 résolue en production.
