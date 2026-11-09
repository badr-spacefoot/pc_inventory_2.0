# Parcéo Sillage — publication du 9 novembre 2026

**Publication terminée : [site Parcéo](https://parceo.piqa.fr) et [collecteur 0.1.57 en téléchargement manuel](https://github.com/badr-spacefoot/pc_inventory_2.0/releases/tag/collector-manual-v0.1.57).** Les trois paquets natifs, le source et les sommes de contrôle sont publics. Le site sert exactement le manifeste de cette release.

## Site

Le site est servi sur **https://parceo.piqa.fr** par le VPS partagé `217.182.169.255`. L’entrée DNS A a été créée chez OVH avec un TTL de 300 secondes. Le certificat public est valide ; le contrôle Chromium utilise TLS 1.3 avec validation normale du certificat.

Le service `piqa-parceo-web` sert uniquement les fichiers statiques. Il réutilise l’image Caddy déjà présente, épinglée par digest, ne publie aucun port hôte et dispose de limites de 64 Mio / 0,25 CPU, d’un système de fichiers en lecture seule et de logs bornés. Il utilise le réseau proxy existant. La création d’une pile Supabase locale n’a pas été tentée : les 4,8 Go libres relevés ne suffisent pas au précontrôle de cette migration.

**L’API, la base et les factures restent dans le projet Supabase existant.** Aucune migration SQL et aucune modification de données métier n’ont été exécutées. Seule l’origine autorisée `https://parceo.piqa.fr` a été ajoutée, en conservant `https://badr-spacefoot.github.io`. La variable GitHub ALLOWED_ORIGINS conserve ces deux origines pour les déploiements futurs.

Le proxy existant a été sauvegardé dans `/srv/vaultwarden/Caddyfile.before-parceo-20261109T165035Z`. L’ajout est limité au bloc `parceo.piqa.fr`; le candidat complet a été validé avant rechargement. La procédure compare le fichier courant avant écriture et conserve l’inode du fichier monté dans le conteneur.

Le site est publié dans `/srv/parceo/site/releases/` avec un lien `current`. Un changement de version remplace ce lien atomiquement. La version précédente est conservée ; aucun nettoyage du VPS n’a été effectué.

## Collecteur

Le propriétaire a explicitement choisi une **publication non signée en téléchargement manuel**. Le canal `collector-manual-v…` est distinct du canal signé `collector-v…`. Le canal signé garde ses exigences de certificats et de manifeste Ed25519. Le collecteur manuel n’accepte pas de manifeste non signé pour une mise à jour automatique ; aucune clé de confiance existante n’est remplacée.

La publication manuelle est étiquetée comme préversion GitHub et ne remplace pas le pointeur GitHub `latest` du canal stable. Le manifeste public du site peut référencer cette préversion pour le téléchargement manuel. Une mention dans l’interface précise l’absence de signature et les avertissements possibles de Windows/macOS. Aucun certificat auto-signé n’est fourni, aucune protection de l’utilisateur n’est désactivée et aucune notarisation Apple n’est revendiquée.

La source de la release est le tag `collector-manual-v0.1.57`, commit `d569110218de1b02ee1ea23b30f8a2fec5b04154`. La branche de suivi est `codex/parceo-sillage-production`. `main` et ses déploiements historiques ne sont pas modifiés par cette publication. Les notes de release ont été précisées après publication pour distinguer les exigences du futur canal signé de l’ancienne release stable.

Les fichiers publics ont été téléchargés puis comparés aux six digests GitHub et au fichier SHA256SUMS. L’installateur Windows contient les sept images de l’ICO Sillage et sa version produit est `0.1.57`. Le champ numérique FileVersion du stub Inno reste `0.0.0.0` ; il est enregistré séparément pour éviter de le confondre avec la version du produit. Aucune installation locale de cet installateur n’a été exécutée pendant cette recette.

La chaîne macOS épingle macholib avec ses hashes PyPI et conserve le bundle officiel `osquery.app` intact, avec son `Info.plist`, ses ressources et sa signature. L’architecture Intel et la signature du bundle sont contrôlées avant assemblage. Le moteur est placé dans `Contents/Frameworks` puis appelé en mode interactif documenté `-S`, sans installer de service. Les tests de construction exécutent uniquement `--version` et le contrôle de démarrage du collecteur, sans scan matériel. Voir les documentations [osquery macOS](https://github.com/osquery/osquery/blob/master/docs/wiki/installation/install-macos.md), [mode interactif](https://github.com/osquery/osquery/blob/master/docs/wiki/introduction/using-osqueryi.md) et [structure PyInstaller](https://pyinstaller.org/en/stable/usage.html).

## Vérifications

- Contrôle de qualité de publication : format, lint, TypeScript, Deno, tests et build.
- 233 tests TypeScript, 3 tests réseau intentionnellement non exécutés ; 39 tests Python, dont les contrôles du canal manuel et de la détection/du mode interactif du bundle macOS.
- Site public réel : 4 vues, clair/sombre, 1440 et 390 px ; Manrope et les logos chargés ; aucune largeur excédentaire ; 0 erreur JavaScript, 0 violation CSP et 0 réponse HTTP en erreur lors du chargement.
- Recette web sans session et sans données fictives : les requêtes de modification ont été bloquées côté test et aucune n’a été tentée. Ce contrôle ne prétend pas valider une écriture métier ou une session administrateur.
- Construction et contrôles de démarrage réussis sur Windows, Linux et macOS Intel ; paquet Linux installé sur le runner ; mode interactif osquery et intégrité de la signature ad hoc macOS vérifiés. La cible macOS annonce 13.0 minimum ; le runner utilisé est macOS 15 Intel, sans recette native Apple Silicon ou macOS 13.
- Vérification du site après mise à jour : les trois liens pointent sur 0.1.57 et la mention de téléchargement non signé est activée. Le pointeur stable GitHub reste `collector-v0.1.52`.
- Contrôle des autres domaines du proxy : réponses normales ; Pimboost conserve sa réponse 401 d’authentification. Pulse répond en GET et ne gère pas HEAD.
- L’inspection détaillée des 26 vues avec données synthétiques et la recette native Windows Sillage restent consignées dans le rapport d’intégration antérieur.

Preuves : [qualité finale](quality-publication.json), [release GitHub](github-release.json), [fichiers et icônes](collector-publication.json), [bascule du site](site-publication.json), [liens de téléchargement](download-ui.json), [recette publique](live-web.json), [autres domaines](proxy-health.json), [vue claire](production-light-1440.png), [vue sombre](production-dark-1440.png), [mobile](production-light-390.png), [DNS OVH](ovh-parceo-dns.png).

## Retour arrière

Pour un défaut du site statique, rétablir le lien `current` vers le dossier de version précédent après vérification de son contenu ; aucun redémarrage de base n’est nécessaire. Pour retirer uniquement le nouveau domaine, sauvegarder le Caddyfile courant, retirer uniquement le bloc PARCEO, valider puis recharger le proxy. Ne pas restaurer aveuglément la sauvegarde complète si un autre projet a modifié le proxy depuis cette publication.

Les anciennes URLs GitHub Pages et les téléchargements stables sont conservés. La migration complète des données vers le VPS et la distribution native signée restent distinctes de cette publication d’identité.
