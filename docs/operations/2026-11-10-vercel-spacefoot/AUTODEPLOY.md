# Publication automatique Parcéo depuis GitHub

Le projet Vercel `parceo` de l’équipe `spacefoot1` est connecté au seul dépôt `badr-spacefoot/pc_inventory_2.0` par l’application officielle Vercel. L’installation et ses droits sur ce dépôt ont été approuvés explicitement ; les autres dépôts ne sont pas sélectionnés.

## Branche et build

- Branche de production unique : `main`.
- Domaine de production : https://parceo.piqa.fr.
- Node 22.x et pnpm 10.34.5, dépendances installées avec `pnpm install --frozen-lockfile`.
- Commande : `pnpm run build:vercel`. Elle exécute lint, typecheck, 99 tests frontend/packaging, construit le frontend puis publie uniquement `dist/vercel-site`.
- Le workflow GitHub Quality complet s’exécute également sur cette branche. Il ne déploie pas de schéma Supabase.
- Les trois URL publiques API/script/manifeste sont configurées dans les variables Vercel de production et restent identiques à la migration validée.

Les commits destinés à la production doivent être intégrés à `main`, qui contient Sillage et la configuration Vercel validée. Les anciennes branches de migration fusionnées ont été supprimées ; leurs commits restent dans l’historique de `main`.

Les builds qui échouent à l’installation, aux vérifications ou à la génération du paquet ne remplacent pas la production. Les previews conservent la protection Vercel existante ; aucun wildcard CORS n’est ajouté à Supabase. Les commentaires automatiques sur les pull requests sont désactivés.

## Parcours de publication protégé

1. Créer une branche de travail et ouvrir une pull request vers `main`.
2. Attendre la réussite du contrôle obligatoire `quality` fourni par GitHub Actions. Mettre la branche à jour avec `main` si nécessaire et résoudre les conversations de revue.
3. Fusionner la pull request après validation des contrôles. Une approbation par une seconde personne n’est pas exigée tant que le dépôt ne compte qu’un collaborateur.
4. Vérifier que Vercel termine le build de production du commit fusionné et associe automatiquement `parceo.piqa.fr` à ce déploiement.

La protection de `main` s’applique aussi aux administrateurs : les pushes directs, les pushes forcés et la suppression de la branche sont bloqués.

## Validation initiale

Le build local passe : 99 tests, lint et typecheck. Le paquet reconstruit avec les variables de production correspond aux 61 fichiers de la version déjà en ligne. Le push `4c4581a` a déclenché le déploiement Git natif `dpl_E57xEgCZPFggNtRTDaErf6ZBQdiH`, READY en staging de production. Les 99 tests passent également sur Vercel ; health, configuration publique et manifeste 0.1.57 sont accessibles. Le champ engines est limité à Node 22 pour éviter que Vercel choisisse Node 24 malgré le réglage 22.x du projet.

L’affectation automatique des domaines est activée pour les prochaines publications de cette branche. Tout push réussi produit un nouveau déploiement de production et met à jour `parceo.piqa.fr` sans promotion manuelle. Le dernier déploiement réussi reste servi si un build échoue.

## Exploitation

Consulter les déploiements sur https://vercel.com/spacefoot1/parceo/deployments. Un retour arrière Vercel peut désactiver l’affectation automatique des domaines : après correction, promouvoir le déploiement validé et vérifier que l’option est de nouveau active avant la publication suivante.

Le collecteur natif et le backend Supabase gardent leurs mécanismes de publication séparés, à partir de la version revue de `main`. Un build Vercel publie le site et ses liens de téléchargement ; il ne crée pas de nouvelle release native et n’applique aucune migration SQL. Le workflow Supabase et le réglage d’origine sont uniquement manuels. Le workflow Pages de secours est manuel et exige `PRODUCTION_FRONTEND=github-pages` ; la valeur de production actuelle est `vercel`.

La maintenance programmée prix/CPU reste active depuis la branche par défaut `main`. Le nettoyage des factures nécessite `INVOICE_STORAGE_CLEANUP_ENABLED=true` après publication de la migration de file d’attente et de l’API correspondante ; cette option reste désactivée pendant la consolidation de branches.
