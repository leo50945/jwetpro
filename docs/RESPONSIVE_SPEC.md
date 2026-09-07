# Responsive

Desktop >= 1200px : hero en deux colonnes et rangées de cartes. Tablette 768–1199px : contenu resserré. Mobile < 768px : hamburger, hero vertical, activité/live/calendrier en scroll horizontal, progression et footer empilés.


Les carrousels mobiles sont contenus dans leur propre viewport ; le body masque les débordements horizontaux et seul le calendrier, l’activité ou le live peut défiler à l’intérieur de sa rangée.

L’archive `live.html?view=replays` ne présente pas une longue rangée horizontale : elle affiche une recherche collante, des groupes par date et des championnats dépliables. Les matchs passent de trois colonnes sur grand écran à deux sous 1 100 px puis une seule sous 800 px. Les libellés et compteurs restent contenus dans le résumé du championnat sans provoquer de débordement du body.

Le palmarès `champions.html` suit la même hiérarchie date puis championnat dépliable. Sur mobile, le nom du champion est masqué dans le résumé pour réserver la largeur au nom du championnat, puis la fiche ouverte place l’identité sur une ligne et les métadonnées sur deux colonnes sans débordement horizontal.


Sur mobile, l’image hero conserve son ratio naturel avec object-fit: contain et aucune hauteur forcée afin que le plateau ne soit jamais coupé.


Le visuel hero utilise object-fit: contain dans son espace disponible ; il se contracte automatiquement et ne doit jamais être recadré, notamment lorsque le hero est fixé à 90vh.


Sur mobile, le tableau d'un championnat terminé empile les quatre phases d'élimination directe — huitièmes, quarts, demi-finales et finale — et conserve les deux joueurs et le score de chaque confrontation. Sur écran large, ces phases restent présentées en quatre colonnes comparables.
La section des champions adopte une grille mobile sans largeur minimale forcée : les trois cartes et le classement restent contenus dans la largeur de l’écran, sans découpe horizontale.

Le menu mobile est un tiroir fixe pleine hauteur ancré à droite, avec backdrop, bouton de fermeture X, focus visible, états hover et verrouillage du défilement pendant son ouverture.
