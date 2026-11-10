# Parcéo — Vercel et organisation Supabase Spacefoot Pro

**Migration effectuée le 10 novembre 2026.** Voir [le compte rendu de production](MIGRATION.md), `execution.json`, `live-integrity.json`, `live-web.json` et les captures. Le texte ci-dessous et `preparation.json` sont le relevé historique de préparation, avant autorisation et exécution.

État au 10 novembre 2026 : faisabilité et comptes vérifiés, configuration statique préparée localement. La production reste celle publiée le 9 novembre. Le transfert vers une organisation payante attend la validation du coût et des conditions d’accès.

## Cibles vérifiées

| Élément | Actuel | Cible |
|---|---|---|
| Frontend | VPS partagé, parceo.piqa.fr | Équipe Vercel Spacefoot, slug spacefoot1, plan Pro existant |
| Backend | Projet Supabase oletfrcaptvardmdwacy, spacefoot-pc-inventory | Même projet dans l’organisation Spacefoot, plan Pro existant |
| Organisation Supabase | rjudgyjtibtpifeuueyf, Free | zqejjzdnqjgolttdiizx, Pro |
| Collecteur | Release manuelle 0.1.57 sur GitHub | Distribution conservée |

Les connexions disponibles donnent accès en lecture aux deux organisations Supabase. Cela ne prouve pas qu’un compte unique possède les droits de transfert dans les deux. Les conditions Supabase imposent un propriétaire dans l’organisation source, au moins un rôle membre dans la cible et l’absence de certaines intégrations actives. Ces conditions et les membres qui auront accès à Parcéo doivent être contrôlés avant validation finale du transfert. Voir [Project Transfers](https://supabase.com/docs/guides/platform/project-transfer).

La méthode proposée est un transfert d’organisation du projet existant. Elle évite de créer une copie partielle de la base et de devoir recopier séparément factures et fonctions. L’objectif est de conserver la référence et les URL actuelles ; leur stabilité et le fonctionnement du collecteur seront vérifiés lors du transfert. Le changement de région ne fait pas partie d’un transfert d’organisation.

## Coût à valider

Spacefoot utilise déjà Pro ; aucun second abonnement Pro n’est proposé. Un projet actif supplémentaire sur une instance Micro représente environ 10 USD/mois de compute, facturés à l’heure, plus les éventuels dépassements des quotas partagés. Il s’agit d’une estimation standard, à confirmer dans l’écran de transfert pour cette instance. L’organisation Spacefoot contient déjà plusieurs projets actifs. Voir la [FAQ de facturation Supabase](https://supabase.com/docs/guides/platform/billing-faq).

Vercel utilisera l’équipe Pro existante. Les déploiements et le trafic seront imputés à son usage existant ; aucun nouveau siège ou supplément de build payant n’est prévu dans cette préparation.

## Configuration Vercel

`vercel.json` sélectionne le preset statique, construit le frontend et ne publie que `dist/vercel-site`. Les en-têtes de sécurité conservent la CSP du site actuel. Aucun secret de base, de service Supabase ou de signature ne doit être placé dans le frontend.

Configurer Node 22.x et ces trois variables publiques de build :

- IT_INVENTORY_API_URL = https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api
- IT_INVENTORY_SCRIPT_URL = https://parceo.piqa.fr/scripts/collect-windows.ps1
- IT_INVENTORY_COLLECTOR_RELEASES_URL = https://parceo.piqa.fr/collector-releases.json

La source actuellement publiée est la branche `codex/parceo-sillage-production`, commit 893c96a. `main` contient encore le déploiement historique ; il ne faut pas le sélectionner par défaut pour cette bascule. La préparation Vercel doit être ajoutée à la source de production revue avant l’import Git.

## Ordre de bascule

1. Valider le coût et les droits de transfert. Examiner les membres de la cible, les intégrations et la disponibilité des sauvegardes ; ne pas élargir les droits d’un compte à toute l’organisation sans accord spécifique.
2. Préparer le projet Vercel sous Spacefoot et un déploiement de recette avec la configuration publique. Vérifier les fichiers réellement exposés, les thèmes, le mobile et la CSP. Les domaines de preview ne doivent pas être autorisés par un wildcard CORS ; utiliser des fixtures ou une origine de recette exacte si nécessaire.
3. Effectuer le transfert Supabase du projet existant. Vérifier les URL, fonctions, factures, authentification et accès après transfert. Vérifier aussi que le jeton utilisé par les workflows GitHub garde accès au projet ; le remplacer par un mécanisme autorisé si nécessaire, sans afficher ni partager sa valeur.
4. Associer parceo.piqa.fr à Vercel et utiliser la cible DNS exacte retournée par Vercel. Modifier uniquement l’entrée de ce sous-domaine chez OVH ; conserver les autres sites et les enregistrements de messagerie.
5. Vérifier HTTPS, sessions, collecte, téléchargements 0.1.57 et liens Storage. Conserver la version VPS en place pour le retour arrière pendant la stabilisation.

Le retour arrière frontend consiste à remettre l’entrée DNS précédente vers 217.182.169.255 tant que le service VPS est conservé. Un retour d’organisation Supabase est une opération distincte de droits et de facturation ; il ne doit pas être traité comme un simple rollback DNS.
