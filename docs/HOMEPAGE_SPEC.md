# Specification homepage

Header sombre ; hero sous forme de grand carrousel priorise ; activite ; matchs en direct ; progression du championnat publie le plus proche ; choix Mopyon/Domino ; champions et classement ; fonctionnement JWETPRO ; calendrier ; confiance ; footer.

Le hero affiche plusieurs événements dans un rail horizontal navigable au toucher, à la souris, au clavier et avec des boutons. Après restauration de la session Firebase, une requête `participantIds array-contains UID` charge les matchs du joueur. Ses matchs officiels non terminés, y compris les confrontations planifiées `kind: series`, précèdent tous les autres contenus et montrent son profil, celui de l’adversaire et l’horaire. Une partie jouable propose « Rejoindre le match » ; une confrontation dont le plateau n’existe pas encore propose de consulter le match planifié dans son championnat. Les championnats suivent dans cet ordre : inscriptions ouvertes, championnat en cours, autres événements planifiés. Sans match personnel, le premier championnat ouvert devient donc l’élément principal. Aucun match attribué à un autre joueur n’est présenté comme un match personnel.

Le modele standard affiche 125 HTG, 32 joueurs, cinq tours et 2 000 HTG au champion. Le deuxieme recoit une inscription gratuite et les autres participants un coupon de reduction de 25 HTG, valable une fois uniquement pour le prochain championnat publie Domino ou Mopyon. Les championnats de la homepage sont data-driven pour permettre plusieurs opportunites dans une meme journee sans fixer les horaires dans le code.

Les anciennes dotations restent valides uniquement dans l'historique. La homepage ne doit pas presenter 40 joueurs, 250 HTG ou 5 000 HTG comme modele quotidien.

La collection Firestore `championships` est la source de verite pour les competitions a venir. Chaque document publie doit contenir `game`, `number`, `entryFee`, `prize`, `maxPlayers`, `startAt` (Timestamp), `status` et `createdBy`. Un etat vide explicite est affiche lorsqu'aucun document valide n'est disponible.

La section progression reprend le meme championnat que le hero et le calendrier. Avant son debut, elle affiche la capacite maximale, la date et l'heure reelles, sans publier le nombre exact de participants ni inventer des statistiques de match. Les champs de progression Firestore sont utilises lorsqu'ils existent.
