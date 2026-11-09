# Parcéo statique sur le VPS partagé

Cette cible sert le frontend sur parceo.piqa.fr avec l’API Supabase actuellement hébergée. Elle est distincte du kit de migration complète `deploy/vps`. Ne pas lancer une seconde base ou modifier les autres services pour publier une version du site.

Le service `piqa-parceo-web` utilise l’image Caddy déjà présente, sans port hôte, sur le réseau proxy existant. Le dossier `/srv/parceo/site` est monté en lecture seule ; `current` pointe vers une version conservée dans `releases/`. Les certificats publics restent gérés par le proxy existant.

Pour une nouvelle version : exécuter les contrôles qualité, générer un nouveau dossier de site avec `scripts/package-site.mjs`, les trois variables publiques d’URL et l’API hébergée actuelle. Archiver uniquement ces fichiers et calculer le SHA-256 du ZIP. Vérifier le manifeste du collecteur et les fichiers publics avant bascule.

Copier le ZIP en `site.zip` et le script `deploy.py` dans le dossier privé `/tmp/parceo-publication` du VPS. Exécuter le script avec `sudo`, le mode `update`, un identifiant de version inédit composé de lettres/chiffres/tirets et le hash exact de l’archive. Le script refuse de réutiliser un dossier de version, vérifie le hash, extrait uniquement sous la cible et remplace le lien atomiquement. Il conserve la version précédente et n’a pas besoin de recharger le proxy.

Le mode `stage` ne sert qu’au premier provisionnement et refuse un `/srv/parceo` déjà existant. Le mode `cutover` sauvegarde et compare le Caddyfile, ajoute seulement la route Parcéo, valide puis recharge. Ne pas le réexécuter pour une mise à jour statique.

Après une bascule, vérifier HTTPS avec validation normale du certificat, santé du conteneur, identité claire/sombre/mobile, chargement des polices, absence d’erreurs JS/CSP et correspondance des liens/empreintes des téléchargements. Pour revenir en arrière, rétablir atomiquement `current` vers la version précédente vérifiée. Pour retirer la route publique, modifier uniquement le bloc PARCEO après sauvegarde/validation du proxy courant ; ne pas écraser les changements récents des autres applications.

Voir [le compte rendu de publication](../../docs/operations/2026-11-09-production/README.md).
