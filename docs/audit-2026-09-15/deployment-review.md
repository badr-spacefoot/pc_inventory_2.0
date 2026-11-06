# Contre-revue du kit de déploiement

Revue locale de `scripts/package-site.mjs`, `deploy/vps/*` et des workflows Pages/Supabase/enrichissement. Aucun accès ni service démarré sur un VPS.

## Problèmes détectés puis corrigés pendant la revue

- La CSP ne permettait pas les cartes intégrées Google/OSM : le parent a ajouté `frame-src` limité à leurs domaines.
- Le précontrôle de configuration acceptait un `network_mode: host`, un réseau de sortie pour la base et un montage du socket Docker; il ne vérifiait pas tous les services/liaisons indispensables. Le parent a ajouté les contrôles de graphe et refus correspondants.

## Tests ajoutés

`tests/tooling/site-packaging.test.ts` : publication strictement limitée aux assets attendus, exclusion de `.env` et scripts de migration, absence de secret serveur dans `config.js`, valeurs runtime publiques, empreintes de contenu de tous les assets JS/CSS, rejet d'un dossier de sortie non vide, d'URL HTTP/avec identifiants/fragment et de valeur numérique invalide.

`tests/tooling/vps-preflight.test.ts` : graphe synthétique isolé accepté; base exposée par ports, réseau hôte, réseau egress, socket Docker ou service base absent refusés. Les tests examinent le résultat de la validation, sans exiger une formulation exacte des messages. Les secrets de fixture sont factices.

Résultat : **11 tests réussis, 2 fichiers** lors de cette contre-revue. ESLint10 sur ces tests et le frontend est passé.

## Navigateur avec CSP du paquet

`packaged-csp-smoke.mjs` construit réellement un paquet temporaire et le charge dans Chromium avec la valeur exacte de CSP de `Caddyfile.static`. Les requêtes vers l'origine cible `https://parc.piqa.fr` sont interceptées et satisfaites par les fichiers temporaires locaux pour conserver la sémantique de `'self'`; API, météo et carte sont simulées. Aucune requête internet n'est autorisée à sortir.

`packaged-csp-results.json` : `passed: true`, zéro erreur JavaScript, zéro violation CSP. Le noyau et l'application démarrent; la configuration résolue utilise `https://parc-api.piqa.fr/functions/v1/inventory-api` et le script local au site. La carte OSM simulée est acceptée par la CSP. Les assets temporaires sont supprimés et le navigateur/serveur loopback sont arrêtés.

Cette vérification prouve la cohérence du paquet et de la politique navigateur, pas une validation du binaire Caddy, du Compose officiel fusionné ou d'un service distant. Un changement des domaines runtime exige aussi d'ajuster la liste `connect-src` de la CSP. Les fixtures ne prétendent pas exercer les données réelles, le TLS public ni les téléchargements de factures signées.

## Points opérationnels conservés pour la recette

- Valider Caddy et la configuration Compose fusionnée avec les versions/digests effectivement retenus.
- Vérifier les routes Storage signées réelles dans l'allowlist API et les uploads aux limites prévues.
- Conserver les anciennes URLs collecteurs pendant leur transition.
- Prouver la restauration DB + Storage dans un environnement isolé; `restic check` seul n'est pas une restauration.
- Les variables GitHub de suspension/bascule et les protections d'environnement doivent être configurées réellement : les YAML ne prouvent pas leur activation.
