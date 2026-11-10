# Recette macOS et Linux du collecteur publié

## Téléchargement Safari et Gatekeeper

Le workflow distinct `Collector macOS Gatekeeper acceptance` utilise des VM neuves macOS Intel et Apple Silicon, sans invitation ni secret d'inventaire. Il vérifie que Gatekeeper est activé, télécharge le ZIP publié 0.1.58 avec Safari, contrôle son SHA-256 et la quarantaine Safari, puis utilise Archive Utility pour obtenir une application qui conserve cette quarantaine. Le contrôle `codesign --verify` porte sur l'intégrité ; il ne constitue pas une signature Developer ID reconnue par Apple.

La tentative d'ouverture passe uniquement par LaunchServices (`open`), jamais par l'exécutable contenu dans le bundle. Le scénario observe la boîte de refus sans la valider ; il ne retire pas la quarantaine, n'accorde aucune exception et ne désactive aucune protection. Il ne clique que sur l'autorisation de téléchargement Safari du dépôt GitHub et de son CDN officiel, lorsque cette demande apparaît.

Pour la version manuelle ad hoc non notariée, `outcome=blocked-by-gatekeeper` et `launchSucceeded=false` sont les résultats attendus. Un `passed=true` certifie alors que le téléchargement et le refus de sécurité ont été observés de manière concluante ; il ne certifie pas que la distribution est acceptée par Gatekeeper. Une ouverture standard sans exception nécessite une nouvelle distribution signée avec un certificat Developer ID et notariée par Apple. Un déplacement dans Applications ne remplace pas ces exigences. Voir les [indications Apple sur l'ouverture sûre](https://support.apple.com/en-us/102445) et la [notarisation avant distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## Parcours directement dans les binaires publiés

Le workflow `Collector published binary GUI acceptance` télécharge uniquement le paquet natif immuable 0.1.58 adapté à la VM. Il ne télécharge pas le source du collecteur, ne charge aucun de ses modules dans le scénario de test, ne recompile pas l'application et n'injecte pas de code dans son processus.

Après vérification SHA-256 et installation/extraction, le scénario lance le vrai exécutable avec ses arguments normaux de préremplissage, sans forcer un chemin osquery externe (`SPACEFOOT_OSQUERYI` est retiré de son environnement). Il observe les étapes à l'écran par reconnaissance de texte, mesure la fenêtre native puis clique sur son bouton principal : continuation du profil, scan matériel, envoi. Le succès doit apparaître dans l'interface. L'API locale exige exactement un envoi, la version `0.1.58`, le canal natif `manual-unsigned`, le moteur `osquery` et des champs matériels réels non vides.

Sur Linux, une seule fenêtre visible portant le titre exact du collecteur est acceptée dans l'affichage Xvfb privé au test ; son processus propriétaire est vérifié lorsqu'il est publié par Tk. Sur macOS, les permissions de capture d'écran et d'événements doivent être déjà accordées ; la recette ne les contourne pas. La résolution de la session de VM est adaptée pour afficher la fenêtre complète, et toute demande facultative de découverte du réseau local est refusée. Le thème clair et la langue anglaise servent à stabiliser la reconnaissance de texte dans les VM. Les groupes de processus lancés par le test sont arrêtés en fin de recette.

Les résultats `publishedBinaryHardwareScan` et `publishedBinarySubmissionSuccessVisible` distinguent cette recette du test du source décrit ci-dessous. Les captures de succès ne sont conservées que pour les profils synthétiques de la recette isolée. Les tests de production ne publient aucune capture, aucun profil et aucun inventaire brut.

## Recette complémentaire du source publié

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

## Étape de production, désactivée sans autorisation

Le workflow distinct `Collector production acceptance (manual only)` ne s’exécute que par déclenchement manuel sur `main`, dans l’environnement GitHub `production`. Il est inutilisable sans les trois secrets d’invitation dédiés `COLLECTOR_VM_INVITE_LINUX`, `COLLECTOR_VM_INVITE_MAC_INTEL` et `COLLECTOR_VM_INVITE_MAC_ARM`. Aucune invitation ni aucun secret ne sont créés par les workflows.

Avant son utilisation, obtenir une confirmation pour créer les trois invitations, chacune valable 24 heures avec une seule utilisation, destinées aux VM GitHub Actions et à de nouvelles fiches de recette. Le script exige un libellé commençant par `RECETTE-VM-`, une utilisation disponible et aucun poste existant ciblé. Le destinataire et son profil proviennent de l’invitation ; les champs utilisateur ne sont pas inventés par le scénario. La destination est exclusivement l’API HTTPS Parcéo codée dans le script et les redirections sont refusées.

La recette de production pilote désormais directement les binaires publiés avec le même scénario externe que le workflow natif isolé. Le scénario Python prépare seulement le préremplissage : les requêtes de profil et d'envoi du scan partent du binaire lancé. Le commentaire marque la VM avec `RECETTE VM BINAIRE` et le numéro de run. Les preuves ne publient ni le code d’invitation, ni le préremplissage, ni le profil, ni l’inventaire brut. Si l'identifiant renvoyé à l'écran est reconnu, seule son empreinte est conservée. Après le run, contrôler indépendamment les fiches dans Parcéo, la version, le canal `manual-unsigned`, le moteur et les affectations ; passer les VM de recette en `Sorti du parc` et supprimer les trois secrets temporaires. Cette étape n’est pas incluse dans les résultats des tests isolés.
