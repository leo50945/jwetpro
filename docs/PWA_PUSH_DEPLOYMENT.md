# Déploiement PWA et notifications Web Push

Cette fiche complète la mise en place PWA de `play.html`.

## Configuration obligatoire

1. Créer ou générer une paire de clés VAPID (publique et privée) pour Web Push.
2. Garder la clé publique dans `shared-pwa-config.js` et dans le paramètre Functions `WEB_PUSH_PUBLIC_KEY` :

   ```js
   window.JWETPRO_PUSH_VAPID_KEY = 'CLE_PUBLIQUE_VAPID';
   ```

3. Configurer `WEB_PUSH_PRIVATE_KEY` avec la clé privée. La clé privée ne doit jamais être publiée dans le site.

Pour la clé privée, utiliser `firebase functions:secrets:set WEB_PUSH_PRIVATE_KEY`. Le paramètre Functions `WEB_PUSH_PUBLIC_KEY` a une valeur par défaut versionnée avec la configuration publique du navigateur.

Le navigateur s’abonne via l’API Web Push native. Sans les clés VAPID, la modale PWA s’affiche, mais le navigateur ne peut pas créer d’abonnement pour les notifications hors application.

État JWETPRO au 1 octobre 2026 : la paire de production est configurée dans le frontend et le secret `WEB_PUSH_PRIVATE_KEY` est créé dans Secret Manager du projet `mopyonlakay`. Il reste à déployer les Functions et règles, publier le frontend et exécuter la recette réelle.

## Déploiement Firebase

Déployer au minimum :

- `firebase-messaging-sw.js`
- `shared-pwa.js`
- `shared-pwa.css`
- `shared-pwa-config.js`
- `site.webmanifest`
- `src/icons/pwa-192.png`
- `src/icons/pwa-512.png`
- `firestore.rules`
- les Cloud Functions exportées par `functions/jwetpro-push.js`
- la dépendance npm `web-push` des Cloud Functions

Les fonctions concernées sont :

- `registerWebPushSubscription`
- `deactivateWebPushSubscription`
- `pushInternalNotification`
- `notifyChampionshipLifecycle`
- `notifyCouponCreated`
- `sendMatchStartReminders`
- `sendChampionshipStartReminders`

## Recette obligatoire

Tester sur au moins Chrome ou Edge desktop, Android Chrome et Safari iOS récent :

1. ouvrir `play.html` depuis un navigateur non installé ;
2. vérifier que la modale bloque entraînement, live, replay et match officiel ;
3. installer l’application ;
4. se connecter avec un vrai compte joueur ;
5. autoriser les notifications ;
6. vérifier que `users/{uid}/pushTokens/{endpointHash}` est créé par la fonction callable ;
7. créer une notification interne de test et vérifier la notification système lorsque l’application est fermée ;
8. vérifier les événements réels : championnat ouvert, championnat fermé, rappel championnat/match cinq minutes, nouvel abonné, message privé, J’aime sur match joué, gagnant de championnat et coupon.

## Limites connues

- Les navigateurs peuvent refuser Web Push en HTTP hors `localhost`; tester en HTTPS pour la recette finale.
- iOS exige une application ajoutée à l’écran d’accueil pour recevoir les notifications Web Push.
- Les préférences `notificationPreferences` restent respectées : un utilisateur peut désactiver certaines familles d’alertes depuis son profil.
