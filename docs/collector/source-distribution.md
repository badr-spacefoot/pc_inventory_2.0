# Distribution source du collecteur pour validation IT

Ce paquet fournit le collecteur Python/Tkinter existant, son moteur de collecte et les assets nécessaires. Il permet de valider les corrections avec un Python approuvé déjà installé, pendant la préparation des identités de signature. Il ne remplace pas un installateur signé et ne garantit pas l'absence de détection antivirus.

Depuis la version `0.1.54-dev`, il inclut l’identité **Parcéo — Sillage**, les logos clair/sombre et les polices locales avec leurs licences. Le chargement des polices est privé au processus ; un échec conserve une police système de repli. Le moteur de collecte et les anciens liens d’invitation conservent leurs contrats et identifiants techniques.

## Préparer et vérifier le paquet

L'équipe IT génère le ZIP depuis la révision relue :

```text
python scripts/package-collector-source.py --output dist/collector-source.zip
```

La commande refuse un fichier de sortie existant et affiche le SHA-256 du ZIP. Transmettre ce SHA par le canal IT de confiance avec la révision correspondante. Le fichier interne `SOURCE-MANIFEST.json` contient les tailles et SHA-256 des sources : il permet de détecter un écart, mais ne prouve pas à lui seul l'identité de l'émetteur si le ZIP et son manifeste étaient tous deux remplacés.

Le paquet n'inclut ni secrets, ni préremplissages, ni environnement de développement, ni certificat privé, ni installateur osquery. Si osquery est déjà installé et approuvé, il peut être utilisé ; sinon le moteur utilise les lectures système natives. Une différence de couverture doit être indiquée dans la recette, pas masquée.

## Lancer l'interface

Prérequis : Python 3.12 ou ultérieur, avec Tkinter, fourni par le canal IT habituel et autorisé sur la machine. Sur Linux, Tkinter peut être fourni séparément par la distribution. Ne pas télécharger automatiquement de runtime depuis ce paquet. La collecte ne nécessite pas de dépendance PyPI supplémentaire ; les mises à jour automatiques restent désactivées tant qu'aucune clé de vérification n'est configurée. Aucun compte Apple/Microsoft n'est nécessaire pour lire et exécuter ces sources dans un environnement IT approuvé.

Extraire le ZIP vérifié dans un dossier de travail privé, ouvrir un terminal dans ce dossier, puis lancer :

```text
python collectors/desktop_collector/collector_app.py
```

Pour un préremplissage, conserver le fichier temporaire téléchargé depuis l'app ou utiliser le code fourni par l'administrateur. Dans les réglages de connexion, vérifier l'origine du serveur avant validation. Le collecteur présente les informations et demande une confirmation avant l'envoi. La cible de migration sera `https://parc-api.piqa.fr/functions/v1/inventory-api` seulement après sa mise en service ; l'environnement actuel conserve son API existante.

Les sources annoncent le canal `source` et une version de développement. Les sources distribuées ne se mettent pas à jour automatiquement par un installateur natif : la prochaine source révisée doit être redistribuée par IT. Ne pas interpréter ce paquet comme une release binaire publiée.

## Recette sur machine représentative

Vérifier démarrage, langue/clavier, réception du préremplissage, champs organisationnels, scan, révision, envoi explicite vers un compte de test et traitement des erreurs réseau. Refaire un scan avec une invitation liée à une machine existante et vérifier qu'elle n'est ni dupliquée ni réaffectée involontairement. Utiliser un environnement isolé ou une machine de test avec une autorisation explicite ; un test de démarrage seul ne valide pas la collecte.

En cas de détection Defender/ESET, relever le nom de détection, la version, le SHA-256 exact du fichier et l'étape où le blocage apparaît. Arrêter cette tentative et conserver les contrôles actifs. Ne pas restaurer un fichier en quarantaine, modifier une exclusion antivirus ou supprimer la quarantaine macOS pour terminer la recette. Une soumission de faux positif à Microsoft est une démarche distincte avec le binaire identifié ; la réputation SmartScreen et une détection de malware ne sont pas le même diagnostic.

Les releases publiques natives restent conditionnées par leurs signatures, la notarisation macOS et la validation réelle sur les OS supportés. Aucune installation, collecte ou soumission ne s'exécute pendant la fabrication du ZIP.
