# Parcéo Collector 0.1.58 — Sillage

Le correctif HTTPS est intégré au collecteur : les anciens liens Supabase transmis en HTTP sont normalisés vers l’adresse publique HTTPS avant toute connexion. Les autres adresses HTTP distantes restent refusées.

Les exécutables et les téléchargements Windows, macOS et Linux portent désormais le nom Parcéo. Les propriétés du fichier Windows affichent Parcéo Collector, Piqa et la version 0.1.58. Les journaux utilisent le répertoire Parcéo Collector. L’identité Sillage, les thèmes clair/sombre et les polices locales sont conservés.

**Distribution manuelle non signée, autorisée par le propriétaire du projet.** L’installateur Windows ne porte pas de signature d’éditeur reconnue et SmartScreen peut afficher un avertissement. L’application macOS n’est pas notariée (signature ad hoc de fonctionnement uniquement) : Gatekeeper peut refuser son ouverture lorsqu’elle provient d’un téléchargement navigateur. Une validation `codesign` réussie vérifie l’intégrité du paquet ; elle ne prouve pas une identité Developer ID ni une notarisation Apple. Déplacer l’app dans Applications ou appeler `open` ne corrige pas ce refus. Aucun certificat de test n’est fourni ou installé et aucune protection système n’est désactivée.

Les vérifications des mises à jour automatiques restent en place. Cette release ne contient pas de manifeste de mise à jour signé et n’est pas installée automatiquement. Vérifiez les fichiers avec SHA256SUMS.txt. Le paquet source inspectable est fourni.

Les nouveaux paquets enregistrent parceo-collector:// et conservent spacefoot-collector:// comme alias de compatibilité. Les anciens fichiers de préremplissage restent acceptés. L’identifiant Windows et le dossier choisi lors d’une précédente installation sont conservés pour permettre la mise à niveau ; les nouvelles installations utilisent Parceo Collector. Sous Linux, le paquet parceo-collector remplace explicitement spacefoot-it-collector.
