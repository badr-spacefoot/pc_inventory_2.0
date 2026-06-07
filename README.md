# Spacefoot IT Inventory

Application web d'inventaire de parc informatique pour remplacer ou completer l'ancien flux Google Sheets.

Le front est statique et peut etre heberge sur GitHub Pages. La collecte complete du materiel passe par un script local volontaire, car un navigateur ne peut pas lire de maniere fiable et autorisee le numero de serie, le CPU, la RAM, le stockage, l'adresse MAC ou l'utilisateur Windows.

## Architecture recommandee

- `frontend/` : application responsive HTML/CSS/JS hebergeable sur GitHub Pages.
- `supabase/schema.sql` : tables `users`, `devices`, `device_scans`, `teams`, `establishments`, `audit_logs` et tokens de collecte.
- `supabase/functions/inventory-api/` : API Supabase Edge Function.
- `scripts/collect-windows.ps1` : script PowerShell de collecte Windows.
- Backend recommande : Supabase pour Postgres, Edge Functions, secrets serveur et CORS.

Flux:

1. L'utilisateur ouvre la page de collecte avec un token d'acces.
2. Il saisit nom, prenom, email, equipe, etablissement, service et commentaire.
3. L'API cree ou met a jour l'utilisateur et renvoie un token de script temporaire.
4. L'utilisateur lance la commande PowerShell generee.
5. Le script collecte les informations locales et poste le scan vers `/collect/scan`.
6. L'API deduplique la machine, met a jour `devices`, ajoute une ligne dans `device_scans` et journalise dans `audit_logs`.
7. L'admin consulte le dashboard, les filtres, le detail, l'historique et l'export CSV.

## Fonctionnalites

- Acces utilisateur par token de collecte.
- Formulaire utilisateur: nom, prenom, email, equipe, etablissement, service, commentaire.
- Commande PowerShell personnalisee et telechargement du script.
- Dashboard admin protege par mot de passe cote backend.
- Liste des machines, recherche globale et filtres equipe, etablissement, OS, anciennete, modele, statut.
- Badges locaux pour les systemes et fabricants, avec normalisation des valeurs OEM et detection des familles professionnelles.
- Vue detail machine et historique des scans.
- Score simple d'anciennete materielle.
- Graphiques: etablissements, equipes, OS, machines non remontees, anciennete, modeles, RAM moyenne, stockage faible.
- Export CSV depuis le dashboard.
- Deduplication: serial number, puis hostname + MAC, puis utilisateur + modele + etablissement.
- Compatibilite ancien script Google Sheets via `/collect/legacy-scan` avec les champs `pcName`, `mac`, `site`, `serial`, `os`, `ram`, `ip`.
- Enrichissement materiel cacheable: score CPU, generation CPU, age modele, prix estime, valeur marche, confiance et recommandation.
- Generation admin de tokens de collecte temporaires avec expiration, limite d'utilisations et revocation.

## Installation Supabase

1. Creer un projet Supabase.
2. Ouvrir le SQL Editor.
3. Executer le contenu de `supabase/schema.sql`.
4. Installer la CLI Supabase si besoin.
5. Configurer les secrets de l'Edge Function:

```powershell
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
supabase secrets set ADMIN_PASSWORD="un-mot-de-passe-long"
supabase secrets set ADMIN_SESSION_SECRET="une-valeur-aleatoire-longue"
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
</script>
```

## Deploiement GitHub Pages

1. Pousser le dossier `frontend/` dans le depot.
2. Dans GitHub, ouvrir `Settings > Pages`.
3. Choisir la branche `main`.
4. Activer GitHub Actions comme source Pages.
5. Verifier que `ALLOWED_ORIGINS` contient l'URL GitHub Pages.

Le workflow `.github/workflows/pages.yml` publie `frontend/` a la racine du site et copie aussi `scripts/`, afin que `collect-windows.ps1` soit disponible depuis GitHub Pages.

## Lancement du script Windows

Depuis le dashboard utilisateur, la commande est generee automatiquement. Exemple manuel:

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

Le script `scripts/import-legacy-csv.ps1` importe l'ancien export `Données` vers la nouvelle API. Il utilise `/collect/legacy-scan`, qui accepte les noms de champs historiques du Google Apps Script.

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File .\scripts\import-legacy-csv.ps1 `
  -CsvPath "C:\Users\roobi\Downloads\Inventaire_pc_auto_2026 - Données.csv" `
  -ApiUrl "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api" `
  -CollectionAccessToken "TOKEN_UTILISATEUR_DE_COLLECTE" `
  -DefaultEmailDomain "spacefoot.local" `
  -DefaultService "Non renseigne"
```

Comme l'ancien export ne contient pas d'email ni de service, l'import genere un email technique par defaut et renseigne un service par defaut. Ces valeurs peuvent ensuite etre corrigees dans la base ou enrichies via une vraie table RH.

## Variables d'environnement

Voir `.env.example`.

Variables publiques frontend:

- `IT_INVENTORY_API_URL`
- `IT_INVENTORY_SCRIPT_URL`
- `IT_INVENTORY_STALE_DAYS`

Secrets backend:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `COLLECTION_ACCESS_TOKEN`
- `ALLOWED_ORIGINS`
- `EBAY_BROWSE_API_TOKEN` optionnel
- `GOOGLE_MAPS_API_KEY` optionnel, pour la recherche et l'autocompletion des adresses
- `ENRICHMENT_CACHE_DAYS` optionnel

Ne jamais mettre `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD` ou `ADMIN_SESSION_SECRET` dans le front GitHub Pages.

## API

Routes principales:

- `POST /auth/admin` avec `{ "password": "..." }`
- `POST /collect/profile` avec header `X-Collection-Access-Token`
- `POST /collect/scan` avec header `Authorization: Bearer <collectionToken>`
- `POST /collect/legacy-scan` avec header `X-Collection-Access-Token` pour accepter l'ancien payload du script Google Sheets
- `GET /admin/devices` avec token admin
- `GET /admin/devices/:id` avec token admin
- `POST /admin/enrich` avec token admin pour lancer l'enrichissement en cache
- `GET /admin/access-tokens` avec token admin
- `POST /admin/access-tokens` avec token admin pour generer un token
- `POST /admin/access-tokens/:id/revoke` avec token admin pour revoquer un token
- `DELETE /admin/access-tokens/:id` avec token admin pour supprimer definitivement un token
- `DELETE /admin/teams/:id` avec token admin, uniquement si l'equipe n'est plus utilisee
- `DELETE /admin/establishments/:id` avec token admin, uniquement si l'etablissement n'est plus utilise
- `POST /admin/devices/:id/assignment` pour modifier equipe, etablissement et proprietaire
- `POST /admin/organization/reassign` pour reaffecter en masse les machines et utilisateurs

## Tokens temporaires de collecte

Le dashboard admin permet de generer des tokens valables de 1 heure a 1 an, avec un nombre maximal d'utilisations optionnel.

- Le token complet n'est retourne et affiche qu'une seule fois.
- Seul son hash SHA-256 est stocke dans `collection_access_tokens`.
- Chaque utilisation valide incremente atomiquement `use_count`.
- Un token expire, revoque ou epuise est refuse.
- Revoquer conserve le token dans l'historique admin avec l'etat `Revoque`.
- Supprimer efface definitivement l'enregistrement. Cette action demande une confirmation dans l'interface.
- Le secret global `COLLECTION_ACCESS_TOKEN` reste accepte comme solution de secours.

Apres une mise a jour depuis une version anterieure, reexecuter `supabase/schema.sql` dans le SQL Editor Supabase pour creer `collection_access_tokens` et `consume_collection_access_token`.

## Enrichissement et valorisation materielle

Le module fonctionne gratuitement par defaut. Il ne requiert ni Keepa ni API payante. Les montants sont des estimations de gestion de parc et ne garantissent pas le MSRP historique exact.

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
2. Jeu CPU integre dans `data/cpu_benchmarks.csv`.
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
- moins de 30: donnees insuffisantes.

La meilleure precision est obtenue avec fabricant, modele exact, CPU, RAM, GPU, type de stockage et annee de sortie.

### Importer les benchmarks CPU

Le fichier exemple est `data/cpu_benchmarks.csv`:

```text
cpu_name,cpu_mark_score,release_year,generation,category
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
2. Creer une cle API reservee au serveur.
3. Restreindre la cle a **Places API (New)**. Ne pas placer cette cle dans `frontend/` ou dans GitHub Pages.
4. Ajouter la valeur dans le secret GitHub `GOOGLE_MAPS_API_KEY`, ou directement dans Supabase:

```bash
supabase secrets set GOOGLE_MAPS_API_KEY="..."
```

La recherche passe par l'Edge Function Supabase et exige une session admin valide. La cle n'est jamais envoyee dans le code GitHub Pages. Lorsqu'elle est configuree, la carte de l'etablissement utilise Google Maps et propose un lien `Ouvrir dans Google Maps`. Sans cette cle, la saisie manuelle et la carte OpenStreetMap restent disponibles automatiquement.

Les coordonnees enregistrees restent les memes dans les deux modes: `latitude` et `longitude`. Elles peuvent etre renseignees manuellement ou remplies par la selection d'une suggestion Google Places.

## Affichage compact des systemes

Les tableaux utilisent `normalizeOsInfo(osString)` pour transformer la chaine complete collectee en badge compact:

- Windows 11 ou Windows 10;
- editions Home/Famille, Pro/Professionnel/Professional, Enterprise ou Education;
- extraction du numero de build, par exemple `10.0.26200`.

La valeur originale n'est jamais modifiee en base. Elle reste disponible dans l'infobulle du badge et dans la fiche detaillee de la machine.

La detection couvre Windows 10, Windows 11, Windows Server, Ubuntu, Debian, Fedora, Linux et macOS. Windows 10 et Windows 11 utilisent des icones distinctes. Ubuntu, macOS et les systemes inconnus disposent egalement de badges locaux, sans image distante.

## Fabricants et familles de machines

`normalizeManufacturer(manufacturerString, modelString)` transforme les valeurs collectees sans modifier la valeur brute stockee:

- `Dell Inc.` et `DELL` deviennent `Dell`;
- `Hewlett-Packard` et `HP Inc.` deviennent `HP`;
- `ASUSTeK COMPUTER INC.` devient `ASUS`;
- les valeurs OEM generiques ou inconnues deviennent `Unknown`.

Les badges SVG sont integres au frontend et fonctionnent hors ligne. Les fabricants pris en charge incluent Dell, HP, Lenovo, ASUS, Acer, Apple, Microsoft/Surface, MSI, Samsung, Fujitsu, Dynabook, Toshiba, Huawei, Framework, Intel NUC et Gigabyte.

La fiche machine detecte aussi les familles courantes: Latitude, Precision, OptiPlex, XPS, EliteBook, ProBook, ZBook, EliteDesk, ThinkPad, ThinkCentre, ThinkBook, MacBook, iMac et Surface. Le dashboard affiche les volumes par fabricant, la combinaison fabricant/OS et l'age moyen par fabricant.

## Affectation et reaffectation

Dans la fiche detaillee d'une machine, le formulaire `Affectations` permet de changer:

- l'equipe;
- l'etablissement;
- le proprietaire parmi les utilisateurs existants;
- le statut materiel dans le formulaire voisin.

Les listes sont chargees depuis Supabase et l'API valide chaque identifiant avant la mise a jour. Une equipe ou un etablissement absent est affiche comme non renseigne au lieu de creer une reference invalide.

## Suppression des donnees d'organisation

Les equipes et etablissements disposent d'une action `Supprimer` dans leur formulaire d'edition. Une confirmation est toujours demandee.

- Une equipe ne peut pas etre supprimee si une machine ou un utilisateur lui est affecte.
- Un etablissement ne peut pas etre supprime si une machine ou un utilisateur lui est affecte.
- L'API retourne le nombre de references bloquantes afin de permettre leur reaffectation.
- La suppression d'un etablissement inutilise supprime egalement son adresse et ses coordonnees, car elles appartiennent au meme enregistrement.
- Le dialogue de reaffectation permet de choisir une autre destination, de deplacer les machines et profils utilisateurs, puis de supprimer l'ancien element.

Aucune migration supplementaire n'est necessaire: ces controles utilisent les cles etrangeres existantes.

Un message `0 machine(s), 1 utilisateur(s)` indique generalement qu'un ancien profil de collecte conserve encore cette equipe ou cet etablissement. Ce n'est pas une coordonnee de carte. Le dialogue de reaffectation deplace ce profil proprement. Pour un audit manuel, consulter les colonnes `team_id` et `establishment_id` de la table `users`; ne pas supprimer directement une reference sans avoir choisi sa nouvelle affectation.

## Collecte Windows, Linux et macOS

Le script historique `scripts/collect-windows.ps1` reste recommande pour Windows. Le script standard Python `scripts/collect-cross-platform.py` fonctionne sous Windows, Ubuntu/Linux et macOS sans paquet Python externe:

```bash
python3 scripts/collect-cross-platform.py \
  --api-url "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api" \
  --token "TOKEN_DE_SCRIPT"
```

Ajouter `--include-mac` uniquement lorsque la collecte de l'adresse MAC est autorisee.

- Linux lit `/etc/os-release`, `/proc`, `/sys/class/dmi/id`, `lsblk` et `lspci` lorsqu'ils sont disponibles.
- `dmidecode` n'est utilise que si la commande existe et que le script est execute avec les droits necessaires.
- macOS utilise `system_profiler`, `sw_vers`, `sysctl` et les informations de stockage locales.
- Windows utilise CIM via PowerShell et revient a des informations generiques si CIM est indisponible.

Une permission manquante produit un champ vide; elle ne doit pas interrompre l'envoi de l'inventaire.

Les prix marche sont approximatifs: le dashboard affiche donc un score de confiance. Plus il y a de signaux recents et concordants, plus la confiance augmente.

## Securite minimale

- Mot de passe admin verifie uniquement dans l'Edge Function.
- Session admin signee par HMAC avec expiration 12h.
- Token utilisateur public separe du token temporaire de script.
- Token de script stocke hashe en base.
- CORS limite par `ALLOWED_ORIGINS`.
- RLS activee sur les tables Supabase.
- Aucune policy publique: l'acces applicatif passe par l'Edge Function et la service role key cote serveur.
- Validation serveur sur les champs obligatoires et tailles de chaines.

## Limites connues

- Le navigateur ne peut pas recuperer toute la configuration materielle. La collecte complete necessite PowerShell, puis plus tard un script Python multiplateforme.
- Le score d'anciennete est volontairement simple. Il peut etre remplace par une logique basee sur date d'achat, garantie, modele ou politique interne.
- L'export XLSX n'est pas inclus sans dependance externe; l'export CSV est pret et compatible Excel.
- La gestion fine des roles admin multi-utilisateurs peut etre ajoutee ensuite avec Supabase Auth.
