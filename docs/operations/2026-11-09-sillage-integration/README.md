# Parcéo — Sillage intégré à l’application et au collecteur

État au 9 novembre 2026 : **intégration locale terminée, rendus web et Windows vérifiés, paquets préparés**. Aucun push, déploiement, changement DNS ou écriture en production.

## Application web

Le titre, le logo et son libellé accessible affichent Parcéo. Les logos clair/sombre basculent avec le thème. Le favicon SVG/ICO, l’icône tactile et le manifeste utilisent Sillage. Le manifeste résout correctement la racine sur un domaine dédié comme sous un chemin GitHub Pages.

La palette est appliquée aux composants existants : vert `#0B6E58`, encre `#142D27`, papier `#F6F7F2`, citron `#D6F279`. Les actions sombres utilisent du texte encre sur citron, les actions claires du blanc sur vert. Les bordures de contrôles et le focus restent visibles ; les couleurs fonctionnelles des OS et des fabricants sont conservées. Manrope variable et IBM Plex Mono sont servies localement avec leurs licences, sans dépendance à Google Fonts.

Les parcours existants sont conservés : collecte, parc, organisation, valorisation, accès, utilisateurs, validations, notifications et fiche machine. Les URL d’API et les données existantes ne sont pas migrées par cette intervention.

## Collecteur 0.1.54-dev

L’en-tête utilise les véritables fichiers de logo Sillage adaptés au thème, l’icône native est remplacée et les textes visibles utilisent Parcéo Collector. Les palettes claires/sombres et les couleurs des boutons sont coordonnées avec le web.

Manrope Regular/Bold et IBM Plex Mono sont embarquées avec leurs licences. Les instances statiques Manrope sont produites depuis la police variable autorisée, avec les métadonnées de graisse normalisées. L’enregistrement est privé au processus : GDI `FR_PRIVATE` sur Windows, CoreText scope Process sur macOS et jeu de polices applicatif Fontconfig sur Linux. Si le chargement échoue, le collecteur conserve une police système. **Le chargement effectif Manrope/Plex a été vérifié sur Windows ; la recette native macOS/Linux reste à effectuer.**

Pour le signalement de l’icône Python, le processus Windows déclare désormais **`Piqa.Parceo.Collector` avant la création de Tk**. Cet identifiant est relu via l’API Windows dans la vérification automatisée. Les raccourcis Inno Setup déclarent le même AppUserModelID. La fenêtre relancée a été inspectée et son icône Sillage est visible dans les captures CUA. Les anciennes épingles Python de l’utilisateur n’ont pas été modifiées. [Rôle de l’identifiant Windows](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-setcurrentprocessexplicitappusermodelid), [identifiant des raccourcis Inno](https://jrsoftware.org/ishelp/topic_iconssection.htm).

L’UUID de l’installateur, le schéma `spacefoot-collector`, les noms techniques des exécutables/artefacts, le chemin du brouillon et les anciennes URL sont conservés pour la compatibilité. Le nom produit, les raccourcis visibles et la description du protocole sont renommés ; le répertoire Windows historique est conservé. Aucun certificat ni comportement de mise à jour de confiance n’est modifié.

Les builds PyInstaller incluent maintenant tout le dossier de marque, donc les logos, les polices et leurs licences. La construction macOS prépare son icône depuis le master carré. Le paquet source utilise une liste explicite de **25 fichiers** et contient les mêmes ressources nécessaires à l’interface.

## Vérifications

| Contrôle | Résultat | Portée |
|---|---|---|
| `pnpm run quality` | Réussi | Format, ESLint, TypeScript, Deno, syntaxe, build |
| Tests TypeScript | **233 réussis, 3 tests réseau volontairement non exécutés** | Contrats et logique existants |
| Tests Python après correction de l’identité Windows | **34 réussis** | Sécurité, distribution et flux du collecteur |
| Application web réelle | **26 vues, clair/sombre, 1440/390 px** | Données fictives, aucune requête en production |
| Site empaqueté | Les **26 mêmes vues passent** | Assets réellement livrés, pas seulement le dossier source |
| Web : erreurs JS / CSP | **0 / 0** | CSP de Caddy, polices locales chargées, aucune largeur de document excédentaire |
| Boutons primaires web | Au moins **4,5:1** | Couleurs effectivement calculées par Chromium |
| Tk : polices et thèmes | Manrope/Plex chargées, **14 contrastes de boutons vérifiés** | États de widgets construits en mémoire, fenêtre masquée |
| Tk : profil → scan → envoi | Réussi, **0 exception de callback** | Moteur et API simulés en mémoire |
| Inspection native CUA | Profil clair/sombre, scan simulé et confirmation inspectés | Captures de la fenêtre réelle, pas de scan matériel ni d’envoi réseau |
| Binaire Windows onedir, sans UPX | Construction réussie, **démarrage masqué : sortie 0** | Polices embarquées, binaire local non signé, ni installation ni recette SmartScreen d’un téléchargement public |

Preuves : [web](web-verification.json), [widgets Windows et AppUserModelID](collector-render.json), [parcours Tk](collector-workflows.json), [binaire Windows](collector-native.json), [inspection CUA](native-visual.json), [artefacts](artifacts.json).

Captures représentatives : [web clair](collection-light-1440.png), [web sombre](fleet-dark-1440.png), [mobile](collection-light-390.png), [collecteur clair](collector-cua-light.jpg), [collecteur sombre](collector-cua-dark.jpg), [scan simulé](collector-cua-scan.jpg), [confirmation simulée](collector-cua-success.jpg).

Les premières captures Win32 hors écran produisaient des artefacts ; elles ont été retirées. Les captures natives retenues proviennent du contrôle d’interface CUA autorisé par l’utilisateur. Aucun rendu produit par `PrintWindow` ou capture de bureau Python n’est présenté comme preuve.

## Livraison

- `dist/parceo-sillage-site-20261109/` et son ZIP : application web avec identité intégrée.
- `dist/parceo-collector-source-0.1.54-dev.zip` : collecteur source avec identité intégrée, polices et manifeste SHA-256.
- `reports/sillage-integration/native/` : binaire Windows de validation interne, non signé.
- `frontend/assets/brand/parceo/` : assets utilisés à l’exécution et manifeste d’empreintes.
- `scripts/sync-parceo-brand.py` : synchronisation reproductible depuis le kit Sillage, avec FontTools dans un environnement de conception isolé.

L’interface est intégrée dans le code local ; **la production et les téléchargements publics restent inchangés**. La migration vers le VPS, ses contraintes de capacité, les identités de signature et la recette des installateurs restent les chantiers distincts déjà documentés. Aucun achat, nettoyage, changement d’accès ou désactivation de protection n’a été effectué.
