# Déploiement du système social

Ce protocole publie uniquement la couche sociale JWETPRO. Il ne redéploie pas les moteurs Mopyon, Domino, les paiements ni l’assistant.

## Conditions de départ

- Les tests unitaires et les deux suites Firebase Emulator doivent être verts.
- Le compte Firebase actif doit avoir les droits de déploiement sur `mopyonlakay`.
- Le dashboard doit être publié avec le bouton **Synchroniser les profils sociaux** avant le backfill.
- Le site principal doit être relié au bon dépôt GitHub. Le dossier `D:\jwetpro` ne contient actuellement pas de dossier `.git`; le dépôt parent `D:\.git` appartient à un autre projet et ne doit jamais être utilisé pour publier JWETPRO.

## Ordre de publication

### 1. Fonctions, règles et index

Déployer uniquement :

- les fonctions de J’aime, profils, abonnements, blocage, signalement, notifications et messages privés ;
- les fonctions de partage public ;
- `firestore.rules` et `firestore.indexes.json`.

État au 10 septembre 2026 : règles, index et fonctions sociales publiés sur `mopyonlakay`. Le quota CPU Cloud Run de `us-central1` empêchant la création d’une révision dédiée à `listFollowing`, la pagination des deux listes passe par l’unique endpoint authentifié `listSocialRelationships` en `us-east1`. Toutes les autres fonctions sociales restent en `us-central1`.

### 2. Contrôles serveur

- Confirmer que les fonctions sociales apparaissent en `us-central1` et que `listSocialRelationships` apparaît en `us-east1`.
- Vérifier que `listSocialRelationships` refuse un appel sans authentification avec `401`, puis retourne séparément les listes `followers` et `following` pour un vrai compte.
- Vérifier qu’un appel public à une page `/s/c/<id>` ou `/s/m/<seriesId>` répond sans exposer de donnée privée.
- Vérifier qu’un client ne peut pas écrire directement dans `socialLikes`, `socialFollows`, `socialProfiles`, `socialEntityStats`, `socialBlocks`, `socialReports`, les favoris, notifications ou conversations.

### 3. Backfill contrôlé

Dans le dashboard, avec un compte administrateur :

1. Ouvrir la rubrique des utilisateurs.
2. Cliquer sur **Synchroniser les profils sociaux**.
3. Attendre le message final indiquant le nombre total de profils synchronisés.
4. Ne pas relancer tant que l’opération précédente n’est pas terminée.

Le backfill conserve chaque ancienne identité simulée ambiguë séparément. Seules les personas qui possèdent déjà un `socialPlayerId` explicite sont réutilisées entre les championnats.

### 4. Interface

État au 13 septembre 2026 : l’interface du site principal et la cible `jwetpro-share` sont publiées. Le script de notifications utilise `20260913-social-v4` et la ressource principale `20260913-social-favorites`; ces versions doivent rester cohérentes dans `index.html` et `shared-shell.js` afin d’éviter un ancien cache.

Le dashboard contient le bouton de backfill et les identités `socialPlayerId` stables. Après son ouverture avec un compte administrateur, exécuter l’étape 3 puis réaliser la recette ci-dessous. Les routes dynamiques `/s/c/*` et `/s/m/*` restent servies temporairement par `jwetpro-share.web.app` tant que `share.jwetpro.com` n’est pas configuré dans Firebase Hosting et dans le DNS.

## Recette de production

Utiliser deux vrais comptes et un joueur simulé :

1. Partager un championnat sans être connecté.
2. Aimer deux fois le même match et confirmer un seul favori et un seul incrément.
3. Faire suivre A par B, puis B par A ; confirmer les deux notifications et le marqueur réciproque.
4. Ouvrir une conversation privée, envoyer un message et confirmer le compteur non lu.
5. Désabonner un compte et confirmer que l’historique reste visible en lecture seule.
6. Rétablir le suivi, puis bloquer ; confirmer la suppression des deux abonnements et l’impossibilité d’écrire.
7. Suivre un joueur simulé ; confirmer qu’il ne peut ni suivre en retour ni recevoir de message.
8. Vérifier les profils public et privé, le français et le kreyòl, puis les largeurs mobile et ordinateur.

## Arrêt et retour arrière

- Arrêter immédiatement la recette si une lecture privée devient possible ou si un compteur diverge.
- Ne jamais assouplir les règles Firestore pour contourner une erreur d’interface.
- En cas d’échec des fonctions, restaurer leur révision précédente depuis Firebase/Cloud Run ou redéployer l’artefact précédent validé.
- En cas d’échec des règles, remettre la version précédente sauvegardée avant publication.
- Si le backfill ou la recette révèle une lecture privée, désactiver les points d’entrée sociaux concernés et restaurer la dernière version validée; ne jamais contourner le problème en assouplissant les règles.
