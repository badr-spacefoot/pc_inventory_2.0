# Spacefoot IT : corrections consolidées et préparation de parc.piqa.fr

État au 6 novembre 2026 : **corrections locales validées ; bascule de production encore conditionnée par la capacité, la distribution native et la recette de restauration**. Aucun déploiement, achat, nettoyage du VPS, changement DNS ou modification de données de production n'a été effectué pendant cette intervention.

La préparation part du `main` publié `4ac6d8d77e982409f00809f7a25640e77ad720c0` et conserve la fonctionnalité « En réparation ». Elle regroupe les corrections d'audit de septembre, les corrections supplémentaires ci-dessous et la préparation opérationnelle. Les rapports de septembre restent historiques ; ce document actualise leur état.

## Collecteur prioritaire

La source annonce **0.1.53-dev**, canal **source**. La future release native prendra la version et le canal `github-release` au moment de sa construction depuis un tag validé.

- Sans clé de vérification configurée, le collecteur poursuit directement le préremplissage ; il n'attend plus un serveur de mise à jour inutilisable.
- Les mises à jour vérifient les signatures existantes, puis la version, le nom de fichier, la plateforme, la taille et le hash avant toute installation. Les chemins de traversée et les noms de shell sont refusés. Les téléchargements invalides sont nettoyés dans leur propre dossier temporaire.
- Les réponses API et les messages d'erreur sont bornés. Les scripts Python et PowerShell refusent les redirections de l'API ; un test HTTP local démontre que le bearer n'est pas envoyé à la cible de redirection. Le script Windows envoie explicitement le JSON en UTF-8.
- L'aide macOS conserve la quarantaine et vérifie signature/Gatekeeper avant ouverture. Les métadonnées de release ne sont plus interpolées librement dans une commande shell. L'appel PowerShell du moteur ne demande plus `ExecutionPolicy Bypass`.
- Aucun certificat Windows auto-signé n'est créé automatiquement. Les builds internes sans certificat sont explicitement non signés ; les publications natives gardent leurs contrôles de signature et notarisation. Les fichiers temporaires PFX sont supprimés après signature, y compris en cas d'échec.
- Un paquet source de 16 fichiers est généré par `scripts/package-collector-source.py`, avec une liste explicite de fichiers et leurs empreintes. Il conserve la même interface Tkinter et n'installe aucun runtime ou service. Il fournit une voie de validation IT avec un Python/Tkinter approuvé déjà installé ; ce n'est pas un installateur signé ni une garantie d'acceptation antivirus.

Le symptôme précisé par l'utilisateur est **SmartScreen / éditeur inconnu**. Aucune détection de malware précise n'a été rapportée. Une signature reconnue permet d'établir l'identité de l'éditeur mais peut encore déclencher un avertissement de réputation sur un nouveau fichier. [Documentation Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation). Aucune exclusion ou désactivation de protection n'a été appliquée.

## Application, API et données

Les corrections locales antérieures sont conservées et vérifiées : valorisation du stock et des valeurs zéro, dépréciation calculée sur une couverture comparable, rendu des scans comme texte, cohérence de sélection malgré des réponses périmées, export CSV protégé, navigation clavier, dialogues nommés et purge après déconnexion.

L'API préparée conserve ses sessions administrateur révocables, limites de connexion persistantes, invitations liées à une machine, contrôles d'identité de collecte, pagination complète, lots d'enrichissement avec leases/fencing et gestion transactionnelle des factures/audits. Les tests PostgreSQL embarqués valident les invariants correspondants ; ils ne remplacent pas un test de la plateforme Supabase complète sous charge concurrente.

**Migration réconciliée :** le fichier local non publié `20260915132127_audit_security_data_integrity.sql` a été transféré, octets SQL conservés, vers **`20261106171331_audit_security_data_integrity.sql`**, généré par le CLI installé. L'historique distant a été lu : la migration d'audit n'y existe pas ; `20261104120000_device_in_repair_status` y est déjà appliquée. Aucun historique distant n'a été réécrit. Les tests pointent sur le nouveau fichier. La migration de sécurité doit précéder la nouvelle API ; les anciennes sessions devront se reconnecter.

Le projet Supabase actuel est sain selon son état de plateforme, sous PostgreSQL `17.6.1.166`. Ses 24 notices de sécurité sont informatives : RLS activée sans politique pour les tables accessibles uniquement via l'API personnalisée/service-role. Ce constat ne justifie pas de créer des politiques publiques pour faire disparaître les notices. [Explication du linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Validation effectuée

| Contrôle | Résultat | Limite |
|---|---|---|
| `pnpm run quality`, pnpm 10.34.5, environnement Python isolé à dépendances hashées | Réussi : format, ESLint, TypeScript, Deno, syntaxe, tests et build | Node/Python locaux 24/3.14 ; la CI déclarée reste 22/3.12 |
| Tests TypeScript | **233 réussis, 3 tests réseau volontairement non exécutés** | Pas de réussite revendiquée pour ces trois tests |
| Tests Python | **34 réussis** | Les fixtures sont synthétiques |
| Binaire Windows PyInstaller onedir / sans UPX | Démarrage et reconstruction UI, sortie 0 | Binaire local non signé ; ni installation MSI/Inno ni recette SmartScreen du téléchargement public |
| Interface Tkinter réelle, fenêtre masquée | Profil → scan simulé → envoi simulé ; aucune exception de callback | Aucun matériel réel scanné, aucune requête réseau, API simulée en mémoire |
| Chromium, fixtures web | Stock : 1 000 € lancement / 300 € actuel / 70 % ; XSS inerte, sélection, clavier, langue, logout, formats 1440/375 px | Pas de données de salariés ni de production |
| Paquet web sous la CSP proposée | Démarrage réussi, zéro erreur JS et zéro violation CSP | API, météo et carte simulées ; pas de preuve de TLS ou Storage réel sur le VPS |
| Compose officiel épinglé + overlay actuel | **12 services, aucun port hôte publié**, précontrôle accepté avec des secrets synthétiques | Aucun conteneur démarré ; les valeurs de test ne doivent jamais être déployées |
| Configurations Caddy | Les deux configurations sont analysées par le binaire 2.11.9 déjà présent sur le VPS | Aucun remplacement ni rechargement du proxy ; adaptation syntaxique, pas recette de service |

Preuves : [binaire Windows](collector-native.json), [interface native](collector-ui.json), [parcours web](frontend-fixture-results.json), [CSP](packaged-csp.json), [pins CI](action-pins.json), [résumé de validation](verification.json), [artifacts](release-artifacts.json).

## Kit VPS et livraison

Le kit reste fondé sur l'architecture Deno/Supabase existante, sans réécriture : `parc.piqa.fr` pour le frontend, `parc-api.piqa.fr` pour l'API et les liens Storage signés. Le Compose officiel est relu au commit `8c7a4d9dbbaf8b552893822e89d7bf06f33f9220` ; son SHA-256 correspond à `deploy/vps/upstream.lock.json`.

L'image du frontend Caddy est alignée sur la version 2.11.9 déjà en place et épinglée sur le RepoDigest relevé sur le serveur. Les autres images restent celles de la base Supabase revue ; leurs digests et leur compatibilité avec les extensions source devront être arrêtés pour la recette réelle. La cible PostgreSQL de cette base est `17.6.1.136`, de la même majeure que la source mais d'une révision de distribution différente : une restauration réelle reste obligatoire.

Le précontrôle vérifie l'isolation réseau et les ports, les secrets applicatifs distincts, le remplacement des valeurs d'exemple PostgreSQL/JWT, la signature HS256/expiration/rôle des clés legacy utilisées par cette base, l'origine publique et le CORS. Il ne mesure pas l'entropie d'un secret ni les accès effectifs après démarrage. Conserver les protections réseau contre les sorties vers les destinations privées/métadonnées, avec les exceptions internes strictement nécessaires ; elles restent à tester sur la cible.

Les 24 références d'actions externes de la CI sont épinglées sur 11 commits amont vérifiés. Le workflow collecteur garde les droits de lecture par défaut ; seul le job de publication reçoit l'écriture. Les checksums incluent maintenant les métadonnées signées. Les appels POST d'enrichissement ne sont plus automatiquement rejoués par curl, et une erreur de job n'imprime plus tout son contenu dans les logs publics.

Les trois tâches GitHub planifiées sont actives ; leurs dernières exécutions du 6 novembre sont réussies. Cela prouve leur exécution, pas la fraîcheur de tous les prix. Le contrôle de fraîcheur et des échecs reste une condition de recette. Aucun workflow distant n'a été déclenché ou modifié ici.

## Conditions restant avant publication

1. **Capacité :** le VPS partagé dispose de **3,3 Go libres, disque à 96 %**, environ 4,1 Gio de RAM disponible et 1,2 Gio de swap utilisée au relevé. Le précontrôle de provisionnement exige 40 Gio libres et 4 Gio disponibles ; le disque échoue. Docker annonce environ 9,5 Go d'images récupérables, mais elles peuvent inclure des possibilités de retour arrière : aucune suppression n'a été autorisée ni faite. Ce seul volume ne franchirait pas la réserve disque prévue. Arrêter une capacité adaptée avant la recette de la pile complète.
2. **Distribution native :** les comptes/identités de signature Windows et Apple ne sont pas disponibles. Utiliser le paquet source pour la validation IT autorisée ; provisionner ensuite les identités, la clé Ed25519 de release et les ressources de notarisation. Tester Windows/macOS/Linux représentatifs et les versions de collecteur déjà installées. Ne pas retirer les anciennes URLs avant leur transition.
3. **Staging et reprise :** une fois la capacité disponible, démarrer une pile isolée, configurer de vrais secrets privés, vérifier les sessions/rôles, invitations et mises à jour de machines existantes, factures signées, échecs/reprises de jobs et restrictions réseau. Définir le dépôt de sauvegarde chiffré hors hôte, les objectifs de reprise et la conservation ; restaurer ensemble DB, rôles, objets et configuration, puis vérifier les relations et les hashes. Aucun backup de production n'a été pris dans cette intervention.
4. **GitHub :** `main` n'est pas protégé et seul l'environnement `github-pages` existe actuellement. Les futurs workflows désignent `production` et `production-supabase` ; configurer leurs restrictions et validations humaines avant publication. La proposition de politique est enregistrée dans [github-protection-proposal.json](github-protection-proposal.json), sans application distante. Le check existant se nomme `quality`.
5. **Bascule :** les deux noms parc n'ont renvoyé aucune adresse depuis le VPS au contrôle. Après recette, appliquer le [runbook de migration](../../audit-2026-09-15/deployment-plan.md) : arrêt des écritures/anciens jobs, copie finale cohérente, tests, DNS/proxy, puis un seul environnement écrivain. Préserver les nouvelles écritures si un retour arrière est nécessaire. Aucun changement DNS ou proxy n'a eu lieu.

Le Core AAS, son runtime/cache et les skills personnels sont inchangés. Les skills directs 20.6.0 sélectionnés ont servi à cette intervention ; aucune instruction de skill n'a été considérée comme une permission de publier ou de modifier les protections.
