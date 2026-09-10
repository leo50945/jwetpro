# Decisions

## 2026-09-08 — Couche sociale unifiée

Les championnats et les séries officielles utilisent une identité sociale canonique partagée par toutes leurs cartes. Le partage reste public; aimer, suivre, bloquer, signaler et écrire en privé exigent un vrai compte actif. Le J’aime alimente à la fois un compteur public agrégé et le favori privé du joueur.

Les profils sociaux exposent seulement une identité minimale, le type réel ou simulé et le nombre d’abonnés. Les listes de relations restent privées. Les messages privés sont autorisés uniquement entre deux vrais joueurs qui se suivent mutuellement; une rupture du lien conserve l’historique en lecture seule. Les personnages simulés ont une identité stable réutilisée entre les championnats mais ne suivent jamais en retour. Le dashboard déclare explicitement cette persona stable; une ancienne simulation sans identifiant déclaré reçoit un identifiant historique propre à son document afin que deux homonymes ne soient jamais fusionnés automatiquement.

Les notifications sociales restent internes à JWETPRO. Le partage d’un palier d’abonnés ne contient jamais l’identité de la personne qui vient de suivre le profil.

## 2026-09-05 - Parité officielle des championnats Domino

Une confrontation Domino suit désormais le même contrat que Mopyon : une série `kind: series` au meilleur de trois manches, une seule ligne dans « Mes matchs », deux manches gagnantes pour remporter le match, un replay regroupé et le retrait de la liste lorsque le championnat est terminé. Les CTA personnels de l'accueil et de `play.html` ouvrent la route joueur `play.html?join=<seriesId>`; la première manche est créée à la demande si nécessaire.

Le moteur Domino officiel est autoritaire côté Cloud Functions. Les fonctions `joinDominoMatch`, `submitDominoMove`, `advanceDominoSeries` et `claimDominoForfeit` contrôlent l'accès, les tours, les placements, la pioche, les passes, le résultat et le délai de présence. Les mains et la pioche sont stockées dans `dominoMatchStates`, sans accès Firestore client; `getDominoMatchState` ne renvoie qu'au participant authentifié sa propre main. Le dashboard administrateur utilise les mêmes fonctions, avec un accès explicite aux mains uniquement pour piloter les participants simulés.

Entre deux joueurs réels, le premier arrivé déclenche le même délai de cinq minutes que Mopyon. Contre un joueur simulé, la manche démarre immédiatement et le bot Débutant répond côté serveur. Les anciennes manches Domino du dashboard qui exposaient les mains dans le document public sont nettoyées lors de leur prochaine préparation ou action autoritaire.

L’interface d’une manche Domino officielle réutilise désormais exactement `dominocash/index.html` dans une iframe de même origine, comme l’entraînement. Un protocole `postMessage` limité à l’origine courante transmet uniquement l’état public, la main privée du joueur authentifié et les intentions de jeu validées; aucune règle ni donnée officielle n’est décidée dans l’iframe. Les Cloud Functions restent l’unique autorité pour les placements, la pioche, les tours et le résultat.

## 2026-09-07 - Rotation élargie de l’animation communautaire

L’animation du salon `general` dispose de 32 personnages et d’un catalogue de 36 scénarios courts en français et en kreyòl, incluant des salutations, questions simples, encouragements et réponses par emoji. Chaque discussion fait intervenir quatre à six personnages. Le serveur choisit en priorité ceux qui n’ont pas encore parlé pendant la journée locale `America/Port-au-Prince`, puis autorise une nouvelle rotation seulement lorsque le catalogue quotidien a été utilisé.

Le document serveur `communitySimulation/state` mémorise les personnages, scénarios et couples personnage/message déjà employés. Un scénario ne peut pas être rejoué le même jour et ceux de la veille sont évités en priorité. Après une animation, une page Community restée ouverte peut en demander une autre à l’expiration du délai serveur de trois minutes, tant qu’aucun vrai joueur n’a écrit. Les marqueurs techniques `authorRole: simulated`, `automated: true` et `simulation: true` restent enregistrés pour le contrôle serveur, sans libellé visible dans la carte. Le salon public charge uniquement les 15 messages les plus récents.

## 2026-09-05 - Plusieurs simulations de championnat en parallèle

Le dashboard ne considère plus qu’une seule simulation globale. Il charge un catalogue des championnats portant `simulation: true`, permet à l’administrateur de sélectionner la simulation affichée et conserve le bouton de création disponible pour démarrer une autre édition sans supprimer la précédente. Chaque simulation continue d’utiliser son propre `championshipId` et son propre `simulationRunId`; les inscriptions, confrontations, manches, résultats et comptes de test sont donc lus, modifiés et supprimés uniquement dans ce périmètre.

La suppression depuis le laboratoire concerne seulement la simulation sélectionnée et bascule ensuite vers la simulation restante la plus récente. La limite de 32 joueurs reste appliquée indépendamment à chaque simulation. Le catalogue du dashboard est volontairement limité aux 50 simulations les plus récentes afin de garder une interface réactive; les éditions terminées peuvent être supprimées depuis la liste des championnats.

## 2026-09-04 - Une source officielle pour le Guide et Jean Estime

Les règles publiques structurantes ne sont plus maintenues séparément dans le Guide et dans l'assistant. Les documents versionnés `championship-format`, `championship-rewards`, `championship-lifecycle` et `match-series-and-replay` de `assistantKnowledge` constituent la source éditable depuis le dashboard. `guide.html` lit uniquement ces quatre identifiants et Jean Estime utilise la même collection. Les écritures restent réservées aux administrateurs; aucune autre connaissance interne n'est rendue publique.

Le format standard V2 comprend 32 joueurs, cinq tours, 125 HTG de participation et 2 000 HTG au champion. Le deuxième reçoit un coupon d'inscription gratuite et chaque autre participant un coupon de réduction de 25 HTG. Les coupons sont personnels, non transférables, non cumulables, utilisables une seule fois uniquement pour le prochain championnat publié, Domino ou Mopyon, puis expirent. Les données propres à une édition publiées dans sa fiche Firebase (date, heure et statut) restent prioritaires.

## 2026-09-03 - Animation d’un salon communautaire silencieux

La suppression des réponses automatiques de Jean Estime dans `general` reste définitive : `autoReplyToGroupMessage` n’est pas réintroduite. En revanche, `startCommunitySimulation` est rétablie comme animation autonome. Après cinq secondes sans nouveau message humain depuis l’ouverture de `community.html`, un joueur authentifié présent peut demander une courte conversation simulée. Les publications simulées utilisent la structure visuelle et les champs ordinaires d’un message utilisateur; seul leur `authorId` technique préfixé `simulated_`, invisible dans l’interface, permet au moteur de les distinguer d’une conversation réelle.

Le navigateur publie sa présence toutes les cinq secondes. Avant le démarrage et avant chaque ligne, le serveur exige au moins une présence datant de moins de douze secondes et vérifie qu’aucun message humain plus récent n’existe. Un message humain observé annule le lancement côté client et interrompt la suite côté serveur. Un verrou transactionnel récupérable après six minutes et un délai de trois minutes entre deux animations évitent les blocages et les doublons tout en permettant une rotation visible des discussions.

## 2026-09-03 - Salon communautaire réservé aux joueurs réels

Cette décision est partiellement remplacée par la décision ci-dessus. Jean Estime et les réponses automatiques restent exclus du groupe, mais les conversations d’animation explicitement identifiées sont de nouveau autorisées.

## 2026-09-03 - Transport public et authentification de la simulation communautaire

`startCommunitySimulation` est une fonction callable invoquée par le navigateur. Son transport Cloud Run doit donc accepter les requêtes publiques et les preflights CORS (`invoker: public`, rôle `roles/run.invoker` pour `allUsers`). Cette permission ne remplace pas l'authentification : le handler refuse toujours une requête sans `request.auth` ou provenant d'une session Firebase anonyme. L'ouverture est limitée à cette fonction ; les déclencheurs Firestore ne reçoivent aucune permission publique supplémentaire.

Cette décision est désormais historique : la simulation communautaire a été supprimée par la décision ci-dessus.

## 2026-09-03 - Migration du fournisseur de langage de Gemini vers Groq

L'assistant officiel JWETPRO (« Jean Estime », `functions/assistant-core.js`), la suggestion de réponse coordonnateur et la simulation communautaire (`functions/index.js`) utilisaient Gemini par deux voies distinctes : `generateVertexJson` appelait Vertex AI (`gemini-2.5-flash`) via un jeton de service (`admin.app().options.credential.getAccessToken()`, sans clé API), tandis que `suggestCoordinatorReply` et `startCommunitySimulation` appelaient l'API Gemini publique via le SDK `@google/genai` et le secret `GEMINI_API_KEY`. Les trois points d'appel sont remplacés par Groq (API compatible OpenAI), via un client `fetch` unique `callGroqChat` dans `assistant-core.js`, appelé directement sans SDK — cohérent avec le style déjà utilisé par l'ancien appel Vertex.

La clé Groq est stockée uniquement comme secret Firebase Functions (`GROQ_API_KEY`, `firebase functions:secrets:set`), jamais en clair dans le dépôt. Toute fonction qui déclenche, directement ou indirectement (via `assistantService.answerUserMessage`), un appel Groq doit déclarer `secrets: [groqApiKey]` — cela inclut désormais `autoReplyToCoordinatorMessage` et `autoReplyToGroupMessage`, qui n'avaient pas besoin de secret sous Vertex.

Le mode JSON strict de Vertex (`responseSchema` typé) n'a pas d'équivalent direct chez Groq : son mode `response_format: {type:"json_object"}` garantit un JSON valide mais pas une forme précise, et exige que le mot « json » apparaisse littéralement quelque part dans les messages envoyés, sinon l'appel échoue avec une erreur 400. La forme exacte attendue (`answer`, `language`, `sourceType`, `needsCoordinator`, `suggestedActions`, `isInScope`, `conversationTopic`) est donc décrite explicitement dans le prompt système (`generateGroqJson`), avec la même logique de nouvelle tentative unique en cas de JSON invalide que l'ancien code Vertex. Le modèle retenu, `openai/gpt-oss-120b`, a été vérifié en conditions réelles avec la clé du compte au moment de la migration ; la liste des modèles disponibles évolue avec le temps et peut être revérifiée via `GET https://api.groq.com/openai/v1/models`.

La dépendance `@google/genai`, devenue inutilisée, a été retirée de `functions/package.json`.

## 2026-09-03 - Présence, forfait de temps et adversaire simulé

Pour un match Mopyon entre deux joueurs réels, `joinMopyonMatch` enregistre l'arrivée du premier joueur et fixe `attendanceDeadlineAt` cinq minutes plus tard. L'interface affiche ce délai et appelle automatiquement `claimMopyonForfeit` à son expiration. La transaction serveur refuse le forfait si l'adversaire est déjà présent et attribue sinon la victoire avec `forfeitReason: attendance-timeout` et `forfeitedUid`. Un joueur qui tente d'arriver après une échéance déjà expirée perd également dans la transaction d'entrée, afin qu'une arrivée tardive ne puisse effacer le forfait. La fonction planifiée `resolveMopyonAttendanceTimeouts`, exécutée chaque minute, garantit la résolution des délais expirés même si le navigateur du joueur présent est fermé.

Un participant simulé doit être identifié explicitement par `simulation: true`, par les champs bot/simulation du participant, ou par un UID technique préfixé `bot_`, `sim_`, `simulated_` ou `simulation_`. Dans un match marqué comme simulation qui contient l'UID du joueur authentifié, l'autre UID est traité comme le bot. Aucun délai de présence ne lui est appliqué. Le serveur lance la partie dès l'arrivée du joueur réel et joue les coups du bot dans la même transaction autoritaire que le coup humain. Le navigateur ne peut donc jamais usurper le bot ni choisir son coup.

Lorsqu'une confrontation planifiée `kind: series` oppose un joueur réel à un joueur simulé et ne possède encore aucun `currentGameId`, l'entrée du joueur réel demande à `joinMopyonMatch` de créer une première manche `kind: game` liée par `seriesId`. La série reçoit immédiatement `currentGameId` et `activeGameId`; l'interface rejoint ensuite cette manche et le moteur serveur active le bot sans attendre une publication manuelle de l'organisateur.

## 2026-09-03 - Hero personnalisé et priorisé

Le hero de la page d'accueil devient un carrousel horizontal alimenté par Firestore. Son ordre métier est fixe : matchs officiels non terminés du joueur connecté, championnats avec inscriptions ouvertes, championnats en cours, puis autres événements planifiés. Les matchs personnels sont reconnus uniquement lorsque l'UID Firebase courant figure dans `participantIds`.

Une carte de match affiche les deux profils, l'horaire et « Rejoindre le match ». Cette action utilise `play.html?join=<matchId>` : la page vérifie que l'utilisateur connecté est réellement participant avant d'ouvrir le plateau et n'emploie pas le mode spectateur. Un visiteur déconnecté ne voit aucun match personnel et doit se connecter avant l'accès direct.

Sur toutes les cartes d'un match en direct, l'action dépend de l'UID connecté : un participant voit « Rejoindre le match » et passe par la route joueur `play.html?join=<matchId>` ; toute autre personne voit « Regarder le match » et passe par la route spectateur en lecture seule `play.html?match=<matchId>`. Une confrontation `series` ne fournit une action de plateau que lorsqu'un identifiant de manche jouable est publié.

La restauration de session déclenche une requête personnelle dédiée sur `matches` avec `participantIds array-contains <uid>`. Elle complète les requêtes publiques, qui peuvent avoir été lancées avant que l'utilisateur soit connu. Une confrontation `kind: series` est affichée comme match planifié prioritaire et ouvre l'espace d'attente personnel tant qu'aucune partie jouable n'a été créée.

Depuis le hero, toute confrontation personnelle, y compris `kind: series`, utilise désormais l'action « Antre nan match la » et la route joueur sécurisée `play.html?join=<matchId>`. Une série sans manche publiée ouvre un espace d'attente personnel ; la page observe ensuite `currentGameId`, `activeGameId` ou `gameId` et rejoint automatiquement la manche dès sa publication, après une nouvelle vérification de l'UID participant.

## 2026-08-18 - Points et niveaux joueurs

Les points JWETPRO sont des points de performance officielle, jamais des points d'entrainement. Ils sont attribues apres publication d'un championnat selon le bareme suivant : participation confirmee +5, victoire en 16e +10, victoire en 8e +15, victoire en quart +25, victoire en demi-finale +40, champion +75 et bonus sans abandon +5.

Le niveau public est calcule automatiquement depuis les points : Debutant 0-49, Intermediaire 50-149, Confirme 150-299, Expert 300-599 et Elite a partir de 600 points. L'interface peut afficher ce niveau calcule meme si une ancienne donnee `level` existe, afin d'eviter les niveaux manuels incoherents.

## 2026-08-17 - Récapitulatif public des championnats

Un championnat terminé ouvre désormais `championship.html?id=<championshipId>`. La page présente les participants réellement publiés, le champion, les huitièmes de finale, les quarts, les demi-finales, la finale et les replays disponibles. Le format standard est une élimination directe à 16 joueurs, avec un seul match par confrontation.

Le récapitulatif accepte les anciens noms de champs déjà présents dans les données (`participantIds`, `participants`, `championshipId`, `tournamentId`, `competitionId`, phases textuelles ou numériques). Une donnée absente reste explicitement indiquée comme non publiée : aucun joueur, résultat, score ou coup n'est inventé. Les replays Mopyon reconstruisent le plateau depuis l'historique des coups ; les autres moteurs utilisent une chronologie générique lorsqu'elle existe.

## 2026-08-17 - Classements de performance

La page publique `ranking.html` présente deux classements réels et séparés : le nombre de championnats où un joueur a atteint au minimum la demi-finale, puis le nombre de championnats auxquels il a effectivement participé. Chaque joueur est compté une seule fois par championnat.

Une qualification au dernier carré est reconnue uniquement depuis une liste explicite de demi-finalistes, finalistes ou vainqueur dans `championships`, ou depuis un match lié au championnat dont la phase publiée contient `demi`, `semi` ou `final`. Une participation est reconnue depuis les listes de participants d'un championnat joué ou depuis un match lié par `championshipId`, `tournamentId`, `competitionId` ou `championshipNumber`. Aucune statistique de démonstration n'est injectée.

## 2026-08-17 - Référencement public de JWETPRO

Le domaine canonique public est `https://jwetpro.com/`, sans sous-domaine `www`. Toutes les pages publiques disposent d'une URL canonique absolue et sont déclarées dans `sitemap.xml`; `robots.txt` autorise leur exploration et référence ce sitemap.

La page d'accueil porte les données structurées `Organization` et `WebSite`. Les aperçus sociaux utilisent une carte JWETPRO dédiée, sans codes visuels de casino ou de paris. Les fichiers `agent.txt` et `llms.txt` décrivent uniquement les contenus publics et rappellent que les espaces authentifiés, les paiements et les données personnelles ne sont pas destinés à la collecte automatisée.

## 2026-08-16 - Aire de jeu Mopyon

La page `play.html` devient l'interface officielle du Mopyon. Le mode entraînement réutilise le moteur tactique local de `mopyonpam/script.js`; ses scores restent locaux et ne modifient jamais les classements, gains ou résultats officiels.

Un match officiel est un document `matches/{matchId}` contenant exactement deux UID dans `participantIds`, un jeu Mopyon, un horaire serveur et l'état du plateau. Le navigateur peut lire un match qui lui est attribué, mais ne peut pas écrire directement son plateau. Les fonctions callable `joinMopyonMatch` et `submitMopyonMove` contrôlent la fenêtre d'accès, le participant, le tour, le coup, la victoire et le résultat dans une transaction Firestore.

La salle ouvre 15 minutes avant l'horaire publié. Le plateau officiel utilise 20 x 20 cases et cinq symboles consécutifs pour gagner, conformément au moteur actuel et au règlement public.

## 2026-08-16 — Assistant client JWETPRO fondé sur des sources officielles

Les réponses automatiques de la conversation privée utilisent Vertex AI depuis Cloud Functions. Le modèle reçoit le dernier message, la langue, au maximum dix messages récents nettoyés et limités à 320 caractères de la même conversation, des extraits pertinents de `assistantKnowledge` et un contexte Firebase public strictement filtré. Le profil complet, les UID, les mots de passe, les jetons et les données d'autres utilisateurs ne sont pas transmis. Les réponses sont structurées, les actions sont limitées par liste blanche et les informations absentes sont signalées clairement.

La base stable est administrée dans le dashboard et conserve une version française et kreyòl. Les championnats, matchs, replays et classements restent des données dynamiques lues au moment de la question. En l'absence de source autoritaire pour une inscription ou un paiement, aucune confirmation n'est produite.

Le serveur refuse les requêtes hors du périmètre JWETPRO avant tout appel au modèle. L'assistant adopte le rôle explicite de coordonnateur virtuel, sans prétendre être humain. Il ne peut encourager une inscription que lorsqu'un championnat Firebase réel est ouvert, et l'action correspondante est filtrée une seconde fois côté serveur.

## Messagerie temps réel - ordre et défilement

Les messages de `communityMessages` sont lus par salon avec `createdAt` serveur en ordre croissant et une limite sur les derniers messages. Les messages de l'utilisateur sont alignés à droite, ceux du coordonnateur à gauche avec une couleur distincte, et les autres joueurs à gauche dans une couleur neutre. L'interface reste en bas uniquement si l'utilisateur lisait déjà le bas ; sinon elle conserve sa position et affiche un indicateur de nouveaux messages. Les règles Firestore exigent un `createdAt` égal à `request.time` à la création et empêchent la modification de cet horodatage.

## 2026-08-18 - Assistance flottante publique

La messagerie communautaire et l'assistance deviennent deux actions flottantes separees. La bulle message ouvre uniquement les salons publics Mopyon et Domino. La bulle assistance ouvre directement `coordinator_<uid>`. Pour un visiteur sans compte joueur, Firebase Auth anonyme fournit un UID technique afin de garder une conversation privee et compatible avec les regles Firestore existantes.

## Création du premier administrateur

Le dashboard vérifie l'absence d'un profil `users` avec `role: admin` via une Cloud Function. Dans ce seul cas, un modal de première configuration permet de créer le premier compte avec un secret de bootstrap séparé. Les créations suivantes sont refusées côté serveur.

## 2026-08-12 — Données de simulation des championnats

- Le dashboard peut publier des données de test dans les mêmes collections Firebase que le site public afin de valider son comportement de bout en bout.
- Chaque championnat, match et résultat simulé porte `simulation: true` et un `simulationRunId` commun. Le nettoyage cible exclusivement cet identifiant.
- La progression est manuelle pour laisser le temps d’inspecter le site à chaque étape et ne dépend pas d’un onglet gardé ouvert.
- Les comptes et paiements ne sont jamais simulés. Les participants sont des noms fictifs intégrés aux documents de test.
- Les capacités 8, 12 et 16 sont utilisées uniquement pour tester des données variées ; elles ne modifient pas le format commercial standard de 16 joueurs.
- Le dashboard exige une session Firebase administrateur avant toute lecture ou écriture de gestion ; les simulations ne contournent jamais les règles Firestore.

## Assistant Gemini pour le coordonnateur

Les suggestions de réponse sont générées uniquement côté Firebase Functions. La clé Gemini est fournie par le secret `GEMINI_API_KEY` et n'est jamais exposée au navigateur. Seul un administrateur authentifié peut demander une suggestion ; l'administrateur doit la relire avant de l'envoyer à l'utilisateur.

## Assistance privée du coordonnateur

La messagerie publique conserve exactement deux salons, `mopyon` et `domino`. Chaque utilisateur authentifié dispose en plus d'une conversation privée identifiée par `coordinator_<uid>`, visible par lui-même et par les administrateurs. Les messages sont stockés dans `communityMessages` et les règles Firestore empêchent un utilisateur de lire la conversation privée d'un autre compte.

## 2026-08-10 — Modele de championnat quotidien V1

Le modele quotidien principal passe de 40 joueurs / 250 HTG / 5 000 HTG a 16 joueurs maximum / 125 HTG / 1 000 HTG au champion.

Cette decision reduit la friction au paiement, facilite le remplissage, ameliore la perception des chances, autorise plusieurs participations et permet plusieurs champions dans une meme journee. Un championnat complet genere theoriquement 2 000 HTG de participations, soit 1 000 HTG brut avant les autres couts ; ce montant n'est pas un benefice net.

Les horaires, jeux, tarifs, gains et statuts sont des donnees modifiables. Les championnats historiques conservent leurs anciennes valeurs.

## 2025-05-20 — Vanilla JS + Vite

HTML/CSS/JavaScript Vanilla avec Vite, donnees separees et base facile a remplacer par une API. React, Vue et architecture surdimensionnee rejetes.

## Choix de langue au premier acces

La page demande une seule fois a l'utilisateur de choisir entre le francais et le kreyol ayisyen. Le choix est conserve dans `localStorage` sous `jwetpro-language`.

Le choix est global : `shared-i18n.js` applique le kreyol a toutes les pages, aux interfaces secondaires et aux contenus ajoutes dynamiquement. Les pages publiques chargees separement reutilisent ce moteur par le header partage.

## Authentification Firebase

Le bouton de connexion ouvre une page d'authentification dediee, connectee a Firebase Authentication. L'inscription publique est ouverte : un visiteur peut creer un compte joueur avec e-mail, nom d'utilisateur et mot de passe, sans verification e-mail. Les regles Firestore autorisent uniquement la creation du profil minimal `users/{uid}` par le proprietaire authentifie, avec `role: user` et des champs limites.

## Page publique des activites

La page `activity.html` lit uniquement les collections publiques `matches` et `championships`. Elle separe les matchs en direct, les replays, les vainqueurs publies et les championnats, avec un etat vide explicite lorsqu'aucune donnee n'est disponible.

## Classement public sans championnat

La page `ranking.html` presente un seul tableau de performance, et non deux cartes concurrentes. Chaque ligne regroupe le joueur, ses participations, ses demi-finales, ses points et son niveau afin de faciliter la comparaison en une seule lecture.

Tant que le classement contient moins de douze joueurs reels, des profils de demonstration completent visuellement les places manquantes. Chaque profil fictif porte explicitement le badge `DEMO`, utilise un avatar illustre non humain, reste uniquement dans l'interface et disparait progressivement lorsque de vrais joueurs sont publies. Les scores de demonstration restent bas et tous les profils, reels ou fictifs, sont tries ensemble par points decroissants. A la connexion, chaque utilisateur publie ou actualise sa propre projection Firestore `leaderboard`, limitee aux champs publics `displayName`, `level`, `points` et `imageName`. Une connexion administrateur synchronise aussi les projections des utilisateurs existants. Seul le proprietaire authentifie ou un administrateur peut ecrire cette projection. La collection privee `users` reste inaccessible en lecture publique.

La homepage affiche uniquement les cinq premiers profils du classement; la modale et la page complete affichent jusqu'a douze profils lorsque les simulations sont necessaires. Le statut de demonstration est indique une seule fois dans l'en-tete, sans badge repete a cote de chaque nom.

Les champions de reference Jean M., Ricardo P. et Nadia L. apparaissent aussi dans le classement simule avec le meme avatar dans les deux composants. Chaque personne visible recoit une image unique; une image deja attribuee ne peut pas etre reutilisee par un autre profil.

Cette identite visuelle est egalement partagee par les cartes de matchs en direct, les replays et les pages publiques : un meme nom conserve le meme avatar que dans le classement. Les joueurs simules visibles dans les matchs sont integres au classement avec un emblème distinct.

Dans la messagerie, les messages de l'utilisateur connecte reprennent toujours la photo de son profil Firebase actuel au lieu de dependre de l'ancienne copie stockee avec le message. En l'absence de photo, les initiales sont affichees; aucun portrait d'un autre joueur ne sert de remplacement.

La barre de progression reste a 0 % quand aucun avancement Firebase n'est disponible. La section ne fabrique plus de valeur visuelle minimale : elle reprend uniquement les donnees du championnat publie le plus proche.

Le palmares de reference affiche un gain de 1 000 HTG par champion et ne montre pas de date. Les cartes de resultats reels suivent la meme presentation.

Le reglement est centralise dans la modale plein ecran de l'accueil, accessible depuis le CTA du hero et depuis les liens de footer via `index.html#rules`. Il ouvre par defaut le jeu du championnat a l'honneur et permet de basculer entre les regles Mopyon et Domino sans page separee.

La décision du 17 août 2026 sur le tableau à élimination directe remplace l'ancien format configurable de cinq confrontations. Le champ historique `championships.rounds` reste lisible pour compatibilité, mais le format public standard comporte désormais quatre phases et 15 matchs.

## 2026-08-17 — Deux moteurs d’entraînement sur la page Jouer

La page `play.html` propose Mopyon et Domino dans un sélecteur commun. Le moteur Mopyon reste intégré au document principal. Le moteur autonome `dominocash/index.html` est chargé à la demande dans une iframe de même origine afin de préserver sa logique, ses styles, ses sons et son cycle de jeu sans collision avec le moteur Mopyon. Il est déchargé lorsque l’utilisateur quitte l’entraînement Domino afin d’éviter qu’un bot, un chronomètre ou une piste audio continue en arrière-plan. Cette intégration concerne uniquement l’entraînement ; les matchs officiels Domino nécessiteront un protocole serveur autoritaire distinct.

## 2026-08-20 — Identité de l’assistant JWETPRO

L’assistant officiel de JWETPRO porte le nom public `Jean Estime`. Ce nom est utilisé dans l’interface d’assistance, les messages automatisés, les indicateurs de réponse et les réponses aux questions d’identité. Les messages historiques ayant `authorRole: assistant` sont également présentés sous cette identité dans l’interface, sans réécriture des documents Firestore existants. Si un utilisateur demande explicitement si Jean Estime est humain ou automatisé, l’assistant répond honnêtement qu’il est l’assistant automatisé de JWETPRO.
## 2026-09-03 - Le match officiel est une serie au meilleur de trois manches

- Le document Firestore `kind: series` est l'unique representation publique et statistique d'un match de championnat.
- Les documents `kind: game` lies par `seriesId` sont des manches internes : ils portent le plateau et les coups, mais ne doivent jamais augmenter le nombre de matchs dans l'activite.
- Deux victoires de manche terminent le match. La progression est effectuee par `advanceMopyonSeries`, transaction serveur idempotente qui enregistre la manche une seule fois, met a jour `seriesScore` et publie la manche suivante si necessaire.
- Un forfait de presence termine toute la serie et donne un score gagnant d'au moins deux manches au joueur present.
- Le replay canonique cible la serie et propose un selecteur pour chacune de ses manches publiees.

## 2026-09-05 — Partage social et invitations vérifiables

- Les partages publics utilisent des instantanés serveur dans `shareEvents`; le navigateur ne choisit jamais lui-même les points, le niveau, l'inscription, la victoire ou la qualification affichés.
- Les pages sociales sont servies par `renderSharePage`, avec des métadonnées Open Graph/Twitter et un retour vers `jwetpro.com` portant l'identifiant de recommandation. Elles utilisent `jwetpro-share.web.app/s/<identifiant>` tant que le DNS de `share.jwetpro.com` n'est pas validé, puis le sous-domaine de marque devient l'origine canonique.
- Les types V1 sont l'arrivée d'un nouveau compte, le profil public, le niveau, l'invitation générique, l'inscription payée confirmée, la victoire officielle et la qualification officielle.
- Le nom et l'avatar n'apparaissent que si `users/{uid}.profilePublic` vaut `true`. L'adresse e-mail, le téléphone, l'UID et les autres champs privés ne sont jamais rendus dans la page partagée.
- Les profils publics sont projetés dans `publicProfiles` par des déclencheurs de confiance. Les clients peuvent lire cette projection mais ne peuvent pas l'écrire.
- L'attribution d'une invitation est enregistrée une seule fois, après connexion d'un nouveau joueur, dans `shareReferrals`. Les auto-invitations et les remplacements d'un parrain existant sont refusés.
- La V1 mesure l'attribution sans distribuer automatiquement une récompense financière ou un coupon. Toute récompense future devra disposer de règles antifraude et d'une validation métier distinctes.

## 2026-09-07 — Programmation quotidienne de la communauté

- Le dashboard enregistre une journée sous `communityDailyPrograms/{AAAA-MM-JJ}` et ses discussions dans des documents séparés, versionnés par révision. La révision active n'est basculée qu'après l'écriture complète des discussions.
- Le moteur choisit d'abord la date locale exacte de Port-au-Prince. En son absence, il applique littéralement la règle produit « jour le plus éloigné » en sélectionnant la plus grande date enregistrée, y compris si elle est future.
- Jusqu'à trois discussions non encore utilisées dans la journée sont jouées simultanément selon leurs décalages, avec des identifiants de messages déterministes pour rendre les reprises idempotentes.
- Les liens `replyTo` ne peuvent viser qu'un message antérieur de la même discussion. Les réponses réelles passent par une fonction callable qui vérifie le parent et conserve un instantané de citation limité.
## 2026-09-07 - Domino officiel, récompenses et coupons

- Une action du bot est persistée par écriture autoritaire, avec un délai serveur de 2 à 3 secondes et un délai court entre les pioches.
- Les points du tour sont crédités à la fin de la série officielle au moyen d'un événement idempotent.
- L'élimination crée un coupon personnel unique : 25 HTG avant la finale, ou une inscription gratuite pour le finaliste.
- Le coupon est réservé et consommé atomiquement lors du checkout de son propriétaire; il n'est jamais modifiable par le client.

## 2026-09-08 — Orchestration serveur des championnats simulés

- La 32e inscription déclenche la clôture et le tableau côté serveur. Les identifiants de séries sont déterministes afin qu'une nouvelle livraison d'événement ne crée jamais un second tableau.
- Les confrontations bot contre bot utilisent `simulationBotJobs`; une transaction empêche les doubles mises en file et un bail protège la reprise d'une exécution interrompue. La concurrence du worker est limitée à six séries.
- Le dashboard ne décide ni du vainqueur ni des points. Il demande l'automatisation, écoute les jobs et affiche leur progression. Une demande individuelle visant une série réelle est refusée; l'action globale ignore ces séries et lance seulement les confrontations 100 % bots.
- Les moteurs produisent des parties complètes au meilleur de trois, avec graines et profils persistés. Les empreintes d'ouverture réduisent la répétition et les nulles sont rejouées au maximum huit fois avant de rendre le job réessayable.
- Les manches sont calculées rapidement, mais leurs dates et leurs coups utilisent un rythme synthétique naturel pour rester cohérents dans les lecteurs de replay existants.
- Les récompenses des joueurs simulés sont inscrites avant la validation terminale de la série; ainsi le tour suivant ne peut pas démarrer avec un total de points incomplet. Aucun coupon d'élimination n'est émis pour eux.
