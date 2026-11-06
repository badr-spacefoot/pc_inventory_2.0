# Corrections frontend — 15 septembre 2026

Les constats initiaux restent dans `frontend.md`. Ce document décrit l'état corrigé localement; aucune publication n'a été effectuée par ce volet.

| Constat | Correction réalisée | Vérification |
|---|---|---|
| FE-01 XSS historique | Échappement des OS/version de scan et de la source de prix avant rendu HTML | Fixture Chromium : la balise inerte n'est plus créée dans le DOM |
| FE-02 course sélection | Numéro de requête; ignore réponses et erreurs des sélections précédentes | B répond puis A : sélection, titre et détail restent B |
| FE-03 CSV formules | Sérialiseur de cellules neutralise les préfixes formule et caractères de contrôle; conserve nombres natifs et guillemets | Tests unitaires sur =/+/-/@, espaces, tabulations, retours et nombres |
| FE-04 clavier parc | Bouton natif dans chaque ligne, focus visible et conservé après rerendu | Chromium : Entrée sur bouton de A sélectionne et affiche A |
| FE-05 disque plein | Zéro mesuré considéré faible stockage, absence/invalidité distinguée | Tests zéro numérique/texte, null, vide, négatif et seuil 30 Go |
| FE-06 clavier notifications | Le parent ignore les keydown provenant des contrôles enfants | Chromium : Entrée « lire » => 1 lecture, 0 navigation |
| FE-07 déconnexion | Purge des collections privées, tokens bruts, formulaires, tables/cartes; requêtes d'ancienne session rejetées; POST /auth/logout borné puis reload | Test client rejette une réponse post-logout; Chromium vérifie state, stockage et DOM vidés; endpoint coordonné avec backend |
| FE-08 dépréciation | Ratio sur postes possédant une paire de valeurs exploitables, couverture affichée, tiret sans données | Tests données partielles et valeur actuelle zéro; stock demeure 70 % dans fixture |
| FE-09 dialogues | Noms/descriptions reliés aux titres des trois dialogues | Chromium vérifie les titres accessibles référencés |

Autres corrections : valeur estimée zéro préservée (sans repli vers un prix supérieur), moyenne divisée par les postes valorisés, requêtes déjà annulées jamais envoyées, indisponibilité transitoire au démarrage ne supprime plus les identifiants, brouillons de formulaire et sélections de fichiers préservés pendant le changement de langue.

Le formulaire d'invitation collecte peut désormais sélectionner un poste existant avec destinataire obligatoire; `deviceId` est transmis au backend pour autoriser une actualisation liée à ce poste. Les invitations de nouveaux postes restent possibles. Cette évolution accompagne le durcissement des autorisations de collecte côté serveur.

Les ajouts de facture transmettent aussi un `requestId` UUID. Un condensat SHA-256 du formulaire et du fichier maintient cet identifiant pour les nouvelles tentatives identiques; une modification crée un identifiant distinct. Seul le condensat est retenu, pas les octets de facture. Après succès API, le formulaire et l'identifiant sont réinitialisés avant l'actualisation des vues, pour éviter un double ajout si ce rafraîchissement échoue. Un test couvre nouvelle tentative, changement de fichier, changement de montant, autre machine et remise à zéro.

Déploiement : `config.js` public est chargé avant le noyau. L'initialisation de thème auparavant inline est extraite dans `theme-init.js`, pour permettre une CSP `script-src 'self'`. Le script de packaging du volet parent génère les valeurs publiques et versionne les assets. Aucun secret n'est ajouté au frontend.

## Preuves et limites

- Fixture reproductible : `frontend-fixture.mjs`, avec assertions exécutées après correction.
- Résultats avant : `frontend-fixture-results-before.json` (reproduit XSS/race).
- Résultats après : `frontend-fixture-results.json`, `assertionsPassed: true`.
- Réseau externe bloqué; serveur loopback éphémère et API simulée; aucune vraie connexion ou donnée.
- Stock : 1000 € lancement / 300 € actuel / 70 % / cinq ans / aucune priorité active.
- Pas de débordement horizontal sur fixtures à 1440 et 375 px; aucune erreur JavaScript.
- Suite Vitest globale passée lors de l'intégration (les décomptes finaux sont consignés par le parent, car les autres volets ajoutent des tests simultanément).
- Lint frontend passé. Build généré par script officiel; une élévation locale a été nécessaire car esbuild ne pouvait lire un dossier parent sous sandbox.
- Pas de certification WCAG complète : lecteur d'écran, contraste/zoom et toutes les combinaisons de formulaires restent une recette manuelle. Pas de test de charge du grand parc. Pas d'affirmation sur l'invalidation effective de sessions en production avant déploiement du backend associé.

Les risques de dimensionnement (pagination/virtualisation) et l'ordre de regroupement des statuts n'ont pas été modifiés sans mesure ni règle métier confirmée. Le découpage TypeScript existant et le correctif stock sont conservés.
