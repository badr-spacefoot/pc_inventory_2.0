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
- Secrets optionnels `EBAY_BROWSE_API_TOKEN` et `KEEPA_API_KEY`

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
- `KEEPA_API_KEY` optionnel
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

## Tokens temporaires de collecte

Le dashboard admin permet de generer des tokens valables de 1 heure a 1 an, avec un nombre maximal d'utilisations optionnel.

- Le token complet n'est retourne et affiche qu'une seule fois.
- Seul son hash SHA-256 est stocke dans `collection_access_tokens`.
- Chaque utilisation valide incremente atomiquement `use_count`.
- Un token expire, revoque ou epuise est refuse.
- Le secret global `COLLECTION_ACCESS_TOKEN` reste accepte comme solution de secours.

Apres une mise a jour depuis une version anterieure, reexecuter `supabase/schema.sql` dans le SQL Editor Supabase pour creer `collection_access_tokens` et `consume_collection_access_token`.

## Enrichissement externe

Le dashboard contient un bouton admin `Enrichir les donnees`. Cette action appelle `/admin/enrich`, traite un lot de machines et met en cache le resultat dans `hardware_enrichment`.

Tables ajoutees:

- `hardware_enrichment`: CPU, score benchmark, generation, annees de sortie, prix estimes, indices performance/obsolescence, recommandation, confiance.
- `market_price_history`: annonces/prix collectes par source avec URL, condition, devise et date.

Sources prevues:

- eBay Browse API via `EBAY_BROWSE_API_TOKEN`.
- Keepa via `KEEPA_API_KEY`, emplacement prepare mais collecte a adapter selon le plan Keepa choisi.
- Benchmark CPU local heuristique par defaut, remplacable ensuite par un dataset PassMark/CPUBenchmark importe.
- Intel ARK / AMD specs: a brancher via dataset local ou endpoint fournisseur, selon contraintes de licences/API.

Variables optionnelles:

```powershell
supabase secrets set EBAY_BROWSE_API_TOKEN="..."
supabase secrets set KEEPA_API_KEY="..."
supabase secrets set GOOGLE_MAPS_API_KEY="..."
supabase secrets set ENRICHMENT_CACHE_DAYS="30"
```

L'enrichissement n'est pas lance a chaque affichage. Par defaut, un resultat de moins de `ENRICHMENT_CACHE_DAYS` jours est ignore. Pour automatiser, creer un schedule Supabase qui appelle regulierement l'Edge Function sur `/admin/enrich` avec un token admin serveur, ou declencher manuellement depuis le dashboard.

## Autocompletion des adresses

Le module Organisation peut rechercher une adresse avec Google Places, puis remplir automatiquement l'adresse, le code postal, la ville, le pays, la latitude et la longitude.

1. Dans Google Cloud Console, activer **Places API (New)** et la facturation.
2. Creer une cle API reservee au serveur.
3. Restreindre la cle a **Places API (New)**. Ne pas placer cette cle dans `frontend/` ou dans GitHub Pages.
4. Ajouter la valeur dans le secret GitHub `GOOGLE_MAPS_API_KEY`, ou directement dans Supabase:

```bash
supabase secrets set GOOGLE_MAPS_API_KEY="..."
```

La recherche passe par l'Edge Function Supabase et exige une session admin valide. Sans cette cle, la saisie manuelle des adresses et la carte OpenStreetMap restent disponibles.

Les prix marche sont approximatifs: le dashboard affiche donc un `confidence_score`. Plus il y a de signaux recents et concordants, plus la confiance augmente.

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
