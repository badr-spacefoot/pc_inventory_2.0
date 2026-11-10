# Parcéo — migration effectuée le 10 novembre 2026

https://parceo.piqa.fr est maintenant hébergé sur Vercel dans l’équipe Spacefoot Pro. Le projet Supabase existant a été transféré dans l’organisation Spacefoot Pro, après validation du supplément de 10 USD/mois et de l’accès des membres de cette organisation. Aucune copie de projet ou migration SQL n’a été effectuée.

## Production

| Élément | Configuration |
|---|---|
| Vercel | Équipe `spacefoot1`, Pro ; projet `parceo`, `prj_iqVnF3z096zc3kldVMqSL59ZyCwt` |
| Déploiement | `dpl_3HYbVN6F9HGLbhMsWKfH1kkXuRKZ`, READY, production |
| Source du site | `3e99711fba03035e35578972f5ffb3758e40bb8c`, branche `codex/parceo-vercel-migration` |
| DNS OVH | `parceo.piqa.fr. 300 IN A 216.150.1.1` — cible retournée par Vercel |
| TLS | Certificat valide pour parceo.piqa.fr, renouvellement automatique activé |
| Supabase | `oletfrcaptvardmdwacy`, ACTIVE_HEALTHY, région eu-west-3 inchangée |
| Organisation cible | `zqejjzdnqjgolttdiizx`, Spacefoot Pro |
| Organisation précédente | `rjudgyjtibtpifeuueyf`, Free |
| API conservée | https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api |
| Collecteur conservé | Release manuelle `collector-manual-v0.1.57` |

La comparaison de la zone DNS confirme que seule l’entrée A Parcéo a changé. Les autres enregistrements et sites sont conservés.

## Résultats

- Les 36 tables contrôlées présentent exactement les mêmes nombres de lignes et empreintes triées immédiatement avant/après transfert : 36/36, aucune différence. Le contrôle inclut toutes les tables public/storage présentes et auth.users/auth.identities. Les empreintes privées restent dans les rapports locaux ignorés par Git.
- La référence du projet, les URL, la région et PostgreSQL 17.6.1.166 sont conservés. La fonction `inventory-api` reste ACTIVE, version 309, avec la même empreinte de déploiement. Aucune clé n’a été remplacée.
- L’intégration Supabase/GitHub, temporairement déconnectée pour le transfert, est rétablie sur `badr-spacefoot/pc_inventory_2.0`, dossier `.`. Déploiement automatique en production et création automatique de branches restent désactivés. Aucune branche payante n’a été créée.
- Le [contrôle GitHub en lecture seule](https://github.com/badr-spacefoot/pc_inventory_2.0/actions/runs/42729694735) réussit avec le secret existant : accès au projet transféré, organisation cible, état sain et API 309 confirmés. Aucun secret n’est affiché ou remplacé.
- Les workflows prix/valorisation et synchronisations CPU sont actifs ; leurs dernières exécutions disponibles avant la bascule sont réussies. URL API et variables de projet inchangées. Ils n’ont pas été relancés pour provoquer des écritures de test.
- Les 61 fichiers publics servis par Vercel correspondent octet pour octet au paquet Sillage publié sur le VPS. La vérification utilise le DNS courant et la validation TLS normale.
- Les quatre vues 1440/390 px, clair/sombre, passent avec les vrais appels publics : aucune erreur JavaScript, CSP, HTTP ou débordement horizontal ; logos et Manrope chargés.
- API publique d’organisation : 200 ; CORS exact pour https://parceo.piqa.fr ; accès anonyme à `/admin/devices` refusé par 403.
- Les téléchargements Windows/macOS/Linux sont disponibles avec les tailles attendues. SHA-256 du manifeste 0.1.57 : `dfffd7f610da8c94d3734c35e9d33ba66c7eaf2ce6f62278378bf2d7f578de9b`.

Ces vérifications ne créent aucune collecte, session ou facture. Elles ne constituent pas une nouvelle recette matérielle du collecteur sur un autre poste ni une connexion interactive à l’administration. La conservation Storage est contrôlée au niveau des tables et du projet inchangé ; les factures privées n’ont pas été téléchargées pour recalculer leurs empreintes.

## Prochaines publications

La bascule utilise un déploiement Vercel de fichiers préconstruits. L’application GitHub Vercel n’a pas accès à ce dépôt personnel ; aucun accès supplémentaire n’a été accordé. Un push Git seul ne met donc pas Vercel à jour. Le domaine est explicitement associé au déploiement validé et l’affectation automatique des domaines est désactivée.

Pour publier à nouveau : construire depuis la source revue, vérifier `dist/vercel-site`, déployer sous `spacefoot1`, contrôler le déploiement puis affecter explicitement `parceo.piqa.fr`. Le `vercel.json` du dépôt prépare ce build avec Node 22.x. Ne pas sélectionner aveuglément `main` : cette branche contient encore le site historique et son workflow backend peut appliquer des migrations SQL.

Le collecteur reste manuel et non signé conformément au choix validé. Cette migration ne supprime pas les avertissements SmartScreen/Gatekeeper liés à l’absence de signature. Le redimensionnement facultatif de l’instance Supabase n’a pas été effectué.

## Retour arrière

Le service VPS `piqa-parceo-web`, sa route et son paquet `sillage-20261109-0-1-57` sont conservés. Pour revenir au frontend précédent, remettre uniquement l’entrée A Parcéo à `217.182.169.255`, TTL 300. Le backend reste identique : aucun changement de données ou de clés n’est nécessaire.

Un retour d’organisation Supabase serait une opération distincte de droits et de facturation, à traiter séparément du rollback DNS.
