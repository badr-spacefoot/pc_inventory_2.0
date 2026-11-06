# Audit frontend, métier et accessibilité — 15 septembre 2026

## Périmètre et méthode

Revue en lecture seule du frontend JavaScript/DOM, du noyau TypeScript et des tests existants. Skill AAS découvert via `search_skills` et `get_skill` : `accessibility-compliance-accessibility-audit`; instructions lues dans `C:/Users/badre/.codex/skills/accessibility-compliance-accessibility-audit/SKILL.md`. Référence de travail : accessibilité WCAG 2.2 AA, sans prétendre à une certification.

Ce volet ne contient ni modification applicative, ni accès aux dossiers réels de production, ni test destructif. Les constats proviennent du code actuel, y compris le correctif local de valorisation du stock, puis de fixtures synthétiques dans Chromium headless. Le skill `webapp-testing` a été lu pour cette validation; le runtime Python fourni n'ayant pas Playwright, le runtime Node fourni et son Playwright installé ont été utilisés. Tests automatisés globaux, infrastructure et API sont traités dans les autres volets. Aucun résultat de contraste ou lecteur d'écran n'est revendiqué.

## Preuves navigateur locales

Script reproductible : `frontend-fixture.mjs`; résultats : `frontend-fixture-results.json`. Le script démarre un serveur HTTP sur loopback à port éphémère, injecte uniquement trois machines fictives et une identité fictive, mocke l'API et bloque toute requête externe. Aucune authentification réelle, collecte réelle ou écriture de base. Le serveur et le navigateur sont fermés après exécution.

Résultats du 15 septembre 2026 :

- Aucun `pageerror` au démarrage ou durant les fixtures.
- **FE-01 reproduit** : une balise inerte `<b>` dans `scan.os_name` devient un vrai élément DOM `B`. Aucun JavaScript malveillant n'a été exécuté; cela démontre l'interprétation HTML du champ non échappé.
- **FE-02 reproduit** : réponses B puis A; résultat `selectedId=B`, `detailId=A`, titre `Fixture B`.
- **Stock vérifié localement** : filtre stock retourne S seul; valeur lancement 1000 €, valeur actuelle 300 €, dépréciation 70 %, âge 5 ans, zéro remplacement actif.
- **FE-04 confirmé au DOM** : les trois lignes ont `tabIndex=-1`, aucun rôle et aucun enfant interactif pour ouvrir la machine.
- Aucun débordement horizontal du document à 1440 px ni 375 px sur le dashboard avec les fixtures. Ceci ne prouve pas tous les formulaires, noms longs, zoom ou langues.
- Captures : `fixture-stock-desktop.png`, `fixture-fleet-1440.png`, `fixture-fleet-375.png`.

## Verdict

Le frontend ne devrait pas être publié tel quel sur un nouveau domaine : une interpolation HTML de données collectées permet un XSS stocké, et la sélection asynchrone des machines peut présenter les contrôles de modification d'une autre machine que celle indiquée par le titre. Ces deux défauts doivent être corrigés avant bascule. L'architecture statique actuelle reste adaptée à un déploiement sur `parc.piqa.fr`; aucune migration React n'est nécessaire.

## Défauts confirmés dans le code

### FE-01 — P1 — HTML non échappé dans l'historique des scans

- `frontend/app.js:3432` insère directement `scan.os_name` et `scan.os_version` dans des chaînes HTML. Elles aboutissent à `#device-detail.innerHTML` (`3435`, `3621`).
- Chaîne de données : `supabase/functions/inventory-api/index.ts:2348` et `2349` acceptent `body.osName`/`osVersion`, puis `2440`–`2441` les copient dans les scans. `core/input.ts:3` ne fait que trim/troncature.
- Une collecte autorisée contenant des balises HTML sera interprétée lors de l'ouverture du détail, y compris quand l'onglet historique est caché. Le bearer administrateur est accessible au JavaScript via localStorage (`frontend/app.js:5646`), ce qui augmente la gravité.
- `frontend/app.js:3427` interpole aussi `priceHistory.source` sans échappement; son origine externe exacte doit être corroborée côté API. Ne pas considérer son exploitabilité identique comme déjà démontrée.
- Correction : encoder toutes les valeurs textuelles, idéalement créer les nœuds avec `textContent`; ajouter un test de rendu avec balises inertes, puis une CSP adaptée au domaine. Ne pas utiliser seulement une validation d'entrée comme protection XSS.
- Validation initiale : fixture DOM locale reproduit l'interprétation d'une balise inerte. Après correction, exiger que cette chaîne reste du texte; vérifier toutes les interpolations équivalentes.

### FE-02 — P1 — Réponses de détail concurrentes associées à la mauvaise sélection

- `frontend/app.js:2873`–`2897` affecte immédiatement `selectedDeviceId` et le titre, attend `getDevice(id)`, puis rend la réponse sans vérifier que cet identifiant est encore sélectionné.
- Scénario : clic A, clic B; B répond avant A. Le titre et la ligne sélectionnée indiquent B, puis la réponse A remplace le détail. Les formulaires créés par `renderDetail` gardent `device.id` de A, notamment statut et suppression (`3775`, `3841`). Une action peut viser A alors que la sélection affichée est B.
- Correction : compteur de requêtes ou AbortController, vérifier l'identifiant après chaque await et dans le catch; synchroniser titre, sélection et données rendues. Tester les réponses dans les deux ordres et un échec tardif.

### FE-03 — P2 — Export CSV interprétable comme formule

- `frontend/app.js:3901`–`3903` ne fait que doubler les guillemets; `3959` exporte directement hostname, noms, modèle et autres données.
- Une valeur telle que `=1+1` reste une formule après ouverture dans un tableur : les guillemets CSV ne neutralisent pas ce comportement. Les champs collectés ou éditables sont concernés.
- Correction : neutraliser les débuts de cellule dangereux pour le mode d'export tableur (`=`, `+`, `-`, `@`, tabulations/retours), en distinguant les nombres légitimes; tester aussi les guillemets et retours à la ligne. Préserver un export brut explicite si nécessaire.

### FE-04 — P2 — Consultation d'une machine inaccessible au clavier

- `frontend/app.js:2850` crée des lignes `<tr data-id>` sans lien/bouton; `2869` ne leur ajoute qu'un gestionnaire `click`. Aucun équivalent clavier n'existe pour ces lignes.
- Le parcours principal de consultation et modification d'un poste est inaccessible au clavier seul. Critère concerné : WCAG 2.1.1.
- Correction : bouton/lien explicite « ouvrir le poste » dans chaque ligne, focus visible et nom accessible; ne pas convertir toute la table en faux boutons sans préserver sa sémantique.

### FE-05 — P2 — Un disque complètement plein n'est pas signalé

- `frontend/src/features/fleet/analytics.ts:175`–`177` retourne `free > 0 && free < 30`.
- Une valeur connue `storage_free_gb = 0` est exclue du compteur faible stockage, du score de santé et des motifs de risque. L'absence de valeur est actuellement confondue avec zéro par `finiteNumber`.
- Correction : distinguer null/absent d'un zéro mesuré et accepter `0 <= free < 30`. Tester null, chaîne vide, zéro, petite valeur positive, seuil et valeur invalide.

### FE-06 — P2 — Action clavier « marquer comme lue » détournée par le parent

- `frontend/app.js:1806` crée un article `role=button` contenant un vrai bouton « marquer comme lue » (`1817`).
- Le gestionnaire keydown du parent (`1832`–`1835`) intercepte Enter/Espace sans vérifier `event.target`, appelle `preventDefault()` et ouvre la cible de notification. Contrairement au click, les événements provenant du bouton enfant ne sont pas exclus.
- Correction : séparer lien de navigation et bouton de lecture, ou ignorer les événements issus des contrôles enfants. Tester Entrée/Espace sur chaque contrôle.

### FE-07 — P2 — Données privées conservées après déconnexion

- `frontend/app.js:5657`–`5664` efface uniquement le bearer/utilisateur courant et masque le dashboard. `state.devices`, détail/scans, comptes, notifications, tokens bruts et liens d'invitation restent en mémoire; les nœuds HTML privés restent présents.
- Conséquence : une déconnexion ne purge pas les données de cette session dans l'onglet. Une connexion suivante, une erreur de chargement ou une inspection du DOM peuvent encore rencontrer les anciennes données. Cela ne prouve pas un contournement de l'autorisation API.
- Correction : nettoyer les collections et DOM privés, tokens/liens bruts et formulaires; interrompre/ignorer les requêtes de la session précédente. Vérifier aussi l'invalidation serveur du token dans le volet sécurité.

### FE-08 — P2 — Dépréciation calculée sur des populations incomplètes différentes

- `frontend/app.js:2713`–`2715` additionne les prix de lancement manquants comme zéro, mais ajoute les valeurs actuelles des mêmes machines lorsqu'elles sont connues.
- Exemple : A lancement 1000, actuel 500; B lancement absent, actuel 1000. Le ratio affiche -50 % même si aucune hausse de valeur n'est démontrée. Avec aucun lancement connu, l'interface affiche 0 % plutôt qu'une absence de données.
- Correction : calculer la dépréciation uniquement sur les machines ayant les deux valeurs exploitables et afficher la couverture; conserver les totaux globaux séparément.

### FE-09 — P2 — Boîtes de dialogue sans nom accessible explicite

- `frontend/index.html:1363`, `1380`, `1403` définissent des `<dialog>` sans `aria-labelledby` ni `aria-label`, alors que des titres identifiables existent.
- Les titres visuels seuls ne sont pas une association de nom accessible pour le dialogue. Critère : WCAG 4.1.2.
- Correction : relier chaque dialogue à son titre et au texte explicatif utile; vérifier l'annonce et le retour de focus avec lecteur d'écran/clavier. Les dialogues natifs constituent déjà un bon point de départ.

## Risques à vérifier, distincts des défauts bloquants

- **Performance/grand parc** : chaque filtre réécrit toutes les lignes et réattache un listener par ligne (`2841`–`2870`), puis recalcule tous les graphiques (`2203`–`2206`), y compris les vues cachées. La traduction observe tout le body. Pas de pagination/virtualisation frontend constatée. Mesurer 100/1000/5000 machines avant de choisir une optimisation; aucune durée excessive n'a été mesurée ici.
- **Valeurs absentes et zéro** : `inventory.ts:294` utilise une chaîne de `||`; un zéro explicite peut être remplacé par une autre estimation. `analytics.ts:466` divise la somme par toutes les machines, y compris non valorisées. Décider la sémantique et afficher la couverture des valeurs avant de modifier le calcul.
- **Tri** : `analytics.ts:263` impose d'abord l'ordre des statuts même pour un tri hostname/fabricant. Vérifier que ce regroupement correspond au libellé produit.
- **Annulation réseau** : `api-client.ts:45` et `public-resources.ts:48` s'abonnent à abort sans traiter un signal déjà annulé. Ajouter un cas de test si ces annulations sont exploitées dans les parcours.
- **Session au démarrage** : `app.js:6168` efface la connexion sur toute erreur `loadAdminData`, y compris une indisponibilité temporaire. Distinguer 401/403 d'une panne réseau.
- **Formulaires et changement de langue** : `applyLanguage` rerend le détail (`app.js:239`), ce qui peut effacer un formulaire non enregistré. Vérifier et préserver les brouillons.

## Couverture fonctionnelle et contrôles existants

| Élément | Vérification et appréciation |
|---|---|
| Parc, filtres et stock | Fonction de filtrage TypeScript centralisée; correctif local réutilise `valuationFleetDevices`, inclut stock, exclut retrait/perte, conserve le stock hors alertes de remplacement. Test spécifique stock présent dans `tests/frontend/fleet-analytics.test.ts:113`. Publication effective non vérifiée. |
| Dashboard et valorisation | Réutilisation de la fonction de valeur et du périmètre actuel; âge ignoré si inconnu. Défauts de disque plein et de dépréciation ci-dessus. Cohérence UI complète à tester avec parc mixte. |
| Organisation | `organization/statistics.ts` distingue affectées/stock/non affectées et utilisateurs distincts; exclut retrait/perte. Tests dédiés présents. Les rapprochements de noms sont un fallback, à contrôler sur les doublons historiques. |
| Matériel, CPU et dates | Normalisation OS/fabricant/RAM et présentation CPU dédiées; lien benchmark et source officielle séparés avec filtrage http(s), échappement et `noopener noreferrer` (`app.js:3380`–`3393`). Dates réelles des références à valider côté backend. |
| Détail et historique | Onglet conservé via `activeDetailTab`; historique structuré et nettoyage de texte importé. XSS et réponse concurrente sont les deux lacunes critiques. |
| Factures et garantie | Types achat/extension, dates et durée, jauge restante, garantie estimée explicitement marquée; tests dédiés `warranty.test.ts`. Lien externe validé http(s) côté serveur. Restauration Storage, permissions et suppression traitées par audit backend. |
| Enrichissement | Coordinateur empêche un deuxième run concurrent, états success/failed, reprise d'étapes et retry; petits lots externes. Tests de domaine présents. Reprise réelle après reload et jobs déployés à valider en environnement de recette. |
| Comptes, invitations et accès | Affichage conditionnel par capacité, rôles dédiés, génération de mot de passe via crypto; URLs/tokens bruts tenus en mémoire. Autorisation ne doit jamais reposer sur ce masquage frontend. Purge logout à corriger. |
| Notifications et validations | Titres/messages échappés, état lu/non lu, navigation vers entités, filtres. Interaction clavier imbriquée défectueuse; permissions et transitions de validation à couvrir en recette. |
| Collecte et téléchargements | Détection plateforme et liens via module dédié; copie gérée avec message d'erreur, code/fichier préremplissage. Signature Defender et packaging audités séparément. |
| FR/EN | Langue document mise à jour, dictionnaires, traductions d'erreurs et tests de présence statique étendus. Pas de certification linguistique exhaustive ni de parcours dynamique bilingue effectué. |
| Responsive/thèmes | Breakpoints 1100/1180/680 px, grilles à une colonne sur mobile, couleurs de thème, styles de focus et bloc reduced-motion présents. Contraste, zoom 200/400 %, 320 px et lecteurs d'écran restent à mesurer. |
| Réseau/erreurs | Client API avec timeout, erreurs structurées, retries GET bornés et pas de retry mutation par défaut. Rendu de panne de démarrage échappé et bouton réessayer. Erreurs de modules secondaires isolées. |
| Architecture/tests | Noyau strict TypeScript modulaire, bundle généré; tests sur domaines/services. Le gros `app.js` conserve les interactions critiques et n'a pas de suite DOM/E2E identifiée dans les dépendances. |

## Recette minimum avant changement de domaine

1. Corriger FE-01 et FE-02, vérifier leurs régressions avec fixtures locales.
2. Tester les quatre rôles sur lecture, export, modification, suppression et invitations; vérifier réponses interdites côté API.
3. Parc mixte actif/stock/perdu/retiré et valeurs partielles : filtres, totaux, âge, remplacement, export.
4. Sélection rapide de machines, panne API, expiration/logout, refresh pendant enrichissement, changement de langue avec brouillon.
5. Achat + extension garantie + accès fichier signé, puis expiration du lien; ne pas employer de facture réelle pour les tests.
6. Navigation clavier des lignes/actions, dialogues nommés, notifications, focus après navigation; scan automatisé a11y et inspection manuelle.
7. Mobile/zoom/dark mode, débit lent, grand parc, cache de version et reload après release.
8. Après configuration du domaine : CORS, URLs des invitations/collecteurs, HTTPS, politique CSP testée, aucun secret serveur dans les fichiers statiques. Ces vérifications relèvent aussi du rapport déploiement.
