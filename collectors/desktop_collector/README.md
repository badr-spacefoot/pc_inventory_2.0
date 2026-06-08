# Spacefoot desktop collector

Collecteur desktop transparent et packagable pour Windows, Linux et macOS.

Objectif:

- valider l'API et le token de collecte avant l'envoi;
- charger les équipes et établissements depuis les valeurs admin;
- afficher clairement les donnees collectees avant soumission;
- utiliser le meme contrat API que le web app (`/collect/profile` puis `/collect/scan`);
- garder un panneau avancé avec le JSON brut pour audit.

Flux utilisateur:

1. `Connection`: API URL, token temporaire de collecte, validation du token.
2. `Assignment`: prenom, nom, email, equipe et etablissement charges depuis l'admin.
3. `Hardware scan`: collecte locale et resume matériel lisible.
4. `Review & submit`: confirmation, puis envoi a l'API.

L'adresse MAC est incluse par defaut lorsque l'organisation l'autorise. L'utilisateur peut la decocher avant le scan.

Le switch de langue en bas de fenetre permet de basculer entre anglais et francais. Le switch theme alterne entre `System`, `Dark` et `Light`. Les preferences sont conservees dans le brouillon local.

La version de l'application est affichee en bas de fenetre. Les submissions ajoutent aussi:

- `collectorVersion`;
- `collectorPlatform`;
- `collectorOs`;
- `collectorBuildChannel`.

Sous Windows, PowerShell/CIM est lance sans ouvrir de console visible (`CREATE_NO_WINDOW`). La barre de titre native suit le theme via DWM lorsque Windows le permet. Tkinter ne permet pas une personnalisation parfaite de la barre native sur toutes les plateformes; le contenu de l'app reste theme clair/sombre partout.

Le champ `Collection access token` attend un token temporaire cree dans l'interface admin `Tokens temporaires` (`sfit_...`). Il ne faut pas y coller le token de scan affiche apres une collecte web: ce second token sert uniquement a envoyer `/collect/scan`.

Depuis la page web, l'utilisateur peut generer un code de pre-remplissage temporaire. Dans l'app, saisir ce code dans `Prefill code`, cliquer `Load prefill`, puis relire/modifier les champs avant l'envoi. Le code expire automatiquement et ne cree pas d'executable personnalise.

Le site telecharge aussi un fichier `spacefoot-collector-prefill.json` en meme temps que l'app lorsque le code existe. Au demarrage, le collecteur inspecte le dossier Downloads et charge automatiquement le fichier le plus recent. L'utilisateur n'a donc normalement pas a ressaisir le token dans l'application. Les reglages de connexion restent masques sur la premiere page et peuvent etre ouverts avec `Show connection settings`.

Les champs `Other team proposal` et `Other location proposal` sont caches tant que l'utilisateur ne choisit pas `Other` / `Autre`. Les listes equipes et etablissements sont toujours rechargees depuis l'API publique `/organization`.

L'écran de scan contient un journal intégré: aucune console Windows visible n'est requise pour suivre l'avancement.

Le collecteur n'installe pas de controle a distance, ne lit aucun fichier personnel, aucun historique navigateur et aucun mot de passe. Les donnees sont envoyees seulement apres confirmation.

Sous Windows, la collecte interroge CIM/WMI:

- `Win32_ComputerSystem`: fabricant, modèle, famille, SKU;
- `Win32_ComputerSystemProduct`: nom produit, version/numéro produit, identifiant, UUID;
- `Win32_BIOS`: numéro de série BIOS/service tag;
- `Win32_BaseBoard`: fabricant et produit carte mere;
- `Win32_SystemEnclosure`: numéro chassis et asset tag;
- `MS_SystemInformation` lorsque disponible.

Les champs historiques restent presents (`manufacturer`, `model`, `serialNumber`). Les nouveaux identifiants sont exposes aussi via:

- `modelNumber`;
- `serviceTag`;
- `hardwareIdentity.systemSku`;
- `hardwareIdentity.productNumber`;
- `hardwareIdentity.baseboardProduct`;
- `hardwareIdentity.biosSerialNumber`;
- `hardwareIdentity.chassisSerialNumber`;
- `hardwareIdentity.assetTag`.

Les valeurs generiques comme `To be filled by O.E.M.`, `Default string` ou `System Serial Number` sont ignorees. Si un constructeur ou un BIOS ne publie pas le SKU/service tag, le champ peut rester vide sans bloquer l'envoi.

Lancement local:

```bash
python collectors/desktop_collector/collector_app.py
```

Packaging local:

```bash
pyinstaller --onefile --windowed collectors/desktop_collector/collector_app.py
```

Packaging GitHub:

- Workflow manuel: `Build collector apps`.
- Release partageable: pousser un tag `collector-vX.Y.Z`.
- Windows: signer le `.exe` avec un certificat Code Signing, ou self-signed interne si aucun secret officiel n'est configure.
- macOS: signer et notariser avec Apple Developer ID.
- Release: verifier les fichiers avec `SHA256SUMS.txt`.

Ce dossier ne cherche pas a contourner les antivirus. Pour reduire les blocages en production, publier des binaires signes/notarises, garder un nom d'editeur stable et distribuer depuis une source officielle.
