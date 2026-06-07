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

Packaging futur:

```bash
pyinstaller --onefile --windowed collectors/desktop_collector/collector_app.py
```

Ce dossier ne cherche pas a contourner les antivirus. Pour reduire les blocages en production, il faudra publier des binaires signes/notarises et documenter l'editeur.
