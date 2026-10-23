# Slots d’entreprise par compte Discord

Une entreprise possédée est incluse par identité Discord, tous espaces confondus. Le contrôle serveur remplace l’ancien quota de dix entreprises de Free ; les valeurs historiques des plans ne sont pas réécrites. Un emploi dans un grade ordinaire ne consomme pas de slot. Les directions inactives et les entreprises archivées ou suspendues restent comptées. Les entreprises déjà présentes au-delà du quota restent conservées ; les nouvelles créations sont refusées jusqu’à disposer de la capacité nécessaire.

## Interfaces

- `/compte/slots` : utilisation, capacité incluse/attribuée/achetée, disponibilité du paiement et historique personnel paginé.
- Menu du profil → Mes slots d’entreprise ; `/espaces` → Mes slots ; Abonnement → Gérer mes slots ; formulaire de création → capacité et lien.
- `/admin/users` : capacité de chaque compte lié à Discord et action Ajouter des slots ; attribution à un Discord ID avant inscription également possible.

Les attributions demandent la nouvelle permission explicite `users.slots.manage`, une session de moins de 30 minutes, un motif et une clé de commande. Le propriétaire plateforme dispose de cette permission ; les délégations existantes ne reçoivent aucun droit automatiquement. Une attribution ajoute de 1 à 100 slots, est idempotente et conserve un audit central. L’attribution n’accorde aucun accès aux entreprises ni rôle administratif. Aucun retrait administratif de slots n’est exposé dans ce lot.

Les créations, attributions et confirmations de paiement prennent le même verrou PostgreSQL par identité Discord. Deux créations concurrentes ne peuvent pas utiliser le même dernier slot. Les capacités locales d’un serveur RP restent contrôlées séparément.

## Achat unique de 5 €

Le prix est fixé à **500 centimes EUR pour un slot**, côté serveur, sans abonnement, promotion ou quantité fournie par le navigateur. Stripe Checkout collecte le paiement. Aucune carte bancaire n’est saisie ni enregistrée par RPilot. Les commandes sont attachées à l’identité Discord vérifiée et utilisent une clé Stripe d’idempotence stable.

Le retour du navigateur ne crédite rien. Le webhook vérifie sa signature sur le corps brut (tolérance 300 secondes), puis relit la session Stripe et vérifie mode, devise, montant, référence et identité. La transaction PostgreSQL assure l’unicité du crédit même pour plusieurs événements concurrents. Les paiements expirés/non réglés ne créditent rien ; les commandes de test terminent en `TEST_PAID` et n’ajoutent aucun slot réel.

Les remboursements intégraux retirent la capacité achetée, sans supprimer les entreprises. Les contestations la suspendent ; une contestation gagnée la rétablit si elle n’a pas été remboursée. L’état actuel du paiement est relu pour résister à un webhook ancien reçu après remboursement. Le remboursement demandé par le client, les factures fiscales SaaS et les remboursements partiels ne disposent pas d’interface RPilot dans ce lot ; ils restent gérés dans Stripe par l’opérateur.

## Configuration et activation distinctes

**Paiement désactivé par défaut**, sans nouveau secret requis pour utiliser les quotas et attributions. Le code ne configure ni n’active de compte Stripe réel.

`cloudflare.config.ts` contient `slotPaymentsMode = "disabled"`. Les bindings Stripe ne sont déclarés que si ce mode devient `test` ou `live`. Les variables de `database-runtime.ts` lisent l’environnement Node local ; l’implémentation Cloudflare lit les bindings du Worker, sans intégration Vercel ni moteur Prisma natif ajouté.

Pour la recette Stripe externe :

1. Utiliser un compte Stripe de test et les informations légales du véritable opérateur.
2. Définir le mode `test` et configurer `STRIPE_SECRET_KEY` en secret (`sk_test_…`) et `STRIPE_WEBHOOK_SECRET` en secret (`whsec_…`), sans les ajouter au dépôt ni au chat.
3. Configurer le webhook `https://rpilot.rpilot.workers.dev/api/billing/webhook` et ces événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
4. Vérifier Checkout, signature, historique, rejeux, retour d’annulation et absence de crédit réel en test.
5. Avant toute activation `live` : décision explicite de l’opérateur, identité/contact/conditions commerciales renseignés, clés et webhook du même environnement. Une clé live en mode test ou une clé test en mode live désactive l’achat.

Le SDK Stripe officiel utilise Fetch et Web Crypto, avec chargement différé seulement pour les paiements. Aucun moteur binaire ajouté ni contrôle de sécurité désactivé. Le parcours Stripe externe n’est pas déclaré vérifié par les tests locaux avec transport simulé.

## Migration et publication Windows

La migration additive `20261022100000_company_slots` crée trois tables ; elle ne modifie aucun plan, compte, rôle ou entreprise historique. 24 migrations cumulées.

```powershell
Set-Location 'C:\Users\ruben\Documents\site\saasrp'
npm.cmd install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-cloudflare.ps1 -Migrate -Publish -DatabaseFromClipboard
```

Lancer la commande d’abord, puis copier la connexion complète de la bonne branche de production dans Neon → Connect quand le script l’attend et appuyer sur Entrée. Ce déploiement conserve le paiement désactivé. Ne pas réinitialiser Neon.
