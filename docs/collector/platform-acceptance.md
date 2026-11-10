# Recette macOS et Linux du collecteur publié

Le workflow `Collector platform acceptance` utilise des VM éphémères GitHub : Ubuntu 22.04 x64, macOS 15 Intel et macOS 15 Apple Silicon. Il peut être lancé manuellement et s’exécute sur les pull requests qui modifient sa recette ou les aides au lancement.

La recette télécharge les paquets **0.1.58 réellement publiés**, vérifie leurs empreintes SHA-256 figées, installe le paquet Linux ou extrait le bundle macOS, vérifie la version native et démarre le binaire en mode de contrôle sans scan. Elle contrôle les deux protocoles et l’intégrité du bundle macOS. Le paquet macOS Intel est également essayé sur Apple Silicon avec l’émulation fournie par la VM ; aucune installation automatique de Rosetta n’est effectuée.

Ensuite, le source **exact de la release 0.1.58**, dont le manifeste est vérifié, est utilisé pour exercer l’interface Tk : chargement d’un préremplissage, validation du jeton de recette, lecture de l’organisation, scan matériel réel de la VM, création du profil et envoi HTTP de l’inventaire. Le moteur osquery est celui du paquet macOS ou de la dépendance Linux vérifiée et épinglée. Le scan n’est pas simulé.

L’API destinataire est un serveur de recette en boucle locale qui vérifie les en-têtes, le profil, la version et les champs matériels. Il ne s’agit pas de l’API ni de la base de production Parcéo. Les résultats n’enregistrent ni le nom réseau de la VM, ni ses adresses, ni son inventaire brut. L’artefact `result.json` distingue le démarrage du binaire publié du parcours exercé avec son source. Il ne prouve pas un scan piloté dans le binaire figé.

## Limites à conserver dans le compte rendu

- La réception par la vraie base Parcéo n’est pas prouvée par cette API isolée. Cette étape nécessite une invitation de collecte dédiée et une autorisation d’accès distincte.
- Un démarrage sur une VM macOS de CI ne prouve pas le franchissement de Gatekeeper après téléchargement dans le navigateur d’un utilisateur. La release reste manuelle et non notariée.
- Aucun `xattr` de suppression de quarantaine, aucune désactivation de Gatekeeper, aucun certificat de test et aucun jeton de production ne sont utilisés.
- La vérification `spctl` reste obligatoire dans le parcours de mise à jour automatique signé. Pour une distribution explicitement manuelle (`signed: false`), la commande de support vérifie `codesign` puis appelle `open` : macOS conserve le contrôle et présente ses propres avertissements. Une décision de confiance éventuelle appartient à l’utilisateur. Voir [les indications Apple](https://support.apple.com/en-us/102445).
- Les VM sont détruites en fin de tâche. Un test d’installation sur un poste utilisateur déjà géré reste une recette distincte.
