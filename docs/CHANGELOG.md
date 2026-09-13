# Changelog

- 2026-09-13 : « Mes favoris » fusionne désormais les favoris sociaux paginés et les anciens `favoriteGames` reconnaissables. Un ancien match ou championnat déjà présent dans la nouvelle collection est dédupliqué, tandis que les entrées historiques sans identité canonique restent visibles et supprimables pendant la migration.

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
