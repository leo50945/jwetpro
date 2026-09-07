# Sécurité et dépendances

JWETPRO est maintenant un site statique HTML/CSS/JavaScript sans Vite ni npm runtime. Les dépendances sont chargées depuis des CDN dans `index.html` et `src/styles.css` : Lucide, GSAP, ScrollTrigger, Inter et Cormorant Garamond.

Cette décision simplifie Live Server et Firebase Hosting, mais rend le site dépendant de la disponibilité des CDN et de leurs politiques de cache. Pour une production plus robuste, les URLs doivent être épinglées à des versions précises, ce qui est le cas dans le projet.
