# Avancement - nouveau moteur Gomoku

## Etat actuel

L'ancien moteur du bot et ses regles empilees ont ete supprimes. Le projet utilise
maintenant un moteur plus petit construit autour d'un catalogue unique de figures.

- Grille: 20 par 20.
- Humain: `X`.
- Bot: `O`.
- Victoire: 5 pions alignes.
- Analyse: horizontale, verticale et deux diagonales.
- Recherche: priorites tactiques puis simulation maximin bornee.
- Budget maximal de calcul profond: 2400 ms par decision tactique dense.
- Le dernier pion joue porte un repere blanc et jaune independant des menaces.
- L'historique affiche chaque coup et peut etre copie au format simulable
  `1:X@L11C11;2:O@L10C10`.

## Ordre de decision

1. Jouer une victoire immediate du bot.
2. Bloquer une victoire immediate de l'humain.
3. Creer la meilleure figure forcante disponible.
4. Bloquer une figure humaine de classe S si le bot n'a pas une attaque plus forte.
5. Continuer une attaque active du bot.
6. Comparer les coups restants avec une simulation des meilleures reponses humaines
   et de la meilleure continuation du bot.

Exception: si l'humain possede deja au moins deux cases gagnantes immediates,
comme les deux extremites de `011110`, la position est consideree perdue. Le bot
ne bloque pas une seule extremite et joue son meilleur coup offensif.

Ouverture humaine: lorsque X pose le premier pion de la partie, le premier pion O
est obligatoirement place sur une case diagonale adjacente. Parmi les diagonales
disponibles, le bot choisit celle qui se rapproche le plus du centre du plateau.

Chaque coup est analyse avant d'etre pose. Le moteur mesure a la fois ce qu'il cree
pour `O` et ce qu'il retire a `X`.

## Verification

Les tests automatiques couvrent le vocabulaire, les figures ouvertes et fermees,
les figures espacees, les doubles menaces, les victoires et blocages immediats,
l'ouverture centrale, l'affichage des menaces et le budget de decision.

Le detail du langage et des classes est dans `FIGURES_BOT.md`.
## Annulation des coups (v116)

- Le bouton **Annuler un coup** retire exactement le dernier pion joue.
- Plusieurs clics permettent de remonter plusieurs coups, pierre par pierre.
- Le tour, le compteur, l'historique exportable, le repere du dernier coup, les menaces et l'explication du bot sont recalcules apres chaque annulation.
- Une reflexion du bot encore en attente est invalidee pour empecher un coup tardif de reapparaitre.
- Si le coup annule avait termine la partie, le score correspondant est retire et la partie est rouverte.

## Detection des pions pieges (v117)

- Ajout d'une recherche VCF bornee sur quatre attaques successives.
- Simulation de chaque quatre, de la reponse O obligatoire et de la continuation X.
- Detection des semences anodines comme `0110` qui conduisent a un `4x3` ou un `4x4`.
- Les points causaux de la chaine sont testes comme blocages avant un simple trois ouvert du bot.
- La decision est exposee sous la priorite `DEF-TRAP-S+` avec le tag `pion-piege`.
- L'historique fourni terminant par X@L6C10 est conserve comme regression automatique.

## Blocage exact dans un plan S+ (v118)

- Tous les `21110` et `01112` sont compares aux points causaux du plan force.
- Si leur zero appartient a la chaine, le bot ferme exactement ce zero pour produire `21112`.
- La priorite affichee devient `DEF-TRAP-CLOSED-THREE` au lieu d'un blocage S+ generique.
- Les trois barres non causaux et eloignes restent classes selon leur danger local.

## Defense multi-branche des pions pieges (v119)

- Chaque blocage candidat est suivi d'une nouvelle recherche complete des plans X.
- Les candidats couvrent les chaines forcees, les `21110`, les `0110` et les meilleures constructions adverses.
- Un blocage qui coupe une diagonale mais laisse une victoire horizontale est rejete.
- Les deux reponses possibles a un trois ouvert sont simulees separement.
- `O@L7C9` est interdit dans l'historique fourni car il laisse la combinaison de la ligne 5.
- Le prelude jusqu'a X@L5C10 prouve automatiquement que le coup 40 est deja une position perdue.

## Urgence du coup racine (v120)

- Tous les candidats defensifs X de rang 60 ou plus sont conserves, sans limite arbitraire aux vingt premiers.
- Chaque zero exact de `21110` est teste comme premier coup d'une combinaison X.
- Les suites gagnantes les plus courtes recoivent la priorite defensive maximale.
- Dans le nouvel historique, le bot ferme `L7C13` ou le zero causal plus large `L6C12`, au lieu d'un trois barre isole.
- Le scenario gagnant qui suivait l'ancien mauvais blocage est conserve comme regression automatique.

## Largeur residuelle des menaces (v121)

- Chaque defense recompte tous les coups X de classe S ou S+ encore disponibles.
- Les quatre, les trois ouverts et les doubles menaces residuels recoivent des penalites distinctes.
- Une case qui coupe plusieurs reseaux passe devant un blocage local a menace unique.
- L'ancien coup perdant `O@L13C8` est interdit dans le nouvel historique.
- La defense retenue doit laisser au plus autant de menaces S et de trois ouverts que `L15C9`.

## Preuve avant quatre de tempo (v122)

- Un quatre O a sortie unique ne peut plus ignorer automatiquement un `01110` X deja present.
- Apres le blocage X obligatoire, le moteur recherche une continuation O jusqu'au cinq, `4x3` ou `4x4`.
- Sans continuation prouvee, la priorite devient `DEF-OPEN-THREE`.
- Avec une continuation mathematiquement forcee, le bot conserve `ATTACK-FOUR` et affiche `victoire-forcee-prouvee`.
- Les deux comportements opposes sont couverts par des regressions automatiques.

## Continuation verrouillee et calcul stable (v123)

- Une continuation annoncee comme gagnante est memorisee et suivie apres chaque blocage obligatoire.
- Si un trois ouvert admet plusieurs reponses, le bot accepte chaque extremite prouvee et recalcule la branche correspondant au coup reel de X.
- Le cas `22022` de l'historique fourni conserve ainsi `L16C11 -> L15C10 -> L14C13 -> L13C14` au lieu de bifurquer vers `L9C10`.
- Les racines defensives sont classees avant la recherche; seules les six plus dangereuses recoivent la simulation profonde.
- Les sous-preuves utilisent des budgets de noeuds fixes afin qu'une meme position ne change plus de decision selon la charge du navigateur.
- La suite comporte 38 regressions automatiques a ce stade, dont la partie `22022` et les trois historiques de pions pieges.

## Largeur des deux de construction (v124)

- Un `01010` local ne passe plus automatiquement devant un `0110` connecte a plusieurs axes.
- Pour chaque case de croissance X, le moteur conserve le nombre reel de directions `open-two` qu'elle ferait apparaitre.
- Une racine a deux branches passe avant une case de meme rang qui n'ouvre qu'une branche, avant le departage par score local.
- Dans l'historique fourni, `L8C11` est choisi devant `L9C13`: le premier coupe deux prolongements et la diagonale gagnante future.
- Le raisonnement `DEF-OPEN-TWO` affiche maintenant le nombre de branches neutralisees.
- La suite comporte maintenant 39 regressions automatiques.

## Trois ouvert obligatoire (v125)

- Un `01110`, `010110`, `011010` ou `0101010` present est bloque avant une semence `DEF-TRAP-S+`.
- Un score offensif heuristique de rang 90 ne peut plus supprimer cette defense.
- Les priorites `FORCE`, `DEF-TRAP-CLOSED-THREE` et `DEF-TRAP-S+` passent maintenant apres `DEF-OPEN-THREE`.
- Seules une victoire O immediate, un quatre a plusieurs sorties ou une continuation O mathematiquement prouvee peuvent conserver l'attaque.
- La position de l'image est reproduite automatiquement: l'ancien `L9C5` est rejete et une extremite du trois horizontal est fermee.
- La preuve offensive utilise un budget fixe de 320 noeuds pour ne pas changer selon la vitesse du navigateur.
- La suite comporte maintenant 40 regressions automatiques.

## Construction polyvalente (v126)

- Deux blocages de meme rang sont maintenant compares aussi du point de vue des constructions O.
- Le moteur compte separement les branches `open-two` neutralisees pour X et celles creees pour O.
- Une bifurcation X sur au moins deux axes reste prioritaire sur une construction offensive agreable.
- Sans bifurcation X critique, le bot maximise les effets combines puis les branches O: blocage plus deux `0220` vaut trois effets.
- Une construction O polyvalente sert de departage d'ouverture, mais ne depasse pas un `21110` actif deja identifie.
- Dans la position fournie, `L12C10` est choisi devant `L12C13` et cree les deux paires diagonales attendues.
- Le panneau de logique expose maintenant les branches X, les branches O et le nombre total d'effets.
- La suite comporte maintenant 41 regressions automatiques.

## Lead offensif de construction (v127)

- Les attaques pures O sont maintenant classees separement du score hybride attaque-defense, afin qu'un blocage local ne cache plus une meilleure initiative.
- Pendant les dix premiers pions, une attaque O peut passer devant une construction X non urgente si elle cree un trois ouvert et une seconde figure de rang A ou plus.
- Chaque extremite defensive X est posee virtuellement; elle doit rester sous le rang S et ne creer aucune victoire immediate.
- Apres chaque reponse X, le moteur exige encore deux etages de continuations O sures et forcantes.
- Un trois ouvert X present, une victoire X immediate ou une semence X deja prouvee `4x3/4x4` conservent leur priorite defensive.
- Hors de l'ouverture, ce calcul est desactive et les constructions X etablies sont de nouveau traitees avant une simple initiative.
- Dans la position fournie, `L11C9` cree le `02220` diagonal et le `12202` horizontal; `L12C14` est rejete.
- La nouvelle priorite affichee est `ATTACK-LEAD` avec le nombre de reponses X verifiees.
- La suite comporte maintenant 42 regressions automatiques.

## Quatre avec plan obligatoire (v128)

- La securite locale d'un quatre et la preuve d'une victoire sont maintenant deux resultats distincts.
- Un quatre a sortie unique seulement non empoisonne est marque `tempoOnly`; il ne recoit plus `ATTACK-FOUR` et est retire des candidats strategiques prioritaires.
- `ATTACK-FOUR` exige desormais plusieurs sorties gagnantes ou une continuation forcee effectivement retournee par la recherche.
- Un plan n'est memorise dans `activeRobotPlan` que lorsque cette continuation existe vraiment.
- Dans l'historique fourni, `022221` a `L11C10` et `122220` a `L14C12` sont tous deux reconnus comme non prouves; la seconde attaque aveugle est rejetee.
- Quand une preuve est reelle et que X joue la reponse attendue, le panneau annonce: `Le flux suit le plan de victoire deja prouve` sous `ATTACK-PLAN`.
- La regression `22022` confirme que les vraies continuations restent memorisees et executees.
- La suite comporte maintenant 43 regressions automatiques.

## Quatre de lead constructif (v129)

- Un `tempoOnly` reste interdit sous `ATTACK-FOUR`, mais il peut recevoir `ATTACK-LEAD` pendant les dix premiers pions s'il possede une vraie valeur de construction.
- Le quatre doit avoir une sortie unique, une seconde figure d'au moins rang B et au moins une direction `open-two` O a developper.
- Le blocage X force doit rester sous le rang S; apres sa pose virtuelle, X ne doit posseder ni victoire immediate ni trois ouvert.
- O doit encore conserver un coup de construction non-four d'au moins rang B apres la reponse X.
- Cette autorisation ne passe pas devant un trois ouvert X, un `21110` actif ou une chaine X `4x3/4x4` deja prouvee.
- Dans l'historique `START O`, `L11C10` est maintenant joue sous `ATTACK-LEAD`, sans faux `activeRobotPlan` ni affirmation de victoire certaine.
- Apres `X@L11C8`, `L14C12` reste rejete comme quatre non prouve sans valeur suffisante dans la nouvelle phase.
- Les 43 regressions passent avec les vraies preuves `22022` toujours actives.

## Deux niveaux d'attaque (v130)

- Niveau 1, `victoire assuree`: plusieurs sorties gagnantes ou recherche forcee complete; le plan est memorise et suivi avec `ATTACK-FOUR` puis `ATTACK-PLAN`.
- Niveau 2, `lead sur`: trois ouvert O plus un deux ouvert ou une seconde figure A; aucune victoire certaine n'est annoncee.
- Pour le niveau 2, chaque defense X immediate doit rester sous S et O doit encore posseder une prochaine attaque forcante.
- Le lead n'est plus limite arbitrairement aux dix premiers pions: il est autorise tant que X n'a ni trois ouvert, ni `21110` prioritaire, ni chaine `4x3/4x4` prouvee, ni construction secondaire a plusieurs branches.
- Les leads equivalents sont compares par leur potentiel futur dans la pire reponse X, puis par le soutien local O; cette correction choisit `L13C10` devant `L10C10`.
- Le bug JavaScript qui utilisait accidentellement l'index du candidat comme profondeur via `.map(evaluateRobotLeadAttack)` est corrige par une profondeur explicite.
- Apres `X@L11C8`, `L13C10` remplace maintenant le coup passif `L9C8`/`L12C14` et maintient `02220 + 0220`.
- Les tags du panneau distinguent `niveau-1-victoire-assuree` et `niveau-2-lead-sur`.
- Les 43 regressions passent.

## Course trois ouvert contre 3x3 (v131)

- Une continuation O n'est plus jugee seulement par son terminal final; le moteur verifie aussi les tempos qu'elle exige de X.
- Chaque etape du plan conserve maintenant `fourDirections`, `openThreeDirections` et les `responseOptions` eventuelles.
- Si X possede deja un trois ouvert, une branche O qui exige que X bloque ensuite un simple trois O est rejetee: X peut reprendre le tempo avec son propre quatre.
- Un plan O gagne encore la course s'il reste une chaine pure de quatre jusqu'a la victoire, s'il forme un `4x4`, ou si une etape cree simultanement quatre et trois ouvert, donc un vrai `4x3`.
- La trace fournie `20222 -> 122220 -> 020220[3x3] -> 022220` est maintenant marquee `raceRejected` parce qu'elle depend du tempo `[3x3]` sans `4x3`.
- Le bot bloque alors le `01110` sous `DEF-OPEN-THREE` et le panneau explique explicitement `3x3-perd-la-course` et `4x3-requis`.
- Les vraies preuves `22022` et les quatre a plusieurs sorties restent valides.
- La suite comporte maintenant 44 regressions automatiques.

## Positions sauvegardees (v132)

- Le panneau lateral permet de nommer et sauvegarder jusqu'a 50 positions dans le stockage local du navigateur.
- Une sauvegarde conserve les 400 cases, l'ordre exact des coups, le joueur de depart, le prochain tour et le choix d'affichage des menaces.
- Le bouton dossier recharge la position; le bouton corbeille la supprime definitivement de la liste.
- Le chargement invalide les anciennes analyses et les anciens plans du bot afin qu'ils ne contaminent jamais la position restauree.
- Une position au tour de O relance normalement l'analyse du bot; une position au tour de X attend le joueur.
- Deux regressions couvrent la restauration exacte et la suppression; la suite comporte maintenant 46 tests automatiques.

## Replay et branches d'analyse (v133)

- Chaque position sauvegardee possede maintenant un bouton lecture qui reconstruit la partie depuis le plateau vide, pion apres pion.
- Les commandes permettent de revenir au debut, reculer ou avancer d'un coup, lire, mettre en pause et aller directement a la fin.
- La vitesse tourne entre `1x`, `2x` et `4x` sans perdre la position courante.
- Le bouton de bifurcation abandonne seulement les coups situes apres l'image courante et permet de continuer la partie depuis cette position.
- Un clic humain sur le plateau pendant un replay en pause cree automatiquement cette nouvelle branche.
- La branche conserve son propre historique et peut etre sauvegardee comme une nouvelle position independante.
- Deux regressions verifient la reconstruction image par image et le remplacement du futur par une nouvelle branche; la suite comporte maintenant 48 tests.

## Replay lent et raccourcis (v134)

- La vitesse normale place maintenant un pion toutes les quatre secondes; `2x` utilise deux secondes et `4x` une seconde.
- Le panneau `Positions sauvegardees` est affiche tout en haut de la colonne de commandes.
- `Espace` lit ou met en pause, les fleches gauche/droite reculent ou avancent, `Debut` et `Fin` changent d'extremite.
- Les touches `1`, `2`, `4` choisissent directement la vitesse et `B` cree une branche depuis l'image courante.
- Les raccourcis sont ignores dans les champs et les boutons afin de ne pas perturber la saisie d'un nom.
- Une regression supplementaire couvre la cadence et les commandes clavier; la suite comporte maintenant 49 tests.

## Cadence du replay (v135)

- La vitesse normale passe a deux secondes par pion.
- `2x` utilise une seconde par pion et `4x` une demi-seconde.

## Raisonnement conserve dans les replays (v136)

- Chaque nouveau coup O conserve maintenant la priorite, la justification, les tags et la figure du panneau `Debug AI`.
- Les donnees de decision sont incluses dans la position sauvegardee avec le coup auquel elles appartiennent.
- Pendant le replay, le panneau restaure automatiquement la derniere decision O lorsque son pion apparait.
- Avant le premier coup O, le panneau reste vide; apres un coup X, la derniere explication O reste visible pour l'analyse.
- Les anciennes sauvegardes sans decision affichent explicitement `raisonnement non enregistre` et aucune justification n'est inventee.
- Une regression couvre l'enregistrement et la restauration du raisonnement; la suite comporte maintenant 50 tests.

## Blocage simultane des menaces (v137)

- Une defense de chaine compare maintenant d'abord la pire menace residuelle de chaque case candidate.
- L'ordre est: victoire immediate restante, doubles menaces, axes de quatre, axes de trois ouverts, puis nombre total de menaces.
- Le bonus d'un blocage exact `21110` ne peut plus passer devant une case qui coupe plusieurs constructions dangereuses a la fois.
- Dans l'historique fourni, `L6C10` laisse six menaces et quatre axes de trois ouverts; `L9C11` est choisi avec cinq menaces et trois axes.
- Le panneau utilise `DEF-MULTI-CUT` et indique le nombre d'unites de danger supprimees ainsi que les menaces restantes.
- La regression accepte `L9C11` ou `L9C12`, refuse `L6C10` et porte la suite a 51 tests.

## Lead visible et defense active (v138)

- Le panneau `Tour actuel` affiche maintenant le lead: `Bot`, `Adversaire` ou `Neutre`.
- Le lead est estime par la pression forcing, les axes de quatre, les trois ouverts, les trois barres et les constructions ouvertes.
- Une nouvelle priorite `DEF-LEAD-HOLD` coupe une menace S de X quand ce blocage conserve une prochaine attaque O.
- Dans l'ouverture fournie, `L8C9` est rejete car sa construction `020020` laisse X reprendre l'initiative; `L9C10` coupe le `01110` central et garde une suite O.
- Les coups polyvalents `bloquer + construire` peuvent maintenant etre expliques comme maintien du lead lorsqu'ils jouent ce role.
- La regression de l'historique `START O` refuse `L8C9`, exige `L9C10`, et verifie que le lead revient au bot.

## Memoire d'opportunites (v139)

- Le bot conserve maintenant une petite memoire des opportunites de tempo encore valides pendant l'ouverture.
- Une opportunite est gardee si O force X a bloquer, si ce blocage ne cree pas de menace S pour X, et si O conserve une construction exploitable ensuite.
- La priorite `ATTACK-OPPORTUNITY` passe devant une attaque simple qui ne cree pas de suite durable.
- Dans l'historique `START O` apres `X@L9C9`, `L10C10` est rejete et `L11C8` est choisi: O force le blocage du quatre puis garde une suite de construction.
- La memoire est videe quand la position change par reset, undo, chargement ou replay, et elle oublie automatiquement les opportunites invalides.
- La recherche tactique respecte un budget plus strict avant 14 coups; les positions avancees gardent la recherche profonde pour les multi-menaces.

## Construction 3x2 prioritaire (v140)

- Le moteur reconnait maintenant une construction de lead `3x2`: un trois ouvert O accompagne d'un deux ouvert exploitable.
- Quand ce coup reste safe apres simulation des reponses X, il peut passer devant un blocage local qui ne fait que repousser l'initiative.
- Cette branche est branchee explicitement sur le panneau comme `ATTACK-LEAD-3X2`.
- La regression couvre la position `START O` ou `L10C9` doit battre `L10C8` en gardant le lead par construction.

## Construction 2x2 reconnue (v141)

- Le moteur identifie maintenant explicitement les constructions `2x2`: deux directions ouvertes qui se developpent en meme coup.
- Le label d'analyse passe a `construction 2x2` quand une case ouvre au moins deux axes `open-two`.
- Un bonus de pression de lead est ajoute a cette structure pour qu'elle ne soit plus lue comme deux petits motifs isolés.
- La regression verifie un croisement simple qui doit produire deux axes ouverts et recevoir le label `construction 2x2`.
