# Spacefoot IT Inventory

Application web d'inventaire de parc informatique pour remplacer ou compléter l'ancien flux Google Sheets.

Le front est statique et peut etre heberge sur GitHub Pages. La collecte complete du materiel passe par un script local volontaire, car un navigateur ne peut pas lire de maniere fiable et autorisee le numero de serie, le CPU, la RAM, le stockage, l'adresse MAC ou l'utilisateur Windows.

## Architecture recommandee

- `frontend/` : application responsive HTML/CSS/JS hébergeable sur GitHub Pages.
- `supabase/schema.sql` : tables `users`, `devices`, `device_scans`, `teams`, `establishments`, `audit_logs` et tokens de collecte.
- `supabase/functions/inventory-api/` : API Supabase Edge Function.
- `collectors/desktop_collector/` : prototype d'application collecteur transparente avec revue avant envoi.
- `scripts/collect-windows.ps1` : fallback PowerShell de collecte Windows.
- `scripts/collect-cross-platform.py` : collecteur standard-library Windows, Ubuntu/Linux et macOS.
- Backend recommande : Supabase pour Postgres, Edge Functions, secrets serveur et CORS.

Flux:

1. L'utilisateur ouvre la page de collecte avec un token d'accès.
2. Il saisit nom, prénom, email, équipe, établissement et commentaire.
3. Les listes équipe/établissement viennent des valeurs admin actives, dans l'ordre configure.
4. Si la valeur manque, l'utilisateur choisit `Autre` et propose une valeur qui reste en attente de validation admin.
5. L'API cree ou met a jour l'utilisateur et renvoie un token de collecteur temporaire.
6. L'utilisateur lance le collecteur recommande ou le fallback PowerShell.
7. Le collecteur affiche les donnees locales, puis poste le scan vers `/collect/scan` apres confirmation.
8. L'API deduplique la machine, met a jour `devices`, ajoute une ligne dans `device_scans` et journalise dans `audit_logs`.
9. L'admin consulte le dashboard, les filtres, le detail, l'historique et l'export CSV.

## Fonctionnalites

- Accès utilisateur par token de collecte.
- Formulaire utilisateur: nom, prénom, email, équipe, établissement, commentaire.
- Champs obligatoires marques par `*`, avec messages lisibles sans perte du brouillon.
- Brouillon local du formulaire de collecte conserve jusqu'a generation reussie.
- Listes équipe/établissement synchronisees avec l'admin, avec option `Autre` et validation admin.
- Collecteur desktop transparent scaffold, commande PowerShell, copie du script et telechargement fallback.
- Dashboard admin protégé par mot de passe côté backend.
- Liste des machines, recherche globale et filtres équipe, établissement, OS, ancienneté, modèle, statut.
- Badges locaux pour les systemes et fabricants, avec normalisation des valeurs OEM et detection des familles professionnelles.
- Vue detail machine et historique des scans.
- Score simple d'ancienneté matérielle.
- Graphiques: etablissements, equipes, OS, machines non remontees, anciennete, modeles, RAM moyenne, stockage faible.
- Export CSV depuis le dashboard.
- Deduplication: serial number, puis hostname + MAC, puis utilisateur + modèle + établissement.
- Compatibilite ancien script Google Sheets via `/collect/legacy-scan` avec les champs `pcName`, `mac`, `site`, `serial`, `os`, `ram`, `ip`.
- Enrichissement matériel cacheable: score CPU, génération CPU, age modèle, prix estimé, valeur marché, confiance et recommandation.
- Génération admin de tokens de collecte temporaires avec expiration, limite d'utilisations et révocation.
- Centre admin `Validations` pour approuver, modifier, rejeter ou lier les propositions utilisateur.
- Reordonnancement drag-and-drop avec ligne d'insertion visible.
- Codes internes/abreviations optionnels pour équipes et établissements.
- Couleurs distinctes par défaut pour équipes et établissements, modifiables par l'admin.
- Icones equipe et discipline lieu: SAV, achat, RH, Biz Dev, marketplace, advertising, IT, design, logistique, catalogue/PIM, B2C, finance, direction, marketing, velo, raquette, football, golf, lifestyle, running, bureau, entrepot, siege.
- Notifications cliquables vers machine, proposition, équipe, établissement ou tokens.

## Installation Supabase

1. Créer un projet Supabase.
2. Ouvrir le SQL Editor.
3. Exécuter le contenu de `supabase/schema.sql`.
4. Installer la CLI Supabase si besoin.
5. Configurer les secrets de l'Edge Function:

```powershell
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
supabase secrets set ADMIN_PASSWORD="un-mot-de-passe-long"
supabase secrets set ADMIN_SESSION_SECRET="une-valeur-aléatoire-longue"
supabase secrets set COLLECTION_ACCESS_TOKEN="token-utilisateur-de-collecte"
supabase secrets set ALLOWED_ORIGINS="https://YOUR_GITHUB_USER.github.io,http://localhost:8080"
```

6. Deployer l'API:

```powershell
supabase functions deploy inventory-api
```

### Deploiement cloud avec GitHub Actions

Le workflow `.github/workflows/supabase-deploy.yml` deploie automatiquement l'API vers Supabase Cloud lorsque les fichiers `supabase/functions/` changent.

Dans GitHub, configurer:

- Variable Actions `SUPABASE_PROJECT_REF`
- Secret Actions `SUPABASE_ACCESS_TOKEN`
- Secret Actions `ADMIN_PASSWORD`
- Secret Actions `ADMIN_SESSION_SECRET`
- Secret Actions `COLLECTION_ACCESS_TOKEN`
- Secret optionnel `EBAY_BROWSE_API_TOKEN`

La machine locale n'heberge rien. GitHub Actions transmet le code a Supabase, puis l'Edge Function s'execute dans le cloud Supabase.

URL attendue:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api
```

## Configuration frontend

Option simple: modifier les valeurs en haut de `frontend/app.js`:

```js
const CONFIG = {
  apiBaseUrl: "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api",
  scriptUrl: "https://badr-spacefoot.github.io/pc_inventory_2.0/scripts/collect-windows.ps1",
  staleDays: 30,
};
```

Alternative: injecter ces valeurs avant `app.js` dans `frontend/index.html`:

```html
<script>
  window.IT_INVENTORY_API_URL = "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api";
  window.IT_INVENTORY_SCRIPT_URL = "https://badr-spacefoot.github.io/pc_inventory_2.0/scripts/collect-windows.ps1";
  window.IT_INVENTORY_STALE_DAYS = 30;
  window.IT_INVENTORY_WEATHER_LATITUDE = 48.8932;
  window.IT_INVENTORY_WEATHER_LONGITUDE = 2.2879;
  window.IT_INVENTORY_WEATHER_LOCATION = "Levallois-Perret";
</script>
```

La meteo de la barre superieure utilise Open-Meteo cote navigateur. Par defaut, aucune cle API n'est necessaire; les coordonnees ci-dessus permettent de choisir la ville affichee.

## Deploiement GitHub Pages

1. Pousser le dossier `frontend/` dans le dépôt.
2. Dans GitHub, ouvrir `Settings > Pages`.
3. Choisir la branche `main`.
4. Activer GitHub Actions comme source Pages.
5. Verifier que `ALLOWED_ORIGINS` contient l'URL GitHub Pages.

Le workflow `.github/workflows/pages.yml` publie `frontend/` a la racine du site et copie aussi `scripts/` et `collectors/`, afin que le fallback PowerShell et la documentation du collecteur soient disponibles depuis GitHub Pages.

## Collecteur recommande, lanceurs simples et fallback script

Les navigateurs, extensions et antivirus peuvent bloquer les fichiers `.ps1` ou les flux `download script`, meme quand le script est legitime. Le projet ne cherche pas a contourner Malwarebytes, les antivirus ou les controles navigateur.

La strategie recommandee est:

1. Generer un token de collecteur depuis la page de collecte.
2. Télécharger l'application native officielle depuis les Releases GitHub.
3. Ouvrir l'application Windows, macOS ou Linux.
4. Coller le token temporaire dans l'application.
5. Collecter, relire les donnees affichees, puis envoyer.

Le token temporaire reste separe de l'application. Il doit etre traite comme une information sensible et ne pas etre partage au-dela de sa duree de validite.

- Windows: application `.exe` PyInstaller, idealement signee avec un certificat Code Signing.
- macOS: application PyInstaller, idealement signee et notarisee Apple.
- Linux: binaire PyInstaller ou exécution Python selon la politique interne.

Les scripts `.cmd`, `.ps1`, `.command` et `.sh` restent des modes avances IT. Ils peuvent etre bloques par les antivirus parce qu'ils lancent un interpreteur ou telechargent du code au moment de l'execution.

Un workflow GitHub Actions `Build collector apps` produit des applications natives via PyInstaller:

1. Pour un test interne, ouvrir l'onglet GitHub `Actions`, lancer `Build collector apps`, puis récupérer les artefacts.
2. Pour une release visible depuis le bouton `Télécharger l'application`, créer et pousser un tag `collector-vX.Y.Z`.
3. Le workflow créé une release avec les builds Windows, macOS et Linux.

Ces builds embarquent le collecteur Python cross-platform. Avant une diffusion large, signer le `.exe` Windows et notariser l'application macOS pour limiter les alertes systeme/antivirus. Aucun packaging ne peut garantir zero alerte si l'application est non signee ou sans reputation SmartScreen.

Secrets optionnels pour signature:

- `WINDOWS_CODESIGN_PFX_BASE64`: certificat Windows `.pfx` encode en base64.
- `WINDOWS_CODESIGN_PASSWORD`: mot de passe du certificat.
- `MACOS_CERTIFICATE_BASE64`: certificat Apple Developer ID `.p12` encode en base64.
- `MACOS_CERTIFICATE_PASSWORD`: mot de passe du certificat macOS.
- `MACOS_CODESIGN_IDENTITY`: identite de signature Apple Developer ID.
- `MACOS_NOTARY_APPLE_ID`, `MACOS_NOTARY_TEAM_ID`, `MACOS_NOTARY_PASSWORD`: notarisation Apple.

### Distribution et signature low-cost

Chaque release collecteur contient:

- builds Windows, macOS et Linux;
- `SHA256SUMS.txt` pour verifier l'integrite des fichiers;
- `spacefoot-it-collector-internal-test.cer` lorsque Windows est signe avec le certificat self-signed interne de test.

Verifier un fichier Windows:

```powershell
Get-FileHash .\spacefoot-it-collector-windows.exe -Algorithm SHA256
Get-AuthenticodeSignature .\spacefoot-it-collector-windows.exe
```

Verifier un fichier Linux/macOS:

```bash
sha256sum -c SHA256SUMS.txt
```

Windows:

- Si `WINDOWS_CODESIGN_PFX_BASE64` est configure, le workflow signe avec ce certificat officiel.
- Sinon, le workflow généré un certificat self-signed `Spacefoot IT Collector Internal Testing` et signe l'exe pour les tests internes.
- Le certificat self-signed ne donne pas de reputation publique SmartScreen. Pour eviter les alertes en interne, deployer le certificat `.cer` dans `Trusted Root Certification Authorities` et `Trusted Publishers` via GPO, Intune ou outil MDM.
- Pour une diffusion externe, utiliser un certificat Code Signing OV/IV ou EV.

Linux:

- Le téléchargement recommandé est maintenant un `.deb` Ubuntu/Debian.
- Le paquet installe le collecteur dans `/opt/spacefoot-it-collector`, enregistre `spacefoot-collector://` et embarque le moteur `osqueryi` utilisé pour l'inventaire local.
- Si osquery n'est pas exploitable sur un poste, le collecteur bascule sur sa collecte Python locale au lieu de bloquer l'utilisateur.
- Verifier `SHA256SUMS.txt`; ajouter une signature GPG ou un dépôt APT signe plus tard si nécessaire.

Commande Ubuntu utilisateur:

```bash
downloads="$(xdg-user-dir DOWNLOAD 2>/dev/null || echo "$HOME/Téléchargements")"
cd "$downloads" || cd "$HOME/Downloads"
sudo apt install ./spacefoot-it-collector-linux-0.1.36.deb
```

macOS:

- Sans Apple Developer ID + notarisation, Gatekeeper peut bloquer ou avertir l'utilisateur.
- Phase 1: installation manuelle/interne avec documentation.
- Phase future: Apple Developer Program, certificat Developer ID Application, `codesign`, `notarytool`, puis stapling.

Regles de securite du collecteur:

- pas d'obfuscation;
- pas de PowerShell encode;
- pas d'exécution cachée;
- aucune clé secrete embarquee;
- écran transparent affichant les données avant envoi;
- releases versionnees et checksums publies.

Le prototype actuel est dans `collectors/desktop_collector/`:

```powershell
python collectors/desktop_collector/collector_app.py
```

Il utilisé `scripts/collect-cross-platform.py` pour collecter avec la bibliothèque standard Python. Ce collecteur détecte automatiquement l'OS avec `platform.system()` et adapte les commandes:

- Windows: PowerShell/CIM/WMI lorsque disponible (`pwsh`, `powershell` ou fallback générique).
- Ubuntu/Linux: `/etc/os-release`, `/proc`, `/sys/class/dmi/id`, `lsblk`, `dmidecode` seulement si accessible.
- macOS: `sw_vers`, `system_profiler`, `sysctl`, stockage local.

Les champs impossibles a lire sans droit suffisant restent vides. Le collecteur echoue proprement et n'installe aucun controle distant.

Le prototype d'application collecteur reste utile pour le mode transparent avec revue avant envoi. Il affiche les donnees collectees avant soumission. Le script PowerShell reste disponible comme fallback avance:

- bouton `Copier le script`;
- bouton `Télécharger le script`;
- aperçu lisible du script;
- commande PowerShell personnalisée.

Ne pas obfusquer le script, ne pas utiliser de commande encodee et ne pas auto-executer un telechargement. Pour reduire les alertes en production, prevoir plus tard des binaires signes/notarises et un editeur clairement identifie.

## Lancement du script Windows

Depuis le dashboard utilisateur, la commande est générée automatiquement. Exemple manuel:

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File .\scripts\collect-windows.ps1 `
  -ApiUrl "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api" `
  -CollectionToken "TOKEN_RENVOYE_PAR_LE_FORMULAIRE"
```

Pour inclure l'adresse MAC, ajouter explicitement:

```powershell
-IncludeMacAddress
```

Par defaut, le script n'envoie pas l'adresse MAC. Cela permet de limiter la collecte d'identifiants reseau si elle n'est pas necessaire ou pas autorisee.

## Import de l'ancien CSV Google Sheets

Le script `scripts/import-legacy-csv.ps1` importe l'ancien export `Données` vers la nouvelle API. Il utilisé `/collect/legacy-scan`, qui accepte les noms de champs historiques du Google Apps Script.

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File .\scripts\import-legacy-csv.ps1 `
  -CsvPath "C:\Users\roobi\Downloads\Inventaire_pc_auto_2026 - Données.csv" `
  -ApiUrl "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api" `
  -CollectionAccessToken "TOKEN_UTILISATEUR_DE_COLLECTE" `
  -DefaultEmailDomain "spacefoot.local" `
  -DefaultService "Non renseigné"
```

Comme l'ancien export ne contient pas d'email ni de service, l'import genere un email technique par defaut et renseigne un service par defaut. Ces valeurs peuvent ensuite etre corrigees dans la base ou enrichies via une vraie table RH.

### Import de l'ancien historique Google Sheets

Le fichier `Historique` de l'ancien Apps Script peut etre importe avec `scripts/import-legacy-history-csv.ps1`.
L'import ajoute des evenements dans `device_history` avec la source `IMPORT`; il ne remplace pas l'etat actuel des machines.
Le rapprochement se fait d'abord par adresse MAC, puis par hostname si la MAC est absente.

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File .\scripts\import-legacy-history-csv.ps1 `
  -CsvPath "C:\Users\roobi\Downloads\Inventaire_pc_auto_2026 - Historique.csv" `
  -ApiUrl "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api" `
  -Username "codex"
```

Le mot de passe admin est demande de maniere masquee si `-Password` n'est pas fourni. Le script importe par lots, ignore les doublons deja presents pour le meme device/timestamp, et affiche les lignes sans correspondance machine.

## Variables d'environnement

Voir `.env.example`.

Variables publiques frontend:

- `IT_INVENTORY_API_URL`
- `IT_INVENTORY_SCRIPT_URL`
- `IT_INVENTORY_STALE_DAYS`
- `IT_INVENTORY_WEATHER_LATITUDE`
- `IT_INVENTORY_WEATHER_LONGITUDE`
- `IT_INVENTORY_WEATHER_LOCATION`

Secrets backend:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `COLLECTION_ACCESS_TOKEN`
- `ALLOWED_ORIGINS`
- `ALLOWED_EMAIL_DOMAINS` optionnel, vide par défaut pour accepter tout domaine email valide
- `EBAY_BROWSE_API_TOKEN` optionnel
- `GOOGLE_MAPS_API_KEY` optionnel, pour la recherche et l'autocompletion des adresses
- `ENRICHMENT_CACHE_DAYS` optionnel

Ne jamais mettre `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD` ou `ADMIN_SESSION_SECRET` dans le front GitHub Pages.

## API

Routes principales:

- `POST /auth/admin` avec `{ "username": "...", "password": "..." }` ou fallback `{ "password": "..." }`
- `GET /organization` pour exposer les équipes/établissements actifs au formulaire public
- `GET /collect/invite/:code` pour charger une invitation de collecte publique
- `POST /collect/invite/:code/prefill` pour créer un pré-remplissage sans exposer le token technique
- `POST /collect/profile` avec header `X-Collection-Access-Token`
- `POST /collect/scan` avec header `Authorization: Bearer <collectionToken>`
- `POST /collect/legacy-scan` avec header `X-Collection-Access-Token` pour accepter l'ancien payload du script Google Sheets
- `GET /admin/devices` avec token admin
- `GET /admin/devices/:id` avec token admin
- `POST /admin/enrich` avec token admin pour lancer l'enrichissement en cache
- `GET /admin/access-tokens` avec token admin
- `POST /admin/access-tokens` avec token admin pour generer un token
- `POST /admin/access-tokens/:id/revoke` avec token admin pour révoquer un token
- `DELETE /admin/access-tokens/:id` avec token admin pour supprimer definitivement un token
- `GET /admin/collection-invites` avec token admin
- `POST /admin/collection-invites` avec token admin pour generer un lien d'invitation
- `POST /admin/collection-invites/:id/revoke` avec token admin pour révoquer un lien d'invitation
- `DELETE /admin/teams/:id` avec token admin, uniquement si l'équipe n'est plus utilisée
- `DELETE /admin/establishments/:id` avec token admin, uniquement si l'établissement n'est plus utilisé
- `POST /admin/devices/:id/assignment` pour modifier équipe, établissement et propriétaire
- `POST /admin/organization/reassign` pour reaffecter en masse les machines et utilisateurs
- `GET /admin/users`, `POST /admin/users`, `POST /admin/users/:id`, `DELETE /admin/users/:id` pour la gestion des comptes et roles
- `GET /admin/notifications`, `POST /admin/notifications/:id/read`, `POST /admin/notifications/read-all` pour le centre de notifications
- `GET /admin/pending-changes`, `POST /admin/pending-changes/:id/decision` pour traiter les propositions equipe/etablissement

## Propositions équipe/établissement

La page collecte n'a plus de listes hardcodees. Elle chargé `GET /organization`, qui renvoie uniquement les équipes et établissements actifs, dans l'ordre admin `sort_index`.

Si l'utilisateur selectionne `Autre`, il doit saisir une proposition:

- `proposedTeam` pour une nouvelle équipe;
- `proposedEstablishment` pour une nouvelle implantation.

L'API créé une ligne `pending_changes` avec le statut `PENDING` et notifie les admins. Aucune équipe/implantation officielle n'est créée tant qu'un admin n'a pas approuve.

Dans `Validations`, un admin peut:

- approuver et créer la nouvelle valeur;
- modifier la valeur avant approbation;
- lier a une valeur existante pour eviter les doublons;
- rejeter en conservant l'historique.

Le champ `service` est deprecie. Il reste en base pour compatibilité avec les anciennes données et imports, mais il n'est plus demande dans le formulaire de collecte ni exporte dans le CSV standard.

## UI, badges et navigation

Les champs obligatoires de la page collecte affichent un marqueur `*`. La validation est faite côté interface avec des messages lisibles, et le brouillon reste conservedans `localStorage` en cas d'erreur.

Dans `Organisation`, les listes équipes et établissements affichent une ligne d'insertion pendant le drag-and-drop. Le nouvel ordre est sauvegarde par `POST /admin/organization/reorder`, puis reutilise dans les listes de collecte et les filtres.

Les équipes et établissements ont un champ optionnel `abbreviation`:

- `ML - Montlouis-sur-Loire`
- `FS - Footstore`
- `RH - Ressources humaines`

Si aucune abbreviation n'est stockee, l'interface genere un code court d'affichage sans l'ecrire en base. La recherche globale matche le nom complet et l'abbreviation.

Les établissements ont aussi une `discipline` optionnelle pour choisir l'icone: `bike`, `racket`, `football`, `golf`, `lifestyle`, `running`, `general`, `office`, `warehouse`, `headquarters`, `remote`, `other`.

Les équipes et établissements possedent un champ `color`. A la creation, l'API choisit une couleur dans une palette douce:

`blue`, `teal`, `green`, `amber`, `orange`, `rose`, `purple`, `indigo`, `cyan`, `lime`, `slate`, `pink`.

L'admin peut modifier la couleur avec le color picker ou revenir a la couleur de palette via `Couleur par defaut`. Les previews affichent le badge final avant sauvegarde. Les badges utilisent la couleur sauvegardee via les variables CSS `--badge-color` et `--item-color`, ce qui garde une apparence coherente en light/dark mode.

La couleur sauvegardee d'un etablissement est prioritaire partout: liste Organisation, panneau d'edition, table du parc, detail machine, filtres et carte lorsque l'interface affiche un marqueur local. Aucun style par type de lieu ne doit remplacer la couleur stockee.

Mapping équipes:

- `SAV`, `Service apres-vente`, `Support`: casque support.
- `Achat`, `Procurement`, `MP`: panier.
- `RH`, `Ressources humaines`: utilisateurs.
- `Commerciale`, `Biz Dev`: briefcase.
- `Marketplace`, `Marketplaces`, `Place de marché`: boutique/market grid.
- `Publicite`, `Advertising`, `Ads`, `Acquisition`: megaphone.
- `Catalogue`, `PIM`, `Integration produits`, `Product integration`: base de données/import.
- `Tech`, `IT`, `Informatique`: terminal.
- `Design`: plume/palette.
- `Logistique`: camion.
- `Finance`, `Compta`: finance.
- `Direction`, `Management`: etoile/leadership.

Disciplines établissements:

- `bike`: velo.
- `racket`: raquette.
- `football`: ballon.
- `golf`: drapeau.
- `lifestyle`: shopping bag.
- `running`: chaussure/course.
- `general`: trophee.
- `office`, `warehouse`, `headquarters`, `remote`, `other`: icones structurelles.

Pour ajouter une nouvelle couleur, etendre `organizationPalette` dans `frontend/app.js` et `supabase/functions/inventory-api/index.ts`. Pour ajouter une discipline, ajouter la valeur dans la contrainte SQL, dans le select admin, puis dans `locationIcon()`.

Les badges OS, OEM, equipes, lieux, statuts et notifications utilisent une palette plus douce, compatible dark mode. Les logos OEM du detail machine sont centres dans un conteneur stable pour eviter les decalages visuels.

Les notifications sont cliquables:

- `device` ouvre le detail machine;
- `pending_change` ouvre `Validations`;
- `team` ou `establishment` ouvre `Organisation`;
- `collection_access_token` ouvre `Accès`;
- sans cible, la notification est seulement marquee comme lue.

Le detail machine utilise des onglets `Vue generale`, `Materiel`, `OS`, `Reseau`, `Affectation`, `Cycle de vie` et `Historique`, avec une grille deux colonnes sur grand ecran et un empilement responsive sur mobile.

## Tokens temporaires de collecte

Le dashboard admin permet de generer des tokens valables de 1 heure a 1 an, avec un nombre maximal d'utilisations optionnel.

- Le token complet n'est retourne et affiche qu'une seule fois.
- Seul son hash SHA-256 est stocke dans `collection_access_tokens`.
- Chaque utilisation valide incremente atomiquement `use_count`.
- Un token expiré, révoqué ou épuisé est refuse.
- Révoquer conservele token dans l'historique admin avec l'état `Révoqué`.
- Supprimer efface definitivement l'enregistrement. Cette action demande une confirmation dans l'interface.
- Le secret global `COLLECTION_ACCESS_TOKEN` reste accepte comme solution de secours.

Apres une mise a jour depuis une version anterieure, reexecuter `supabase/schema.sql` dans le SQL Editor Supabase pour creer `collection_access_tokens` et `consume_collection_access_token`.

## Enrichissement et valorisation matérielle

Le module fonctionne gratuitement par défaut. Il ne requiert ni Keepa ni API payante. Les montants sont des estimations de gestion de parc et ne garantissent pas le MSRP historique exact.

La section Admin > Valorisation affiche la valeur de lancement et la valeur actuelle estimees, la depreciation moyenne, l'age du parc, les CPU faibles, les priorites de remplacement, la valeur par equipe et les distributions d'age et de performance.

Pour chaque machine, le service calcule:

- annee de sortie approximative;
- prix de lancement selon la categorie et le niveau CPU;
- valeur actuelle selon une courbe de depreciation;
- score benchmark CPU;
- categorie materielle;
- score de priorite de remplacement de 0 a 100;
- recommandation garder, surveiller ou remplacer;
- statut `partial`, `completed` ou `failed`;
- sources, notes et score de confiance.

### Sources gratuites et ordre de repli

1. Table CPU importee manuellement dans Supabase.
2. Jeu CPU intégré dans `data/cpu_benchmarks.csv`.
3. Detection de generation CPU et estimation locale.
4. Regles de prix par categorie: portable professionnel, workstation, mini PC, desktop ou all-in-one.
5. Depreciation: 70% a un an, 55% a deux ans, 40% a trois ans, 30% a quatre ans, 20% a cinq ans, puis 10 a 15%.
6. eBay Browse API peut etre activee en option. Keepa n'est pas requis.

Le scraping de pages constructeur et de sites editoriaux n'est pas active automatiquement. Ces sources peuvent servir a verifier et mettre a jour manuellement les jeux locaux, sans rendre le dashboard dependant de pages externes.

### Score de confiance

- 90-100: plusieurs prix marche trouves;
- 70-89: CPU exact trouve et annee de modele determinee;
- 50-69: generation CPU et categorie detectees;
- 30-49: estimation faible basee sur la marque ou la categorie;
- moins de 30: données insuffisantes.

La meilleure precision est obtenue avec fabricant, modele exact, CPU, RAM, GPU, type de stockage et annee de sortie.

### Importer les benchmarks CPU

Le fichier exemple est `data/cpu_benchmarks.csv`:

```text
cpu_name,cpu_mark_score,release_year,génération,category
```

Dans Admin > Valorisation, cliquer sur `Importer benchmarks CPU`, choisir le CSV, puis lancer `Recalculer les valeurs`. Les lignes importees remplacent le jeu integre lorsqu'un nom CPU normalise correspond exactement.

### Cache et actions admin

- `Enrichir cette machine`: force le recalcul d'une fiche.
- `Enrichir toutes les machines`: traite les enrichissements absents ou vieux de plus de 90 jours.
- `Recalculer les valeurs`: recalcule hors ligne, sans appel externe.
- `Exporter inventaire enrichi`: exporte valeurs, scores, sources et priorites.

Variables optionnelles:

```powershell
supabase secrets set EBAY_BROWSE_API_TOKEN="..."
supabase secrets set GOOGLE_MAPS_API_KEY="..."
supabase secrets set ENRICHMENT_CACHE_DAYS="90"
```

Les erreurs externes sont isolees par machine, journalisees et marquees avec `enrichment_status = failed`; elles ne bloquent pas le reste du parc.

## Autocompletion des adresses

Le module Organisation peut rechercher une adresse avec Google Places, puis remplir automatiquement l'adresse, le code postal, la ville, le pays, la latitude et la longitude.

1. Dans Google Cloud Console, activer **Places API (New)** et la facturation.
2. Créer une clé API reservee au serveur.
3. Restreindre la cle a **Places API (New)**. Ne pas placer cette cle dans `frontend/` ou dans GitHub Pages.
4. Ajouter la valeur dans le secret GitHub `GOOGLE_MAPS_API_KEY`, ou directement dans Supabase:

```bash
supabase secrets set GOOGLE_MAPS_API_KEY="..."
```

La recherche passe par l'Edge Function Supabase et exige une session admin valide. La clé n'est jamais envoyée dans le code GitHub Pages. Lorsqu'elle est configuree, la carte de l'établissement utilisé Google Maps et propose un lien `Ouvrir dans Google Maps`. Sans cette clé, la saisie manuelle et la carte OpenStreetMap restent disponibles automatiquement.

Les coordonnees enregistrees restent les memes dans les deux modes: `latitude` et `longitude`. Elles peuvent etre renseignees manuellement ou remplies par la selection d'une suggestion Google Places.

## Affichage compact des systemes

Les tableaux utilisent `normalizeOsInfo(osString)` pour transformer la chaine complete collectee en badge compact:

- Windows 11 ou Windows 10;
- editions Home/Famille, Pro/Professionnel/Professional, Enterprise ou Education;
- extraction du numéro de build, par exemple `10.0.26200`.

La valeur originale n'est jamais modifiee en base. Elle reste disponible dans l'infobulle du badge et dans la fiche detaillee de la machine.

La detection couvre Windows 10, Windows 11, Windows Server, Ubuntu, Debian, Fedora, Linux et macOS. Windows 10 et Windows 11 utilisent des icones distinctes. Ubuntu, macOS et les systemes inconnus disposent egalement de badges locaux, sans image distante.

## Fabricants et familles de machines

`normalizeManufacturer(manufacturerString, modelString)` transforme les valeurs collectees sans modifier la valeur brute stockee:

- `Dell Inc.` et `DELL` deviennent `Dell`;
- `Hewlett-Packard` et `HP Inc.` deviennent `HP`;
- `ASUSTeK COMPUTER INC.` devient `ASUS`;
- les valeurs OEM generiques ou inconnues deviennent `Unknown`.

Les logos SVG sont stockes dans `frontend/assets/logos/oem/` et fonctionnent hors ligne. Les fabricants pris en chargé incluent Dell, HP, Lenovo, ASUS, Acer, Apple, Microsoft/Surface, MSI, Samsung, Fujitsu, Dynabook, Toshiba, Huawei, Framework, Intel NUC et Gigabyte. Un logo générique est utilisé pour les valeurs inconnues.

La majorite des pictogrammes de marque proviennent du projet Simple Icons et sont copies dans le dépôt, sans chargement distant. Les marques restent la propriete de leurs detenteurs respectifs. Pour ajouter une marque:

1. ajouter un SVG monochrome dans `frontend/assets/logos/oem/`;
2. ajouter la regle correspondante dans `manufacturerRules`;
3. faire correspondre `logoType` au nom du fichier sans extension.

La fiche machine détecte aussi les familles courantes: Latitude, Precision, OptiPlex, XPS, EliteBook, ProBook, ZBook, EliteDesk, ThinkPad, ThinkCentre, ThinkBook, MacBook, iMac et Surface. Le dashboard affiche les volumes par fabricant, la combinaison fabricant/OS et l'age moyen par fabricant.

## Icones équipes et établissements

`normalizeTeamInfo(teamName)` associe automatiquement les equipes aux categories SAV, achats, RH, commerciale/Biz Dev, Tech/IT, Design, Store Manager, Logistique, Catalogue et B2C. Les noms inconnus utilisent l'icone equipe generique.

Les etablissements utilisent leur type enregistre: bureau, boutique, entrepot, siege, teletravail ou autre. Ces icones SVG sont integrees au frontend et apparaissent dans les listes d'organisation, le tableau du parc et la fiche machine.

## Ordre personnalise

Les tables `teams` et `establishments` possedent un champ `sort_index`. Dans Admin > Organisation:

- glisser-deposer un element pour le deplacer sur ordinateur;
- utiliser les boutons haut/bas sur mobile ou au clavier;
- l'ordre est sauvegarde immediatement par `POST /admin/organization/reorder`.

Les listes de gestion, les champs de collecte et les filtres equipe/etablissement reutilisent cet ordre. Les anciennes lignes sans `sort_index` sont classees alphabetiquement puis initialisees par la migration.

## Affectation et réaffectation

Dans la fiche detaillee d'une machine, le formulaire `Affectations` permet de changer:

- l'équipe;
- l'établissement;
- le propriétaire parmi les utilisateurs existants;
- le statut matériel dans le formulaire voisin.

Les listes sont chargees depuis Supabase et l'API valide chaque identifiant avant la mise a jour. Une equipe ou un etablissement absent est affiche comme non renseigne au lieu de creer une reference invalide.

## Suppression des données d'organisation

Les equipes et etablissements disposent d'une action `Supprimer` dans leur formulaire d'edition. Une confirmation est toujours demandee.

- Une equipe ne peut pas etre supprimee si une machine ou un utilisateur lui est affecte.
- Un etablissement ne peut pas etre supprime si une machine ou un utilisateur lui est affecte.
- L'API retourne le nombre de références bloquantes afin de permettre leur réaffectation.
- La suppression d'un etablissement inutilise supprime egalement son adresse et ses coordonnees, car elles appartiennent au meme enregistrement.
- Le dialogue de reaffectation permet de choisir une autre destination, de deplacer les machines et profils utilisateurs, puis de supprimer l'ancien element.

La migration `20260607150000_device_history_and_ordering.sql` ajoute l'ordre persistant et la table d'historique.

## Historique du cycle de vie

`device_history` conservela machine, le type d'événement, le champ modifie, l'ancienne et la nouvelle valeur, la source, l'auteur, la date, la note et les références utilisateur/équipe/établissement lorsque disponibles.

La fiche machine comporte les onglets Vue generale, Materiel, Reseau, Affectation, Cycle de vie et Historique. L'onglet Historique affiche les evenements les plus recents, repond a `qui / quand / comment / quoi / pourquoi`, et permet d'ajouter une note administrateur.

La table `device_assignment_periods` conserveles periodes d'utilisation historiques:

- utilisateur et email;
- équipe et établissement;
- date de debut, date de fin et durée calculee;
- auteur d'affectation/retrait;
- source (`MANUAL_ADMIN`, `COLLECTOR`, `IMPORT`, `SYSTEM`);
- raison ou note.

Les événements sont ajoutes lorsque:

- une machine est créée;
- le collecteur ou l'import modifie le hostname, l'OS, le fabricant, le modèle, le CPU, la RAM, le stockage ou l'utilisateur OS;
- un administrateur change le propriétaire, l'équipe, l'établissement ou le statut;
- une machine est sortie du parc ou réactivée;
- une reaffectation en masse deplace les machines vers une autre equipe ou un autre etablissement.

`last_seen_at` et les scans identiques ne generent pas d'evenement afin d'eviter un historique bruyant. Les valeurs actuelles restent dans `devices`; les anciennes valeurs restent dans `device_history`.

Quand un administrateur passe une machine en `Sorti du parc`, une fenêtre demande une note obligatoire. La confirmation:

- enregistre le statut `retired`;
- vide le propriétaire courant et l'équipe courante;
- ferme la periode d'affectation ouverte;
- ajoute les événements `DEVICE_RETIRED` et, si nécessaire, `USER_REMOVED`;
- créé une notification cliquable vers l'onglet Historique.

Une machine sortie du parc n'a donc plus d'utilisateur courant. Les anciens utilisateurs restent visibles dans l'historique et dans la chronologie d'affectation.

Un message `0 machine(s), 1 utilisateur(s)` indique generalement qu'un ancien profil de collecte conserve encore cette equipe ou cet etablissement. Ce n'est pas une coordonnee de carte. Le dialogue de reaffectation deplace ce profil proprement. Pour un audit manuel, consulter les colonnes `team_id` et `establishment_id` de la table `users`; ne pas supprimer directement une reference sans avoir choisi sa nouvelle affectation.

## Collecte Windows, Linux et macOS

Le script historique `scripts/collect-windows.ps1` reste disponible comme fallback Windows. Le script standard Python `scripts/collect-cross-platform.py` fonctionne sous Windows, Ubuntu/Linux et macOS sans paquet Python externe et choisit automatiquement la stratégie de collecte selon l'OS:

```bash
python3 scripts/collect-cross-platform.py \
  --api-url "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api" \
  --token "TOKEN_DE_SCRIPT"
```

Ajouter `--include-mac` uniquement lorsque la collecte de l'adresse MAC est autorisee.

- Linux lit `/etc/os-release`, `/proc`, `/sys/class/dmi/id`, `lsblk` et `lspci` lorsqu'ils sont disponibles.
- `dmidecode` n'est utilisé que si la commande existe et que le script est exécute avec les droits necessaires.
- macOS utilisé `system_profiler`, `sw_vers`, `sysctl` et les informations de stockage locales.
- Windows utilisé CIM via PowerShell et revient au registre Windows si CIM est indisponible.

Le collecteur Windows enrichit l'identite matérielle avec plusieurs sources:

- `Win32_ComputerSystem`: `Manufacturer`, `Model`, `SystemFamily`, `SystemSKUNumber`;
- `Win32_ComputerSystemProduct`: `Name`, `Vendor`, `Version`, `IdentifyingNumber`, `UUID`;
- `Win32_BIOS`: `SerialNumber`, `SMBIOSBIOSVersion`;
- `Win32_BaseBoard`: `Manufacturer`, `Product`, `SerialNumber`;
- `Win32_SystemEnclosure`: `SerialNumber`, `SMBIOSAssetTag`, `ChassisTypes`;
- `MS_SystemInformation` si disponible.

Le JSON garde les champs existants (`manufacturer`, `model`, `serialNumber`) et ajoute:

```json
{
  "modelNumber": "SKU ou product number",
  "serviceTag": "serial/service tag si disponible",
  "hardwareIdentity": {
    "manufacturer": "Dell Inc.",
    "model": "Dell G16 7630",
    "systemFamily": "GSeries",
    "systemSku": "SKU",
    "productName": "Dell G16 7630",
    "productNumber": "Product number",
    "baseboardProduct": "Baseboard product",
    "baseboardManufacturer": "Dell Inc.",
    "biosSerialNumber": "Service tag",
    "chassisSerialNumber": "Chassis serial",
    "assetTag": "Asset tag",
    "serviceTag": "Service tag",
    "uuid": "System UUID"
  }
}
```

Les valeurs placeholder (`To be filled by O.E.M.`, `Default string`, `System Serial Number`, `None`, vide) sont ignorees. La priorite est: `systemSku` pour `modelNumber`, puis product/baseboard; `serviceTag`/BIOS serial pour `serialNumber`, puis identifiant produit/chassis.

Une permission manquante produit un champ vide; elle ne doit pas interrompre l'envoi de l'inventaire.

Le collecteur desktop `Spacefoot IT Collector` propose un flux en quatre etapes:

1. connexion API et validation du token temporaire;
2. affectation utilisateur avec equipes/etablissements charges depuis l'admin;
3. scan matériel local;
4. revue lisible puis soumission, avec JSON brut disponible dans une section avancée.

L'adresse MAC est cochee par defaut dans le collecteur desktop lorsque sa collecte est autorisee. L'utilisateur peut la retirer avant le scan. Les boutons en bas de fenetre permettent de changer la langue (`FR`/`EN`) et le theme (`System`, `Dark`, `Light`). Ces preferences sont conservees localement.

Le collecteur affiche sa version en bas de fenêtre et envoie aussi `collectorVersion`, `collectorPlatform`, `collectorOs` et `collectorBuildChannel` dans le payload. L'API conserveces informations dans le payload brut du scan et utilisé `collectorVersion` comme version de script lorsque `scriptVersion` n'est pas present.

Sous Windows, les commandes PowerShell/CIM lancees par l'application sont executees avec `CREATE_NO_WINDOW` afin de ne pas ouvrir de console visible. La barre de titre native est assombrie/eclaircie via DWM lorsque Windows le permet. Sur les plateformes ou la barre native ne peut pas etre stylisee par Tkinter, l'application applique le meilleur theme possible au contenu et documente cette limite.

Attention aux deux types de tokens:

- token d'enrolement temporaire admin `sfit_...`: visible sur la page web, accepte par le collecteur desktop et utilise pour creer le profil;
- token/secret de scan retourne apres `/collect/profile`: interne, utilise uniquement par le script ou l'app pour poster `/collect/scan`, et non affiche comme token utilisateur.

Le flux recommande utilise maintenant des invitations de collecte. L'admin cree un lien du type `https://.../pc_inventory_2.0/?invite=inv_...` depuis `Admin > Acces collecte`. L'utilisateur ouvre ce lien, voit ses champs pre-remplis si l'admin les a renseignes, puis clique sur le telechargement du collecteur. Le site telecharge aussi un fichier `spacefoot-collector-prefill.json`; au demarrage, le collecteur cherche ce fichier dans le dossier Downloads et charge automatiquement le pre-remplissage. L'utilisateur n'a donc pas besoin de voir ou copier le token technique.

Les tokens `sfit_...` restent disponibles dans `Tokens techniques avances` pour le support IT, les imports et les cas de diagnostic. Le collecteur distingue:

- lien d'invitation `inv_...`: expérience utilisateur normale, partageable par email/Teams, expiré et limite en utilisations;
- token d'enrolement temporaire `sfit_...`: mode support IT avance;
- token/secret de scan retourne apres `/collect/profile`: interne, utilise uniquement par le script ou l'app pour poster `/collect/scan`, jamais affiche comme token utilisateur.

Dans le collecteur desktop, les champs `API URL`, token, prenom, nom, email, equipe, etablissement, propositions, langue et theme sont pre-remplis puis restent entierement modifiables avant l'envoi. Les listes equipe/etablissement sont rechargees depuis `/organization`; les champs `autre equipe` et `autre etablissement` ne sont visibles que si l'utilisateur choisit `Other` / `Autre`.

Les brouillons de pre-remplissage expirent automatiquement, par defaut apres 24 heures maximum. Aucun executable personnalise n'est genere et aucune donnee personnelle n'est placee dans les assets GitHub Releases.

La page web détecte l'OS avec `navigator.userAgentData` quand disponible, puis `navigator.userAgent` / `navigator.platform` en fallback, et affiche un badge/logo OS sur le bouton principal:

- Windows: bouton principal `Télécharger le collecteur Windows`;
- macOS: bouton principal `Télécharger le collecteur macOS`;
- Linux: bouton principal `Télécharger le collecteur Linux`;
- inconnu: bouton générique et choix manuel Windows/macOS/Linux.

Les URLs de telechargement viennent de `frontend/collector-releases.json`, qui contient la version, l'asset et le lien de release. Le lien `Autres versions` ouvre la page GitHub Releases complete.

Le collecteur affiche explicitement que seuls les champs d'inventaire sont lus: aucun fichier personnel, aucun historique navigateur, aucun mot de passe, aucun controle a distance. Les donnees sont envoyees via le meme contrat API que le web app: `/collect/profile` cree le jeton de scan, puis `/collect/scan` enregistre la machine. Les nouveaux champs `model_number`, `service_tag` et `hardware_identity` sont persistes dans `devices`, `device_scans` et exposes par `device_inventory_view`.

Si `modelNumber`, `serviceTag` ou `serialNumber` restent vides, verifier dans PowerShell:

```powershell
Get-CimInstance Win32_ComputerSystem | Select Manufacturer,Model,SystemFamily,SystemSKUNumber
Get-CimInstance Win32_ComputerSystemProduct | Select Name,Vendor,Version,IdentifyingNumber,UUID
Get-CimInstance Win32_BIOS | Select SerialNumber,SMBIOSBIOSVersion
Get-CimInstance Win32_SystemEnclosure | Select SerialNumber,SMBIOSAssetTag
```

Certains BIOS masquent ou remplacent ces valeurs par des placeholders; le collecteur les ignore volontairement pour eviter de polluer la base.

Les prix marché sont approximatifs: le dashboard affiche donc un score de confiance. Plus il y ade signaux récents et concordants, plus la confiance augmente.

## Securite minimale

- Les comptes d'administration sont stockes dans `admin_users`.
- Les mots de passe ne sont jamais stockes en clair. L'API stocke un hash `pbkdf2_sha256` avec sel unique et 210 000 iterations.
- Session admin signee par HMAC avec expiration 12h. Le front conserve seulement le token signe et le role courant.
- Le secret `ADMIN_PASSWORD` reste un filet de sécurité et sert au bootstrap du premier compte admin.
- Token utilisateur public separe du token temporaire de script.
- Token de script stocke hashe en base.
- CORS limite par `ALLOWED_ORIGINS`.
- RLS activee sur les tables Supabase.
- Aucune policy publique: l'accès applicatif passe par l'Edge Function et la service role key côté serveur.
- Validation serveur sur les champs obligatoires et tailles de chaines.

## Roles et comptes admin

L'interface admin supporte des comptes nominatifs avec roles:

- `ADMIN`: acces complet, gestion utilisateurs, roles, tokens, equipes, etablissements, machines, historique, exports et notifications.
- `MANAGER`: lecture du parc, edition et reaffectation des machines, gestion organisationnelle, exports, notifications et validations mineures.
- `VIEWER` / `READ_ONLY`: lecture dashboards, details machines et historique, sans edition ni suppression.
- `COLLECTOR_USER`: reserve aux futurs usages de collecte, sans accès dashboard admin.

Le premier compte peut etre initialise depuis l'ecran de connexion:

1. saisir un identifiant, par exemple `admin`;
2. utiliser le mot de passe defini dans le secret Supabase `ADMIN_PASSWORD`;
3. si aucun compte n'existe encore dans `admin_users`, l'API créé ce premier compte avec le role `ADMIN`.

L'ancien mode sans identifiant continue de fonctionner avec `ADMIN_PASSWORD` pour eviter un verrouillage accidentel pendant la transition. Il est conseille de creer un compte `ADMIN`, puis d'utiliser des comptes `MANAGER` temporaires pour les tests ou interventions.

La page `Users & roles` permet a un `ADMIN` de creer, modifier, desactiver, supprimer un compte et reinitialiser son mot de passe. La liste et le panneau d'edition affichent aussi la date de creation du compte. Les actions sensibles creent des entrees dans `audit_logs` et des notifications.

Le champ mot de passe inclut deux actions rapides:

- generer un mot de passe fort avec `crypto.getRandomValues`, au moins 16 caracteres, majuscules, minuscules, chiffres et symboles;
- copier le mot de passe généré ou saisi, avec retour visuel en cas de succès ou champ vide.

L'etat `Compte actif` est affiche sous forme d'interrupteur: vert/actif pour un compte autorise, gris/desactive pour un compte bloque. Les comptes desactives ne peuvent pas se connecter.

Le header admin affiche le nom connecté avec une icone et un libellé de role compact (`ADMIN`, `MANAGER`, `VIEWER` / `READ_ONLY`, `COLLECTOR_USER`), compatible dark mode et mobile.

Les actions globales du header (`Actualiser`, `Enrichir`, `Export CSV`, `Deconnexion`) et `Nouveau compte` utilisent des boutons avec icones, labels courts, `aria-label` et tooltips.

## Validation email et propriétaire machine

Les emails sont valides cote navigateur et cote API avec un format standard. Les domaines `.com` sont acceptes par defaut; `.local` n'est pas requis.

Le secret optionnel `ALLOWED_EMAIL_DOMAINS` peut restreindre les domaines si besoin, par exemple:

```text
ALLOWED_EMAIL_DOMAINS=spacefoot.com,example.com
```

Si `ALLOWED_EMAIL_DOMAINS` est vide, aucun filtrage de domaine n'est applique au-dela du format email valide.

Dans le detail machine, l'onglet `Affectation` permet a un admin de modifier l'equipe, l'etablissement, le proprietaire, le prenom, le nom et l'email du proprietaire. Les changements de proprietaire creent des lignes dans `device_history` et une notification de reaffectation lorsque l'affectation change.

## Propositions et rejets

La validation admin affiche par defaut uniquement les propositions `PENDING`. Approuver, modifier puis approuver, ou rejeter une proposition change son statut et la retire immediatement de la liste par defaut. Les propositions traitees restent conservees en base et dans l'audit pour un usage historique.

## Notifications

La table `notifications` conserve:

- type, titre, message et severite (`INFO`, `SUCCESS`, `WARNING`, `ERROR`);
- cible par role ou utilisateur;
- entite liée lorsque disponible;
- état lu/non lu et date de lecture.

Le dashboard affiche une cloche avec compteur de notifications non lues, une page de notifications, des filtres par severite/état et les actions `Marquer lu` / `Tout marquer comme lu`.

Les notifications systeme utilisent des cles de traduction cote interface lorsque possible. Les titres/messages connus sont rendus en francais ou en anglais selon la langue choisie; les nouvelles notifications de cycle de vie utilisent directement des cles comme `notification.deviceRetired.title`.

Les dates et mois sont formates via `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat`. Le select `Heure` dans le header permet de choisir `Auto`, `24h` ou `AM/PM`; la preference est conservee dans le navigateur et s'applique aux notifications, historiques, dates utilisateur, dernier scan et propositions.

Des notifications sont creees notamment lors de:

- creation ou mise a jour importante d'une machine par le collecteur;
- réaffectation d'une machine;
- sortie du parc ou reactivation d'une machine;
- révocation ou suppression d'un token de collecte;
- suppression équipe/établissement bloquée;
- creation, mise a jour, suppression ou bootstrap d'un compte admin.

Les `ADMIN` voient toutes les notifications. Les autres roles voient les notifications globales, celles de leur role ou celles qui leur sont directement assignees.

## Limites connues

- Le navigateur ne peut pas recuperer toute la configuration materielle. La collecte complete necessite PowerShell, puis plus tard un script Python multiplateforme.
- Le score d'anciennete est volontairement simple. Il peut etre remplace par une logique basee sur date d'achat, garantie, modele ou politique interne.
- L'export XLSX n'est pas inclus sans dependance externe; l'export CSV est pret et compatible Excel.
