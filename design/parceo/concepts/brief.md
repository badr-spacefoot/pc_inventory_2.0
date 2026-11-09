# Parcéo — exploration d’identité

Date : 9 novembre 2026. Adresse cible : `parceo.piqa.fr`.

Parcéo réunit l’inventaire informatique, le collecteur, les affectations, la valorisation et les réparations. Public : équipes IT et responsables du matériel. Hypothèses : une marque produit autonome, rattachée à Piqa par son domaine, avec le nom affiché **Parcéo** et l’adresse sans accent.

Qualités recherchées : précision, clarté, continuité, maîtrise et accessibilité. Promesse proposée : **Votre parc, clairement.** Usages : application, collecteur, favicon, documentation et étiquettes de matériel. Cette phase explore les signes ; aucune modification de l’application ou du DNS.

## Recherche et choix

Skill demandé : https://github.com/kaankiziltug/logo-design-skill
Révision consultée : `bbf31e521d765eb6d53242549bbee7c2e5bbd6bc`.
Les outils sont téléchargés dans `reports/parceo-design-tools/logo-design`, sans installation globale. Les marques de la bibliothèque restent la propriété de leurs titulaires et ne sont pas des éléments à réutiliser.

Bibliothèque : catégorie hardware-devices (14 références), recherche inventory (aucun résultat), loop (26 résultats), puis lecture des constructions de Pagekit, Patreon, Framer et Kotlin pour comparer des lettres et espaces négatifs. Cette comparaison n’est pas une recherche d’antériorité exhaustive.

Clichés écartés : ordinateur dessiné, engrenage, bouclier, coche, réseau de petits points, flèches circulaires et grille de quatre carrés. Carte de mots : parc → ensemble, repère, affectation ; collecteur → entrée, unité ; réparation → continuité ; valorisation → visibilité ; Parcéo → P, C, accent.

## Dix idées, avant construction

Notes sur 5 : clarté / distinction / simplicité / pertinence / petite taille.

| Idée | Type | Notes | Décision |
|---|---|---|---|
| Un P dont une unité séparée reste précisément alignée avec son inventaire | Lettre | 5/4/5/5/5 | A : construire |
| Une enceinte ouverte et une unité qui peut y entrer ou en sortir | Abstrait | 4/3/5/5/5 | B : construire |
| Un é dessiné sur mesure, l’accent devenant la signature du produit français | Typographique | 5/4/5/4/4 | C : construire |
| Un P construit comme une étiquette à coin coupé | Lettre | 4/2/4/5/4 | Trop attendu |
| Un ruban continu reliant acquisition et retrait | Abstrait | 3/2/3/4/3 | Trop proche des signes de lien |
| Un repère d’inventaire dans la contreforme du a | Mot-symbole | 3/4/3/4/2 | Faible en petit |
| Une pile de fiches formant un P | Pictographique | 4/2/3/5/3 | Trop littéral |
| Un accent repris comme curseur au-dessus du nom | Mot-symbole | 4/3/5/3/4 | Intégré à C plutôt que piste distincte |
| Deux parenthèses entourant un équipement | Abstrait | 4/2/5/4/5 | Trop proche d’outils de développement |
| Une ligne de série qui se replie en P | Lettre | 3/4/2/4/2 | Détails trop petits |

## Les trois directions

**A — Le repère.** P géométrique avec une contreforme ouverte et une unité détachée. Le parc est structuré ; chaque équipement garde son identité. Recommandation : lecture immédiate du P et bonne tenue attendue sur l’icône du collecteur. Risque : le monogramme doit être enseigné avec le nom au lancement.

**B — Le passage.** Cadre arrondi ouvert à droite ; une unité se situe dans son ouverture. Évoque entrée, affectation, réparation et retour dans le parc. Risque : plus abstrait, il peut évoquer un C ou un emplacement de stationnement.

**C — L’accent.** Mot-symbole géométrique personnalisé, accompagné d’un é autonome. Met en avant la prononciation et la singularité du nom français. Risque : le symbole isolé identifie moins directement la gestion informatique.

Construction : grille principale de 8 unités sur 256, formes pleines, angles droits et accent à 45°, contreformes réelles, aucun texte dépendant d’une police dans les fichiers SVG des logos. Le mot-symbole est dessiné en chemins, sans police tierce. Les textes de présentation utilisent uniquement les polices système.

Les essais restent monochromes. Palette, typographies d’interface, déclinaisons, fichiers d’icônes et règles de marque seront arrêtés après le choix d’une direction, conformément au checkpoint du skill. Aucune disponibilité de marque n’est garantie.
