# Archive technique Cloudflare avant migration Vercel

Les fichiers `.disabled` conservent le manifeste, le lockfile, les configurations vinext/cf, les adaptateurs Workers et les procédures de publication antérieurs. Ils ne font plus partie de l’exécution, du build TypeScript, du déploiement Vercel ou des commandes npm actives. Le test de compatibilité des redirections vinext est archivé avec son code spécifique ; les parcours OAuth Next.js restent testés.

Cette archive n’est ni une sauvegarde de Neon, ni un paquet à exécuter sans revue. Le Worker distant `rpilot`, ses secrets et son KV n’ont pas été supprimés. Le retour immédiat consiste à utiliser l’ancien déploiement, dont le callback Discord doit rester enregistré jusqu’à validation réelle de Vercel. Ne pas rejouer de seed ou de reset. Voir `VERCEL_DEPLOYMENT.md` à la racine.
