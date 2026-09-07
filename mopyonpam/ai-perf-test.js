const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

function makeElement() {
  const element = {
    children: [], dataset: {}, textContent: "", className: "", firstElementChild: null,
    classList: {
      add() {}, remove() {}, toggle() {},
    },
    setAttribute() {}, addEventListener() {},
    appendChild(child) {
      const children = child?.isFragment ? child.children : [child];
      element.children.push(...children);
      element.firstElementChild = element.children[0] ?? null;
    },
    replaceChildren(...children) { element.children = children; },
    closest() { return null; },
  };
  return element;
}

function loadGame() {
  const elements = new Map();
  const document = {
    addEventListener() {},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    },
    createElement: makeElement,
    createDocumentFragment() {
      const fragment = makeElement();
      fragment.isFragment = true;
      return fragment;
    },
  };
  const context = {
    console, document, performance, Math, Date, JSON, Map, Set,
    window: { gsap: null, lucide: null, setTimeout() { return 0; } },
    setTimeout() { return 0; },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  vm.runInContext(`${source}
globalThis.__ai = {
  TOTAL_CELLS, HUMAN, ROBOT, EMPTY, state, getIndex, analyzeMove,
  rankMoves, chooseRobotMove, getDetectedThreats, clearAnalysisCache
};`, context);
  return context.__ai;
}

function clear(ai) {
  ai.state.board = Array(ai.TOTAL_CELLS).fill(ai.EMPTY);
  ai.state.moves = 0;
  ai.state.moveHistory = [];
  ai.state.activeRobotPlan = null;
  ai.clearAnalysisCache();
}

function place(ai, row, col, player) {
  const index = ai.getIndex(row, col);
  ai.state.board[index] = player;
  ai.state.moves += 1;
  ai.state.moveHistory.push({ index, player });
  ai.clearAnalysisCache();
}

function measure(label, maxMs, fn) {
  const startedAt = performance.now();
  const result = fn();
  const elapsed = performance.now() - startedAt;
  console.log(`${label}: ${elapsed.toFixed(1)}ms`);
  if (elapsed > maxMs) throw new Error(`${label} trop lent: ${elapsed.toFixed(1)}ms > ${maxMs}ms`);
  return result;
}

const ai = loadGame();

clear(ai);
measure("ouverture vide", 100, () => ai.chooseRobotMove());

clear(ai);
place(ai, 10, 8, ai.HUMAN);
place(ai, 10, 9, ai.HUMAN);
measure("analyse 01110", 50, () => ai.analyzeMove(ai.getIndex(10, 10), ai.HUMAN));
measure("liste menaces sur 2 ouvert", 500, () => ai.getDetectedThreats());
measure("decision apres 2 ouvert", 1500, () => ai.chooseRobotMove());

clear(ai);
[
  [10, 10, ai.ROBOT], [10, 11, ai.HUMAN], [9, 10, ai.ROBOT], [11, 11, ai.HUMAN],
  [8, 10, ai.ROBOT], [12, 11, ai.HUMAN], [9, 9, ai.ROBOT], [12, 12, ai.HUMAN],
  [8, 8, ai.ROBOT], [13, 13, ai.HUMAN], [7, 9, ai.ROBOT], [13, 12, ai.HUMAN],
  [7, 8, ai.ROBOT], [14, 11, ai.HUMAN], [6, 10, ai.ROBOT], [14, 10, ai.HUMAN],
].forEach(([row, col, player]) => place(ai, row, col, player));

measure("classement position developpee", 800, () => ai.rankMoves(ai.ROBOT, 12));
measure("decision position developpee", 1800, () => ai.chooseRobotMove());
measure("visuel position developpee", 800, () => ai.getDetectedThreats());
