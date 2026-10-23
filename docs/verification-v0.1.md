# Vérification de RPilot v0.1 — 18 octobre 2026

## Résultat

- `npm run typecheck` : réussi.
- `npm test` : 23 tests réussis, 0 échec, sur PostgreSQL local Prisma.
- `npm run build` : compilation Next.js de production réussie avec Webpack, types vérifiés, migrations versionnées.
- `npm run test:http` : réussi sur le serveur lancé avec `npm start`.

## Parcours HTTP

L’accueil `/` est public et présente les fonctionnalités. `/app` renvoie les visiteurs non connectés vers `/login` et conserve le jeton d’invitation ; les anciennes invitations sous `/?invite=...` restent compatibles. Le test reconnaît les redirections HTTP et les redirections streamées documentées par Next.js. La page de connexion ne comporte aucun champ de mot de passe ; les endpoints de connexion et d’inscription par e-mail retournent une erreur 400 et ne créent pas de compte.

Une session fixture signée est ensuite créée directement dans la base de test, sans endpoint applicatif de contournement et sans prétendre effectuer le consentement Discord. Elle permet de créer une entreprise vide, de relire des indicateurs à zéro et d’enregistrer une tâche. Un autre identifiant d’entreprise reçoit 403, une origine étrangère 403, un JSON invalide 400 et un cookie falsifié 401. La déconnexion révoque la session, puis les fixtures sont retirées.

## Parcours navigateur

- Ancienne session de démonstration conservée pendant la migration de routes, redirection de `/login` vers `/app` pour une session valide, puis déconnexion vérifiée.
- Accueil : boutons Commencer et Se connecter, catalogue des 34 modules dépliable, FAQ dépliable et retour à l’accueil depuis la connexion. Les passages entre accueil et connexion chargent un nouveau document afin de relire la session et d’éviter un état de route périmé.
- Connexion : seul Discord est proposé ; bouton visible et désactivé avec un message d’indisponibilité lorsque ses identifiants sont absents. Aucun formulaire e-mail/mot de passe de secours.
- Caisse : ajout d’un kit de réparation, client « Validation navigateur RP », confirmation à 350 $ RP.
- Stock : quantité passée de 4 à 3 et mouvement de sortie relié à la référence de vente.
- Comptabilité : écriture de +350 $ RP visible par recherche du client ; solde passé de 352 500 à 352 850 $ RP.
- Grade Employé : formulaire d’édition prérempli, 10 permissions sélectionnées sur les 25 disponibles. La protection du grade Direction est couverte par le test d’intégration.
- Thème clair et thème sombre : contrôlés dans le navigateur.
- Format mobile 390 × 844 : navigation latérale repliable, tableaux avec défilement interne. Débordement des cartes financières corrigé, largeur du document inférieure ou égale à la largeur du viewport.
- Format ordinateur 1440 × 1000 : tableau de bord, graphique issu des écritures, activité et transactions rendus ; aucune erreur console observée.
- Nouvel accueil contrôlé sur ordinateur 1440 × 900 et mobile 390 × 844 : aucun débordement horizontal (document 385 px pour un viewport de 390 px), menu mobile opérationnel et bouton Commencer menant à la connexion Discord.

Les captures [accueil](screenshots/home.jpg), [accueil mobile](screenshots/home-mobile.jpg) et [connexion Discord](screenshots/discord-login.jpg) présentent le nouveau parcours. L’aperçu [dashboard.jpg](screenshots/dashboard.jpg) contient des données explicitement fictives ; cette capture est aussi utilisée sur l’accueil avec une légende de démonstration.

## Limites de cette vérification

La connexion Discord n’a pas été exécutée avec des identifiants OAuth réels. Aucun stockage S3, paiement, worker d’automatisation, envoi d’e-mail, déploiement Vercel ni test de charge n’a été validé. Les fonctionnalités non livrées sont listées dans le README et marquées à venir dans le catalogue.

L’environnement Windows a interrompu une instance PostgreSQL locale détachée pendant une passe de test. Après redémarrage et maintien de la base dans la même session que le serveur Next.js, la suite et le parcours HTTP ont réussi. Cela ne remplace pas une validation sur un PostgreSQL de production.
