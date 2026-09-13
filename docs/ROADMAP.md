# Roadmap

- 2026-09-10 — Système social : partage et favoris des championnats/séries, profils joueurs, abonnements réels ou simulés, compteurs privés/publics, notifications internes et messagerie privée réciproque avec blocage, signalement et historique en lecture seule implémentés. Les tests unitaires et Auth/Firestore Emulator sont validés; fonctions, règles, index et interface principale sont publiés sur `mopyonlakay`. Restent le backfill administrateur, le parcours manuel de production à deux comptes et le rattachement de `share.jwetpro.com`.

- 2026-09-08 — Simulations de championnat : clôture automatique à 32 joueurs, tableau déterministe, file bot contre bot par match ou par tour, six workers concurrents, progression automatique, replays Mopyon/Domino versionnés et points simulés idempotents réalisés. Validation de charge sur un championnat complet en production à effectuer après déploiement ciblé.

- 2026-09-03 — Palmarès des champions : recherche, classement par date et navigation par championnat dépliable réalisés avec une fiche de vainqueur responsive.

- 2026-09-03 — Archives de replays : recherche prioritaire et classement réalisés par date puis par championnat dépliable, avec filtrage par match, joueur, jeu, phase ou compétition et présentation responsive.

- 2026-09-03 — Hero personnalisé : carrousel priorisé réalisé avec matchs du joueur, championnats ouverts, championnats en cours et événements planifiés ; accès direct et contrôlé au plateau officiel ajouté.

- 2026-08-17 — Replays Mopyon : liaison des matchs termines vers `play.html`, lecteur 20 × 20 avec navigation coup par coup, lecture automatique et vitesses ; les matchs de simulation sans historique obtiennent un replay deterministe explicitement identifie comme simule.

- 2026-09-03 — L’entraînement Domino dans `play.html` démarre directement contre le bot Débutant (`bot=weak`), sans demander au joueur de choisir un niveau. Le sélecteur de difficulté Mopyon reste indépendant.
- 2026-09-05 — Match officiel Domino : moteur serveur autoritaire, mains privées, bot Débutant, présence/forfait de cinq minutes, séries au meilleur de trois manches, replay groupé et pilotage depuis le dashboard réalisés. Une validation Firebase de bout en bout avec deux navigateurs joueurs reste à effectuer après déploiement.
- 2026-08-17 — Interface Jouer multijeu : sélection Mopyon ou Domino ajoutée ; moteur `dominocash` raccordé à la page pour l’entraînement contre bot.

- 2026-08-16 - Interface Mopyon : entraînement contre le moteur local réalisé; interface des matchs attribués, compte à rebours et protocole de coups serveur réalisés; génération automatique des confrontations et validation Firebase de bout en bout restantes.

- 2026-08-12 — Dashboard : simulateur contrôlé de 1 à 50 championnats fictifs, avec progression manuelle à travers les états planifié, inscriptions ouvertes, inscriptions terminées, en cours et terminé ; génération de matchs/résultats associés et nettoyage isolé par identifiant de simulation.

- PHASE 01 — Homepage desktop : realisee.
- PHASE 02 — Homepage responsive/mobile : premiere version realisee.
- GUIDE — Page « Comment ça marche » : réalisée.
- NAVIGATION — Header et footer raccordes ; pages Jouer, Champions, FAQ, Confidentialite et reseaux sociaux realisees. Le reglement est centralise dans la modale plein ecran de l'accueil.
- INTERNATIONALISATION — Kreyòl appliqué à toutes les pages et interfaces : réalisée.
- ASSISTANT CLIENT — Base officielle bilingue, contexte Firebase filtré, réponses structurées, retours et escalade humaine : implémentés; validation Firebase en production restante.
- PHASE 03 — Page championnat : récapitulatif public responsive réalisé avec participants, tableau à élimination directe, résultats et replays publiés ; alimentation automatique et migration complète des anciens championnats restantes.
- PHASE 04 — Connexion : creation de compte joueur publique sans verification e-mail, connexion e-mail/mot de passe et profil minimal realises.
- PHASE 05 — Espace joueur : rubriques du profil interactives, mise à jour limitée des informations personnelles, sécurité, préférences et favoris sociaux alimentés par les parcours métier réalisés ; alimentation complète des groupes restante.
- PHASE 06 — Interface Mopyon : entraînement et protocole de match officiel réalisés; déploiement et orchestration automatique des confrontations restants.
- PHASE 07 — Live / spectateur.
- PHASE 08 — Systeme de tournoi et paiements confirmes.

## RETENTION — A VALIDER

- Comeback Credit de 25 HTG apres une participation terminee.
- XP, progression, rang et historique.
- Recompenses intermediaires et parties gratuites.
- Classement, communaute et notifications de retour.

Ces mecanismes ne sont pas marques comme termines et aucun wallet financier complet n'est implemente sur la base de cette piste.
