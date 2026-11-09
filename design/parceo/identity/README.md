# Parcéo — identité visuelle 2.0 · Sillage

Direction **C — Sillage**, choisie le 9 novembre 2026 après comparaison des trois nouvelles propositions. Adresse de marque : **parceo.piqa.fr**. Déclinaison : **Parcéo Collector**. Signature : **Votre parc, clairement.**

Cette version remplace le premier repère dans l’ensemble du kit actif : symboles, mot-symbole, compositions, favicon, icônes web et natives, présentations et guide. Le premier kit reste archivé dans `dist/parceo-identite-v1.0.zip` à la racine du projet. Le nouveau paquet est `dist/parceo-identite-v2.0-sillage.zip`.

## Utiliser les fichiers

| Besoin | Fichier |
|---|---|
| Logo principal sur fond clair | `logos/parceo-horizontal-color.svg` |
| Logo sur fond sombre | `logos/parceo-horizontal-dark.svg` |
| Logo une couleur sur fond sombre | `logos/parceo-horizontal-white.svg` |
| Impression en noir | `logos/parceo-horizontal-black.svg` |
| Composition verticale | `logos/parceo-stacked-color.svg` |
| Symbole seul | `logos/parceo-symbol-color.svg` |
| Mot-symbole seul | `logos/parceo-wordmark-ink.svg` |
| Petite taille, sans tuile | `logos/parceo-symbol-small.svg` |
| Favicon navigateur | `web/favicon.svg` et `web/favicon.ico` |
| Icône tactile Apple | `web/apple-touch-icon.png` |
| Icônes web | `web/icon-192.png`, `web/icon-512.png`, `web/maskable-512.png` |
| Icône du collecteur Windows | `collector/parceo-collector.ico` |
| Icône du collecteur macOS | `collector/parceo-collector.icns` |
| Icône du collecteur Linux | `collector/parceo-collector-256.png` ou `-512.png` |
| Icône du collecteur grand format | `collector/parceo-collector-1024.png` |
| Logo Parcéo Collector | `collector/parceo-collector-horizontal.svg` |
| Aperçu de l’identité | `previews/identity-board.html`, `previews/parceo-identity.png` |
| Guide imprimable | `guide-parceo.pdf` |
| Variables de marque | `parceo-tokens.css`, `tokens.json` |

Le dossier `logos/png/` fournit des exports transparents utilisables dans les documents et outils qui n’acceptent pas le SVG. Les variantes `white` et `dark` sont destinées aux fonds sombres. Les fichiers SVG restent les masters ; ne pas vectoriser un PNG.

## Le signe

Le P est un tracé continu : une contreforme ouverte, une courbe ample et une terminaison à 45°. Il évoque le suivi du matériel dans la durée. Le même signe porte l’application et son collecteur. Le carré détaché de la première piste est supprimé ; le citron reste une couleur d’accent dans les interfaces et documents, pas une pièce ajoutée au symbole.

Le mot-symbole **parcéo** reprend Manrope 600 vectorisée, comme dans la proposition C choisie. Les fichiers ne dépendent pas d’une police installée et conservent la composition approuvée ; ne pas les recomposer en tapant le nom. Dans les textes courants : **Parcéo** avec majuscule et accent ; dans l’adresse et les noms de fichiers : **parceo**, sans accent. Le collecteur s’appelle **Parcéo Collector**. Le rattachement à Piqa se fait par le domaine ou une mention textuelle discrète « Un produit Piqa » ; aucun logo Piqa n’a été inventé.

## Couleurs

| Couleur | HEX | RGB | CMYK indicatif | Rôle |
|---|---|---|---|---|
| Vert Parcéo | **#0B6E58** | 11 / 110 / 88 | 90 / 0 / 20 / 57 | Signe, actions et points d’ancrage |
| Encre | **#142D27** | 20 / 45 / 39 | 56 / 0 / 13 / 82 | Texte, fonds sombres |
| Citron | **#D6F279** | 214 / 242 / 121 | 12 / 0 / 50 / 5 | Surfaces et détails d’accent hors du logo |
| Papier | **#F6F7F2** | 246 / 247 / 242 | 0 / 0 / 2 / 3 | Fond de l’interface et des documents |
| Blanc | **#FFFFFF** | 255 / 255 / 255 | 0 / 0 / 0 / 0 | Surfaces, logo inversé |

CMYK : conversion mathématique de départ, sans profil d’impression. Faire une épreuve pour une production physique. Aucune correspondance Pantone n’est revendiquée ; elle devra être choisie sur nuancier physique si nécessaire.

Répartition conseillée : surfaces claires dominantes, encre pour la lecture, vert pour les actions principales, citron en accent ponctuel. Sur fond clair, le signe est entièrement vert. Sur vert/encre, le P et le nom sont entièrement blancs. Les variantes `white` et `dark` sont donc identiques en couleur et conservent deux noms pratiques pour les intégrations existantes. Le citron ne sert jamais de petit texte sur blanc.

Contrastes calculés en sRGB : blanc/vert **6,20:1**, encre/blanc **14,64:1**, texte secondaire/blanc **6,13:1**, vert/papier **5,76:1**, citron/vert **4,97:1**, encre/citron **11,74:1**. Ces rapports concernent les paires définies, pas une certification globale d’accessibilité d’une application. Les états doivent rester accompagnés d’un libellé ou pictogramme, pas uniquement d’une couleur.

Couleurs fonctionnelles : succès `#176B45`, réparation/attention `#855000`, erreur `#B42336`, texte secondaire `#53665D`. La bordure `#D9E3DC` est décorative ; pour un contrôle nécessitant une délimitation visible, utiliser `#789184` (3,40:1 sur blanc). Le focus doit rester visible, par exemple un contour vert de 2 px séparé par 2 px de fond clair ; citron sur fond sombre.

## Typographies

- **Manrope** : titres 600–800, navigation et boutons 600–700, texte 400–500. Fichier variable fourni, axe 200–800. Fallback : `"Segoe UI", Arial, sans-serif`.
- **IBM Plex Mono Regular** : numéros de série, identifiants de machines, versions et données techniques. Limiter son usage aux informations qui bénéficient d’une lecture alignée. Fallback : `Consolas, monospace`.
- Corps conseillé : 16 px / 1,5 ; tableaux : 14 px / 1,45 ; libellés secondaires : 12–13 px ; titres de page : 28–32 px / 1,15. Utiliser `font-variant-numeric: tabular-nums` dans les tableaux financiers.

Les deux familles sont livrées avec leurs textes **SIL Open Font License 1.1**, lus à la source : [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope) et [IBM Plex Mono](https://github.com/google/fonts/tree/main/ofl/ibmplexmono). Conserver `fonts/*-OFL.txt` avec les polices redistribuées. Les fichiers TTF ne sont pas modifiés ; leurs empreintes sont enregistrées dans `fonts/sources.json`. Le symbole Sillage est dessiné spécifiquement ; le nom vectorisé utilise Manrope 600 et le descriptif vectorisé « COLLECTOR » les contours d’IBM Plex Mono.

Les accents français, œ/Œ, symbole € et chiffres ont été vérifiés dans les deux fichiers. La CSS héberge les polices localement, sans appel à Google Fonts. Pour une interface native Tkinter, le simple ajout d’un TTF dans le paquet ne l’active pas automatiquement : utiliser la police système tant qu’un chargement privé multiplateforme n’est pas implémenté et vérifié. Les logos et icônes n’ont pas cette dépendance.

## Tailles, espaces et formes

L’unité X est l’épaisseur du fût du symbole normal, soit **36 unités sur un canevas de 256**. Garder au moins X de zone libre entre le dessin et un autre élément ; les marges du SVG peuvent contribuer à cette zone. Ne pas modifier les rapports entre symbole et nom.

| Version | Taille écran minimale | Impression indicative |
|---|---|---|
| Logo horizontal | 144 px de large | 30 mm de large |
| Logo vertical | 120 px de large | 25 mm de large |
| Symbole normal | 24 px de haut | 6 mm de haut |
| Favicon / symbole small | 16 px | Pas destiné à l’impression |
| Logo complet Collector | 320 px de large | 55 mm de large |

En dessous de 320 px pour un en-tête de collecteur : employer le symbole, puis le nom « Parcéo Collector » en texte d’interface plutôt que réduire son sous-titre vectoriel. Les minimas d’impression demandent une épreuve selon le support.

La version inversée du P est amincie d’environ 3 % sur son ruban pour compenser son poids apparent sur fond sombre. La petite version est redessinée sur une grille de 16 : fût et ouverture de 2 px, terminaison à 45°, sans carré détaché. Les exports 16/32/48 du navigateur utilisent cette version. L’icône native utilise Sillage blanc, corrigé pour fond sombre, dans une tuile verte arrondie ; les formats Apple/PWA fournis à fond carré laissent le système appliquer son masque. Le fichier maskable garde le signe dans la zone sûre centrale.

Pour les interfaces : grille de 4 px ; espacements 8/12/16/24/32 ; rayon des contrôles 8 px ; panneaux 16 px. Les icônes fonctionnelles doivent partager une grille de 24 px et un trait cohérent ; le symbole de marque n’est pas à transformer en icône de chaque action. Les motifs peuvent reprendre la courbe ou la terminaison à 45° dans les zones de marque, jamais derrière les tableaux.

## Intégration web et collecteur

Préparer une copie de `logos/`, `fonts/`, `web/`, `collector/` et `parceo-tokens.css` sous `/assets/brand/parceo/`, en conservant leurs chemins relatifs. `web/head-snippet.html` fournit les balises à insérer dans le `<head>` du futur site. Le manifeste utilise des chemins relatifs à son fichier et décrit l’icône, pas une fonctionnalité hors ligne ou une installation PWA complète.

```html
<link rel="stylesheet" href="/assets/brand/parceo/parceo-tokens.css">
<img src="/assets/brand/parceo/logos/parceo-horizontal-color.svg"
     alt="Parcéo" width="156" height="64">
```

La CSS fournit des variables et une classe d’exemple `.parceo-theme` ; elle ne remplace pas à elle seule le thème de l’application. Le mode sombre d’exemple s’active sur cette classe avec `data-parceo-theme="dark"`. Servir les polices depuis la même origine et conserver les licences. Avant production, vérifier le rendu réel, la CSP, le chemin du favicon, les contrastes des composants et les caches.

Windows : l’ICO du collecteur contient 16/24/32/48/64/128/256 px. macOS : l’ICNS contient 16/32/64/128/256/512/1024 px à fond carré. Linux : PNG transparent à coins arrondis, en tailles usuelles. Ces fichiers sont prêts pour les configurations des prochains builds ; aucun exécutable n’a été reconstruit ou installé pour cette livraison d’identité.

## Utilisations à préserver

Conserver les proportions et les couleurs fournies. Utiliser le bon fichier pour le fond choisi. Sur photo, réserver une surface calme ou une tuile pleine. Garder l’accent du nom. Préférer une version monochrome pour les petits marquages physiques.

Éviter les étirements, rotations, ombres, dégradés, contours ajoutés, fermeture de la contreforme, recolorations ponctuelles et recomposition du nom dans une police. Ne pas ajouter le carré de l’ancienne piste. Ne pas utiliser une icône dont le fond carré est ensuite découpé dans le signe.

## Livraison et validation

Les maquettes de `previews/` montrent l’identité, avec des données fictives ; elles ne constituent pas une nouvelle version de l’application. La présentation `skill-presentation.html` et ses cinq planches ont été générées par les outils du [skill demandé](https://github.com/kaankiziltug/logo-design-skill/tree/bbf31e521d765eb6d53242549bbee7c2e5bbd6bc/skills/logo-design).

Les contrôles locaux sont enregistrés dans `sources/` : géométrie SVG, contrastes, couverture des polices, chargement des maquettes, dimensions et formats des icônes. Une inspection écran a été effectuée ; aucune recherche exhaustive de marque, épreuve d’impression ou recette native Windows/macOS de ces nouveaux fichiers de marque n’est revendiquée. Aucune application, production ou configuration DNS n’est modifiée.

Pour reproduire les vecteurs : Python avec `fonttools==4.68.0`, puis `python build-identity.py`. Pour les PNG/PDF : Node et Playwright/Chromium, puis `node render-assets.mjs` ; la variable `PLAYWRIGHT_MODULE` peut désigner un module Playwright déjà présent. La conversion de conteneurs et le paquet sont créés avec `python package-identity.py`. Les fichiers nécessaires sont déjà fournis : aucune installation d’outil n’est nécessaire pour utiliser les logos ou icônes.
