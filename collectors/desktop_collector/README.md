# Spacefoot desktop collector

Prototype transparent de collecteur desktop multiplateforme.

Objectif:

- afficher clairement les donnees collectees;
- laisser l'utilisateur relire avant envoi;
- utiliser le meme endpoint `/collect/scan` et le meme token que le script;
- rester lisible et packagable plus tard avec PyInstaller, Tauri ou une signature native.

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
