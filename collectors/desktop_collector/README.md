# Spacefoot desktop collector

Collecteur desktop transparent et packagable pour Windows, Linux et macOS.

Objectif:

- valider l'API et le token de collecte avant l'envoi;
- charger les equipes et etablissements depuis les valeurs admin;
- afficher clairement les donnees collectees avant soumission;
- utiliser le meme contrat API que le web app (`/collect/profile` puis `/collect/scan`);
- garder un panneau avance avec le JSON brut pour audit.

Flux utilisateur:

1. `Connection`: API URL, token temporaire de collecte, validation du token.
2. `Assignment`: prenom, nom, email, equipe et etablissement charges depuis l'admin.
3. `Hardware scan`: collecte locale et resume materiel lisible.
4. `Review & submit`: confirmation, puis envoi a l'API.

Le collecteur n'installe pas de controle a distance, ne lit aucun fichier personnel, aucun historique navigateur et aucun mot de passe. Les donnees sont envoyees seulement apres confirmation.

Sous Windows, la collecte interroge CIM/WMI:

- `Win32_ComputerSystem`: fabricant, modele, famille, SKU;
- `Win32_ComputerSystemProduct`: nom produit, version/numero produit, identifiant, UUID;
- `Win32_BIOS`: numero de serie BIOS/service tag;
- `Win32_BaseBoard`: fabricant et produit carte mere;
- `Win32_SystemEnclosure`: numero chassis et asset tag;
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
