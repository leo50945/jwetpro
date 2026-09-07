# Vocabulaire des figures du bot

## Alphabet

Une ligne du plateau est transformee en chaine de chiffres:

- `0`: case vide.
- `1`: pion adverse, donc le joueur humain `X`.
- `2`: pion du bot `O`.

Une figure est reconnue dans les quatre directions et dans les deux sens. Ainsi,
une seule definition couvre ses formes horizontale, verticale et diagonales, ainsi
que son miroir.

Exemples:

- `01110`: trois humains avec deux extremites libres, menace tres dangereuse.
- `21110`: trois humains bloques par le bot d'un cote, potentiel de menace.
- `02220`: meme figure ouverte pour le bot.
- `12220`: meme figure fermee pour le bot.

Le bord du plateau coupe une figure. Il n'ajoute pas un nouveau chiffre au
vocabulaire: les codes publics restent exclusivement `0`, `1` et `2`.

## Classes

| Classe | Sens | Exemples |
| --- | --- | --- |
| `WIN` | cinq deja formes | `11111`, `22222` |
| `PERDU` | deux victoires immediates: un blocage unique ne sert plus | `011110`, `022220` |
| `S+` | menace double majeure encore evitable avant sa formation | combinaison 4x3 |
| `S` | reponse urgente normalement obligatoire | `01110`, quatre ferme, trois ouvert avec trou |
| `A` | potentiel fort mais pas urgence absolue | `21110`, trois ferme avec trou |
| `B` | construction utile | `0110`, `01010` |
| `C` | graine lointaine | `010010` |

## Catalogue humain actuel

Le catalogue du bot est genere automatiquement en echangeant `1` et `2`.

| Code | Nom | Classe |
| --- | --- | --- |
| `11111` | victoire | `WIN` |
| `011110` | quatre ouvert: perdu s'il est deja forme | `PERDU` |
| `11101`, `11011`, `10111` | quatre avec trou, une defense precise | `S` |
| `0111010`, `0110110`, `0101110` | quatre espace, une defense precise | `S` |
| `211110` | quatre ferme | `S` |
| `01110` | trois ouvert | `S` |
| `010110`, `011010` | trois ouvert avec trou | `S` |
| `0101010` | trois ouvert espace | `S` |
| `21110` | trois ferme | `A` |
| `210110`, `211010` | trois ferme avec trou | `A` |
| `0110` | deux ouvert | `B` |
| `01010` | deux espace | `B` |
| `010010` | graine large | `C` |

## Regles d'extension

Pour ajouter une figure, il faut definir son code une seule fois dans
`HUMAN_FIGURES` avec son nom, sa classe et son caractere forcant. Le moteur cree
automatiquement la version du bot et les miroirs.

Une figure detectee pendant l'evaluation doit contenir la case candidate. Cela
evite d'attribuer a un nouveau coup une menace qui existait deja ailleurs.

Une double menace n'est pas seulement un grand score: elle exige des figures
forcantes dans plusieurs directions independantes. Cette distinction protege le
bot contre les faux plans bases sur plusieurs lectures de la meme ligne.

Pour bloquer un trois ouvert, le bot compare toutes les extremites. Pour chaque
blocage, il simule la meilleure prolongation adverse sur l'extremite restante et
mesure separement les figures creees dans les autres directions. Il prefere
l'extremite qui force l'adversaire a former son quatre barre sans construire en
meme temps un deux ouvert, un trois ou une autre intersection dangereuse.

Cette comparaison part de la figure reellement presente (`01110`, `010110`,
`011010` ou `0101010`) et non du code obtenu apres le prochain coup. Le panneau
Debug doit donc afficher le code actuel, par exemple `01110`, meme si la
prolongation simulee formerait ensuite `011110`.

La lecture ne s'arrete pas a la figure creee immediatement. Pour chaque extremite,
le bot simule aussi la fermeture obligatoire du futur quatre barre, puis classe
les cinq meilleures constructions humaines dans un rayon de quatre cases autour
du pion de prolongation. Une extremite qui donne seulement un deux ferme inutile
peut ainsi etre preferee a une zone apparemment vide mais entouree de plusieurs
appuis utilisables aux coups suivants.

Les possibilites locales sont mesurees de maniere causale: une future figure ne
compte que si son code contient effectivement le pion de prolongation simule.
Une menace deja presente dans le voisinage mais independante de cette extremite
ne peut donc plus gonfler artificiellement son danger.

Dans cet horizon de construction uniquement, un futur trois deja ferme comme
`21110` ou `211010` est fortement reduit: il reste controlable par une seule
defense. Plusieurs `0110` independants ont davantage de valeur, car chacun peut
devenir un trois ouvert et fournir de nouveaux chemins d'attaque.

Si plusieurs extremites bloquent correctement le meme trois present, une attaque
defensive a priorite: une extremite qui cree simultanement `02220` pour le bot est
choisie avant une extremite purement defensive. Les codes comme `10111`, qui
decrivent une figure que X pourrait creer au prochain coup, utilisent une regle
de prevention separee et ne sont jamais presentes comme des extremites d'un
`01110` deja forme.

Un trois barre continu est bloque sur sa case vide exacte: `21110` devient
`21112`, et sa forme inversee `01112` devient `21112`. Jouer une case plus loin
et produire `211102` ne neutralise pas la construction et est interdit par la
regle defensive.

Un quatre a sortie unique du bot n'est plus automatiquement prioritaire sur un
trois ouvert adverse. Si un coup transforme `2202` ou `2022` en quatre, le moteur
pose virtuellement le X obligatoire, puis cherche une continuation O complete.
Sans cinq, `4x3`, `4x4` ou autre chaine forcee prouvee apres ce blocage, le quatre
est seulement un gain de tempo: O ferme d'abord le `01110` deja present.

Le bot conserve `ATTACK-FOUR` devant le trois adverse dans deux cas seulement:
le quatre possede deja plusieurs sorties gagnantes, ou la recherche apres le X
obligatoire prouve une nouvelle suite gagnante. La logique affiche alors
explicitement `victoire-forcee-prouvee`.

En dehors de ces deux preuves, un trois ouvert humain deja present est une
defense obligatoire. `DEF-OPEN-THREE` passe devant un score `FORCE`, devant un
trois barre causal et devant toute semence annoncee par `DEF-TRAP-S+`. Une
recherche de piege incomplete ne peut donc plus faire ignorer un `01110` visible.
La position v125 verifie explicitement ce cas: le coup eloigne sous la ligne est
rejete et O ferme une extremite du trois horizontal.

Les deux ouverts presents (`0110`, `01010`, `010010`) sont examines avant un
trois ferme controlable. Pour chaque case qui transformerait le deux en trois
ouvert, le bot mesure les figures causales et les constructions locales futures.
Il bloque l'extremite la plus riche avec `DEF-OPEN-TWO`. Cette priorite ne depasse
pas une victoire immediate, un quatre forcant du bot ou un futur 3x3 de rang
superieur.

Deux croissances de meme rang ne sont pas equivalentes. Le moteur compte aussi
le nombre de directions `open-two` que X obtiendrait en jouant chaque case. Une
case qui ouvre deux reseaux distincts est coupee avant une case qui ne complete
qu'un `01010` local, meme si cette derniere possede un meilleur petit motif
secondaire. Dans l'historique v124, cette largeur fait choisir `L8C11` devant
`L9C13` et coupe la diagonale qui aurait ensuite mene au cinq X.

Pendant la construction, le moteur examine egalement ce que le pion defensif
cree pour O. Il additionne les branches X neutralisees et les directions `0220`
ouvertes pour O. Si X ne possede pas une bifurcation critique sur deux axes, un
blocage qui cree deux paires O passe devant un blocage de meme rang qui n'en cree
qu'une. Le blocage compte comme un effet: `L12C10`, avec ses deux diagonales O,
est donc un coup a trois effets. Cette polyvalence reste un departage et ne passe
pas devant un trois ouvert ou un `21110` actif.

## Deux niveaux d'attaque

Le niveau 1 est la victoire assuree. O possede plusieurs sorties ou une recherche
forcee complete. Le moteur enregistre alors les coups dans `activeRobotPlan` et
utilise `ATTACK-FOUR`, puis `ATTACK-PLAN` tant que le flux suit la preuve.

Le niveau 2 est le lead sur. Un candidat doit creer un trois ouvert O avec un
deux developpable ou une seconde figure de rang A, par exemple `02220 + 12202`
avec `L11C9`, ou `02220 + 0220` avec `L13C10`. Cette attaque ne promet pas encore
la victoire et ne cree pas de `activeRobotPlan`.

O pose virtuellement l'attaque de niveau 2 et chaque defense X. Ces pions X
doivent rester sous S, ne produire aucune victoire immediate et laisser une
prochaine attaque O. Le moteur compare ensuite le potentiel O restant dans la
pire reponse X et le soutien local autour du candidat.

Le lead sur n'est pas limite par un numero de tour. Il est refuse si X possede
deja un trois ouvert, un `21110` prioritaire, une chaine `4x3/4x4` prouvee ou une
construction qui ouvre plusieurs branches secondaires. Ainsi le bot peut garder
l'initiative sans ignorer un danger reel.

## Course des trois ouverts

Un terminal gagnant ne suffit pas si la preuve suppose de mauvais choix de X.
Lorsqu'un `01110` X existe deja, X possede le premier tempo de trois ouvert. Si
une suite O atteint seulement un `3x3`, X n'est pas oblige de le defendre comme
le moteur le supposait auparavant: il peut lever son propre quatre et reprendre
la course.

Pour dépasser ce trois ouvert, le plan O doit satisfaire au moins une condition:

1. rester une chaine pure de quatre forces jusqu'a la victoire;
2. terminer directement en `4x4`;
3. contenir un coup qui cree simultanement un quatre et un trois ouvert, donc un
   `4x3`.

Chaque etape de recherche enregistre ses directions de quatre, de trois ouvert
et ses reponses defensives. Une etape avec `responseOptions` represente un tempo
de trois. Si ce tempo apparait sans `4x3` alors que X avait deja son `01110`, la
preuve est marquee `raceRejected` et O bloque le trois X.

Avant `ATTACK-FOUR`, le bot compte les sorties gagnantes. Avec au moins deux
sorties, le quatre est considere gagnant. Avec une seule sortie, il simule le X
oblige de la fermer. Si ce pion force cree une figure S ou S+ ou gagne
directement, le quatre est marque empoisonne et retire de toutes les branches
d'attaque et de planification.

Une sortie unique non empoisonnee ne constitue pas encore une victoire. Si la
recherche ne retourne aucune continuation gagnante apres le blocage X, le coup
est classe `tempoOnly`: il peut forcer un pion, mais il n'a pas de plan prouve.
Il est donc lui aussi retire des candidats strategiques prioritaires et ne peut
jamais afficher `victoire-forcee-prouvee`.

Il existe une exception de construction, mais pas une exception de preuve.
Pendant les dix premiers pions, un `tempoOnly` peut devenir `ATTACK-LEAD` s'il
cree en meme temps une seconde figure de rang B et un deux O developpable. Le X
force est simule: il doit rester sous la classe S, ne creer aucun trois ouvert et
laisser a O une continuation constructive. Ainsi `L11C10` peut prendre le tempo
et conserver son deux, sans etre presente comme une victoire certaine.

Cette exception n'enregistre aucun `activeRobotPlan`. Apres le blocage X, toute
la position est recalculee. Un nouveau quatre comme `L14C12` doit alors apporter
sa propre preuve ou sa propre valeur constructive; il ne peut pas heriter du
label du coup precedent.

`ATTACK-FOUR` est reserve aux quatre a plusieurs sorties et aux sorties uniques
dont la continuation contient de vrais coups calcules. Dans ce second cas, les
coups, les blocages obligatoires et les reponses possibles sont enregistres dans
`activeRobotPlan`. Au tour suivant, `ATTACK-PLAN` annonce que le flux suit le
plan de victoire deja prouve; le moteur ne presente pas le coup suivant comme
une nouvelle attaque independante.

Quand plusieurs `21110` ou `01112` existent, le bot ne prend plus le premier
trouve. Pour chacun, il simule l'extension X, le blocage force O, les constructions
causales suivantes et le nombre de deux ouverts situes dans un rayon de quatre
cases. Le zero dont la prolongation nourrit la zone la plus dangereuse est ferme
en priorite; un trois ferme isole peut donc etre laisse intact.

Quand l'adversaire possede deja deux coups qui gagnent immediatement, notamment
avec `011110`, le bot ne gaspille pas son tour a fermer une seule extremite. Il
joue alors son meilleur coup offensif. En revanche, une case qui permettrait a
l'adversaire de creer cette figure reste un coup preventif important.

## Pion piege et chaine de quatre

Un `0110` peut etre une semence de classe `S+` meme si sa valeur immediate est
seulement `B`. Le moteur cherche maintenant jusqu'a quatre attaques humaines
successives de la forme suivante:

1. X cree un quatre avec une seule case gagnante.
2. O est oblige de remplir cette case.
3. X cree un nouveau quatre, puis recommence.
4. La chaine termine par une victoire, un quatre ouvert ou deux cases gagnantes
   distinctes, donc un `4x3` ou un `4x4` tactique.

Le moteur conserve les coups d'attaque, les blocages obligatoires et les cases
gagnantes de la branche. Avant de lancer un simple trois ouvert, O occupe un de
ces points causaux. Cette decision porte la priorite `DEF-TRAP-S+` et la logique
affiche explicitement `pion-piege`.

Si un point causal est deja le zero exact d'un `21110` ou de sa forme inversee
`01112`, cette fermeture devient prioritaire sur les autres points de la chaine.
Le bot joue directement sur ce zero, produit `21112` et annonce
`DEF-TRAP-CLOSED-THREE`. Un trois barre eloigne qui ne fait pas partie de la
chaine S+ ne recoit pas cette priorite.

Une defense n'est plus acceptee parce qu'elle coupe seulement la premiere chaine
trouvee. Le moteur rassemble les points des quatre forces, des trois barres, des
deux ouverts et des meilleures constructions X. Il pose virtuellement O sur
chaque candidat, puis relance toute la recherche X. Une case qui laisse un autre
`4x4`, un autre `4x3` ou une combinaison gagnante est rejetee.

Lorsqu'une suite forcee atteint un trois ouvert, les deux extremites defensives
sont simulees separement. Le plan X n'est declare force que s'il survit aux deux
reponses de O. Cette verification evite de confondre une menace forte avec une
victoire mathematiquement assuree.

Quand plusieurs zeros exacts de `21110` sont disponibles, le score local ne suffit
pas. Pour chaque zero, le moteur contraint X a commencer sa recherche sur cette
case et mesure la longueur de la suite gagnante obtenue. Le zero qui lancerait la
victoire X avec le moins d'attaques est ferme en premier. Cette urgence racine
permet notamment de choisir `L7C13` avant des trois barres localement plus riches.

Les defenses de classe S ne sont plus limitees aux vingt meilleurs scores. Tous
les coups X de rang 60 ou plus entrent dans le groupe defensif avant que les
finalistes soient soumis a la simulation profonde.

Le depart gagnant le plus court ne suffit pas toujours a departager deux
defenses. Apres chaque pose virtuelle de O, le moteur recompte sur tout le
plateau les coups X de classe S, les directions de quatre, les trois ouverts et
les doubles menaces. Cette largeur residuelle est soustraite au score defensif:
le bot prefere donc une case qui casse plusieurs reseaux simultanement. Dans
l'historique du coup 38, `L13C8` est rejete et la defense choisie doit laisser au
plus autant de menaces S et de trois ouverts que `L15C9`.

## Memoire d'une attaque prouvee

Une preuve offensive n'est plus seulement une justification du premier coup.
Le moteur conserve la liste des attaques O, des blocages X obligatoires et des
reponses possibles aux trois ouverts. Tant que X joue une reponse couverte par
la preuve, O reprend le coup suivant sous la priorite `ATTACK-PLAN`.

Quand un trois ouvert offre deux extremites, les deux ont ete verifiees avant
l'annonce. Apres le choix reel de X, le moteur relance une recherche bornee sur
la position obtenue et remplace la suite representative par la branche exacte.
Si X sort de l'ensemble prouve, le plan est annule et toute la position est
evaluee de nouveau.

Les recherches defensives profondes sont concentrees sur les six racines les
plus dangereuses selon la classe, le danger du trois barre et le score de la
construction. Leurs budgets de noeuds sont fixes: la reconnaissance d'un piege
ne depend donc plus du temps deja consomme par les calculs precedents.
