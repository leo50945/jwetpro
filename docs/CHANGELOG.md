# Changelog

- 2026-09-19 : le module « Messages privés » dispose maintenant d’une vraie colonne desktop avec sa liste de conversations, en plus de son affichage mobile.
- 2026-09-19 : les règles globales qui masquaient « SALONS », « Groupe » et « Messages privés » sont maintenant neutralisées sur la page communauté desktop.
- 2026-09-19 : l’animation communautaire s’arrête dès qu’un visiteur ouvre ou utilise la zone de saisie, avant même l’envoi du message, afin d’éviter qu’un message simulé apparaisse pendant qu’il écrit.
- 2026-09-19 : la simulation communautaire transmet maintenant le contexte détecté (match live, replay, championnat, Domino ou Mopyon) et privilégie les conversations programmées qui portent le même contexte.
- 2026-09-20 : le profil public affiche explicitement l’action « Suivre » avec un état accessible « Abonné » ou « Suivre en retour », et conserve cet état après actualisation du profil.
- 2026-09-20 : l’authentification Google est maintenant visible dans la fenêtre de connexion et initialise automatiquement le profil JWETPRO lors de la première connexion Google.

- 2026-09-16 : les comptes à rebours du hero sont maintenant actualisés chaque seconde et affichent les secondes restantes pour un suivi en temps réel.

- 2026-09-16 : les identifiants simulés sans projection sociale sont maintenant reconnus comme des profils privés, au lieu de renvoyer un état « profil indisponible ».

- 2026-09-16 : l’espace inférieur du hero mobile est maintenant utilisé comme panneau de contexte du match (statut officiel et format meilleur de trois manches), avec une hauteur stable et une navigation intégrée.

- 2026-09-16 : le hero mobile s’adapte maintenant à la hauteur réelle de chaque diapositive, notamment les matchs à venir/en cours, sans laisser de zone vide sous le visuel.

- 2026-09-16 : les actions sociales des cartes de matchs utilisent maintenant une disposition intégrée au flux de la carte, avec un fond clair et une marge dédiée pour éviter tout recouvrement des joueurs.

- 2026-09-16 : la page `progress.html` utilise désormais le statut d’inscription du joueur connecté (participant public ou ticket payé) pour remplacer « S’inscrire au championnat » par « Voir le championnat ».

- 2026-09-16 : la section « Progression du championnat » vérifie aussi l’inscription personnelle payée dans `championshipTicketRegistrations`, même avant la synchronisation publique des participants. Le bouton devient alors immédiatement « VOIR LE CHAMPIONNAT ».

- 2026-09-16 : les CTA d’un championnat déjà rejoint par le joueur connecté affichent désormais « VOIR LE CHAMPIONNAT » au lieu de proposer une nouvelle inscription. Cette règle est appliquée au héros, au calendrier, à l’activité et aux cartes de jeu, après résolution de l’authentification.

- 2026-09-16 : la carte du prochain championnat réserve désormais un espace inférieur suffisant pour afficher clairement le prix d’entrée, le gain et l’action d’inscription, sans découpe du contenu.

- 2026-09-16 : toute la ligne d’un joueur dans le classement est désormais cliquable et accessible au clavier pour ouvrir son profil; les liens internes de l’avatar et du nom restent compatibles avec le tri des colonnes.

- 2026-09-16 : les joueurs du classement sont accessibles via leur profil social; un profil réel privé affiche désormais un état privé explicite, et les profils simulés restent toujours privés même si une ancienne donnée les déclarait publics.

- 2026-09-15 : les cartes d’activité de la page d’accueil ne sont plus limitées à une hauteur fixe sur mobile; le statut, les actions sociales et le bouton d’inscription restent entièrement visibles et accessibles.

- 2026-09-15 : la carte « Progression du championnat » adopte une mise en page mobile-first finale : titre et statut adaptatifs, métriques en grille lisible, libellés autorisés à revenir à la ligne et bouton d’inscription pleine largeur sans débordement sur les petits écrans.

- 2026-09-13 : les actions J’aime et Partager disposent désormais d’une cible tactile minimale de 44 × 44 px sur mobile. La feuille immuable `social-system-v5.css` contourne le cache CDN sur toutes les pages, avec un test anti-régression dédié.

- 2026-09-13 : le protocole de déploiement social reflète désormais l’état réel de production, les versions de cache `social-v4`/`social-favorites`, l’étape de backfill encore requise et la dépendance DNS de `share.jwetpro.com`.

- 2026-09-13 : la cloche de notifications sépare désormais la liste des 30 événements récents du compteur des notifications non lues. Le badge reste exact jusqu’à 99 puis affiche `99+`; « Tout marquer comme lu » traite automatiquement plusieurs lots de 100.

- 2026-09-13 : « Mes favoris » fusionne désormais les favoris sociaux paginés et les anciens `favoriteGames` reconnaissables. Un ancien match ou championnat déjà présent dans la nouvelle collection est dédupliqué, tandis que les entrées historiques sans identité canonique restent visibles et supprimables pendant la migration. La ressource principale est versionnée à nouveau afin d’éviter qu’un ancien cache masque ce correctif.

- 2026-09-13 : validation du backfill social sous Auth/Firestore Emulator : accès réservé à l’administration, projection minimale des profils privés, persona simulée stable réutilisée et absence de fusion entre deux anciennes identités simulées homonymes. Les suites Emulator sociales passent désormais avec six tests actifs, sans test ignoré.

- 2026-09-13 : clarification du guide et de la confidentialité sociale : les entraînements, championnats annulés et manches individuelles ne constituent pas des favoris distincts; l’accès administratif à une conversation privée est limité au traitement d’un signalement lié. Les traductions françaises/créoles et l’état de publication de la roadmap sont synchronisés. Le test Emulator du backfill vérifie désormais l’autorisation administrateur, la confidentialité des statistiques et l’absence de fusion entre deux anciennes identités simulées ambiguës.

- 2026-09-10 : publication ciblée des fonctions sociales, règles et index Firestore sur `mopyonlakay`. Face au quota CPU Cloud Run saturé en `us-central1`, les listes privées d’abonnés et d’abonnements utilisent désormais un endpoint authentifié unique `listSocialRelationships` en `us-east1`; son refus `401` hors connexion est vérifié en production. Aucune fonction de jeu, de paiement ou d’assistance n’a été redéployée.

- 2026-09-10 : les contenus sociaux ajoutés après chargement Firestore dans le profil et la messagerie privée respectent désormais immédiatement la langue Français/Kreyòl. Un test de couverture protège la présence des actions sociales sur le hero, Calendrier/Live, Activité, Mes matchs, Progression, Champions et les archives, ainsi que l’exclusion des manches individuelles.

- 2026-09-09 : validation locale complète de la couche sociale avec Auth/Firestore Emulator : confidentialité des favoris, notifications, compteurs privés et conversations; refus des écritures client sur toutes les projections serveur; likes idempotents, regroupement des manches sous leur série, abonnements réciproques, lecture seule après désabonnement, blocage, signalement lié à la conversation et exclusion des joueurs simulés comme acteurs. Le panneau de notifications expose son état, piège le focus, se ferme avec Échap ou au clic extérieur et reste contenu dans l’écran mobile. Les versions des ressources sociales sont renouvelées sur toutes les pages concernées.

- 2026-09-08 : ajout de la couche sociale JWETPRO : partage public et J’aime/favoris sur les championnats et matchs officiels, fiches joueurs réels ou simulés, abonnements, compteurs, notifications internes, paliers d’abonnés partageables et messagerie privée réciproque avec lecture seule, blocage et signalement. Les identités simulées du dashboard sont désormais stables entre les simulations, tandis que les anciens homonymes sans identifiant déclaré restent distincts. Les actions sociales du hero restent visibles sous l’en-tête sur ordinateur et mobile; la reconstruction du répertoire supprime aussi les statistiques précédemment publiques lorsqu’un joueur rend son profil privé. Les longues listes de favoris, abonnés et abonnements sont paginées; la fenêtre de partage piège correctement le focus, se ferme avec Échap et restitue le focus au bouton d’origine. La lecture administrative d’un échange privé exige désormais un signalement lié à cette conversation. Les manches individuelles sont exclues des actions sociales et toutes les vues utilisent la série parente comme match canonique.

- 2026-09-08 : dans `progress.html`, le nom d’un participant est désormais barré dès que le match officiel complet est terminé et confirme sa défaite, donc son élimination du championnat. Les manches enfant sont explicitement exclues du calcul et les ressources sont versionnées afin que cet état apparaisse immédiatement.

- 2026-09-08 : la page `champions.html` respecte désormais le choix global Français/Kreyòl, y compris les textes chargés depuis JavaScript, les états vides et d’erreur, la recherche, les compteurs, les libellés accessibles, les dates et le titre de page. Les parcours autonomes d’inscription/paiement et la page publique de partage chargent maintenant aussi le moteur linguistique commun.

- 2026-09-07 : correction de la faible variété dans Community. Chaque conversation animée utilise désormais quatre à six personnages choisis en priorité parmi ceux qui n’ont pas encore parlé dans la journée. Une page restée ouverte peut demander de nouvelles discussions après le délai serveur de trois minutes; les scénarios et les couples personnage/message restent non répétables pendant la journée, et seuls les 15 derniers messages sont chargés.
- 2026-09-07 : lors de la première visite, le choix de langue reste prioritaire puis la discussion privée s'ouvre automatiquement après un délai de cinq secondes, avec l'accueil permanent de Jean Estime en français ou en kreyòl. Ce message système reste toujours en tête sans être dupliqué dans Firestore et fait aussi partie du contexte reçu par l'assistant.
- 2026-09-06 : le plateau d’un match Domino officiel charge désormais exactement le moteur visuel `dominocash` déjà utilisé par l’entraînement, sur desktop et mobile. L’état officiel et la main privée sont synchronisés par un pont de même origine, tandis que chaque coup continue d’être validé par les Cloud Functions; l’ancien plateau HTML recréé et comprimé a été retiré du parcours actif.

- 2026-09-05 : les championnats Domino disposent désormais du même parcours officiel que Mopyon sur le site et dans le dashboard : match personnel prioritaire dans le hero, une seule ligne par confrontation dans « Mes matchs », accès joueur, moteur serveur autoritaire, adversaire simulé Débutant, délai de présence de cinq minutes entre deux vrais joueurs, meilleur de trois manches et replay regroupé. Les mains et la pioche ont été retirées des documents publics et sont servies individuellement aux participants authentifiés.

- 2026-09-05 : ajout du système de partage JWETPRO. Un nouveau joueur reçoit une proposition de partage après la création de son compte; il peut ensuite partager son profil public, son niveau, une invitation, une inscription payée et une victoire/qualification officielle via une carte serveur avec métadonnées sociales. Les accomplissements sont vérifiés côté Firebase, les données privées restent exclues, un réglage permet de rendre le profil public ou privé et les recommandations sont attribuées une seule fois après authentification.
- 2026-09-05 : le laboratoire multi-simulations affiche désormais un bloc distinct « Championnat à administrer ». Le sélecteur présente chaque simulation avec son jeu, son numéro, ses inscriptions et son statut; un résumé confirme que toutes les commandes d’inscription, d’avancement et de suppression s’appliquent exclusivement au championnat sélectionné.
- 2026-09-05 : correction de la création des simulations après le renforcement de la limite d’inscriptions. Le document Firestore est désormais initialisé avec `participants: []`, cohérent avec `registeredCount: 0` et avec `validChampionship`; la création n’est donc plus rejetée à tort par les règles de sécurité pour un administrateur authentifié.
- 2026-09-05 : le laboratoire du dashboard peut désormais conserver et administrer plusieurs simulations de championnat en parallèle. Le bouton de création reste disponible lorsqu’une simulation existe déjà, un sélecteur permet de basculer entre elles, et l’inscription, le bracket, les matchs ainsi que la suppression restent strictement limités à la simulation affichée. Après une suppression, le dashboard sélectionne automatiquement la simulation restante la plus récente.
- 2026-09-05 : le laboratoire de simulation du dashboard ne peut plus dépasser les 32 inscriptions. Le remplissage automatique tient compte des joueurs réels ajoutés manuellement, les inscriptions sont validées avec une transaction Firestore résistante aux doubles clics et aux onglets concurrents, les règles refusent tout compteur ou tableau supérieur à `maxPlayers`, et une ancienne simulation à 33 est ramenée automatiquement à 32 lors de sa restauration.
- 2026-09-04 : le format officiel passe à 32 joueurs et cinq tours, avec 2 000 HTG au champion. Le deuxième reçoit un coupon d’inscription gratuite et les autres participants un coupon de réduction de 25 HTG; chaque coupon est personnel, non transférable, non cumulable, valable une seule fois uniquement pour le prochain championnat publié Domino ou Mopyon, puis expire. Les fiches versionnées de `assistantKnowledge` alimentent désormais Jean Estime et la page Guide afin de conserver une seule source officielle modifiable depuis le dashboard.
- 2026-09-04 : les liens suggérés par Jean Estime sont désormais présentés dans un bloc contrasté « Accès rapide » qui explique explicitement qu’un clic ouvre la page correspondante. Les actions occupent toute la largeur, utilisent un style de bouton évident sur mobile et ordinateur, et ferment automatiquement la modale d’assistance avant la navigation.
- 2026-09-04 : correction de la cause des échecs Groq : un caractère Unicode invisible `U+FEFF` présent dans le secret est désormais retiré avant de construire l’en-tête d’authentification. Les formulations inhabituelles sont interprétées sémantiquement avec le contexte de la conversation au lieu d’être bloquées par une correspondance exacte; en cas d’indisponibilité du modèle, une réponse officielle locale est utilisée lorsqu’elle existe.
- 2026-09-04 : Jean Estime reconnaît aussi « enscri sou site » et ses variantes fautives comme une demande de création de compte. Son ancien message technique répétitif est remplacé par deux attentes courtes et différentes; le second échec ouvre une escalade visible dans le module Messages du dashboard, puis Jean cesse de répondre automatiquement jusqu’à l’intervention humaine.
- 2026-09-04 : les procédures de Jean Estime utilisent désormais des paragraphes et des étapes sur des lignes séparées pour une lecture claire. Le rendu conserve ces retours à la ligne et les scripts/styles concernés sont versionnés afin que les boutons d’accès rapide, notamment « Kreye kont mwen », ne restent pas masqués par un ancien cache. La FAQ ne contient plus l’ancienne règle contradictoire sur la création publique de compte.
- 2026-09-04 : correction du secours technique reçu pour « mwn ta renmen kreyre on kont ». Les demandes de création de compte sont maintenant reconnues malgré les fautes kreyòl courantes et traitées localement avec les étapes officielles et le bouton « Kreye kont mwen », sans dépendre de Groq.
- 2026-09-04 : Jean Estime guide désormais précisément tout visiteur pour créer un compte public sans vérification d’e-mail, comprendre JWETPRO, s’inscrire à un championnat et accéder aux jeux ou à « Mes matchs ». Ses réponses peuvent afficher jusqu’à trois boutons d’accès rapide issus d’une liste d’URL locale fermée; le modèle ne peut pas fabriquer de lien. Le lien « Créer mon compte » ouvre directement le formulaire en mode inscription depuis toutes les pages.
- 2026-09-04 : la base bilingue et le contexte Firebase de Jean Estime sont synchronisés avec les fonctions actuelles du site : cycle et tableau des championnats, meilleur de trois manches, forfait de présence, bot simulé, replay complet, « Mes matchs », entraînement Domino Débutant, points/niveaux, archives et animation communautaire distincte. Le contexte personnel regroupe les manches sans transmettre les UID au modèle.
- 2026-09-04 : « Mes matchs » dans `play.html` regroupe désormais toutes les manches sous une seule confrontation. Le bouton de la ligne passe de « Rejoindre le match » à « Revoir le replay », le replay s’ouvre sur la série complète, et les lignes sont retirées dès que leur championnat est terminé.
- 2026-09-03 : dans la modale de résultat Mopyon, le bouton « Passer à la manche suivante » respecte désormais réellement son état masqué lorsque la rencontre est gagnée 2–0 ou 2–1. Il reste disponible seulement après une manche intermédiaire.
- 2026-09-03 : la grille Mopyon des matchs officiels conserve désormais 20 lignes et 20 colonnes strictement identiques. Les symboles sont contenus dans leur cellule et ne peuvent plus déformer le plateau.
- 2026-09-03 : sélectionner Domino dans l’entraînement de `play.html` ouvre maintenant directement une partie au niveau Débutant, sans afficher la fenêtre de choix du niveau.
- 2026-09-03 : les messages d’animation de `community.html` ont désormais exactement la même carte et les mêmes champs visibles qu’un message normal. Les champs `simulationLabel`, `automated` et le rôle spécial ne sont plus écrits; l’identifiant auteur invisible suffit à préserver les règles d’arrêt de la simulation.
- 2026-09-03 : l’animation du salon `general` est réactivée sans réintroduire les réponses de Jean Estime. Après cinq secondes de silence avec un vrai lecteur présent, `startCommunitySimulation` peut publier une courte conversation autonome. Elle s’arrête dès qu’un utilisateur écrit ou qu’aucune présence récente ne subsiste, avec verrou serveur et délai de dix minutes contre les répétitions.
- 2026-09-03 : `champions.html` reprend l’organisation professionnelle des archives de replays : recherche prioritaire par champion ou compétition, regroupement par date, un menu dépliable par championnat, compteur dynamique et fiche du vainqueur responsive avec date de validation et prix officiel.
- 2026-09-03 : `live.html?view=replays` adopte une archive structurée pour les volumes importants : barre de recherche prioritaire, regroupement chronologique par journée, championnats dépliables avec compteur de matchs, filtrage instantané et états vides accessibles. Le championnat le plus récent est ouvert par défaut et la présentation passe de trois à deux puis une colonne selon l’écran.
- 2026-09-03 : `community.html` devient une messagerie exclusivement entre joueurs réels. Le déclenchement de conversations simulées, la réponse automatique de Jean Estime, les contrôles d’évaluation de l’assistant et le widget d’assistance privé sont retirés de cette page ; les anciens messages automatiques sont filtrés de l’affichage. Les fonctions serveur `startCommunitySimulation` et `autoReplyToGroupMessage` sont retirées du code.
- 2026-09-03 : le tableau de `progress.html` affiche désormais le score officiel final de chaque match best-of-3 depuis `seriesScore`. Dans `play.html`, la modale attend le score de la série et détecte immédiatement la deuxième victoire : la modale finale ne propose plus de manche suivante, que le joueur connecté ait gagné ou perdu.
- 2026-09-03 : `startCommunitySimulation` déclare explicitement `invoker: public` et son service Cloud Run accorde uniquement `roles/run.invoker` à `allUsers`, afin d'autoriser le préflight CORS depuis le navigateur. La sécurité applicative reste assurée par le refus des appels sans compte Firebase réel ; vérification effectuée avec un préflight `204` et un appel non authentifié rejeté en `401`.
- 2026-09-03 : les confrontations officielles sont désormais gérées comme des matchs au meilleur de trois manches. Une modale permet au participant de passer à la manche suivante, le premier à deux victoires remporte le match, la progression serveur est idempotente, le replay regroupe toutes les manches avec un sélecteur, et les pages d’accueil/activité ne comptent plus les manches comme des matchs indépendants. Le dashboard de simulation relit aussi l’état publié avant toute reprise ou validation afin d’éviter un double comptage.
- 2026-09-03 : le fournisseur du modèle de langage de l'assistant JWETPRO (« Jean Estime »), de la suggestion de réponse coordonnateur et de la simulation communautaire passe de Gemini (Vertex AI / clé `GEMINI_API_KEY`) à Groq (API compatible OpenAI, clé secrète `GROQ_API_KEY`, modèle `openai/gpt-oss-120b`). Voir `docs/DECISIONS.md`.
- 2026-09-03 : les matchs Mopyon entre deux joueurs réels appliquent désormais un délai de présence de 5 minutes à partir de l'arrivée du premier joueur, avec forfait de temps automatique et motif visible dans le résultat/replay. Face à un participant simulé, le match démarre immédiatement et le bot joue côté serveur sans délai de présence.
- 2026-09-03 : une confrontation Mopyon planifiée contre un joueur simulé crée désormais automatiquement sa première manche lorsqu'un vrai joueur choisit « Antre nan match la », puis ouvre directement le plateau au lieu de rester sur l'attente d'une publication organisateur.
- 2026-09-03 : correction de la réponse de `joinMopyonMatch` pour les parties contre bot : une échéance absente est renvoyée comme `null` et non `NaN`, ce qui évite le rejet JSON observé après la création réussie du plateau. La détection des joueurs lit aussi les marqueurs `player1.real` et `player2.real` produits par le dashboard de simulation.

- 2026-09-03 : l'attente du plateau dans `play.html` utilise désormais une carte centrale sombre et responsive, distincte de la grille de jeu, avec une hiérarchie visuelle et un statut accessibles.

- 2026-09-03 : dans le hero de l'accueil, « Voir le match planifié » est remplacé par « Antre nan match la ». Pour une série dont le plateau n'est pas encore publié, la route joueur ouvre une salle d'attente et bascule automatiquement vers la première manche lorsqu'elle devient disponible.

- 2026-09-03 : les cartes de match de `activity.html` résolvent désormais les joueurs depuis `participantIds` et `participantNames`, puis enrichissent leur identité avec le profil public du classement afin d'afficher leur vrai nom et leur photo lorsqu'elle est publiée.

- 2026-09-03 : les actions des matchs en direct sont personnalisées sur l'accueil, l'activité, la page Live, la progression et la page Jouer. Un participant rejoint son propre match via `play.html?join=...`; seul un non-participant utilise le mode spectateur `play.html?match=...`.

- 2026-09-03 : le hero mobile retrouve sa composition verticale professionnelle : informations en haut et visuel pleine largeur en bas. La grille mobile neutralise explicitement les colonnes héritées de l'ordinateur ; la carte « votre prochain match » suit la même hiérarchie et conserve tout son contenu dans les `95vh` du hero.

- 2026-09-03 : la page d'accueil dispose désormais d'un grand hero en carrousel. Les matchs attribués au joueur connecté passent en premier avec les deux profils et l'action « Rejoindre le match », suivis des inscriptions ouvertes, des championnats en cours et des autres événements planifiés.

- 2026-09-03 : `play.html?join=<matchId>` ouvre l'espace du match en mode joueur après vérification de l'UID participant ; un visiteur non connecté ou non attribué ne peut pas utiliser cet accès personnel.

- 2026-09-03 : les cartes du carrousel principal occupent toute la largeur de l’écran, sans marges latérales, sur ordinateur et mobile.

- 2026-09-03 : la hauteur totale du hero et de son carrousel est limitée à `95vh`; les cartes et leurs visuels se redimensionnent désormais à l’intérieur de cette hauteur.

- 2026-09-03 : le hero recharge maintenant les matchs avec une requête personnelle `participantIds array-contains UID` après restauration de la session Firebase. Les confrontations planifiées de type `series` sont également reconnues et passent avant les championnats.

- 2026-09-03 : dans la page de classement, le barème des points et des niveaux est maintenant placé dans un bloc repliable, fermé par défaut et accessible au clavier.

- 2026-09-03 : sur mobile, seul le tableau des joueurs défile horizontalement ; l’en-tête du classement et le menu du barème restent fixes et occupent toute la largeur de la carte.

- 2026-08-24 : tous les boutons publics « Regarder le match / Gade match la » de l'accueil, de l'activité, de la page live et du tableau de progression ouvrent désormais `play.html?match=...`; `play.html` fournit un mode spectateur public en temps réel, strictement en lecture seule, avec plateau Mopyon ou dominos publiés et retour vers les directs.

- 2026-08-24 : le statut du hero recoupe désormais le championnat affiché avec les documents publics de `matches` (`championshipId`, `tournamentId`, `competitionId` ou numéro), afin qu'un match live ou terminé fasse immédiatement passer le hero à « En cours », même si le document du championnat indique encore que les inscriptions sont fermées.

- 2026-08-24 : lorsque le championnat a commencé, possède un match en direct ou au moins un résultat joué, le hero remplace le compte à rebours par le statut bilingue « Championnat déjà commencé — En cours ».

- 2026-08-24 : le hero masque désormais le compte à rebours dès la fermeture des inscriptions et affiche à sa place un statut bilingue « Inscriptions complètes ».

- 2026-08-24 : suppression des trois matchs de démonstration affichés sur l'accueil en l'absence de données; la section des matchs présente désormais un état vide professionnel et réserve un message distinct aux erreurs de chargement.

- 2026-08-20 : l'assistant officiel JWETPRO adopte l'identite `Jean Estime` dans l'interface, les messages, les indicateurs de reponse, les donnees Firestore nouvellement creees et les consignes du chatbot; les questions d'identite sont traitees en francais et en kreyol.

- 2026-08-20 : clarification des options du profil avec une entree `Changer le mot de passe` pour le formulaire Firebase et une entree distincte `Securite et confidentialite` menant vers `privacy.html`, avec traduction francaise et kreyol.

- 2026-08-20 : versionnement du style commun des pages FAQ, Confidentialite et Reseaux sociaux afin que la correction du contenu masque par le header fixe soit appliquee sans ancien cache.

- 2026-08-20 : correction de l'espacement supérieur de `activity.html` pour que le header fixe ne masque plus le libellé et le haut du hero sur mobile ou desktop.

- 2026-08-20 : ajout d'un rendu SVG local de secours dans le shell partage afin d'afficher les icones de navigation, d'accueil, de connexion, de messages et d'assistance sans bibliotheque externe, notamment sur `champions.html`.

- 2026-08-20 : correction de l'espacement supérieur des pages d'information sur mobile et desktop afin que le header fixe ne masque plus le contenu, notamment sur `champions.html`.

- 2026-08-18 : ajout du bareme officiel de points et des niveaux automatiques dans le reglement, le classement public, le classement d'accueil et le profil joueur.

- 2026-08-18 : retrait du hero et du bandeau d'explication officielle de la page `ranking.html` pour laisser le classement plus direct et discret.

- 2026-08-18 : correction des lectures publiques de matchs sur le classement, l'activite et l'accueil afin de respecter les regles Firestore et eviter l'erreur `Missing or insufficient permissions`.

- 2026-08-18 : refonte de `ranking.html` en une seule carte de classement avec colonnes joueur, participation, demi-final, points et niveau.

- 2026-08-18 : suppression de la page Reglement separee; les liens Reglement des footers, du guide, de la communaute et des references publiques pointent desormais vers la modale de reglement de l'accueil via `#rules`.

- 2026-08-18 : ajout d'une bulle flottante d'assistance distincte de la bulle message sur les pages publiques; elle ouvre directement la conversation du coordonnateur et accepte les visiteurs sans compte via Firebase Auth anonyme. La section coordonnateur a ete retiree de la modal communautaire.

- 2026-08-18 : ouverture de la creation de compte joueur au public depuis l'ecran de connexion, avec nom d'utilisateur, e-mail, mot de passe, sans verification e-mail; ajout de la creation automatique d'un profil joueur minimal et restriction Firestore au proprietaire du compte.

- 2026-08-17 : ajout du lecteur de replay Mopyon dans `play.html`, ouverture par identifiant de match depuis les cartes d'activite, commandes coup par coup et replay deterministe clairement etiquete pour les simulations sans historique enregistre.

- 2026-08-17 : création de `championship.html`, page publique de récapitulatif des championnats terminés avec participants, champion, tableau à élimination directe de 16 joueurs, résultats et replays coup par coup lorsqu'ils sont publiés ; les actions « Revoir le championnat » de l'accueil et de l'activité ouvrent désormais le bon championnat.

- 2026-08-17 : ajout d'un bouton « S’inscrire au prochain championnat » dans l'état vide de l'onglet `Mes matchs`, avec redirection vers le parcours de participation et traduction kreyòl.

- 2026-08-17 : remplacement du classement public par deux palmarès officiels calculés sans données fictives : nombre de qualifications au minimum en demi-finale et nombre de championnats joués, avec déduplication par joueur et championnat.

- 2026-08-17 : ajout du choix Mopyon ou Domino dans l’entraînement de `play.html`, avec sélecteur et réglages Mopyon compacts, intégration directe du moteur `dominocash` et refonte professionnelle du choix de niveau Domino.

- 2026-08-17 : affichage de la photo publique de chaque champion sur `champions.html`, reliée au même profil `leaderboard` que le classement avec un avatar illustré stable en secours.

- 2026-08-17 : suppression de la page Contact, de son entrée dans le sitemap et de ses liens dans tous les footers ; la FAQ oriente désormais vers l’assistance privée JWETPRO.

- 2026-08-17 : limitation de chaque section de `activity.html` aux trois éléments les plus pertinents, tri des matchs par activité récente et ajout de liens « Voir plus » vers les matchs, champions et championnats complets.

- 2026-08-17 : correction de `live.html` pour exclure totalement les matchs terminés et les replays, expiration des statuts live après 1 h 30 et ajout d’un état vide premium avec prochain rendez-vous, calendrier et résultats.

- 2026-08-17 : activation des cinq rubriques de la page Profil avec vues dédiées responsive, édition sécurisée des champs personnels autorisés, changement de mot de passe Firebase, préférences de confidentialité et notifications, consultation des groupes et gestion des favoris.

- 2026-08-17 : mise en place du référencement technique de `jwetpro.com` avec métadonnées uniques, URL canoniques, Open Graph, Twitter Cards, données structurées, `robots.txt`, `sitemap.xml`, `CNAME`, manifeste, `agent.txt`, `llms.txt` et carte sociale JWETPRO.

- 2026-08-17 : refonte de l'état vide du calendrier d'accueil avec une carte premium structurée, une action vers le calendrier complet et un rendu responsive bilingue.

- 2026-08-16 : refonte complète de `play.html` en aire Mopyon responsive avec entraînement, trois difficultés, choix X/O et conservation du moteur tactique existant.
- 2026-08-16 : ajout de l'onglet `Mes matchs`, limité aux matchs Firestore réellement attribués à l'utilisateur, avec compte à rebours, états vides explicites et plateau officiel temps réel.
- 2026-08-16 : ajout des fonctions serveur transactionnelles de connexion et de jeu Mopyon, des règles Firestore par participant et des tests unitaires du plateau officiel.

- 2026-08-16 : limitation de la colonne droite du calendrier d’accueil aux quatre championnats les plus proches, y compris après la sélection d’un championnat.

- 2026-08-16 : correction du débordement de l’identité JWETPRO dans l’en-tête de la messagerie desktop et réalignement des contrôles dans leur propre colonne.

- 2026-08-16 : suppression de la colonne latérale droite de la messagerie (informations du salon, membres connectés et rappel des règles) ; la conversation utilise désormais tout l’espace libéré sur desktop.

- 2026-08-16 : ajout d'une réponse d'identité bilingue déterministe présentant uniquement « Assistant JWETPRO », sans le terme « virtuel », pour les questions `qui es-tu` et `kiyes ou ye`.
- 2026-08-16 : ajout de réponses sociales chaleureuses et variées pour les remerciements, salutations et questions de bien-être, reconnaissance de `messi` et `koman w ye`, et évolution du ton vers un accompagnement commercial positif mais non manipulateur.
- 2026-08-16 : amélioration de la continuité conversationnelle du coordonnateur avec dix messages récents limités, conservation du dernier sujet JWETPRO spécifique malgré les clarifications génériques, relances courtes contextuelles et reconnaissance de `kombyen kob`, `enscription` et variantes similaires.
- 2026-08-16 : reconnaissance des formulations kreyòl naturelles et fautives liées à la participation, séparation entre demande ambiguë et hors sujet, correction des faux positifs de mots courts comme `pri` dans `tanpri`, et variation contrôlée des refus bilingues.
- 2026-08-16 : correction du coordonnateur virtuel pour détecter la langue de chaque message, répondre naturellement aux salutations, exclure les matchs de clubs externes comme le Real Madrid, retenter les réponses JSON Gemini tronquées et supprimer les renvois incohérents vers un autre coordonnateur.
- 2026-08-16 : évolution de l'assistant en coordonnateur virtuel chaleureux et bilingue, avec classification hors sujet côté serveur, contexte conversationnel minimal limité à six messages du même utilisateur, suivi de sujet et incitation à l'inscription strictement conditionnée à un championnat Firebase ouvert.
- 2026-08-16 : création de l'assistant client JWETPRO fondé sur une base de connaissances bilingue et des données Firebase filtrées; ajout du CRUD administrateur, des réponses structurées Vertex AI, de la limitation de fréquence, des retours utiles/pas utiles, de l'escalade humaine et des règles Firestore associées.
- 2026-08-16 : suppression des faux messages, salons, membres et compteurs injectés au chargement de la messagerie; seuls les états de chargement, les états vides et les documents Firebase sont désormais affichés.

- 2026-08-16 : stabilisation du rendu des messages après envoi ; les classes d’alignement et de couleur sont générées directement avec chaque message et le snapshot Firestore est trié sans mutation.

- 2026-08-16 : correction du rendu Lucide sur les pages publiques ; les noms d’icônes PascalCase sont normalisés en kebab-case avant chaque rendu, ce qui supprime les avertissements d’icônes introuvables.

- 2026-08-15 : réponses automatiques du coordonnateur avec Gemini dans les conversations privées, toujours rédigées en kreyòl ayisyen et affichées en temps réel sur le site joueur.

- 2026-08-12 : ajout au dashboard d’un simulateur de championnats en quantité variable, avec données aléatoires, cycle complet piloté étape par étape, matchs et résultats fictifs, reprise d’une simulation existante et suppression isolée des données de test.
- 2026-08-12 : alignement des règles Firestore sur les états `registration-closed` et `ongoing`, ajout de la gestion administrateur des résultats et restriction des écritures de championnats aux administrateurs.

- 2026-08-12 : cycle d'etat automatique des championnats sur les pages publiques (inscriptions ouvertes/terminees, en cours, termine apres 1 h 30) et conservation des championnats termines parmi les trois activites JWETPRO les plus recentes.
- 2026-08-12 : les championnats termines sont places en dernier dans l'ordre d'affichage des activites, sans etre retires de l'historique recent.
- 2026-08-12 : ajout d'un bouton contextuel sur chaque carte de championnat pour l'inscription, le suivi en direct ou la consultation apres la fin.
- 2026-08-12 : harmonisation des boutons « S'inscrire » des cartes d'activite avec le CTA or anime utilise dans le reste du site.
- 2026-08-12 : raccordement complet des liens de navigation du header et du footer, avec creation des pages Jouer, Champions, FAQ, Contact, Reglement, Confidentialite et reseaux sociaux.
- 2026-08-12 : correction de l'icone de progression absente dans la quatrieme carte de la section « Tout se passe sur JWETPRO ».
- 2026-08-12 : remplacement de cette icone par un pictogramme de progression autonome, sans dependance a la conversion Lucide, afin de garantir son affichage avec le meme cercle que les cartes voisines.

## 2026-08-12

- Affichage des images Facebook, Instagram et WhatsApp dans le footer partagé de toutes les pages HTML, avec les mêmes liens et styles que sur l’accueil.
- Ajout d'une suggestion de réponse Gemini dans la boîte de réception du dashboard, via une Cloud Function sécurisée et le secret `GEMINI_API_KEY`.
- Extension du choix Kreyòl à toutes les pages du site grâce à une traduction partagée, persistante et appliquée aussi aux contenus chargés dynamiquement.
- Création de la page guide « Comment ça marche » couvrant le compte après paiement confirmé, les championnats, les matchs, le live, la progression, les résultats et le profil ; raccordement des menus desktop et mobile.
- Ajout d'une conversation privée « Coordonnateur » par utilisateur dans la messagerie, avec accès Firebase limité à l'utilisateur concerné et aux administrateurs.
- Synchronisation complète du compte dans le header de toutes les pages publiques : le bouton ouvre réellement la connexion, puis est remplacé par l'avatar du compte actif avec accès direct au profil.

- Remplacement du bouton de retour vide de la page des règlements par une flèche gauche autonome et lisible sur mobile.
- Connexion de la section progression au championnat Firestore le plus proche, avec date, statut, capacité et métriques réelles disponibles.
- Publication sécurisée du nom, du niveau, des points et de l’avatar des utilisateurs dans le classement public lors de leur connexion.
- Ajout de profils de démonstration clairement identifiés pour compléter le classement jusqu’à cinq joueurs lorsque la base réelle est encore peu remplie.
- Extension du classement de démonstration à douze profils, réduction des scores, tri global par points et ajout d’avatars illustrés non humains.
- Limitation de la homepage aux cinq premiers profils et suppression du badge `DÉMO` répété à côté de chaque nom.
- Remplacement des portraits humains du palmarès de référence par des avatars illustrés non humains.
- Synchronisation des champions de référence avec le classement et attribution d’un avatar stable et unique à chaque personne.
- Synchronisation des avatars des cartes de matchs et des replays avec ceux du classement, sans portraits humains.
- La messagerie affiche la photo de profil actuelle de l'utilisateur connecté à côté de ses messages, avec ses initiales comme seul secours.

## 2026-08-10

- Passage du format quotidien principal a 16 joueurs, 125 HTG et 1 000 HTG au champion.
- Donnees de championnat centralisees pour supporter plusieurs championnats quotidiens et les participations multiples.
- Mise a jour du hero, de l'activite, de la progression, des cartes de jeu et du calendrier.
- Ajout de l'information sobre sur les gains cumulables.
- Conservation des anciennes dotations dans les donnees historiques.
- Ajout du calendrier administrateur pour publier les championnats a venir dans Firestore.
- La homepage lit les championnats publies depuis Firestore et n'affiche plus de faux championnat, activite, live, champion ou classement.

## 2025-05-20

- Initialisation de la homepage JWETPRO en Vanilla JS + Vite.
- Ajout des sections hero, activite, live, progression, jeux, champions, classement, processus, calendrier, confiance et footer.
# 2026-08-16


- Suppression de la colonne latérale droite de la messagerie (informations du salon, membres connectés et rappel des règles) ; la conversation utilise désormais tout l’espace libéré sur desktop.

## 2026-09-07

- Ajout de la programmation quotidienne des discussions Community dans le dashboard : import JSON, validation des 32 personnages, aperçu des volumes, édition et suppression par date.
- Ajout d'un moteur serveur versionné qui entrelace jusqu'à trois discussions, évite de rejouer une discussion le même jour et choisit la plus grande date enregistrée lorsque la date exacte est absente.
- Ajout des réponses ciblées dans Community, avec bouton « Répondre », aperçu avant envoi et citation persistante dans les 15 derniers messages chargés.
- Refonte de la page Community en messagerie plein écran : document non défilable, historique seul défilable, en-tête mobile compact, composeur fixé dans le viewport et suppression du footer.

- 2026-09-16 : les cartes de championnat de la page Activité appliquent également le CTA personnalisé pour un joueur déjà inscrit (« VOIR LE CHAMPIONNAT »).

- 2026-09-16 : le script de progression est versionné avec le correctif CTA d’inscription afin d’éviter qu’un ancien cache conserve le bouton de paiement.

- 2026-09-16 : les actions J’aime/Partager des cartes de matchs publiques sont désormais intégrées dans le flux de la carte au lieu de recouvrir les noms des joueurs sur mobile.

- 2026-09-16 : les profils simulés affichent désormais un état « Profil privé » au lieu d’un message indiquant que le profil est inexistant.

- 2026-09-20 : le profil n’affiche plus les coupons utilisés ou expirés et limite l’affichage à un seul coupon actif. Le nettoyage serveur supprime automatiquement les doublons et les anciens coupons, y compris lors de l’émission d’une nouvelle récompense.
- 2026-09-20 : un coupon suit désormais séparément le prochain championnat Mopyon et le prochain championnat Domino. Un championnat manqué désactive le coupon pour son jeu uniquement ; après un championnat manqué dans chaque jeu, le coupon est supprimé. La règle est également publiée dans le guide et la base de connaissances de l’assistant.
- 2026-09-20 : ajout d’un mode plateau plein écran dans play.html, avec affichage mobile agrandi, conseil localisé au chargement et suggestion du mode paysage pour Domino.
- 2026-09-20 : le conseil plein écran de play.html propose désormais « Ne plus afficher ce message », mémorisé séparément pour Mopyon et Domino.
- 2026-09-20 : correction de la modale de fin de match : Mopyon ne reste plus bloqué sur la validation d’un reçu Domino et le bouton de sortie devient « Terminer » pour une rencontre achevée.
- 2026-09-20 : correction du lobby Mopyon : la première manche est maintenant préparée pour deux joueurs réels, puis chacun rejoint le même plateau officiel en temps réel.
- 2026-09-20 : les championnats simulés ne classent plus automatiquement un compte réel comme bot ; seuls les participants explicitement marqués simulés déclenchent les coups automatiques.
- 2026-09-20 : neutralisation des marqueurs bot obsolètes dès que le second compte réel rejoint la manche Mopyon ; les coups automatiques sont désormais impossibles dans une rencontre entre deux vrais utilisateurs.

## 2026-09-20 — Minuteur de tour Mopyon
- Ajout d’un délai serveur de 30 secondes par tour pour les manches Mopyon, visible par les deux joueurs et appliqué aussi aux adversaires simulés.
- À expiration, la manche est clôturée par forfait de temps avec le joueur actif déclaré perdant; le délai est renouvelé après chaque coup.

## 2026-09-20 — Certificat de champion
- Ajout d’une modal de félicitations pour le vainqueur d’un championnat terminé.
- Le certificat affiche le champion, le championnat, la date et le score, avec partage natif ou copie d’un lien public vers la progression.

## 2026-09-20 — Moteur Rapfi pour le bot Mopyon
- Le bot Mopyon utilise désormais le build WebAssembly Rapfi côté serveur pour analyser les positions et choisir des coups plus compétitifs.
- Un repli sécurisé vers le moteur JavaScript existant est conservé si le moteur WASM dépasse son délai ou ne peut pas se charger.
- Le moteur est exécuté côté Functions, sans exposer le calcul du bot au navigateur.

## 2026-09-20 — Retour visuel des coups Mopyon
- Le pion du joueur est maintenant affiché immédiatement après le clic, avant la réponse du bot.
- Le dernier coup officiel est signalé visuellement et reste visible après synchronisation.

## 2026-09-21 — Stabilité du bot Mopyon officiel
- L’exécution Rapfi a été retirée temporairement des Functions après un dépassement du quota CPU Cloud Run qui empêchait `submitMopyonMove` de répondre correctement.
- Les matchs officiels utilisent de nouveau le moteur JavaScript léger; le build Rapfi est conservé hors du package Functions pour une future intégration dédiée.
- La fonction `submitMopyonMove` a été redéployée avec succès en `us-central1`.
- Correctif complémentaire : import explicite de `chooseBotMove` dans `index.js`, supprimant l’erreur `ReferenceError` qui retournait un 500 lors d’un coup contre un participant simulé.

## 2026-09-21 — Rapfi pour les championnats
- Ajout d’un service Cloud Run `jwetpro-rapfi` dédié au moteur Rapfi, avec une instance maximale et un délai de calcul borné.
- `joinMopyonMatch` et `submitMopyonMove` utilisent Rapfi pour les adversaires simulés des championnats; le moteur d’entraînement local reste inchangé.
- Le jeton d’accès est stocké dans Firebase Secret Manager, sans être conservé dans le dépôt.

## 2026-09-21 — Synchronisation de clôture des championnats
- `syncChampionshipTicketNow` est limité à 0,5 CPU, une instance et 30 secondes afin d’éviter les échecs de démarrage liés au quota Cloud Run du projet.
- La fonction a été redéployée et vérifiée avec ces limites.
- Déploiement du callable `deleteSimulationAccounts` manquant au dashboard; le nettoyage des comptes simulés ne dépend plus d’un endpoint absent.

## 2026-09-21 — Plein écran pour les matchs officiels et replays
- Ajout d’un bouton plein écran au plateau des matchs de championnat Mopyon/Domino.
- Ajout du même contrôle dans le lecteur de replay, avec orientation paysage proposée pour Domino.
- Les contrôles ciblent uniquement la surface de jeu afin de garder les informations secondaires hors écran.

## 2026-09-21 — Résultats multi-manches sur la progression
- La page `progress.html` affiche désormais un résultat par confrontation (série), et non une ligne par manche.
- Les noms des joueurs simulés sont récupérés depuis la série ou les données publiques des manches.
- Le score final de la série, le détail de chaque manche et un lien unique vers le replay complet sont affichés.

- 2026-09-21: resultats regroupes par rencontre; noms, score de serie et replay complet des manches affiches.\n
- 2026-09-21: actions coeur/partage des cartes de resultats placees dans une colonne reservee, responsive mobile-first.\n
- 2026-09-21: tous les replays sont recuperes et groupes par etape dans des sections repliables par defaut.\n
- 2026-09-21: les matchs officiels respectent maintenant startAt; l acces est bloque avant l heure programmee et le delai de presence de 5 minutes commence apres le debut officiel.\n
- 2026-09-21: hero et page Play utilisent maintenant l heure officielle du championnat pour le compte a rebours et le bouton d entree.\n
- 2026-09-21: Ajout du callable admin rescheduleChampionshipStart pour avancer la date d ouverture des simulations completes, avec propagation aux series non terminees.

- 2026-09-21: Le delai d attendance est maintenant affiche dans l hero et Mes matchs; le forfait automatique conserve un coupon de 25 HTG et affiche un modal au retour du joueur.

- 2026-09-21: Le compte a rebours de presence de 5 minutes est ancre sur l heure officielle; acces bloque apres expiration et forfait serveur applique aux matchs reels.

- 2026-09-21 : correction du héros des matchs planifiés ; après l’heure officielle + 5 minutes, le bouton d’entrée est désactivé et affiche DELAI ECOULE. Correction d’une erreur JavaScript qui empêchait le rendu du héros.

- 2026-09-21 : le compte à rebours de présence démarre désormais à l'heure officielle de chaque match, y compris face à un adversaire simulé ; dans Mes matchs, l'action devient Delai ecoule après cinq minutes.

- 2026-09-21 : progress.html propage désormais les forfaits de présence : le joueur absent est rayé des participants, le tableau affiche le vainqueur par forfait de temps et le résultat rappelle l'absence de cinq minutes.

- 2026-09-21 : ajout du trigger utoAdvanceCompletedMopyonGame ; une manche Mopyon terminée par forfait met maintenant à jour automatiquement la série, le score et le vainqueur du championnat.

- 2026-09-21 : prise en charge du double forfait de présence : les deux joueurs sont éliminés, le match parent est clôturé sans vainqueur et le tableau affiche le motif.

- 2026-09-21 : le dashboard ne lance plus une synchronisation Smart Cut callable à chaque chargement local ; les triggers serveur restent la source de synchronisation et évitent les erreurs CORS causées par le quota Cloud Run.

- 2026-09-21 : fermeture automatique renforcée des simulations : le dashboard appelle repairSimulationBracket dès que le 32e joueur est enregistré, afin d’éviter une course entre triggers Firestore ; le trigger parent vérifie aussi la capacité atteinte.

- 2026-09-21 : le balayage d attendance distingue maintenant un vrai joueur absent d un adversaire simule ; apres cinq minutes, le joueur reel est marque forfait et progress.html peut le rayer, tandis que deux vrais absents restent un double forfait.

- 2026-09-21 : les adversaires simules sont maintenant consideres presents par le balayage d attendance ; seul un vrai joueur absent est marque forfait apres cinq minutes.

- 2026-09-21 : les series jamais rejointes sont maintenant resolues directement apres l heure officielle + 5 minutes ; le joueur reel absent est elimine meme si aucune manche enfant n a encore ete creee.

- 2026-09-21 : un document de manche de replay est cree pour chaque forfait d attendance, y compris les series deja terminees ; le replay affiche le joueur forfait et la raison.

- 2026-09-21 : le dashboard et les pages publiques utilisent maintenant le vocabulaire championnat planifie ; le bouton devient Planifier le championnat et les mentions visibles de simulation sont remplacees par championnat ou automatique. Les indicateurs techniques Firebase restent inchanges pour compatibilite.
- 2026-09-21 : ajout d un fallback de cloture dans le dashboard : si le callable repairSimulationBracket est temporairement indisponible (quota Cloud Run/CORS), le tableau 32 joueurs est genere directement avec les droits administrateur.
- 2026-09-22 : alternance officielle du joueur qui commence une confrontation : joueur 1 en premiere manche, joueur 2 en deuxieme, tirage automatique en troisieme; applique aux matchs reels et automatiques, Domino et Mopyon.\n- 2026-09-22 : la modale entre deux manches affiche un compte a rebours de cinq minutes; a expiration, le serveur peut cloturer la transition par forfait.\n
- 2026-09-22 — Le délai officiel de 30 secondes reste visible dans l’hero et Mes matchs après navigation; le serveur conserve le forfait à l’expiration.

- 2026-09-22 — La lecture publique des matchs utilise désormais une requête isibility=public compatible avec les règles Firestore; les statuts sont filtrés côté client pour éviter les refus de permission qui perturbaient l’hero.

- 2026-09-22 — Restauration du CTA détaillé de la hero championnat avec le prix d’inscription; le correctif du minuteur ne supprime plus les informations de la carte.

- 2026-09-22 — Correction du bloc statut des matchs planifiés dans la hero : la balise fermée manquante n’engloutit plus les joueurs, le plateau et les contrôles.

- 2026-09-22 — Ajout d’un balayage serveur 
esolveOfficialTurnTimeouts : un tour Mopyon expiré est clôturé par forfait même si aucun joueur ne reste sur la page play.

- 2026-09-22 — Un timeout de 30 secondes clôt désormais uniquement la manche en cours; la confrontation continue jusqu’à deux manches gagnées et la modal l’explique explicitement. La règle est publiée dans le guide et la base de connaissances de l’assistant.

- 2026-09-22 — La base de connaissances de l’assistant précise aussi l’alternance du joueur débutant entre les manches 1, 2 et 3.

- 2026-09-22 — Suppression des mentions visibles d’adversaire automatique/simulé dans play.html et les replays; joinMopyonMatch redéployé avec 0,5 CPU et une instance maximale pour respecter le quota Cloud Run.
## 2026-09-22 — Élimination visible après délai d’absence
- La progression écoute désormais les matchs waiting-opponent et les états forfaités.
- Un délai d’absence de cinq minutes arrivé à échéance est interprété côté lecture comme un forfait même avant le prochain passage du job serveur ; le participant absent est rayé dans Patisipan yo.
- Les joueurs simulés restent considérés présents pour cette déduction, et le résultat de forfait conserve le gagnant/les deux forfaits dans le tableau.
- La date limite de présence reprend aussi le même fallback que l’hero (début planifié + cinq minutes) quand le champ explicite est absent, sans requalifier un match déjà terminé.
- 2026-09-22 — Le parent d’une série reçoit désormais le motif et l’identité du joueur forfait après expiration de la présence ; un double forfait conserve les deux identifiants. Les fonctions Mopyon concernées ont été redéployées.
- La requête de progression respecte maintenant les règles Firestore : les statuts publics sont filtrés dans la requête autorisée, et les matchs waiting-opponent privés sont chargés uniquement pour le participant connecté.
- Le balayage de présence couvre aussi les séries marquées live/ongoing sans manche enfant : un premier forfait de cinq minutes clôture bien la confrontation complète.
- Le délai de 30 secondes (turn-timeout) est maintenant séparé du forfait de présence de cinq minutes : seul attendance-timeout élimine du championnat dans la progression.
- Chaque nouvelle manche créée pour une série officielle reçoit désormais sa propre échéance serveur de présence de cinq minutes ; un retour tardif ne peut pas réinitialiser le délai.
### 2026-09-23 — Forfaits persistants et double absence

- Le balayage serveur résout désormais aussi les manches `scheduled`/`preview` dont le délai d’entrée de cinq minutes est expiré, y compris après fermeture ou actualisation du navigateur.
- Les manches simulé-versus-simulé restent hors de toute logique d’absence et sont laissées à l’orchestrateur de simulation.
- Un double forfait persiste les deux identifiants éliminés et clôt correctement la série enfant/parent.
- L’orchestrateur de championnat fait avancer par bye le vainqueur de la confrontation adjacente lorsqu’une paire de vrais joueurs est doublement absente.
- Les transactions `joinMopyonMatch` et `joinDominoMatch` refusent désormais toute arrivée après l’échéance officielle et ne peuvent plus recréer une manche avec un délai réinitialisé.
- Le délai d’entrée de la première manche clôt le match par forfait ; une absence après une manche déjà jouée ne compte qu’une manche et laisse le meilleur-de-trois continuer si nécessaire.
- Le déclencheur Domino clôt maintenant aussi un double forfait sans tenter de lancer une série avec un vainqueur vide.
- 2026-09-23 — Les fonctions `joinMopyonMatch` et `joinDominoMatch` sont limitées à une instance et 0,25 CPU avec concurrence 1 afin d’éviter les refus Cloud Run liés au quota CPU ; la preflight CORS reste autorisée pour le site local.

