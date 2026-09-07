# Problèmes connus

- Les classements et la page de récapitulatif ne peuvent pas reconstruire un historique absent. Les anciens championnats sans liste de participants, sans identifiant de championnat sur les matchs, sans phase explicite ou sans historique de coups affichent un état « non publié » jusqu'à migration de ces données.
- L'onglet `Mes matchs` dépend de documents `matches` autoritaires contenant `participantIds`, `game` et `startAt`. Le dashboard ne planifie pas encore automatiquement ces confrontations à partir des inscriptions, car aucune collection autoritaire d'inscriptions ou de paiements n'est définie.
- Les fonctions `joinMopyonMatch`, `submitMopyonMove` et `advanceMopyonSeries` sont déployées. Leur logique pure est testée localement, mais un scénario concurrent complet entre deux navigateurs joueurs doit encore être validé sur le projet Firebase.
- Le moteur officiel Domino et ses fonctions autoritaires sont couverts par des tests locaux. Après leur premier déploiement, il reste à exécuter un parcours Firebase complet avec deux comptes réels puis un parcours joueur réel contre participant simulé, afin de valider la présence, les trois manches potentielles et le replay dans les conditions réseau réelles.
- Les images officielles, avatars et logo final ne sont pas fournis ; les visuels CSS temporaires sont documentés dans `ASSETS.md`.
- Les liens métier sont des ancres de préparation ; aucun paiement, compte ou match réel n’est connecté.
- Les URL officielles Facebook/Instagram et le numéro ou canal WhatsApp ne sont pas encore renseignés. Le footer dirige vers une page JWETPRO interne sans inventer de profil externe.
- Aucune collection autoritaire d'inscriptions ou de paiements n'est encore définie. L'assistant oriente ces demandes vers le coordonnateur et ne peut pas confirmer leur statut.
- Les réponses Groq, les règles Firestore et le déclencheur automatique doivent être validés après déploiement dans le projet Firebase réel; les tests locaux ne peuvent pas reproduire l'API distante ni les custom claims de production.
## Firebase Functions - migration Node.js requise

- Le runtime Node.js 20 est deprecie depuis le 30 avril 2026 et doit etre migre avant sa mise hors service annoncee au 30 octobre 2026.
- Le package `firebase-functions` est aussi signale comme ancien par la CLI. Sa mise a niveau peut contenir des changements incompatibles et doit faire l'objet d'une migration testee separement.

## Partage social

- La cible Firebase Hosting `jwetpro-share` est déployée et les liens utilisent temporairement `jwetpro-share.web.app`. `share.jwetpro.com` doit encore être rattaché à cette cible dans Firebase Hosting et validé par les enregistrements DNS du domaine; après validation, `SHARE_ORIGIN` pourra adopter le sous-domaine de marque.
- La première version utilise l'image Open Graph générique `og-jwetpro.png`. Une image sociale personnalisée par accomplissement pourra être ajoutée ensuite sans modifier le modèle de validation serveur.
- L'attribution est enregistrée après authentification, mais aucune récompense de parrainage n'est encore déclenchée automatiquement.
