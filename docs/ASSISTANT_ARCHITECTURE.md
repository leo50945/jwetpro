# Jean Estime — assistant JWETPRO

## Objectif

L'assistant répond uniquement dans la conversation privée `coordinator_<uid>` avec des informations officielles JWETPRO. Jean Estime et son widget sont absents du salon collectif `general` et de `community.html`; aucune réponse d'assistant n'y est créée. Une animation communautaire distincte peut publier une courte conversation autonome entre personnages simulés lorsqu'un joueur réel observe un salon silencieux. Elle ne répond jamais au contenu d'un utilisateur. L'assistant privé ne remplace pas le coordonnateur pour une confirmation de paiement, d'inscription, de résultat ou de litige lorsqu'aucune donnée Firebase autoritaire n'existe.

## Flux

À la première visite sur un navigateur, la sélection de langue reste prioritaire. Cinq secondes après la fermeture de cette modale, le widget privé s'ouvre automatiquement et place toujours en tête un accueil constant de Jean Estime, dans la langue sélectionnée. Pour un navigateur qui possédait déjà une préférence de langue avant l'ajout de ce parcours, le même délai commence après le chargement de la page. Cet accueil est un élément système local et non un document Firestore : il ne peut donc être ni dupliqué ni supprimé. Le serveur ajoute le même accueil au début de `RECENT_CONVERSATION`, afin que l'assistant sache qu'il s'est déjà présenté et réponde directement au premier besoin du visiteur.

1. Le joueur authentifié écrit un message privé dans `communityMessages`.
2. La règle Firestore impose son UID, `authorRole: user`, la langue, un texte de 1 à 2 000 caractères et un horodatage serveur.
3. `autoReplyToCoordinatorMessage` traite uniquement le dernier message créé dans la conversation de ce joueur.
4. Le serveur classe d'abord la demande. Une demande hors sujet reçoit une réponse bilingue déterministe sans appel à Groq.
5. La fonction sélectionne au maximum huit documents pertinents dans `assistantKnowledge` et charge uniquement les données publiques nécessaires dans une liste blanche de collections.
6. Groq reçoit la langue, le dernier message, au maximum dix messages récents nettoyés et limités à 320 caractères de la même conversation, les extraits officiels et le contexte Firebase filtré. Aucun UID, mot de passe, jeton, profil complet ou message d'un autre utilisateur n'est transmis.
7. La réponse JSON est validée, limitée à 2 000 caractères puis enregistrée comme message `authorRole: assistant`, avec `isInScope`, `conversationTopic` et au maximum trois actions autorisées.

La langue est détectée à partir de chaque message; la préférence enregistrée sert uniquement lorsque le texte est ambigu. Les salutations simples sont traitées localement avec une réponse chaleureuse et bilingue. Les références explicites à des compétitions ou clubs externes, notamment le Real Madrid, sont classées hors sujet même si le message contient le mot « match ». Les variantes kreyòl courantes ou mal orthographiées de la participation (`patisipe`, `patissipe`) sont reconnues.

Les remerciements (`merci`, `mesi`, `messi`), salutations et questions de bien-être (`comment vas-tu`, `koman w ye`) utilisent des réponses sociales dédiées et variées côté serveur. Le coordonnateur ne présente pas spontanément sa nature technique; il reste honnête uniquement si l'utilisateur l'interroge explicitement à ce sujet.

La création de compte est aussi un parcours déterministe bilingue : les formulations françaises et kreyòl, y compris des variantes courantes mal orthographiées, reçoivent les étapes officielles et l’action `open_signup` sans dépendre du fournisseur de modèle.

Les questions d'identité (`qui es-tu`, `comment tu t'appelles`, `kiyes ou ye`) reçoivent une réponse locale qui le présente comme Jean Estime, l'assistant officiel de JWETPRO. Le terme « virtuel » est exclu de cette présentation. Une question explicite sur son caractère humain ou automatisé reste traitée honnêtement : Jean Estime est alors présenté comme l'assistant automatisé de JWETPRO.

Le filtre distingue trois états : demande JWETPRO reconnue, demande explicitement hors sujet et formulation inhabituelle. Seules les demandes explicitement hors sujet ou malveillantes sont refusées localement. Une formulation inhabituelle est transmise au modèle avec le contexte récent afin qu’il en comprenne l’intention malgré les fautes et abréviations; une question de précision n’est utilisée que si le sens reste réellement indéterminable.

## Sources de vérité

- Stable : `assistantKnowledge`, administrée depuis le dashboard, avec une base bilingue intégrée comme secours officiel. Quatre fiches versionnées (`championship-format`, `championship-rewards`, `championship-lifecycle`, `match-series-and-replay`) alimentent aussi directement `guide.html`; le Guide et Jean Estime présentent donc la même règle. Une fiche Firebase plus ancienne que la version intégrée ne peut pas écraser une règle officielle plus récente.
- Dynamique : `championships`, `matches` et une projection anonymisée de `leaderboard`. Pour une question sur les matchs, le contexte privé contient uniquement les rencontres du joueur authentifié, sans UID transmis au modèle; les manches sont regroupées sous leur série parent et l’action sûre (`rejoindre_le_match` ou `revoir_le_replay`) est calculée côté serveur.
- Non disponibles : aucune collection autoritaire d'inscriptions et de paiements n'est actuellement définie. L'assistant ne confirme donc jamais ces opérations.

La base bilingue intégrée couvre aussi la création publique d’un compte sans vérification d’e-mail et son parcours exact, le cycle des championnats, le tableau à élimination directe, les matchs au meilleur de trois manches, le forfait de présence de cinq minutes, le comportement des adversaires simulés, les replays multiman­ches, l’entraînement Mopyon et Domino, le barème de points, les niveaux, les archives et la séparation stricte entre Jean Estime et l’animation du groupe communautaire.

## Sécurité

- La clé Groq est stockée dans les secrets Cloud Functions et n'est jamais présente dans le navigateur.
- Avant son utilisation dans l’en-tête HTTP, la clé Groq est nettoyée des marqueurs Unicode invisibles (`U+FEFF`, espaces sans largeur) qui peuvent être introduits lors d’un copier-coller.
- Huit demandes maximum par utilisateur et par minute via `assistantRateLimits`.
- Actions frontend limitées à des identifiants connus; aucune URL générée par le modèle n'est utilisée. Les parcours guidés couvrent la création de compte, le guide du site, le calendrier et l'inscription, les jeux Mopyon/Domino, « Mes matchs », les directs, les replays, le classement et les règlements.
- Les intentions de création de compte, d'inscription, de jeu et d'accès à un match reçoivent aussi une action déterministe côté serveur. Le bouton utile ne dépend donc pas uniquement du choix du modèle.
- L'action d'inscription est supprimée côté serveur lorsqu'aucun championnat Firebase réel n'a le statut `registration-open` ou `open`.
- Le contexte récent est limité aux dix derniers messages nettoyés du salon privé de l'utilisateur et sert à comprendre les relances, les pronoms et les formulations elliptiques. Les sujets génériques de clarification ne masquent plus un sujet JWETPRO spécifique plus ancien.
- Une réponse Groq JSON incomplète est retentée une fois avec une marge de génération supérieure. En cas d'échec technique persistant, le message de secours reste cohérent avec le rôle de l'assistant et ne renvoie pas vers un autre coordonnateur.
- En cas d’échec technique, Jean Estime utilise au maximum deux messages d’attente courts et différents dans une fenêtre de quinze minutes. Le deuxième ouvre `assistantEscalations` pour le module Messages du dashboard. À partir de la troisième demande en échec, aucun nouveau message automatique n’est publié et la conversation reste attribuée à l’équipe humaine.
- Si le modèle est temporairement indisponible mais que l’intention JWETPRO et une information officielle sont déjà connues, Jean répond depuis la base intégrée avec l’action utile au lieu d’annoncer une panne.
- Le ton commercial explique la valeur réelle des championnats et suggère une prochaine étape utile sans pression, fausse urgence, promesse de gain ni donnée inventée.
- Les écritures de la base de connaissances sont réservées au custom claim `admin: true`. La lecture publique est limitée par identifiant aux quatre fiches officielles affichées dans le Guide; les autres fiches restent privées.
- Les retours sont stockés dans `assistantFeedback`; les demandes humaines dans `assistantEscalations`.
- Les documents internes de limitation restent inaccessibles aux clients.

## Exploitation

Le dashboard permet d'initialiser, rechercher, créer, modifier, désactiver et supprimer les informations officielles. Une réponse humaine résout automatiquement l'escalade ouverte correspondante.

Le déploiement doit inclure les Functions et les règles Firestore. Le secret `GROQ_API_KEY` doit être défini dans le projet `mopyonlakay` pour les fonctions privées qui utilisent le modèle.
