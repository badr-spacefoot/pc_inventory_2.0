# Publication automatique Parcéo depuis GitHub

Le projet Vercel `parceo` de l’équipe `spacefoot1` est connecté au seul dépôt `badr-spacefoot/pc_inventory_2.0` par l’application officielle Vercel. L’installation et ses droits sur ce dépôt ont été approuvés explicitement ; les autres dépôts ne sont pas sélectionnés.

## Branche et build

- Branche de production : `codex/parceo-sillage-production`.
- Domaine de production : https://parceo.piqa.fr.
- Node 22.x et pnpm 10.34.5, dépendances installées avec `pnpm install --frozen-lockfile`.
- Commande : `pnpm run build:vercel`. Elle exécute lint, typecheck, 99 tests frontend/packaging, construit le frontend puis publie uniquement `dist/vercel-site`.
- Le workflow GitHub Quality complet s’exécute également sur cette branche. Il ne déploie pas de schéma Supabase.
- Les trois URL publiques API/script/manifeste sont configurées dans les variables Vercel de production et restent identiques à la migration validée.

Les commits destinés à la production doivent être intégrés à `codex/parceo-sillage-production`. `main` reste une branche historique et ne constitue pas la source du site Parcéo actuel.

Les builds qui échouent à l’installation, aux vérifications ou à la génération du paquet ne remplacent pas la production. Les previews conservent la protection Vercel existante ; aucun wildcard CORS n’est ajouté à Supabase. Les commentaires automatiques sur les pull requests sont désactivés.

## Validation initiale

Le build local passe : 99 tests, lint et typecheck. Le paquet reconstruit avec les variables de production correspond aux 61 fichiers de la version déjà en ligne. Le push `4c4581a` a déclenché le déploiement Git natif `dpl_E57xEgCZPFggNtRTDaErf6ZBQdiH`, READY en staging de production. Les 99 tests passent également sur Vercel ; health, configuration publique et manifeste 0.1.57 sont accessibles. Le champ engines est limité à Node 22 pour éviter que Vercel choisisse Node 24 malgré le réglage 22.x du projet.

L’affectation automatique des domaines est activée pour les prochaines publications de cette branche. Tout push réussi produit un nouveau déploiement de production et met à jour `parceo.piqa.fr` sans promotion manuelle. Le dernier déploiement réussi reste servi si un build échoue.

## Exploitation

Consulter les déploiements sur https://vercel.com/spacefoot1/parceo/deployments. Un retour arrière Vercel peut désactiver l’affectation automatique des domaines : après correction, promouvoir le déploiement validé et vérifier que l’option est de nouveau active avant la publication suivante.

Le collecteur natif et le backend Supabase gardent leurs mécanismes de publication séparés. Un build Vercel publie le site et ses liens de téléchargement ; il ne crée pas de nouvelle release native et n’applique aucune migration SQL.
