# Parcéo — des pistes plus affirmées

Retour du client : le premier signe est trop basique. L’objectif est d’améliorer son caractère, pas de modifier le nom ou la fonction du produit. Le premier kit est conservé. Le vert et l’encre servent de continuité ; les nouveaux dessins sont des propositions, pas une refonte approuvée.

## Recherche et sélection

Le [skill logo-design](https://github.com/kaankiziltug/logo-design-skill/blob/bbf31e521d765eb6d53242549bbee7c2e5bbd6bc/skills/logo-design/SKILL.md) et sa référence `redesign.md` guident cette itération. Les références de ruban Bing/Strapi et le p bouclé Parse ont été consultés pour comparer les constructions, sans en copier les contours. Pas de recherche exhaustive d’antériorité.

Longue liste d’idées, notes sur 5 (clarté / distinction / simplicité / pertinence / petite taille) :

| Idée | Notes | Sort |
|---|---|---|
| P facetté, contreforme pentagonale et pied en pointe | 5/4/5/4/4 | A : Prisme |
| P coupé par une jonction diagonale | 5/4/4/5/4 | B : Jonction |
| P continu, contreforme ouverte et terminaison oblique | 5/4/5/5/5 | C : Sillage |
| C caché dans la contreforme du P | 4/3/4/4/2 | Testé, puis écarté : évocation du copyright et détail faible en petit |
| Deux P imbriqués | 3/3/3/3/3 | Trop proche des signes de paiement |
| P dessiné par trois rubans | 3/4/2/4/2 | Trop de détails |
| P dans une étiquette biseautée | 4/2/4/5/4 | Trop attendu |
| P très fin dans une enceinte | 4/2/4/3/2 | Trop fragile |
| P en perspective isométrique | 3/3/3/3/3 | Plus d’effet que de signe |
| Étoile dérivée de l’accent | 3/2/4/2/4 | Lien au nom trop faible |

## Résultats

- **A — Prisme :** plus anguleux et affirmé. Risque : son pied pointu évoque une flèche ou un fanion ; il est moins chaleureux.
- **B — Jonction :** une ouverture diagonale traverse le P, évoquant le passage des équipements. Risque : la fente doit rester suffisamment ouverte à petite taille.
- **C — Sillage, recommandé :** un tracé continu, une terminaison en biais, une contreforme ouverte. Plus fluide et équilibré. Risque : l’association au matériel est portée par la marque et le contexte plutôt que par un objet dessiné.

Les lettres sont vectorisées depuis Manrope, sous SIL OFL 1.1, déjà fournie avec le kit précédent. A utilise les capitales, B/C les minuscules. Les symboles sont dessinés spécifiquement. Aucun texte vivant, bitmap, filtre, dégradé ou masque dans les symboles. Les compositions sont exploratoires : typographie et espacement pourront encore être affinés sur la piste choisie.

Deux passes ont été conservées. Après inspection de la première, le C caché de B a été remplacé, les contreformes de A/C ont été ouvertes et les symboles recentrés. Le contrôle structurel `svg_audit.py` donne 100/100 aux trois symboles v2 ; c’est une heuristique de construction, pas une certification de qualité ou de marque.

Comparer [la planche couleur](parceo-refinement.png), [les dessins monochromes](comparison-mono.png) et [les essais détaillés](preview-tests.html). Les tailles 16/32/48/64 px, les inversions, le miroir et la rotation sont inspectés localement ; aucune validation avec un panel extérieur ni épreuve d’impression.

Le kit précédent n’est pas remplacé. Après choix, mettre à jour les véritables favicon, ICO/ICNS, masters et guide ensemble. Le skill prévoit : « Build the kit (Phase 7) only after they pick a direction and say yes. » Aucun déploiement ni changement d’application ou de DNS.
