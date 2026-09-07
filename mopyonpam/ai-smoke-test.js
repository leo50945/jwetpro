const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

function makeElement(tagName = "div") {
  const element = {
    tagName,
    children: [],
    dataset: {},
    textContent: "",
    className: "",
    firstElementChild: null,
    classList: {
      add(...names) {
        const classes = new Set(element.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        element.className = [...classes].join(" ");
      },
      remove(...names) {
        const classes = new Set(element.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.delete(name));
        element.className = [...classes].join(" ");
      },
      toggle(name, force) {
        const classes = new Set(element.className.split(/\s+/).filter(Boolean));
        const add = force === undefined ? !classes.has(name) : Boolean(force);
        if (add) classes.add(name);
        else classes.delete(name);
        element.className = [...classes].join(" ");
      },
    },
    setAttribute(name, value) {
      element[name] = String(value);
    },
    appendChild(child) {
      const children = child?.isFragment ? child.children : [child];
      for (const item of children) element.children.push(item);
      element.firstElementChild = element.children[0] ?? null;
      return child;
    },
    replaceChildren(...children) {
      element.children = [];
      children.forEach((child) => element.appendChild(child));
    },
    querySelector(selector) {
      if (selector === "span") return element.children.find((child) => child.tagName === "span") ?? null;
      return null;
    },
    addEventListener() {},
    closest(selector) {
      return selector === ".cell" && element.className.includes("cell") ? element : null;
    },
  };
  return element;
}

function loadGame() {
  const elements = new Map();
  const storage = new Map();
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement(selector));
      return elements.get(selector);
    },
    createElement: makeElement,
    createDocumentFragment() {
      const fragment = makeElement("fragment");
      fragment.isFragment = true;
      return fragment;
    },
    addEventListener() {},
  };
  const context = {
    console,
    document,
    performance,
    window: {
      gsap: null,
      lucide: null,
      localStorage,
      setTimeout() { return 0; },
    },
    setTimeout() { return 0; },
    Math,
    Date,
    JSON,
    Map,
    Set,
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  vm.runInContext(`${source}
globalThis.__ai = {
  BOARD_SIZE, TOTAL_CELLS, HUMAN, ROBOT, EMPTY, CELL_CODE, FIGURE_CLASSES, REPLAY_BASE_DELAY_MS,
  PATTERN_BOOK, state, boardEl, getIndex, getRowCol, getLineCode, analyzeMove,
  getCandidateMoves, findImmediateWins, rankMoves, rankAttackMoves, evaluateDefensiveCut,
  chooseBestDefensiveCut,
  findExistingOpenThrees, chooseExistingOpenThreeCut, evaluateExistingThreeCut,
  findExistingOpenTwos, chooseExistingOpenTwoCut, findExistingClosedThreeCuts, chooseRobotMove,
  chooseLeadMaintainingCut, evaluateRobotOpportunity, chooseRobotOpportunity, getLeadState,
  getDetectedThreats, getMoveHistoryText, updateLastMoveMarker, updateMoveHistory, clearAnalysisCache,
  undoLastMove, placeSymbol, searchForcingWin, findForcedAttackDefense, evaluateRobotFourSafety, evaluateRobotLeadAttack
  , updateThreatVisualization, toggleThreatVisualization, createPositionSnapshot, saveCurrentPosition,
  loadSavedPosition, deleteSavedPosition, getSavedPositions, replayState, startSavedReplay,
  playReplay, pauseReplay, stepReplay, seekReplay, branchFromReplay, cycleReplaySpeed,
  setReplaySpeed, handleReplayShortcut
};`, context, { filename: "script.js" });
  return context.__ai;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clearBoard(ai) {
  ai.state.board = Array(ai.TOTAL_CELLS).fill(ai.EMPTY);
  ai.state.moves = 0;
  ai.state.moveHistory = [];
  ai.state.currentPlayer = ai.HUMAN;
  ai.state.isGameOver = false;
  ai.state.isRobotThinking = false;
  ai.state.roundResult = null;
  ai.state.lastRobotDecision = null;
  ai.state.activeRobotPlan = null;
  ai.state.startingPlayer = ai.HUMAN;
  ai.clearAnalysisCache();
}

function place(ai, row, col, player) {
  const index = ai.getIndex(row, col);
  ai.state.board[index] = player;
  ai.state.moves += 1;
  ai.state.moveHistory.push({ index, player });
  ai.clearAnalysisCache();
  return index;
}

function testVocabularyContainsCoreFigures(ai) {
  const figures = new Set(ai.PATTERN_BOOK.map((figure) => `${figure.owner}:${figure.code}`));
  assert(figures.has("X:01110"), "La figure humaine 01110 manque du dictionnaire.");
  assert(figures.has("X:21110"), "La figure humaine barree 21110 manque du dictionnaire.");
  assert(figures.has("O:02220"), "La figure bot 02220 manque du dictionnaire.");
  assert(figures.has("O:12220"), "La figure bot barree 12220 manque du dictionnaire.");
}

function testAbsoluteBoardEncoding(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 9, ai.ROBOT);
  const center = ai.getIndex(10, 10);
  const line = ai.getLineCode(center, 0, 1, 3).code;
  assert(line.includes("120"), `L'encodage absolu devait contenir 120, recu ${line}.`);
}

function testOpenThree01110(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 9, ai.HUMAN);
  const analysis = ai.analyzeMove(ai.getIndex(10, 10), ai.HUMAN);
  assert(analysis.primaryCode === "01110", `Figure attendue 01110, recue ${analysis.primaryCode}.`);
  assert(analysis.className === "S", "01110 doit etre classe S.");
  assert(analysis.forcing, "01110 doit etre une figure forcing.");
}

function testClosedThree21110(ai) {
  clearBoard(ai);
  place(ai, 10, 7, ai.ROBOT);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 9, ai.HUMAN);
  const analysis = ai.analyzeMove(ai.getIndex(10, 10), ai.HUMAN);
  assert(analysis.primaryCode === "21110", `Figure attendue 21110, recue ${analysis.primaryCode}.`);
  assert(analysis.className === "A", "21110 doit rester une menace potentielle de classe A.");
  assert(!analysis.forcing, "21110 ne doit pas etre aussi urgent que 01110.");
}

function testBrokenOpenThree(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 10, ai.HUMAN);
  const analysis = ai.analyzeMove(ai.getIndex(10, 11), ai.HUMAN);
  assert(
    analysis.matches.some((match) => match.code === "010110"),
    "Le trois ouvert casse 010110 n'est pas reconnu."
  );
  assert(analysis.className === "S", "Un trois ouvert casse doit etre classe S.");
}

function testRobotUsesDigitTwo(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.ROBOT);
  place(ai, 10, 9, ai.ROBOT);
  const analysis = ai.analyzeMove(ai.getIndex(10, 10), ai.ROBOT);
  assert(analysis.primaryCode === "02220", `La figure O attendue etait 02220, recue ${analysis.primaryCode}.`);
}

function testSpacedThreeByThree(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 12, ai.HUMAN);
  place(ai, 8, 10, ai.HUMAN);
  place(ai, 12, 10, ai.HUMAN);
  const analysis = ai.analyzeMove(ai.getIndex(10, 10), ai.HUMAN);
  assert(analysis.doubleThreat, "Le pivot espace dans deux directions doit etre une double menace.");
  assert(analysis.rank >= 85, "Le 3x3 espace doit etre classe critique.");
}

function testRobotTakesImmediateWin(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.ROBOT);
  place(ai, 10, 9, ai.ROBOT);
  place(ai, 10, 10, ai.ROBOT);
  place(ai, 10, 11, ai.ROBOT);
  place(ai, 4, 4, ai.HUMAN);
  const move = ai.chooseRobotMove();
  assert(move === ai.getIndex(10, 7) || move === ai.getIndex(10, 12), "Le bot n'a pas joue sa victoire immediate.");
  assert(ai.state.lastRobotDecision.priority === "WIN", "La victoire doit avoir la priorite WIN.");
}

function testRobotBlocksImmediateLoss(ai) {
  clearBoard(ai);
  place(ai, 10, 7, ai.ROBOT);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 9, ai.HUMAN);
  place(ai, 10, 10, ai.HUMAN);
  place(ai, 10, 11, ai.HUMAN);
  const move = ai.chooseRobotMove();
  assert(move === ai.getIndex(10, 12), "Le bot n'a pas bloque l'unique victoire X.");
  assert(ai.state.lastRobotDecision.priority === "BLOCK-WIN", "Le blocage doit avoir la priorite BLOCK-WIN.");
}

function testRobotDoesNotWasteMoveOnOpenFour(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 9, ai.HUMAN);
  place(ai, 10, 10, ai.HUMAN);
  place(ai, 10, 11, ai.HUMAN);
  place(ai, 5, 5, ai.ROBOT);
  place(ai, 5, 6, ai.ROBOT);

  const losingEnds = [ai.getIndex(10, 7), ai.getIndex(10, 12)];
  const move = ai.chooseRobotMove();
  assert(!losingEnds.includes(move), "Le bot a gaspille son tour a bloquer une seule extremite de 011110.");
  assert(ai.state.lastRobotDecision.priority === "LOST-ATTACK", "Le quatre ouvert existant doit passer en mode LOST-ATTACK.");
  assert(ai.analyzeMove(move, ai.ROBOT).rank >= 35, "Le bot devait choisir sa meilleure construction offensive.");
}

function testOpenThreeBlockForcesHarmlessEnd(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 9, ai.HUMAN);
  place(ai, 10, 10, ai.HUMAN);
  place(ai, 11, 11, ai.HUMAN);
  place(ai, 4, 4, ai.ROBOT);

  const move = ai.chooseRobotMove();
  assert(
    move === ai.getIndex(10, 11),
    `Le bot devait bloquer a droite pour forcer X vers l'extremite sans construction, recu ${move}.`
  );
  assert(ai.state.lastRobotDecision.priority === "DEF-OPEN-THREE", "Le trois present devait utiliser sa regle dediee.");
  assert(ai.state.lastRobotDecision.reason.includes("Figure 01110"), "Le Debug doit afficher la figure actuelle 01110.");
  assert(!ai.state.lastRobotDecision.reason.includes("Figure 011110"), "Le Debug affiche encore la figure future 011110.");
  assert(ai.state.lastRobotDecision.tags.includes("extremite-simulee"), "La simulation des extremites n'a pas ete utilisee.");
}

function testSpacedThreeBlockAvoidsSecondaryTwo(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 10, ai.HUMAN);
  place(ai, 10, 12, ai.HUMAN);
  place(ai, 11, 11, ai.HUMAN);
  place(ai, 9, 9, ai.ROBOT);
  place(ai, 12, 12, ai.ROBOT);
  place(ai, 4, 4, ai.ROBOT);

  const selectedCut = ai.chooseExistingOpenThreeCut(ai.HUMAN);
  const move = ai.chooseRobotMove();
  assert(
    move === ai.getIndex(10, 9),
    `Le bot devait fermer le trou qui supprime toute prolongation forcante, recu ${move}.`
  );
  assert(selectedCut?.figure.code === "0101010", "La figure espacee actuelle doit etre identifiee explicitement.");
  assert(selectedCut?.remainingReplies.length === 0, "Ce blocage devait supprimer toutes les continuations forcantes de la figure.");
}

function testImagePositionBlocksDenseSide(ai) {
  clearBoard(ai);
  place(ai, 4, 5, ai.HUMAN);
  place(ai, 5, 3, ai.HUMAN);
  place(ai, 5, 5, ai.HUMAN);
  place(ai, 6, 4, ai.HUMAN);
  place(ai, 7, 3, ai.HUMAN);

  place(ai, 3, 5, ai.ROBOT);
  place(ai, 4, 4, ai.ROBOT);
  place(ai, 5, 4, ai.ROBOT);
  place(ai, 7, 5, ai.ROBOT);

  const figure = ai.findExistingOpenThrees(ai.HUMAN).find((item) => item.code === "01110" && item.directionIndex === 3);
  const upperRightCut = ai.evaluateExistingThreeCut(figure, ai.getIndex(4, 6));
  const lowerLeftCut = ai.evaluateExistingThreeCut(figure, ai.getIndex(8, 2));
  const move = ai.chooseRobotMove();
  assert(
    move === ai.getIndex(8, 2),
      `Dans la position de l'image, le bot doit bloquer le cote dense et forcer X vers le deux ferme, recu ${move}. ` +
      `HD=${upperRightCut.futurePotential}[${upperRightCut.futureCandidates.map((item) => `${item.index}:${item.causalRank}:${item.causalMatches.map((match) => match.code).join("+")}`).join("|")}], ` +
      `BG=${lowerLeftCut.futurePotential}[${lowerLeftCut.futureCandidates.map((item) => `${item.index}:${item.causalRank}:${item.causalMatches.map((match) => match.code).join("+")}`).join("|")}].`
  );
  assert(ai.state.lastRobotDecision.reason.includes("Figure 01110"), "La diagonale ouverte actuelle doit etre lue comme 01110.");
}

function testSecondImageProtectsFutureOpenTwo(ai) {
  clearBoard(ai);
  place(ai, 5, 3, ai.HUMAN);
  place(ai, 5, 4, ai.HUMAN);
  place(ai, 5, 5, ai.HUMAN);
  place(ai, 6, 4, ai.HUMAN);
  place(ai, 7, 5, ai.HUMAN);
  place(ai, 7, 6, ai.HUMAN);

  place(ai, 4, 2, ai.ROBOT);
  place(ai, 6, 5, ai.ROBOT);
  place(ai, 6, 6, ai.ROBOT);
  place(ai, 7, 3, ai.ROBOT);
  place(ai, 7, 7, ai.ROBOT);

  const figure = ai.findExistingOpenThrees(ai.HUMAN).find((item) => item.code === "01110" && item.directionIndex === 0);
  const leftCut = ai.evaluateExistingThreeCut(figure, ai.getIndex(5, 2));
  const rightCut = ai.evaluateExistingThreeCut(figure, ai.getIndex(5, 6));
  const selectedCut = ai.chooseExistingOpenThreeCut(ai.HUMAN);
  const move = ai.chooseRobotMove();
  assert(
    move === ai.getIndex(5, 2),
      `Dans la seconde image, le bot doit bloquer l'extremite gauche qui alimente le futur trois ouvert, recu ${move}. ` +
      `Selection=${selectedCut?.index}, gauche=${leftCut.futurePotential}, droite=${rightCut.futurePotential}, ` +
      `G=${leftCut.futureCandidates.map((item) => `${item.index}:${item.analysis.primaryCode}:${item.analysis.rank}`).join("|")}, ` +
      `D=${rightCut.futureCandidates.map((item) => `${item.index}:${item.analysis.primaryCode}:${item.analysis.rank}`).join("|")}.`
  );
  assert(ai.state.lastRobotDecision.reason.includes("Figure 01110"), "Le trois horizontal doit rester identifie comme 01110.");
}

function testThirdImageUsesAttackDefenseOpenThree(ai) {
  clearBoard(ai);
  place(ai, 4, 6, ai.HUMAN);
  place(ai, 6, 5, ai.HUMAN);
  place(ai, 7, 5, ai.HUMAN);
  place(ai, 7, 6, ai.HUMAN);
  place(ai, 8, 2, ai.HUMAN);
  place(ai, 8, 5, ai.HUMAN);
  place(ai, 8, 7, ai.HUMAN);

  place(ai, 4, 3, ai.ROBOT);
  place(ai, 5, 5, ai.ROBOT);
  place(ai, 5, 6, ai.ROBOT);
  place(ai, 6, 4, ai.ROBOT);
  place(ai, 7, 3, ai.ROBOT);
  place(ai, 9, 1, ai.ROBOT);

  const move = ai.chooseRobotMove();
  const expected = ai.getIndex(5, 4);
  assert(move === expected, `Le bot devait bloquer et creer 02220 avec le meme coup, recu ${move}.`);
  const attack = ai.analyzeMove(move, ai.ROBOT);
  assert(attack.primaryCode === "02220", `Le coup attendu devait creer 02220, recu ${attack.primaryCode}.`);
}

function testFourthImageBlocksInsideClosedThree(ai) {
  clearBoard(ai);
  place(ai, 5, 1, ai.HUMAN);
  place(ai, 5, 2, ai.HUMAN);
  place(ai, 5, 3, ai.HUMAN);
  place(ai, 6, 0, ai.HUMAN);
  place(ai, 6, 2, ai.HUMAN);
  place(ai, 7, 3, ai.HUMAN);
  place(ai, 7, 4, ai.HUMAN);

  place(ai, 4, 0, ai.ROBOT);
  place(ai, 5, 0, ai.ROBOT);
  place(ai, 6, 3, ai.ROBOT);
  place(ai, 6, 4, ai.ROBOT);
  place(ai, 7, 1, ai.ROBOT);
  place(ai, 7, 5, ai.ROBOT);

  const openTwoCut = ai.chooseExistingOpenTwoCut(ai.HUMAN);
  const move = ai.chooseRobotMove();
  assert(
    move === ai.getIndex(8, 4),
    `Le bot doit remplir le 0 du 21110 diagonal pour former 21112, pas jouer un cran plus loin; recu ${move}. ` +
      `${ai.state.lastRobotDecision.priority}: ${ai.state.lastRobotDecision.reason}. ` +
      `Deux=${openTwoCut?.figure.code}/${openTwoCut?.growthDanger}/${openTwoCut?.attack.secondaryRank}`
  );
  assert(move !== ai.getIndex(9, 5), "Le bot a encore produit la forme incorrecte 211102.");
  assert(ai.state.lastRobotDecision.priority === "DEF-CLOSED-THREE", "Le blocage exact du trois barre n'a pas ete prioritaire.");
}

function testFutureThreeByThreeOutranksBrokenFour(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 12, ai.HUMAN);
  place(ai, 8, 10, ai.HUMAN);
  place(ai, 12, 10, ai.HUMAN);

  place(ai, 4, 4, ai.HUMAN);
  place(ai, 4, 6, ai.HUMAN);
  place(ai, 4, 7, ai.HUMAN);
  place(ai, 4, 3, ai.ROBOT);
  place(ai, 2, 2, ai.ROBOT);

  const fork = ai.getIndex(10, 10);
  const brokenFour = ai.getIndex(4, 8);
  assert(ai.analyzeMove(fork, ai.HUMAN).doubleThreat, "Le pivot central doit etre reconnu comme futur 3x3.");
  assert(ai.analyzeMove(brokenFour, ai.HUMAN).primaryCode === "10111", "Le cas concurrent doit etre 10111.");
  const move = ai.chooseRobotMove();
  assert(move === fork, `Le futur 3x3 doit etre bloque avant la construction 10111; recu ${move}.`);
}

function testUnprovenRobotFourYieldsToHumanOpenThree(ai) {
  clearBoard(ai);
  place(ai, 6, 9, ai.ROBOT);
  place(ai, 8, 7, ai.ROBOT);
  place(ai, 9, 6, ai.ROBOT);
  place(ai, 5, 10, ai.HUMAN);

  place(ai, 12, 8, ai.HUMAN);
  place(ai, 12, 9, ai.HUMAN);
  place(ai, 12, 10, ai.HUMAN);

  const winningFour = ai.getIndex(7, 8);
  const attack = ai.analyzeMove(winningFour, ai.ROBOT);
  assert(attack.fourDirections > 0 && attack.forcing, "Completer 2202 doit creer un quatre forcant.");
  const evaluation = ai.evaluateRobotFourSafety(
    { index: winningFour, attack },
    performance.now() + 1200
  );
  assert(!evaluation.provenWinningAttack, "Ce quatre de tempo ne devait pas etre presente comme une victoire forcee.");
  const move = ai.chooseRobotMove();
  assert(move !== winningFour, "Le bot a ignore le 01110 humain pour un quatre sans continuation prouvee.");
  assert([ai.getIndex(12, 7), ai.getIndex(12, 11)].includes(move), "Le bot devait fermer une extremite du 01110 humain.");
  assert(ai.state.lastRobotDecision.priority === "DEF-OPEN-THREE", "Le trois ouvert present devait redevenir prioritaire.");
}

function testProvenRobotFourCanOutrankHumanOpenThree(ai) {
  clearBoard(ai);
  place(ai, 10, 6, ai.HUMAN);
  place(ai, 10, 7, ai.ROBOT);
  place(ai, 10, 8, ai.ROBOT);
  place(ai, 10, 9, ai.ROBOT);
  place(ai, 8, 10, ai.ROBOT);
  place(ai, 9, 10, ai.ROBOT);

  place(ai, 15, 7, ai.HUMAN);
  place(ai, 15, 8, ai.HUMAN);
  place(ai, 15, 9, ai.HUMAN);

  const forcingFour = ai.getIndex(10, 10);
  const attack = ai.analyzeMove(forcingFour, ai.ROBOT);
  const evaluation = ai.evaluateRobotFourSafety(
    { index: forcingFour, attack },
    performance.now() + 1600
  );
  assert(evaluation.winningCells.length === 1, "Le premier quatre O devait avoir une seule sortie.");
  assert(evaluation.provenContinuation, "O devait prouver le quatre ouvert vertical apres le blocage X.");

  const move = ai.chooseRobotMove();
  assert(move === forcingFour, "Le bot devait conserver la chaine O mathematiquement gagnante.");
  assert(ai.state.lastRobotDecision.priority === "ATTACK-FOUR", "La continuation prouvee doit utiliser ATTACK-FOUR.");
  assert(
    ai.state.lastRobotDecision.reason.includes("continuation forcee"),
    "Le raisonnement doit expliquer pourquoi le 01110 X peut etre ignore."
  );
}

function testFifthImageBlocksOpenTwoBeforeClosedThree(ai) {
  clearBoard(ai);
  place(ai, 6, 5, ai.HUMAN);
  place(ai, 7, 3, ai.HUMAN);
  place(ai, 7, 5, ai.HUMAN);
  place(ai, 8, 4, ai.HUMAN);
  place(ai, 9, 3, ai.HUMAN);
  place(ai, 10, 4, ai.HUMAN);

  place(ai, 5, 5, ai.ROBOT);
  place(ai, 6, 4, ai.ROBOT);
  place(ai, 6, 6, ai.ROBOT);
  place(ai, 7, 4, ai.ROBOT);
  place(ai, 9, 5, ai.ROBOT);

  const openTwoCut = ai.chooseExistingOpenTwoCut(ai.HUMAN);
  const expectedOpenTwo = ai.analyzeMove(ai.getIndex(8, 3), ai.HUMAN);
  const expectedCounter = ai.analyzeMove(ai.getIndex(8, 3), ai.ROBOT);
  const move = ai.chooseRobotMove();
  const chosenAttack = ai.analyzeMove(move, ai.ROBOT);
  assert(
    move === ai.getIndex(8, 3),
    `Le bot doit fermer le centre du 01010 qui deviendrait 01110 avant le 21110; recu ${move}. ` +
      `${ai.state.lastRobotDecision.priority}: ${ai.state.lastRobotDecision.reason}. ` +
      `Deux=${openTwoCut?.figure.code}@${openTwoCut ? ai.getRowCol(openTwoCut.index).map((value) => value + 1).join("C") : "aucune"}` +
      `/A${openTwoCut?.attack.rank}/D${openTwoCut?.constructionBranches}/O${openTwoCut?.counterConstructionBranches}` +
      `/R${openTwoCut?.richGrowth}/${openTwoCut?.growthDanger}/${openTwoCut?.attack.secondaryRank}; ` +
      `Attendu=A${expectedOpenTwo.rank}/D${expectedOpenTwo.openTwoDirections}/O${expectedCounter.openTwoDirections}/S${expectedOpenTwo.secondaryRank}; ` +
      `Attaque choisie=R${chosenAttack.rank}/S${chosenAttack.secondaryRank}/` +
      `${chosenAttack.matches.filter((match) => match.classInfo.rank >= 60).map((match) => match.code).join(",")}`
  );
  assert(move !== ai.getIndex(10, 2), "Le bot a encore prefere le trois ferme controlable.");
  assert(ai.state.lastRobotDecision.priority === "DEF-OPEN-TWO", "Le 0110 dangereux doit utiliser DEF-OPEN-TWO.");
}

function testConstructionDefenseCutsMostDangerousOpenTwo(ai) {
  clearBoard(ai);
  const moves = [
    [10, 11, ai.HUMAN], [11, 10, ai.ROBOT], [9, 12, ai.HUMAN], [10, 10, ai.ROBOT],
    [8, 13, ai.HUMAN], [7, 14, ai.ROBOT], [10, 13, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const expected = ai.getIndex(7, 10);
  const rejected = ai.getIndex(8, 12);
  const alternate = ai.getIndex(6, 12);
  const move = ai.chooseRobotMove();
  const expectedAttack = ai.analyzeMove(expected, ai.HUMAN);
  const rejectedAttack = ai.analyzeMove(rejected, ai.HUMAN);
  const alternateAttack = ai.analyzeMove(alternate, ai.HUMAN);
  const alternateBuild = ai.analyzeMove(alternate, ai.ROBOT);
  const figures = ai.findExistingOpenTwos(ai.HUMAN)
    .map((figure) => `${figure.code}@${figure.emptyIndices.map((index) => ai.getRowCol(index).map((value) => value + 1).join("C")).join("/")}`);

  assert(
    expectedAttack.openTwoDirections > rejectedAttack.openTwoDirections,
    "L8C11 doit etre reconnu comme une racine ouvrant davantage de branches que L9C13."
  );
  assert(
    move === expected,
    `Le bot devait couper L8C11, racine du reseau diagonal, au lieu de L9C13; recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}. ` +
      `Attaques L8C11=R${expectedAttack.rank}/S${expectedAttack.secondaryRank}/O${expectedAttack.openTwoDirections}, ` +
      `L9C13=R${rejectedAttack.rank}/S${rejectedAttack.secondaryRank}/O${rejectedAttack.openTwoDirections}, ` +
      `L7C13=R${alternateAttack.rank}/S${alternateAttack.secondaryRank}/X${alternateAttack.openTwoDirections}/O${alternateBuild.openTwoDirections}. ` +
      `Figures: ${figures.join(" | ")}.`
  );
  assert(
    ["DEF-OPEN-TWO", "DEF-LEAD-HOLD"].includes(ai.state.lastRobotDecision.priority),
    "La correction doit rester une defense de construction ou maintien du lead."
  );
}

function testOpeningDefensePrefersThreePurposeMove(ai) {
  clearBoard(ai);
  const stones = [
    [11, 11, ai.ROBOT], [11, 12, ai.ROBOT], [11, 13, ai.HUMAN],
    [12, 11, ai.HUMAN], [12, 12, ai.HUMAN],
    [13, 11, ai.ROBOT],
  ];
  stones.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const expected = ai.getIndex(11, 9);
  const rejected = ai.getIndex(11, 12);
  const expectedDefense = ai.analyzeMove(expected, ai.HUMAN);
  const rejectedDefense = ai.analyzeMove(rejected, ai.HUMAN);
  const expectedBuild = ai.analyzeMove(expected, ai.ROBOT);
  const rejectedBuild = ai.analyzeMove(rejected, ai.ROBOT);
  const selectedCut = ai.chooseExistingOpenTwoCut(ai.HUMAN);
  const move = ai.chooseRobotMove();

  assert(
    move === expected,
    `Le bot devait jouer L12C10: blocage X et deux constructions O diagonales; recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}. ` +
      `Defense C10=R${expectedDefense.rank}/O${expectedDefense.openTwoDirections}, C13=R${rejectedDefense.rank}/O${rejectedDefense.openTwoDirections}; ` +
      `Construction O C10=R${expectedBuild.rank}/O${expectedBuild.openTwoDirections}, C13=R${rejectedBuild.rank}/O${rejectedBuild.openTwoDirections}; ` +
      `Coupe=${selectedCut ? ai.getRowCol(selectedCut.index).map((value) => value + 1).join("C") : "aucune"}, priorite=${ai.state.lastRobotDecision?.priority ?? "aucune"}.`
  );
  assert(
    ["DEF-OPEN-TWO", "DEF-LEAD-HOLD"].includes(ai.state.lastRobotDecision?.priority),
    "Ce coup polyvalent doit rester classe comme defense de construction ou maintien du lead."
  );
}

function testRobotLeadPrefersSafeDoubleAttack(ai) {
  clearBoard(ai);
  const stones = [
    [10, 12, ai.HUMAN],
    [11, 11, ai.ROBOT], [11, 12, ai.ROBOT], [11, 13, ai.HUMAN],
    [12, 10, ai.ROBOT], [12, 11, ai.HUMAN], [12, 12, ai.HUMAN],
    [13, 11, ai.ROBOT],
  ];
  stones.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const expected = ai.getIndex(10, 8);
  const rejected = ai.getIndex(11, 13);
  const attack = ai.analyzeMove(expected, ai.ROBOT);
  const rejectedDefense = ai.analyzeMove(rejected, ai.HUMAN);
  const move = ai.chooseRobotMove();

  assert(
    move === expected,
    `Le bot devait exploiter son lead avec L11C9; recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}. ` +
      `Attaque=R${attack.rank}/S${attack.secondaryRank}/T${attack.openThreeDirections}/O${attack.openTwoDirections}/${attack.primaryCode}; ` +
      `danger L12C14=R${rejectedDefense.rank}/S${rejectedDefense.secondaryRank}/${rejectedDefense.primaryCode}; ` +
      `priorite=${ai.state.lastRobotDecision?.priority ?? "aucune"}.`
  );
  assert(
    ["ATTACK-FORCE", "ATTACK-LEAD"].includes(ai.state.lastRobotDecision?.priority),
    "Le raisonnement doit indiquer que O conserve une initiative offensive sure."
  );
}

function testDoubleTwoConstructionIsRecognized(ai) {
  clearBoard(ai);
  place(ai, 10, 11, ai.ROBOT);
  place(ai, 11, 10, ai.ROBOT);

  const analysis = ai.analyzeMove(ai.getIndex(10, 10), ai.ROBOT);
  assert(analysis.openTwoDirections === 2, `Le croisement devait creer deux directions ouvertes, recu ${analysis.openTwoDirections}.`);
  assert(analysis.doubleConstruction, "Le moteur doit reconnaitre explicitement la construction 2x2.");
  assert(analysis.classLabel === "construction 2x2", `Le label devait annoncer une construction 2x2, recu ${analysis.classLabel}.`);
}

function testRobotPrefersLead3x2OverLocalHold(ai) {
  clearBoard(ai);
  ai.state.startingPlayer = ai.ROBOT;
  const stones = [
    [11, 11, ai.ROBOT],
    [12, 10, ai.HUMAN],
    [11, 10, ai.ROBOT],
    [10, 11, ai.HUMAN],
    [11, 9, ai.ROBOT],
    [11, 12, ai.HUMAN],
    [9, 10, ai.ROBOT],
    [9, 9, ai.HUMAN],
    [11, 8, ai.ROBOT],
    [11, 7, ai.HUMAN],
  ];
  stones.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));
  ai.state.currentPlayer = ai.ROBOT;

  const expected = ai.getIndex(9, 8);
  const rejected = ai.getIndex(9, 7);
  const expectedAttack = ai.analyzeMove(expected, ai.ROBOT);
  const rejectedDefense = ai.analyzeMove(rejected, ai.HUMAN);
  const leadAttack = ai.evaluateRobotLeadAttack({ index: expected, attack: expectedAttack }, 0);
  const move = ai.chooseRobotMove();

  assert(
    expectedAttack.openThreeDirections === 1 && expectedAttack.openTwoDirections === 1,
    `Le coup L10C9 devait etre reconnu comme une vraie construction 3x2; recu O=${expectedAttack.openThreeDirections}/2=${expectedAttack.openTwoDirections}.`
  );
  assert(
    move === expected,
    `Le bot devait garder le lead avec L10C9 au lieu du blocage local; recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}. ` +
      `lead3x2=${leadAttack?.safeLead}/${Math.round(leadAttack?.leadScore ?? 0)}; ` +
      `danger X L10C8=${rejectedDefense.primaryCode}/${rejectedDefense.rank}; ` +
      `decision=${ai.state.lastRobotDecision?.priority}/${ai.state.lastRobotDecision?.reason}.`
  );
  assert(
    ai.state.lastRobotDecision?.priority === "ATTACK-LEAD-3X2",
    "Le panneau doit annoncer explicitement la construction 3x2 de maintien du lead."
  );
}

function testEarlyLeadDefenseBlocksCentralOpenThree(ai) {
  clearBoard(ai);
  ai.state.startingPlayer = ai.ROBOT;
  const moves = [
    [11, 11, ai.ROBOT],
    [12, 10, ai.HUMAN],
    [11, 10, ai.ROBOT],
    [10, 11, ai.HUMAN],
    [11, 9, ai.ROBOT],
    [11, 12, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));
  ai.state.currentPlayer = ai.ROBOT;

  const expected = ai.getIndex(8, 9);
  const rejected = ai.getIndex(7, 8);
  const leadCut = ai.chooseLeadMaintainingCut(ai.rankMoves(ai.HUMAN, 12));
  const move = ai.chooseRobotMove();

  assert(
    move === expected,
    `O devait jouer L9C10 pour couper le 01110 central et garder le lead; ` +
      `recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}. ` +
      `leadCut=${leadCut ? ai.getRowCol(leadCut.index).map((value) => value + 1).join("C") : "aucun"}; ` +
      `L8C9 X=${ai.analyzeMove(rejected, ai.HUMAN).primaryCode}/O=${ai.analyzeMove(rejected, ai.ROBOT).primaryCode}; ` +
      `decision=${ai.state.lastRobotDecision?.priority}/${ai.state.lastRobotDecision?.reason}.`
  );
  assert(ai.state.lastRobotDecision?.priority === "DEF-LEAD-HOLD", "Le panneau doit expliquer le maintien du lead.");
  ai.state.board[move] = ai.ROBOT;
  ai.state.moves += 1;
  ai.clearAnalysisCache();
  const lead = ai.getLeadState();
  ai.state.moves -= 1;
  ai.state.board[move] = ai.EMPTY;
  ai.clearAnalysisCache();
  assert(lead.owner === "robot", `Apres L9C10, le visuel devait donner le lead au bot; recu ${lead.owner}/${lead.reason}.`);
}

function testRobotRemembersTempoOpportunityAfterLeadDefense(ai) {
  clearBoard(ai);
  ai.state.startingPlayer = ai.ROBOT;
  const moves = [
    [11, 11, ai.ROBOT],
    [12, 10, ai.HUMAN],
    [11, 10, ai.ROBOT],
    [10, 11, ai.HUMAN],
    [11, 9, ai.ROBOT],
    [11, 12, ai.HUMAN],
    [9, 10, ai.ROBOT],
    [9, 9, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));
  ai.state.currentPlayer = ai.ROBOT;

  const expected = ai.getIndex(10, 7);
  const rejected = ai.getIndex(9, 9);
  const opportunity = ai.evaluateRobotOpportunity(
    ai.evaluateRobotFourSafety({ index: expected, attack: ai.analyzeMove(expected, ai.ROBOT) }, Infinity)
  );
  const move = ai.chooseRobotMove();

  assert(
    move === expected,
    `O devait jouer L11C8 pour forcer le blocage et garder une opportunite; ` +
      `recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}. ` +
      `opportunite=${opportunity?.useful}/${Math.round(opportunity?.opportunityScore ?? 0)}/` +
      `${opportunity?.followUp ? ai.getRowCol(opportunity.followUp.index).map((value) => value + 1).join("C") : "aucune"}; ` +
      `L10C10=${ai.analyzeMove(rejected, ai.ROBOT).primaryCode}/${ai.analyzeMove(rejected, ai.ROBOT).rank}; ` +
      `decision=${ai.state.lastRobotDecision?.priority}/${ai.state.lastRobotDecision?.reason}.`
  );
  assert(ai.state.lastRobotDecision?.priority === "ATTACK-OPPORTUNITY", "Le panneau doit annoncer la memoire d'opportunite.");
  assert(
    ai.state.robotOpportunities.some((item) => item.index === expected),
    "La memoire du bot doit conserver L11C8 comme opportunite active."
  );
}

function testVisibleOpenThreeOutranksTrapSeed(ai) {
  clearBoard(ai);
  const stones = [
    [3, 4, ai.ROBOT], [3, 5, ai.ROBOT],
    [4, 5, ai.HUMAN], [4, 7, ai.ROBOT],
    [5, 4, ai.ROBOT], [5, 5, ai.ROBOT], [5, 6, ai.HUMAN], [5, 8, ai.ROBOT],
    [6, 5, ai.HUMAN], [6, 6, ai.ROBOT], [6, 7, ai.HUMAN],
    [7, 5, ai.HUMAN], [7, 6, ai.HUMAN], [7, 8, ai.ROBOT],
    [8, 5, ai.HUMAN], [8, 6, ai.HUMAN], [8, 7, ai.HUMAN],
    [9, 4, ai.HUMAN], [10, 3, ai.ROBOT],
  ];
  stones.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const leftEnd = ai.getIndex(7, 3);
  const rightEnd = ai.getIndex(7, 7);
  const openThree = ai.findExistingOpenThrees(ai.HUMAN)
    .find((figure) => figure.code === "01110" && figure.indices.includes(ai.getIndex(7, 5)));
  assert(openThree, "Le 01110 horizontal visible dans l'image doit etre detecte avant la decision.");

  const move = ai.chooseRobotMove();
  assert(
    [leftEnd, rightEnd].includes(move),
    `Le bot devait fermer une extremite du 01110; recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}.`
  );
  assert(
    ai.state.lastRobotDecision?.priority === "DEF-OPEN-THREE",
    `Une semence piegee ne doit pas passer devant le trois ouvert (${ai.state.lastRobotDecision?.priority ?? "aucune"}).`
  );
}

function testPoisoned122220IsRejected(ai) {
  clearBoard(ai);
  place(ai, 5, 4, ai.HUMAN);
  place(ai, 5, 5, ai.ROBOT);
  place(ai, 5, 6, ai.ROBOT);
  place(ai, 5, 7, ai.ROBOT);

  place(ai, 4, 9, ai.HUMAN);
  place(ai, 6, 9, ai.HUMAN);
  place(ai, 4, 8, ai.HUMAN);
  place(ai, 6, 8, ai.HUMAN);

  place(ai, 12, 8, ai.HUMAN);
  place(ai, 12, 9, ai.HUMAN);
  place(ai, 12, 11, ai.HUMAN);
  place(ai, 2, 2, ai.ROBOT);

  const poisonedFour = ai.getIndex(5, 8);
  const forcedBlock = ai.getIndex(5, 9);
  assert(ai.analyzeMove(poisonedFour, ai.ROBOT).fourDirections > 0, "Le coup test doit creer 122220.");
  assert(ai.analyzeMove(forcedBlock, ai.HUMAN).rank >= 85, "Le blocage force de X doit creer une menace S.");

  const move = ai.chooseRobotMove();
  assert(move !== poisonedFour, "Le bot a joue le 122220 empoisonne qui construit une menace S pour X.");
  assert(ai.state.lastRobotDecision.priority !== "ATTACK-FOUR", "Un quatre a sortie unique empoisonnee ne doit pas utiliser ATTACK-FOUR.");
}

function testRobotKeepsStrongerAttack(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.ROBOT);
  place(ai, 10, 9, ai.ROBOT);
  place(ai, 5, 5, ai.HUMAN);
  place(ai, 14, 14, ai.HUMAN);
  const move = ai.chooseRobotMove();
  const attack = ai.analyzeMove(move, ai.ROBOT);
  assert(attack.rank >= 50, "Le bot devait poursuivre une figure offensive active.");
  assert(
    ["ATTACK", "ATTACK-FORCE", "ATTACK-LEAD", "ATTACK-LEAD-2X2", "ATTACK-LEAD-3X2", "FORCE", "PLAN"].includes(ai.state.lastRobotDecision.priority),
    "Le bot a abandonne son attaque sans urgence X."
  );
}

function testEmptyBoardCenter(ai) {
  clearBoard(ai);
  const move = ai.chooseRobotMove();
  assert(move === ai.getIndex(10, 10), `Le centre attendu etait ${ai.getIndex(10, 10)}, recu ${move}.`);
}

function testHumanOpeningGetsDiagonalResponse(ai) {
  clearBoard(ai);
  const humanMove = place(ai, 10, 10, ai.HUMAN);
  const robotMove = ai.chooseRobotMove();
  const [humanRow, humanCol] = ai.getRowCol(humanMove);
  const [robotRow, robotCol] = ai.getRowCol(robotMove);

  assert(Math.abs(robotRow - humanRow) === 1, "Le premier O n'est pas sur une ligne diagonale adjacente.");
  assert(Math.abs(robotCol - humanCol) === 1, "Le premier O a ete place en bas ou a cote du premier X.");
  assert(ai.state.lastRobotDecision.priority === "OPEN-DIAGONAL", "La priorite d'ouverture diagonale n'a pas ete utilisee.");
}

function testDiagonalOpeningWorksOnBorders(ai) {
  const openings = [[0, 0], [0, 10], [19, 19], [10, 0]];

  for (const [row, col] of openings) {
    clearBoard(ai);
    const humanMove = place(ai, row, col, ai.HUMAN);
    const robotMove = ai.chooseRobotMove();
    const [humanRow, humanCol] = ai.getRowCol(humanMove);
    const [robotRow, robotCol] = ai.getRowCol(robotMove);
    assert(!ai.state.board[robotMove], "La reponse diagonale doit rester un coup legal.");
    assert(
      Math.abs(robotRow - humanRow) === 1 && Math.abs(robotCol - humanCol) === 1,
      `Ouverture non diagonale depuis le bord ${row},${col}.`
    );
  }
}

function testThreatListUsesCodes(ai) {
  clearBoard(ai);
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 9, ai.HUMAN);
  const threats = ai.getDetectedThreats();
  assert(threats.some((threat) => threat.player === ai.HUMAN && threat.code === "01110"), "Le visuel ne remonte pas le code 01110.");
}

function testThreatColorsCanBeHidden(ai) {
  clearBoard(ai);
  ai.state.showThreats = true;
  place(ai, 10, 8, ai.HUMAN);
  place(ai, 10, 9, ai.HUMAN);
  ai.updateThreatVisualization();
  assert(
    ai.boardEl.children.some((cell) => cell.className.includes("threat-human")),
    "Les reperes rouges devraient etre visibles avant le basculement."
  );

  ai.toggleThreatVisualization();
  assert(!ai.state.showThreats, "Le bouton devait desactiver les reperes.");
  assert(
    ai.boardEl.children.every((cell) => !cell.className.includes("threat-")),
    "Les couleurs de menace sont restees sur le plateau."
  );

  ai.toggleThreatVisualization();
  assert(ai.state.showThreats, "Le second clic devait restaurer les reperes.");
}

function testLastMoveMarkerFollowsHistory(ai) {
  clearBoard(ai);
  const first = place(ai, 10, 10, ai.HUMAN);
  const second = place(ai, 9, 9, ai.ROBOT);
  ai.updateLastMoveMarker();

  assert(!ai.boardEl.children[first].className.includes("last-move"), "L'ancien pion est encore marque comme dernier coup.");
  assert(ai.boardEl.children[second].className.includes("last-move"), "Le dernier pion ne porte pas son repere visuel.");
  assert(
    ai.boardEl.children.filter((cell) => cell.className.includes("last-move")).length === 1,
    "Un seul pion doit etre marque comme dernier coup."
  );
}

function testMoveHistoryExportFormat(ai) {
  clearBoard(ai);
  place(ai, 10, 10, ai.HUMAN);
  place(ai, 9, 9, ai.ROBOT);
  place(ai, 10, 11, ai.HUMAN);
  const history = ai.getMoveHistoryText();

  assert(history.includes("START X"), "Le joueur de depart manque dans l'export.");
  assert(
    history.includes("MOVES 1:X@L11C11;2:O@L10C10;3:X@L11C12"),
    `L'ordre ou les coordonnees exportees sont incorrects: ${history}`
  );
}

function testUndoMovesOneStoneAtATime(ai) {
  clearBoard(ai);
  const first = place(ai, 10, 10, ai.HUMAN);
  const second = place(ai, 9, 9, ai.ROBOT);
  ai.state.currentPlayer = ai.HUMAN;
  ai.updateLastMoveMarker();

  assert(ai.undoLastMove(), "Le premier Undo devait retirer le coup de O.");
  assert(ai.state.board[second] === ai.EMPTY, "Le dernier pion O est reste sur le plateau.");
  assert(ai.state.board[first] === ai.HUMAN, "Undo a retire plus d'un pion.");
  assert(ai.state.moves === 1 && ai.state.moveHistory.length === 1, "Le compteur ou l'historique n'a pas recule d'un coup.");
  assert(ai.state.currentPlayer === ai.ROBOT, "Le tour devait revenir au joueur O annule.");
  assert(ai.boardEl.children[first].className.includes("last-move"), "Le repere n'est pas revenu sur le pion precedent.");
  assert(!ai.getMoveHistoryText().includes("O@L10C10"), "L'export contient encore le coup annule.");

  assert(ai.undoLastMove(), "Le second Undo devait retirer le coup de X.");
  assert(ai.state.board[first] === ai.EMPTY, "Le pion X est reste apres le second Undo.");
  assert(ai.state.moves === 0 && ai.state.moveHistory.length === 0, "Le plateau devait revenir a zero coup.");
  assert(ai.state.currentPlayer === ai.HUMAN, "Le tour devait revenir au joueur X annule.");
  assert(!ai.undoLastMove(), "Undo devait refuser de reculer au-dela du debut.");
}

function testUndoWinningMoveRollsBackScore(ai) {
  clearBoard(ai);
  const winningMove = place(ai, 10, 10, ai.HUMAN);
  ai.state.currentPlayer = ai.HUMAN;
  ai.state.isGameOver = true;
  ai.state.roundResult = ai.HUMAN;
  ai.state.scores.X = 1;
  ai.boardEl.classList.add("game-over");

  assert(ai.undoLastMove(), "Le coup gagnant devait pouvoir etre annule.");
  assert(ai.state.board[winningMove] === ai.EMPTY, "Le coup gagnant est reste sur le plateau.");
  assert(ai.state.scores.X === 0, "Le point de victoire n'a pas ete retire.");
  assert(ai.state.roundResult === null && !ai.state.isGameOver, "La partie n'a pas ete rouverte.");
  assert(!ai.boardEl.className.includes("game-over"), "Le plateau porte encore l'etat de fin de partie.");
}

function testSavedPositionRestoresExactBoardAndHistory(ai) {
  clearBoard(ai);
  place(ai, 8, 9, ai.HUMAN);
  place(ai, 9, 10, ai.ROBOT);
  place(ai, 8, 10, ai.HUMAN);
  ai.state.currentPlayer = ai.HUMAN;
  ai.state.startingPlayer = ai.HUMAN;
  ai.state.showThreats = false;
  const expectedBoard = ai.state.board.join("|");
  const expectedHistory = JSON.stringify(ai.state.moveHistory);
  const saved = ai.saveCurrentPosition("Ouverture a analyser");

  clearBoard(ai);
  place(ai, 2, 2, ai.ROBOT);
  ai.state.lastRobotDecision = { priority: "TEST" };
  ai.state.activeRobotPlan = { steps: [1, 2, 3] };
  const loaded = ai.loadSavedPosition(saved.id);

  assert(loaded, "La position sauvegardee doit pouvoir etre chargee.");
  assert(ai.state.board.join("|") === expectedBoard, "Le plateau restaure doit etre strictement identique.");
  assert(JSON.stringify(ai.state.moveHistory) === expectedHistory, "L'historique restaure doit etre strictement identique.");
  assert(ai.state.moves === 3, "Le compteur de coups doit etre restaure.");
  assert(ai.state.currentPlayer === ai.HUMAN, "Le prochain joueur doit etre restaure.");
  assert(ai.state.showThreats === false, "Le choix d'affichage des menaces doit etre restaure.");
  assert(ai.state.lastRobotDecision?.priority === "REPLAY-ARCHIVE", "Une ancienne decision du bot ne doit pas survivre au chargement; l'archive doit signaler le debug manquant.");
  assert(ai.state.activeRobotPlan === null, "Un ancien plan du bot ne doit pas contaminer la position chargee.");
}

function testSavedPositionCanBeDeleted(ai) {
  for (const position of ai.getSavedPositions()) ai.deleteSavedPosition(position.id);
  clearBoard(ai);
  place(ai, 10, 10, ai.HUMAN);
  const first = ai.saveCurrentPosition("Position A");
  const second = ai.saveCurrentPosition("Position B");

  assert(ai.getSavedPositions().length === 2, "Les deux positions doivent etre conservees.");
  assert(ai.deleteSavedPosition(first.id), "La suppression d'une position existante doit reussir.");
  const remaining = ai.getSavedPositions();
  assert(remaining.length === 1 && remaining[0].id === second.id, "Seule la position non supprimee doit rester.");
  assert(!ai.loadSavedPosition(first.id), "Une position supprimee ne doit plus pouvoir etre chargee.");
}

function prepareThreeMoveReplay(ai, name) {
  for (const position of ai.getSavedPositions()) ai.deleteSavedPosition(position.id);
  clearBoard(ai);
  const first = place(ai, 8, 8, ai.HUMAN);
  const second = place(ai, 9, 9, ai.ROBOT);
  const third = place(ai, 8, 9, ai.HUMAN);
  ai.state.currentPlayer = ai.ROBOT;
  const saved = ai.saveCurrentPosition(name);
  assert(ai.startSavedReplay(saved.id, false), "Le replay sauvegarde doit pouvoir demarrer.");
  return { first, second, third };
}

function testSavedGameReplayMovesOneStoneAtATime(ai) {
  const { first, second, third } = prepareThreeMoveReplay(ai, "Replay trois coups");
  assert(ai.state.moves === 0 && ai.state.board.every((cell) => cell === ai.EMPTY), "Le replay doit commencer sur un plateau vide.");
  assert(ai.stepReplay(1), "Le replay doit avancer d'un coup.");
  assert(ai.state.moves === 1 && ai.state.board[first] === ai.HUMAN, "La premiere image doit contenir seulement le premier X.");
  ai.stepReplay(1);
  assert(ai.state.moves === 2 && ai.state.board[second] === ai.ROBOT && !ai.state.board[third], "La seconde image doit contenir exactement deux pions.");
  ai.seekReplay(3);
  assert(ai.state.moves === 3 && ai.state.board[third] === ai.HUMAN, "L'avance rapide doit restaurer la position finale.");
  assert(ai.cycleReplaySpeed() === 2, "La vitesse doit passer de 1x a 2x.");
  ai.seekReplay(0);
  assert(ai.playReplay() && ai.replayState.isPlaying, "Le bouton lecture doit demarrer le replay.");
  assert(ai.pauseReplay() && !ai.replayState.isPlaying, "Le bouton pause doit arreter le replay sans perdre le curseur.");
}

function testReplayCanBranchAndBeSavedAgain(ai) {
  prepareThreeMoveReplay(ai, "Replay a bifurquer");
  ai.seekReplay(2);
  const discardedMove = ai.replayState.moves[2];
  assert(ai.branchFromReplay(false), "Une branche doit pouvoir etre creee depuis le replay en pause.");
  assert(ai.replayState.positionId === null, "Le mode replay doit se fermer apres la bifurcation.");
  assert(ai.state.moveHistory.length === 2 && !ai.state.board[discardedMove.index], "Les coups futurs doivent etre abandonnes, pas les coups passes.");

  const branchIndex = place(ai, 7, 8, ai.HUMAN);
  ai.state.currentPlayer = ai.ROBOT;
  const branch = ai.saveCurrentPosition("Nouvelle direction");
  assert(branch.moveHistory.length === 3, "La nouvelle branche sauvegardee doit contenir son historique propre.");
  assert(branch.moveHistory[2].index === branchIndex, "Le nouveau troisieme coup doit remplacer l'ancien futur.");
}

function testReplayKeyboardShortcutsAndTwoSecondPace(ai) {
  prepareThreeMoveReplay(ai, "Replay clavier");
  assert(ai.REPLAY_BASE_DELAY_MS === 2000, "A vitesse 1x, chaque pion doit attendre deux secondes.");
  ai.seekReplay(0);
  let prevented = false;
  const keyboardEvent = (key, tagName = "DIV") => ({
    key,
    target: { tagName, isContentEditable: false },
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault() { prevented = true; },
  });

  assert(ai.handleReplayShortcut(keyboardEvent("ArrowRight")), "La fleche droite doit avancer le replay.");
  assert(prevented && ai.replayState.cursor === 1, "Le raccourci doit avancer exactement d'un coup.");
  prevented = false;
  assert(ai.handleReplayShortcut(keyboardEvent(" ")), "Espace doit lancer le replay.");
  assert(ai.replayState.isPlaying, "Espace doit mettre le replay en lecture.");
  ai.handleReplayShortcut(keyboardEvent(" "));
  assert(!ai.replayState.isPlaying, "Un second Espace doit mettre le replay en pause.");
  assert(ai.handleReplayShortcut(keyboardEvent("4")) && ai.replayState.speed === 4, "La touche 4 doit choisir la vitesse 4x.");
  assert(!ai.handleReplayShortcut(keyboardEvent(" ", "INPUT")), "Les raccourcis doivent etre ignores dans le champ de nom.");
}

function testReplayRestoresRobotReasoning(ai) {
  for (const position of ai.getSavedPositions()) ai.deleteSavedPosition(position.id);
  clearBoard(ai);
  place(ai, 10, 10, ai.HUMAN);
  const robotIndex = ai.getIndex(11, 11);
  ai.state.lastRobotDecision = {
    index: robotIndex,
    priority: "ATTACK-LEAD",
    reason: "Le bot maintient le lead avec un trois ouvert. Figure 02220.",
    tags: ["attaque", "lead", "trois-ouvert"],
  };
  ai.placeSymbol(robotIndex, ai.ROBOT);
  ai.state.currentPlayer = ai.HUMAN;
  const saved = ai.saveCurrentPosition("Replay avec raisonnement");

  assert(saved.moveHistory[1].decision?.priority === "ATTACK-LEAD", "La sauvegarde doit attacher la decision au coup O.");
  ai.state.lastRobotDecision = null;
  assert(ai.startSavedReplay(saved.id, false), "Le replay avec raisonnement doit pouvoir demarrer.");
  ai.stepReplay(1);
  assert(ai.state.lastRobotDecision === null, "La justification O ne doit pas apparaitre avant son coup.");
  ai.stepReplay(1);
  assert(ai.state.lastRobotDecision?.priority === "ATTACK-LEAD", "Le replay doit restaurer la priorite originale du bot.");
  assert(ai.state.lastRobotDecision?.reason.includes("02220"), "Le replay doit restaurer la figure et la justification originales.");
  assert(ai.state.lastRobotDecision?.tags.includes("trois-ouvert"), "Le replay doit restaurer les tags de decision.");

  prepareThreeMoveReplay(ai, "Ancienne archive sans debug");
  ai.stepReplay(2);
  assert(ai.state.lastRobotDecision?.priority === "REPLAY-ARCHIVE", "Une ancienne sauvegarde doit signaler le raisonnement manquant.");
}

function testMultiThreatDefenseOutranksRemoteClosedThree(ai) {
  clearBoard(ai);
  ai.state.startingPlayer = ai.ROBOT;
  const moves = [
    [11, 11, ai.ROBOT], [12, 10, ai.HUMAN], [11, 10, ai.ROBOT], [10, 11, ai.HUMAN],
    [11, 9, ai.ROBOT], [11, 8, ai.HUMAN], [10, 9, ai.ROBOT], [12, 9, ai.HUMAN],
    [12, 11, ai.ROBOT], [13, 12, ai.HUMAN], [11, 12, ai.ROBOT], [11, 13, ai.HUMAN],
    [13, 10, ai.ROBOT], [10, 13, ai.HUMAN], [10, 12, ai.ROBOT], [9, 13, ai.HUMAN],
    [12, 13, ai.ROBOT], [8, 12, ai.HUMAN], [10, 14, ai.ROBOT], [8, 11, ai.HUMAN],
    [8, 13, ai.ROBOT], [7, 11, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));
  ai.state.currentPlayer = ai.ROBOT;

  const move = ai.chooseRobotMove();
  const accepted = [ai.getIndex(8, 10), ai.getIndex(8, 11)];
  assert(
    accepted.includes(move),
    `O devait couper plusieurs dangers par L9C11/L9C12, pas ${ai.getRowCol(move).map((value) => value + 1).join("C")}; ` +
      `decision=${ai.state.lastRobotDecision?.priority}/${ai.state.lastRobotDecision?.reason}`
  );
  assert(ai.state.lastRobotDecision?.priority === "DEF-MULTI-CUT", "Le panneau doit identifier le blocage simultane de plusieurs menaces.");
}

function testReportedHistoryAvoidsRemoteClosedThree(ai) {
  clearBoard(ai);
  const moves = [
    [8, 10, ai.HUMAN], [9, 11, ai.ROBOT], [8, 11, ai.HUMAN],
    [8, 12, ai.ROBOT], [10, 10, ai.HUMAN], [9, 10, ai.ROBOT],
    [9, 9, ai.HUMAN], [8, 8, ai.ROBOT], [10, 8, ai.HUMAN],
    [11, 7, ai.ROBOT], [9, 7, ai.HUMAN], [10, 9, ai.ROBOT],
    [11, 9, ai.HUMAN], [8, 6, ai.ROBOT], [12, 10, ai.HUMAN],
    [13, 11, ai.ROBOT], [12, 8, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const closed = ai.findExistingClosedThreeCuts(ai.HUMAN).map((figure) => {
    const attack = ai.analyzeMove(figure.blockIndex, ai.HUMAN);
    return `${figure.code}@${ai.getRowCol(figure.blockIndex).map((value) => value + 1).join(",")}:R${attack.rank}/S${attack.secondaryRank}`;
  });
  const move = ai.chooseRobotMove();
  const rejected = ai.getIndex(6, 10);
  assert(
    move !== rejected,
    `Le bot a reproduit le blocage lointain L7C11. Trois fermes detectes: ${closed.join(" | ")}.`
  );
  assert(
    move === ai.getIndex(12, 6),
    `Le bot devait traiter le 21110 actif en L13C7; recu ${ai.getRowCol(move).map((value) => value + 1).join(",")}.`
  );
}

function testHiddenOpenTwoTrapIsClassSPlus(ai) {
  clearBoard(ai);
  const moves = [
    [9, 10, ai.HUMAN], [10, 11, ai.ROBOT], [9, 11, ai.HUMAN], [9, 12, ai.ROBOT],
    [11, 10, ai.HUMAN], [10, 10, ai.ROBOT], [10, 9, ai.HUMAN], [9, 8, ai.ROBOT],
    [11, 8, ai.HUMAN], [12, 7, ai.ROBOT], [11, 9, ai.HUMAN], [11, 7, ai.ROBOT],
    [12, 9, ai.HUMAN], [13, 9, ai.ROBOT], [10, 7, ai.HUMAN], [9, 6, ai.ROBOT],
    [8, 9, ai.HUMAN], [9, 9, ai.ROBOT], [8, 11, ai.HUMAN], [7, 12, ai.ROBOT],
    [8, 10, ai.HUMAN], [9, 5, ai.ROBOT], [9, 7, ai.HUMAN], [10, 6, ai.ROBOT],
    [12, 8, ai.HUMAN], [8, 4, ai.ROBOT], [7, 3, ai.HUMAN], [8, 12, ai.ROBOT],
    [10, 12, ai.HUMAN], [6, 12, ai.ROBOT], [5, 12, ai.HUMAN], [11, 13, ai.ROBOT],
    [5, 11, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const move = ai.chooseRobotMove();
  const decision = ai.state.lastRobotDecision;
  assert(move !== ai.getIndex(7, 5), "Le bot a encore joue O@L8C6 et ignore le pion piege.");
  assert(move !== ai.getIndex(6, 8), "Le bot a encore joue O@L7C9 et laisse la seconde chaine vers le trois ouvert horizontal.");
  assert(
    decision?.priority?.startsWith("DEF-TRAP"),
    `Le bot n'a pas classe la defense multi-branche comme un piege S+ (${decision?.priority ?? "aucune"}).`
  );

}

function testNewVictoryHistoryProvesMoveThirtyFourWasLosing(ai) {
  clearBoard(ai);
  const moves = [
    [9, 10, ai.HUMAN], [10, 11, ai.ROBOT], [9, 11, ai.HUMAN], [9, 12, ai.ROBOT],
    [11, 10, ai.HUMAN], [10, 10, ai.ROBOT], [10, 9, ai.HUMAN], [9, 8, ai.ROBOT],
    [11, 8, ai.HUMAN], [12, 7, ai.ROBOT], [11, 9, ai.HUMAN], [11, 7, ai.ROBOT],
    [12, 9, ai.HUMAN], [13, 9, ai.ROBOT], [10, 7, ai.HUMAN], [9, 6, ai.ROBOT],
    [8, 9, ai.HUMAN], [9, 9, ai.ROBOT], [8, 11, ai.HUMAN], [7, 12, ai.ROBOT],
    [8, 10, ai.HUMAN], [9, 5, ai.ROBOT], [9, 7, ai.HUMAN], [10, 6, ai.ROBOT],
    [12, 8, ai.HUMAN], [8, 4, ai.ROBOT], [7, 3, ai.HUMAN], [8, 12, ai.ROBOT],
    [10, 12, ai.HUMAN], [6, 12, ai.ROBOT], [5, 12, ai.HUMAN], [11, 13, ai.ROBOT],
    [5, 11, ai.HUMAN], [7, 9, ai.ROBOT], [6, 11, ai.HUMAN], [7, 11, ai.ROBOT],
    [7, 10, ai.HUMAN], [4, 13, ai.ROBOT], [5, 10, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const move = ai.chooseRobotMove();
  assert(
    move === ai.getIndex(5, 9) && ai.state.lastRobotDecision?.priority === "BLOCK-WIN",
    "Au coup 40, O doit bloquer la victoire immediate L6C10, meme si la position est deja perdue."
  );

  ai.state.board[move] = ai.ROBOT;
  ai.state.moves += 1;
  const fatalExtension = ai.getIndex(4, 8);
  ai.state.board[fatalExtension] = ai.HUMAN;
  ai.state.moves += 1;
  ai.clearAnalysisCache();
  const winningCells = ai.findImmediateWins(ai.HUMAN);
  ai.state.moves -= 2;
  ai.state.board[fatalExtension] = ai.EMPTY;
  ai.state.board[move] = ai.EMPTY;
  ai.clearAnalysisCache();
  assert(winningCells.length >= 2, "X@L5C9 devait prouver les deux sorties gagnantes laissees par O@L7C9.");
}

function testSecondTrapHistoryBlocksCausalClosedThree(ai) {
  clearBoard(ai);
  const moves = [
    [8, 11, ai.HUMAN], [9, 10, ai.ROBOT], [8, 10, ai.HUMAN], [8, 9, ai.ROBOT],
    [10, 11, ai.HUMAN], [9, 11, ai.ROBOT], [9, 12, ai.HUMAN], [8, 13, ai.ROBOT],
    [10, 13, ai.HUMAN], [11, 14, ai.ROBOT], [10, 12, ai.HUMAN], [10, 14, ai.ROBOT],
    [11, 12, ai.HUMAN], [12, 12, ai.ROBOT], [9, 14, ai.HUMAN], [8, 15, ai.ROBOT],
    [7, 12, ai.HUMAN], [8, 12, ai.ROBOT], [7, 10, ai.HUMAN], [6, 9, ai.ROBOT],
    [7, 11, ai.HUMAN], [8, 16, ai.ROBOT], [8, 14, ai.HUMAN], [9, 15, ai.ROBOT],
    [11, 13, ai.HUMAN], [7, 17, ai.ROBOT], [6, 18, ai.HUMAN], [7, 9, ai.ROBOT],
    [9, 9, ai.HUMAN], [5, 9, ai.ROBOT], [4, 9, ai.HUMAN], [10, 8, ai.ROBOT],
    [4, 10, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const move = ai.chooseRobotMove();
  const accepted = [ai.getIndex(6, 12), ai.getIndex(5, 11)];
  assert(
    accepted.includes(move),
    `Le bot devait fermer L7C13 ou le 21110 causal plus large L6C12; recu ${ai.getRowCol(move).map((value) => value + 1).join(",")}.`
  );
}

function testThirdTrapHistoryMinimizesResidualThreats(ai) {
  clearBoard(ai);
  const moves = [
    [11, 9, ai.HUMAN], [10, 10, ai.ROBOT], [11, 10, ai.HUMAN], [11, 11, ai.ROBOT],
    [9, 9, ai.HUMAN], [10, 9, ai.ROBOT], [10, 8, ai.HUMAN], [11, 7, ai.ROBOT],
    [9, 7, ai.HUMAN], [8, 6, ai.ROBOT], [9, 8, ai.HUMAN], [9, 6, ai.ROBOT],
    [8, 8, ai.HUMAN], [7, 8, ai.ROBOT], [10, 6, ai.HUMAN], [11, 5, ai.ROBOT],
    [12, 8, ai.HUMAN], [11, 8, ai.ROBOT], [12, 10, ai.HUMAN], [13, 11, ai.ROBOT],
    [12, 9, ai.HUMAN], [11, 4, ai.ROBOT], [11, 6, ai.HUMAN], [10, 5, ai.ROBOT],
    [8, 7, ai.HUMAN], [12, 3, ai.ROBOT], [13, 2, ai.HUMAN], [12, 11, ai.ROBOT],
    [10, 11, ai.HUMAN], [14, 11, ai.ROBOT], [15, 11, ai.HUMAN], [9, 12, ai.ROBOT],
    [15, 10, ai.HUMAN], [12, 7, ai.ROBOT], [13, 6, ai.HUMAN], [9, 10, ai.ROBOT],
    [8, 11, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const move = ai.chooseRobotMove();
  const residualProfile = (index) => {
    ai.state.board[index] = ai.ROBOT;
    ai.state.moves += 1;
    ai.clearAnalysisCache();
    const threats = ai.getCandidateMoves(2)
      .map((candidate) => ai.analyzeMove(candidate, ai.HUMAN))
      .filter((analysis) => analysis.rank >= 85);
    ai.state.moves -= 1;
    ai.state.board[index] = ai.EMPTY;
    ai.clearAnalysisCache();
    return {
      count: threats.length,
      fours: threats.reduce((total, threat) => total + threat.fourDirections, 0),
      threes: threats.reduce((total, threat) => total + threat.openThreeDirections, 0),
    };
  };
  const selectedProfile = residualProfile(move);
  const suggestedProfile = residualProfile(ai.getIndex(14, 8));
  assert(
    ai.state.lastRobotDecision?.priority?.startsWith("DEF-TRAP") ||
      ai.state.lastRobotDecision?.priority === "DEF-MULTI-CUT",
    `Le bot devait utiliser une defense multi-menaces; recu ${ai.state.lastRobotDecision?.priority ?? "aucune"}.`
  );
  assert(move !== ai.getIndex(12, 7), "Le bot a reproduit le coup perdant O@L13C8.");
  assert(
    selectedProfile.count <= suggestedProfile.count && selectedProfile.threes <= suggestedProfile.threes,
    "La defense choisie devait laisser moins de menaces S et de trois ouverts que L15C9."
  );
}

function testProven22022PlanIsFollowed(ai) {
  clearBoard(ai);
  const moves = [
    [11, 11, ai.HUMAN], [10, 10, ai.ROBOT], [10, 11, ai.HUMAN], [9, 11, ai.ROBOT],
    [11, 9, ai.HUMAN], [11, 10, ai.ROBOT], [12, 10, ai.HUMAN], [13, 11, ai.ROBOT],
    [13, 9, ai.HUMAN], [14, 8, ai.ROBOT], [12, 9, ai.HUMAN], [14, 9, ai.ROBOT],
    [12, 8, ai.HUMAN], [12, 7, ai.ROBOT], [14, 10, ai.HUMAN], [15, 11, ai.ROBOT],
    [12, 12, ai.HUMAN], [12, 11, ai.ROBOT], [10, 12, ai.HUMAN], [9, 13, ai.ROBOT],
    [11, 12, ai.HUMAN], [13, 12, ai.ROBOT], [10, 9, ai.HUMAN], [9, 9, ai.ROBOT],
    [12, 13, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const falseFour = ai.getIndex(15, 10);
  const attack = ai.analyzeMove(falseFour, ai.ROBOT);
  assert(attack.primaryCode === "22022", `La figure initiale attendue est 22022, recue ${attack.primaryCode}.`);

  let move = ai.chooseRobotMove();
  assert(move === falseFour && ai.state.lastRobotDecision?.priority === "ATTACK-FOUR", "O devait lancer le plan prouve avec L16C11.");
  place(ai, 15, 10, ai.ROBOT);
  place(ai, 13, 10, ai.HUMAN);

  move = ai.chooseRobotMove();
  assert(move === ai.getIndex(14, 9), "Apres X@L14C11, le plan devait poursuivre avec O@L15C10.");
  assert(ai.state.lastRobotDecision?.priority === "ATTACK-PLAN", "La continuation devait utiliser le plan verrouille.");
  place(ai, 14, 9, ai.ROBOT);
  place(ai, 12, 7, ai.HUMAN);

  move = ai.chooseRobotMove();
  assert(move === ai.getIndex(13, 12), "Apres X@L13C8, O devait jouer L14C13, pas recalculer L9C10.");
  place(ai, 13, 12, ai.ROBOT);
  place(ai, 14, 13, ai.HUMAN);

  move = ai.chooseRobotMove();
  assert(move === ai.getIndex(12, 13), "Le plan devait terminer par O@L13C14.");
  place(ai, 12, 13, ai.ROBOT);

  let winningCells = ai.findImmediateWins(ai.ROBOT);
  for (let continuation = 0; continuation < 3 && winningCells.length < 2; continuation += 1) {
    const response = ai.state.activeRobotPlan?.expectedHumanMoves?.[0];
    assert(response !== undefined, "Le plan devait memoriser les reponses legales au trois ouvert O.");
    place(ai, ...ai.getRowCol(response), ai.HUMAN);
    move = ai.chooseRobotMove();
    assert(ai.state.lastRobotDecision?.priority === "ATTACK-PLAN", "O devait reprendre la branche gagnante correspondant au blocage X choisi.");
    place(ai, ...ai.getRowCol(move), ai.ROBOT);
    ai.clearAnalysisCache();
    winningCells = ai.findImmediateWins(ai.ROBOT);
  }
  assert(winningCells.length >= 2, "La suite verrouillee devait terminer avec deux sorties gagnantes O.");
}

function testReported022221DoesNotInventWinningPlan(ai) {
  clearBoard(ai);
  ai.state.startingPlayer = ai.ROBOT;
  const opening = [
    [11, 11, ai.ROBOT], [12, 12, ai.HUMAN], [11, 12, ai.ROBOT], [11, 13, ai.HUMAN],
    [13, 11, ai.ROBOT], [12, 11, ai.HUMAN], [12, 10, ai.ROBOT], [10, 12, ai.HUMAN],
    [11, 9, ai.ROBOT], [10, 8, ai.HUMAN],
  ];
  opening.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const firstFour = ai.getIndex(10, 9);
  const firstEvaluation = ai.evaluateRobotFourSafety(
    { index: firstFour, attack: ai.analyzeMove(firstFour, ai.ROBOT) },
    Infinity
  );
  assert(
    !firstEvaluation.provenWinningAttack,
    "Le 022221 de L11C10 ne doit pas etre transforme en victoire prouvee sans continuation."
  );

  let move = ai.chooseRobotMove();
  const firstDecision = { ...ai.state.lastRobotDecision };
  assert(
    move === firstFour && firstDecision.priority === "ATTACK-LEAD",
    `Le quatre constructif L11C10 doit conserver le lead sans recevoir ATTACK-FOUR; ` +
      `recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}/${firstDecision.priority}. ` +
      `Attaque=R${firstEvaluation.attack.rank}/S${firstEvaluation.attack.secondaryRank}` +
      `/T${firstEvaluation.attack.openThreeDirections}/O${firstEvaluation.attack.openTwoDirections}` +
      `/tempo=${firstEvaluation.tempoOnly}/bloc=${firstEvaluation.forcedBlockAnalysis?.rank}.`
  );
  assert(!ai.state.activeRobotPlan, "Un lead constructif non prouve ne doit pas creer de faux activeRobotPlan.");

  ai.state.activeRobotPlan = null;
  place(ai, 10, 9, ai.ROBOT);

  const forcedBlock = ai.findImmediateWins(ai.ROBOT)[0];
  assert(forcedBlock === ai.getIndex(10, 7), "Le blocage obligatoire du 022221 devait etre X@L11C8.");
  place(ai, ...ai.getRowCol(forcedBlock), ai.HUMAN);

  const rejected = ai.getIndex(13, 11);
  const secondEvaluation = ai.evaluateRobotFourSafety(
    { index: rejected, attack: ai.analyzeMove(rejected, ai.ROBOT) },
    Infinity
  );
  assert(
    !secondEvaluation.provenWinningAttack,
    "Le 122220 de L14C12 ne possede pas la continuation gagnante annoncee."
  );

  move = ai.chooseRobotMove();
  const secondDecision = ai.state.lastRobotDecision;
  assert(
    move !== rejected && secondDecision?.priority !== "ATTACK-FOUR",
    `O@L14C12 ne doit etre ni choisi ni annonce comme une nouvelle preuve. ` +
      `Premier=${firstDecision.priority}/${firstDecision.reason}; ` +
      `second=${secondDecision?.priority}/${secondDecision?.reason}.`
  );

  const expectedLead = ai.getIndex(12, 9);
  const leadAttack = ai.analyzeMove(expectedLead, ai.ROBOT);
  const chosenLeadAttack = ai.analyzeMove(move, ai.ROBOT);
  const expectedLeadEvaluation = ai.evaluateRobotLeadAttack({ index: expectedLead, attack: leadAttack });
  const chosenLeadEvaluation = ai.evaluateRobotLeadAttack({ index: move, attack: chosenLeadAttack });
  const humanConstruction = ai.chooseExistingOpenTwoCut(ai.HUMAN);
  assert(
    move === expectedLead && secondDecision?.priority === "ATTACK-LEAD",
    `Apres X@L11C8, O devait maintenir le lead avec L13C10; ` +
      `recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}/${secondDecision?.priority}. ` +
      `Attaque=R${leadAttack.rank}/S${leadAttack.secondaryRank}/T${leadAttack.openThreeDirections}` +
      `/O${leadAttack.openTwoDirections}/${leadAttack.primaryCode}; ` +
      `choisi=R${chosenLeadAttack.rank}/S${chosenLeadAttack.secondaryRank}/T${chosenLeadAttack.openThreeDirections}` +
      `/O${chosenLeadAttack.openTwoDirections}/${chosenLeadAttack.primaryCode}` +
      `/XR${Math.max(...(chosenLeadEvaluation?.responses ?? []).map((response) => response.humanConstruction.rank), 0)}` +
      `/attentes=${chosenLeadEvaluation?.responseIndices.length ?? 0}` +
      `/potentiel=${chosenLeadEvaluation?.worstFuturePotential ?? 0}` +
      `/influence=${chosenLeadEvaluation?.localInfluence ?? 0}` +
      `/safe=${chosenLeadEvaluation?.safeLead ?? false}` +
      `/suites=${(chosenLeadEvaluation?.responses ?? []).map((response) => response.followUp ? `${ai.getRowCol(response.followUp.index).map((value) => value + 1).join("C")}:${response.followUp.attack.secondaryRank}/${response.followUp.attack.openTwoDirections}` : "aucune").join("|")}; ` +
      `L13C10=XR${Math.max(...(expectedLeadEvaluation?.responses ?? []).map((response) => response.humanConstruction.rank), 0)}` +
      `/attentes=${expectedLeadEvaluation?.responseIndices.length ?? 0}` +
      `/potentiel=${expectedLeadEvaluation?.worstFuturePotential ?? 0}` +
      `/influence=${expectedLeadEvaluation?.localInfluence ?? 0}` +
      `/safe=${expectedLeadEvaluation?.safeLead ?? false}` +
      `/suites=${(expectedLeadEvaluation?.responses ?? []).map((response) => response.followUp ? `${ai.getRowCol(response.followUp.index).map((value) => value + 1).join("C")}:${response.followUp.attack.secondaryRank}/${response.followUp.attack.openTwoDirections}` : "aucune").join("|")}; ` +
      `construction-X=${humanConstruction ? `${ai.getRowCol(humanConstruction.index).map((value) => value + 1).join("C")}` +
        `/R${humanConstruction.attack.rank}/D${humanConstruction.constructionBranches}` : "aucune"}.`
  );
}

function testThreeByThreeCannotOutraceExistingOpenThree(ai) {
  clearBoard(ai);
  ai.state.startingPlayer = ai.ROBOT;
  const moves = [
    [11, 11, ai.ROBOT], [12, 12, ai.HUMAN], [11, 12, ai.ROBOT], [11, 13, ai.HUMAN],
    [13, 11, ai.ROBOT], [12, 11, ai.HUMAN], [12, 10, ai.ROBOT], [11, 9, ai.HUMAN],
    [10, 12, ai.ROBOT], [13, 9, ai.HUMAN], [10, 9, ai.ROBOT], [10, 10, ai.HUMAN],
    [12, 8, ai.ROBOT], [9, 13, ai.HUMAN], [12, 13, ai.ROBOT], [10, 14, ai.HUMAN],
    [8, 12, ai.ROBOT], [9, 15, ai.HUMAN], [8, 16, ai.ROBOT], [11, 15, ai.HUMAN],
    [12, 16, ai.ROBOT], [10, 15, ai.HUMAN], [8, 15, ai.ROBOT], [10, 16, ai.HUMAN],
  ];
  moves.forEach(([row, col, player]) => place(ai, row - 1, col - 1, player));

  const openThree = ai.findExistingOpenThrees(ai.HUMAN)
    .find((figure) => figure.indices.includes(ai.getIndex(9, 14)) && figure.code === "01110");
  assert(openThree, "Le 01110 horizontal X doit etre present avant la decision O.");

  const rejected = ai.getIndex(6, 11);
  const evaluation = ai.evaluateRobotFourSafety(
    { index: rejected, attack: ai.analyzeMove(rejected, ai.ROBOT) },
    Infinity
  );
  const move = ai.chooseRobotMove();

  assert(
    openThree.emptyIndices.includes(move),
    `O devait fermer le 01110 avant le faux plan 3x3; recu ${ai.getRowCol(move).map((value) => value + 1).join("C")}. ` +
      `Evaluation L7C12=${evaluation.provenWinningAttack}/${evaluation.continuationPlan?.terminal ?? "aucune"}/` +
      `${evaluation.continuationPlan?.steps.map((step) => `${step.code}${step.responseOptions?.length ? "[3x3]" : ""}`).join("->") ?? "sans-plan"}; ` +
      `decision=${ai.state.lastRobotDecision?.priority}/${ai.state.lastRobotDecision?.reason}.`
  );
  assert(ai.state.lastRobotDecision?.priority === "DEF-OPEN-THREE", "Le trois ouvert X doit gagner la course contre un simple 3x3 O.");
  assert(ai.state.lastRobotDecision?.reason.includes("4x3"), "Le panneau doit expliquer pourquoi le 3x3 O ne gagne pas cette course.");
}

function testDecisionBudget(ai) {
  clearBoard(ai);
  const stones = [
    [10, 10, ai.ROBOT], [10, 11, ai.HUMAN], [9, 10, ai.ROBOT], [11, 11, ai.HUMAN],
    [8, 10, ai.ROBOT], [12, 11, ai.HUMAN], [9, 9, ai.ROBOT], [12, 12, ai.HUMAN],
    [8, 8, ai.ROBOT], [13, 13, ai.HUMAN], [7, 9, ai.ROBOT], [13, 12, ai.HUMAN],
  ];
  stones.forEach(([row, col, player]) => place(ai, row, col, player));
  const startedAt = performance.now();
  const move = ai.chooseRobotMove();
  const elapsed = performance.now() - startedAt;
  assert(move !== null && !ai.state.board[move], "Le moteur doit retourner un coup legal.");
  assert(elapsed < 2000, `La decision depasse le budget: ${elapsed.toFixed(1)}ms.`);
}

function run() {
  const ai = loadGame();
  const tests = [
    testVocabularyContainsCoreFigures,
    testDecisionBudget,
    testAbsoluteBoardEncoding,
    testOpenThree01110,
    testClosedThree21110,
    testBrokenOpenThree,
    testRobotUsesDigitTwo,
    testSpacedThreeByThree,
    testRobotTakesImmediateWin,
    testRobotBlocksImmediateLoss,
    testRobotDoesNotWasteMoveOnOpenFour,
    testOpenThreeBlockForcesHarmlessEnd,
    testSpacedThreeBlockAvoidsSecondaryTwo,
    testImagePositionBlocksDenseSide,
    testSecondImageProtectsFutureOpenTwo,
    testThirdImageUsesAttackDefenseOpenThree,
    testFourthImageBlocksInsideClosedThree,
    testFutureThreeByThreeOutranksBrokenFour,
    testUnprovenRobotFourYieldsToHumanOpenThree,
    testProvenRobotFourCanOutrankHumanOpenThree,
    testFifthImageBlocksOpenTwoBeforeClosedThree,
    testConstructionDefenseCutsMostDangerousOpenTwo,
    testOpeningDefensePrefersThreePurposeMove,
    testRobotLeadPrefersSafeDoubleAttack,
    testDoubleTwoConstructionIsRecognized,
    testRobotPrefersLead3x2OverLocalHold,
    testEarlyLeadDefenseBlocksCentralOpenThree,
    testRobotRemembersTempoOpportunityAfterLeadDefense,
    testVisibleOpenThreeOutranksTrapSeed,
    testPoisoned122220IsRejected,
    testRobotKeepsStrongerAttack,
    testEmptyBoardCenter,
    testHumanOpeningGetsDiagonalResponse,
    testDiagonalOpeningWorksOnBorders,
    testThreatListUsesCodes,
    testThreatColorsCanBeHidden,
    testLastMoveMarkerFollowsHistory,
    testMoveHistoryExportFormat,
    testUndoMovesOneStoneAtATime,
    testUndoWinningMoveRollsBackScore,
    testSavedPositionRestoresExactBoardAndHistory,
    testSavedPositionCanBeDeleted,
    testSavedGameReplayMovesOneStoneAtATime,
    testReplayKeyboardShortcutsAndTwoSecondPace,
    testReplayRestoresRobotReasoning,
    testReplayCanBranchAndBeSavedAgain,
    testMultiThreatDefenseOutranksRemoteClosedThree,
    testReportedHistoryAvoidsRemoteClosedThree,
    testHiddenOpenTwoTrapIsClassSPlus,
    testNewVictoryHistoryProvesMoveThirtyFourWasLosing,
    testSecondTrapHistoryBlocksCausalClosedThree,
    testThirdTrapHistoryMinimizesResidualThreats,
    testProven22022PlanIsFollowed,
    testReported022221DoesNotInventWinningPlan,
    testThreeByThreeCannotOutraceExistingOpenThree,
  ];
  const filter = process.argv[2]?.toLowerCase();
  const selected = filter ? tests.filter((test) => test.name.toLowerCase().includes(filter)) : tests;

  for (const test of selected) {
    const startedAt = performance.now();
    process.stdout.write(`${test.name}... `);
    test(ai);
    console.log(`OK (${(performance.now() - startedAt).toFixed(1)}ms)`);
  }
  console.log(`OK: ${selected.length} tests du nouveau moteur passent.`);
}

run();
