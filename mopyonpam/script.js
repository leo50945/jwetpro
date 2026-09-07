const BOARD_SIZE = 20;
const WIN_LENGTH = 5;
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;
const HUMAN = "X";
const ROBOT = "O";
const EMPTY = "";
const SEARCH_TIME_MS = 1400;
const ROOT_CANDIDATE_LIMIT = 12;
const REPLY_CANDIDATE_LIMIT = 8;
const FOLLOW_UP_LIMIT = 5;
const FORCING_CHAIN_DEPTH = 4;
const FORCING_CHAIN_CANDIDATES = 14;
const FORCING_CHAIN_NODE_LIMIT = 480;
const REPLAY_BASE_DELAY_MS = 2000;
const SAVED_POSITIONS_KEY = "gomoku-saved-positions-v1";
const MAX_SAVED_POSITIONS = 50;

const CELL_CODE = Object.freeze({
  [EMPTY]: "0",
  [HUMAN]: "1",
  [ROBOT]: "2",
});

const DIRECTIONS = Object.freeze([
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]);

const FIGURE_CLASSES = Object.freeze({
  WIN: { rank: 100, score: 1000000000, label: "victoire" },
  LOST: { rank: 98, score: 90000000, label: "etat perdu si deja forme" },
  S_PLUS: { rank: 95, score: 90000000, label: "classe S+" },
  S: { rank: 85, score: 18000000, label: "classe S" },
  A: { rank: 60, score: 2400000, label: "classe A" },
  B: { rank: 35, score: 320000, label: "classe B" },
  C: { rank: 15, score: 42000, label: "classe C" },
});

function swapPlayersInCode(code) {
  return code.replace(/[12]/g, (digit) => (digit === "1" ? "2" : "1"));
}

const HUMAN_FIGURES = Object.freeze([
  { key: "FIVE", code: "11111", className: "WIN", family: "five", forcing: true },
  { key: "OPEN_FOUR", code: "011110", className: "LOST", family: "four", forcing: true },
  { key: "BROKEN_FOUR_A", code: "11101", className: "S", family: "four", forcing: true },
  { key: "BROKEN_FOUR_B", code: "11011", className: "S", family: "four", forcing: true },
  { key: "BROKEN_FOUR_C", code: "10111", className: "S", family: "four", forcing: true },
  { key: "OPEN_BROKEN_FOUR_A", code: "0111010", className: "S", family: "four", forcing: true },
  { key: "OPEN_BROKEN_FOUR_B", code: "0110110", className: "S", family: "four", forcing: true },
  { key: "OPEN_BROKEN_FOUR_C", code: "0101110", className: "S", family: "four", forcing: true },
  { key: "CLOSED_FOUR", code: "211110", className: "S", family: "four", forcing: true },
  { key: "OPEN_THREE", code: "01110", className: "S", family: "open-three", forcing: true },
  { key: "BROKEN_OPEN_THREE_A", code: "010110", className: "S", family: "open-three", forcing: true },
  { key: "BROKEN_OPEN_THREE_B", code: "011010", className: "S", family: "open-three", forcing: true },
  { key: "SPACED_OPEN_THREE", code: "0101010", className: "A", family: "spaced-three", forcing: false },
  { key: "CLOSED_THREE", code: "21110", className: "A", family: "closed-three", forcing: false },
  { key: "BROKEN_CLOSED_THREE_A", code: "210110", className: "A", family: "closed-three", forcing: false },
  { key: "BROKEN_CLOSED_THREE_B", code: "211010", className: "A", family: "closed-three", forcing: false },
  { key: "OPEN_TWO", code: "0110", className: "B", family: "open-two", forcing: false },
  { key: "SPACED_TWO", code: "01010", className: "C", family: "open-two", forcing: false },
  { key: "WIDE_TWO", code: "010010", className: "C", family: "seed", forcing: false },
]);

function compilePatternBook() {
  const entries = [];

  for (const figure of HUMAN_FIGURES) {
    for (const owner of [HUMAN, ROBOT]) {
      const code = owner === HUMAN ? figure.code : swapPlayersInCode(figure.code);
      const variants = new Set([code, [...code].reverse().join("")]);

      for (const variant of variants) {
        entries.push(Object.freeze({
          ...figure,
          owner,
          code: variant,
          classInfo: FIGURE_CLASSES[figure.className],
        }));
      }
    }
  }

  return Object.freeze(entries);
}

const PATTERN_BOOK = compilePatternBook();
const CURRENT_OPEN_THREE_CODES = Object.freeze(["01110", "010110", "011010", "0101010"]);
const CURRENT_OPEN_TWO_CODES = Object.freeze(["0110", "01010", "010010"]);

const boardEl = document.querySelector("#board");
const turnSymbolEl = document.querySelector("#turnSymbol");
const statusTextEl = document.querySelector("#statusText");
const moveCounterEl = document.querySelector("#moveCounter");
const turnCardEl = document.querySelector("#turnCard");
const leadCardEl = document.querySelector("#leadCard");
const leadOwnerEl = document.querySelector("#leadOwner");
const leadReasonEl = document.querySelector("#leadReason");
const scoreXEl = document.querySelector("#scoreX");
const scoreOEl = document.querySelector("#scoreO");
const scoreDrawEl = document.querySelector("#scoreDraw");
const resetRoundBtn = document.querySelector("#resetRound");
const undoMoveBtn = document.querySelector("#undoMove");
const resetScoresBtn = document.querySelector("#resetScores");
const toggleThreatsBtn = document.querySelector("#toggleThreats");
const humanStartsBtn = document.querySelector("#humanStarts");
const robotStartsBtn = document.querySelector("#robotStarts");
const aiDebugPriorityEl = document.querySelector("#aiDebugPriority");
const aiDebugReasonEl = document.querySelector("#aiDebugReason");
const aiDebugMoveEl = document.querySelector("#aiDebugMove");
const aiDebugTagsEl = document.querySelector("#aiDebugTags");
const opponentDebugPriorityEl = document.querySelector("#opponentDebugPriority");
const opponentDebugReasonEl = document.querySelector("#opponentDebugReason");
const opponentDebugMoveEl = document.querySelector("#opponentDebugMove");
const opponentDebugTagsEl = document.querySelector("#opponentDebugTags");
const threatSummaryCountEl = document.querySelector("#threatSummaryCount");
const threatSummaryListEl = document.querySelector("#threatSummaryList");
const historyCountEl = document.querySelector("#historyCount");
const moveHistoryListEl = document.querySelector("#moveHistoryList");
const copyHistoryBtn = document.querySelector("#copyHistory");
const savedPositionCountEl = document.querySelector("#savedPositionCount");
const positionNameInput = document.querySelector("#positionName");
const savePositionBtn = document.querySelector("#savePosition");
const savedPositionListEl = document.querySelector("#savedPositionList");
const replayProgressEl = document.querySelector("#replayProgress");
const replayStartBtn = document.querySelector("#replayStart");
const replayBackBtn = document.querySelector("#replayBack");
const replayPlayPauseBtn = document.querySelector("#replayPlayPause");
const replayForwardBtn = document.querySelector("#replayForward");
const replayEndBtn = document.querySelector("#replayEnd");
const replaySpeedBtn = document.querySelector("#replaySpeed");
const replayBranchBtn = document.querySelector("#replayBranch");
const difficultySelectEl = document.querySelector("#difficultySelect");
const humanMarkXBtn = document.querySelector("#humanMarkX");
const humanMarkOBtn = document.querySelector("#humanMarkO");

const state = {
  board: Array(TOTAL_CELLS).fill(EMPTY),
  currentPlayer: HUMAN,
  startingPlayer: HUMAN,
  moves: 0,
  isGameOver: false,
  isRobotThinking: false,
  robotTurnId: 0,
  moveHistory: [],
  lastRobotDecision: null,
  lastHumanDecision: null,
  activeRobotPlan: null,
  robotOpportunities: [],
  roundResult: null,
  showThreats: true,
  scores: { X: 0, O: 0, draw: 0 },
  humanMark: HUMAN,
};

const analysisCache = new Map();
const ANALYSIS_CACHE_LIMIT = 6000;
let savedPositions = [];
const replayState = {
  positionId: null,
  positionName: "",
  moves: [],
  cursor: 0,
  isPlaying: false,
  speed: 1,
  playToken: 0,
  finalCurrentPlayer: HUMAN,
};

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function clearAnalysisCache() {
  analysisCache.clear();
}

function getBoardSignature() {
  return state.board.map((cell) => CELL_CODE[cell]).join("");
}

function getIndex(row, col) {
  return row * BOARD_SIZE + col;
}

function getRowCol(index) {
  return [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE];
}

function isInside(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function otherPlayer(player) {
  return player === HUMAN ? ROBOT : HUMAN;
}

function centerBias(index) {
  const [row, col] = getRowCol(index);
  const center = (BOARD_SIZE - 1) / 2;
  return Math.max(0, 20 - Math.abs(row - center) - Math.abs(col - center)) * 180;
}

function animate(target, fromVars, toVars) {
  if (!window.gsap) return;
  window.gsap.fromTo(target, fromVars, toVars);
}

function buildBoard() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < TOTAL_CELLS; index += 1) {
    const [row, col] = getRowCol(index);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = String(index);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Ligne ${row + 1}, colonne ${col + 1}`);
    fragment.appendChild(cell);
  }

  boardEl.appendChild(fragment);
}

function formatMoveLabel(index) {
  if (index === null || index === undefined) return "-";
  const [row, col] = getRowCol(index);
  return `L${row + 1} C${col + 1}`;
}

function formatCompactMoveLabel(index) {
  const [row, col] = getRowCol(index);
  return `L${row + 1}C${col + 1}`;
}

function getMoveHistoryText() {
  const moves = state.moveHistory
    .map((move, index) => `${index + 1}:${move.player}@${formatCompactMoveLabel(move.index)}`)
    .join(";");
  return [
    "GOMOKU 20x20",
    "CODES 0=EMPTY 1=X 2=O",
    `START ${state.startingPlayer}`,
    `MOVES ${moves}`,
  ].join("\n");
}

function updateLastMoveMarker() {
  for (const cell of boardEl.children) cell.classList.remove("last-move");
  const lastMove = state.moveHistory[state.moveHistory.length - 1];
  if (lastMove) boardEl.children[lastMove.index]?.classList.add("last-move");
}

function updateMoveHistory() {
  if (!historyCountEl || !moveHistoryListEl) return;
  const count = state.moveHistory.length;
  historyCountEl.textContent = `${count} coup${count === 1 ? "" : "s"}`;

  const rows = state.moveHistory.map((move, index) => {
    const row = document.createElement("div");
    row.className = "history-row";

    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");
    const player = document.createElement("strong");
    player.textContent = move.player;
    const coordinate = document.createElement("span");
    coordinate.textContent = formatMoveLabel(move.index);
    row.appendChild(number);
    row.appendChild(player);
    row.appendChild(coordinate);
    return row;
  });

  if (!rows.length) {
    const row = document.createElement("div");
    row.className = "history-row";
    row.textContent = "Aucun coup";
    rows.push(row);
  }

  moveHistoryListEl.replaceChildren(...rows);
  moveHistoryListEl.scrollTop = moveHistoryListEl.scrollHeight;
}

async function copyMoveHistory() {
  const text = getMoveHistoryText();
  let copied = false;

  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      copied = true;
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copied = Boolean(document.execCommand?.("copy"));
      textarea.remove();
    }
  } catch (error) {
    console.error("[pattern-bot] history copy failed", error);
  }

  const label = copyHistoryBtn?.querySelector?.("span");
  if (label) label.textContent = copied ? "Coordonnees copiees" : "Copie impossible";
  window.setTimeout(() => {
    if (label) label.textContent = "Copier les coordonnees";
  }, 1400);
}

function decodeSavedBoard(encodedBoard) {
  if (typeof encodedBoard !== "string" || encodedBoard.length !== TOTAL_CELLS || /[^012]/.test(encodedBoard)) {
    return null;
  }
  return [...encodedBoard].map((code) => (code === "1" ? HUMAN : code === "2" ? ROBOT : EMPTY));
}

function normalizeReplayDecision(decision, index) {
  if (!decision || typeof decision !== "object") return null;
  const reason = String(decision.reason || "").trim();
  const priority = String(decision.priority || "").trim();
  if (!reason || !priority) return null;
  return {
    index,
    priority: priority.slice(0, 80),
    reason: reason.slice(0, 800),
    tags: Array.isArray(decision.tags)
      ? decision.tags.map((tag) => String(tag).slice(0, 80)).slice(0, 16)
      : [],
  };
}

function getReplayDebugDecision(history, player = ROBOT) {
  const replayMove = [...history].reverse().find((move) => move.player === player);
  if (!replayMove) return null;
  const label = player === ROBOT ? "du bot" : "de X";
  return normalizeReplayDecision(replayMove.decision, replayMove.index) ?? {
    index: replayMove.index,
    priority: "REPLAY-ARCHIVE",
    reason: `Cette ancienne sauvegarde ne contient pas le raisonnement ${label} pour ce coup.`,
    tags: ["replay", "raisonnement-non-enregistre"],
  };
}

function normalizeSavedPosition(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const board = decodeSavedBoard(candidate.board);
  if (!board) return null;
  if (![HUMAN, ROBOT].includes(candidate.currentPlayer) || ![HUMAN, ROBOT].includes(candidate.startingPlayer)) {
    return null;
  }

  const occupied = board.reduce((count, cell) => count + Number(cell !== EMPTY), 0);
  const history = Array.isArray(candidate.moveHistory)
    ? candidate.moveHistory.map((move) => {
      const index = Number(move?.index);
      const player = move?.player;
      const decision = normalizeReplayDecision(move?.decision, index);
      return decision ? { index, player, decision } : { index, player };
    })
    : [];
  const validHistory = history.length === occupied && history.every((move, position) => (
    Number.isInteger(move.index)
      && move.index >= 0
      && move.index < TOTAL_CELLS
      && [HUMAN, ROBOT].includes(move.player)
      && board[move.index] === move.player
      && history.findIndex((entry) => entry.index === move.index) === position
  ));

  return {
    id: String(candidate.id || ""),
    name: String(candidate.name || "Position sauvegardee").trim().slice(0, 48) || "Position sauvegardee",
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : new Date().toISOString(),
    board: candidate.board,
    currentPlayer: candidate.currentPlayer,
    startingPlayer: candidate.startingPlayer,
    moves: occupied,
    moveHistory: validHistory ? history : [],
    showThreats: candidate.showThreats !== false,
  };
}

function readSavedPositions() {
  try {
    const raw = window.localStorage?.getItem(SAVED_POSITIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    savedPositions = Array.isArray(parsed)
      ? parsed.map(normalizeSavedPosition).filter(Boolean).slice(0, MAX_SAVED_POSITIONS)
      : [];
  } catch (error) {
    console.error("[pattern-bot] saved positions read failed", error);
    savedPositions = [];
  }
  return savedPositions;
}

function persistSavedPositions() {
  try {
    window.localStorage?.setItem(SAVED_POSITIONS_KEY, JSON.stringify(savedPositions));
    return true;
  } catch (error) {
    console.error("[pattern-bot] saved positions write failed", error);
    return false;
  }
}

function formatSavedPositionDate(savedAt) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function renderSavedPositions() {
  if (!savedPositionCountEl || !savedPositionListEl) return;
  savedPositionCountEl.textContent = String(savedPositions.length);

  if (!savedPositions.length) {
    const empty = document.createElement("div");
    empty.className = "saved-position-empty";
    empty.textContent = "Aucune position sauvegardee";
    savedPositionListEl.replaceChildren(empty);
    return;
  }

  const rows = savedPositions.map((position) => {
    const row = document.createElement("div");
    row.className = "saved-position-row";

    const copy = document.createElement("div");
    copy.className = "saved-position-copy";
    const name = document.createElement("strong");
    name.textContent = position.name;
    const meta = document.createElement("span");
    meta.textContent = `${position.moves} coups · tour ${position.currentPlayer} · ${formatSavedPositionDate(position.savedAt)}`;
    copy.appendChild(name);
    copy.appendChild(meta);

    const replayButton = document.createElement("button");
    replayButton.type = "button";
    replayButton.className = "saved-position-action";
    replayButton.dataset.savedAction = "replay";
    replayButton.dataset.savedPositionId = position.id;
    replayButton.title = `Rejouer ${position.name}`;
    replayButton.setAttribute("aria-label", `Rejouer ${position.name}`);
    replayButton.innerHTML = '<i data-lucide="circle-play" aria-hidden="true"></i>';

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "saved-position-action";
    loadButton.dataset.savedAction = "load";
    loadButton.dataset.savedPositionId = position.id;
    loadButton.title = `Charger ${position.name}`;
    loadButton.setAttribute("aria-label", `Charger ${position.name}`);
    loadButton.innerHTML = '<i data-lucide="folder-open" aria-hidden="true"></i>';

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "saved-position-action is-delete";
    deleteButton.dataset.savedAction = "delete";
    deleteButton.dataset.savedPositionId = position.id;
    deleteButton.title = `Supprimer ${position.name}`;
    deleteButton.setAttribute("aria-label", `Supprimer ${position.name}`);
    deleteButton.innerHTML = '<i data-lucide="trash-2" aria-hidden="true"></i>';

    row.appendChild(copy);
    row.appendChild(replayButton);
    row.appendChild(loadButton);
    row.appendChild(deleteButton);
    return row;
  });

  savedPositionListEl.replaceChildren(...rows);
  window.lucide?.createIcons();
}

function createPositionSnapshot(name = "") {
  const requestedName = String(name).trim().slice(0, 48);
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    name: requestedName || `Position ${savedPositions.length + 1} - ${state.moves} coups`,
    savedAt: new Date().toISOString(),
    board: getBoardSignature(),
    currentPlayer: state.currentPlayer,
    startingPlayer: state.startingPlayer,
    moves: state.moves,
    moveHistory: state.moveHistory.map((move) => {
      const decision = normalizeReplayDecision(move.decision, move.index);
      return decision
        ? { index: move.index, player: move.player, decision }
        : { index: move.index, player: move.player };
    }),
    showThreats: state.showThreats,
  };
}

function saveCurrentPosition(name = positionNameInput?.value ?? "") {
  if (replayState.isPlaying) pauseReplay();
  const snapshot = createPositionSnapshot(name);
  savedPositions.unshift(snapshot);
  savedPositions = savedPositions.slice(0, MAX_SAVED_POSITIONS);
  persistSavedPositions();
  renderSavedPositions();
  if (positionNameInput) positionNameInput.value = "";
  setStatus(`Position « ${snapshot.name} » sauvegardee.`);
  return snapshot;
}

function loadSavedPosition(id) {
  const snapshot = savedPositions.find((position) => position.id === id);
  const normalized = normalizeSavedPosition(snapshot);
  if (!normalized) return false;

  clearReplayState();
  clearAnalysisCache();
  state.robotTurnId += 1;
  state.isRobotThinking = false;
  state.board = decodeSavedBoard(normalized.board);
  state.currentPlayer = normalized.currentPlayer;
  state.startingPlayer = normalized.startingPlayer;
  state.moves = normalized.moves;
  state.moveHistory = normalized.moveHistory.map((move) => ({ ...move }));
  state.lastRobotDecision = getReplayDebugDecision(state.moveHistory);
  state.lastHumanDecision = getReplayDebugDecision(state.moveHistory, HUMAN);
  state.activeRobotPlan = null;
  state.robotOpportunities = [];
  state.roundResult = null;
  state.isGameOver = false;
  state.showThreats = normalized.showThreats;
  boardEl.classList.remove("game-over", "robot-thinking");

  renderBoard();
  updateAiDebugPanel();
  updateStartButtons();
  updateThreatToggle();
  setStatus(`Position « ${normalized.name} » chargee. Tour de ${state.currentPlayer}.`);
  updateHud();
  if (state.currentPlayer === ROBOT) scheduleRobotTurn("Position chargee. Le robot analyse son tour...");
  return true;
}

function deleteSavedPosition(id) {
  const position = savedPositions.find((candidate) => candidate.id === id);
  if (!position) return false;
  if (replayState.positionId === id) clearReplayState();
  savedPositions = savedPositions.filter((candidate) => candidate.id !== id);
  persistSavedPositions();
  renderSavedPositions();
  setStatus(`Position « ${position.name} » supprimee.`);
  return true;
}

function getSavedPositions() {
  return savedPositions.map((position) => ({
    ...position,
    moveHistory: position.moveHistory.map((move) => ({
      ...move,
      ...(move.decision ? { decision: { ...move.decision, tags: [...move.decision.tags] } } : {}),
    })),
  }));
}

function isReplayActive() {
  return replayState.positionId !== null;
}

function updateReplayControls() {
  const active = isReplayActive();
  const atStart = replayState.cursor <= 0;
  const atEnd = replayState.cursor >= replayState.moves.length;
  if (replayProgressEl) replayProgressEl.textContent = `${replayState.cursor} / ${replayState.moves.length}`;
  if (replayStartBtn) replayStartBtn.disabled = !active || atStart;
  if (replayBackBtn) replayBackBtn.disabled = !active || atStart;
  if (replayPlayPauseBtn) replayPlayPauseBtn.disabled = !active || replayState.moves.length === 0;
  if (replayForwardBtn) replayForwardBtn.disabled = !active || atEnd;
  if (replayEndBtn) replayEndBtn.disabled = !active || atEnd;
  if (replaySpeedBtn) {
    replaySpeedBtn.disabled = !active;
    replaySpeedBtn.textContent = `${replayState.speed}x`;
  }
  if (replayBranchBtn) replayBranchBtn.disabled = !active;

  if (replayPlayPauseBtn && replayPlayPauseBtn.dataset.mode !== String(replayState.isPlaying)) {
    replayPlayPauseBtn.dataset.mode = String(replayState.isPlaying);
    replayPlayPauseBtn.title = replayState.isPlaying
      ? "Mettre le replay en pause (Espace)"
      : "Lire le replay (Espace)";
    replayPlayPauseBtn.setAttribute("aria-label", replayPlayPauseBtn.title);
    replayPlayPauseBtn.innerHTML = replayState.isPlaying
      ? '<i data-lucide="pause" aria-hidden="true"></i>'
      : '<i data-lucide="play" aria-hidden="true"></i>';
    window.lucide?.createIcons();
  }
}

function clearReplayState() {
  replayState.playToken += 1;
  replayState.positionId = null;
  replayState.positionName = "";
  replayState.moves = [];
  replayState.cursor = 0;
  replayState.isPlaying = false;
  replayState.speed = 1;
  replayState.finalCurrentPlayer = HUMAN;
  updateReplayControls();
}

function applyReplayCursor(cursor) {
  if (!isReplayActive()) return false;
  const nextCursor = Math.max(0, Math.min(Number(cursor) || 0, replayState.moves.length));
  replayState.cursor = nextCursor;
  state.robotTurnId += 1;
  state.isRobotThinking = false;
  state.isGameOver = false;
  state.roundResult = null;
  state.activeRobotPlan = null;
  state.board = Array(TOTAL_CELLS).fill(EMPTY);
  state.moveHistory = replayState.moves.slice(0, nextCursor).map((move) => ({ ...move }));
  state.lastRobotDecision = getReplayDebugDecision(state.moveHistory);
  state.lastHumanDecision = getReplayDebugDecision(state.moveHistory, HUMAN);
  for (const move of state.moveHistory) state.board[move.index] = move.player;
  state.moves = state.moveHistory.length;
  state.currentPlayer = nextCursor === replayState.moves.length
    ? replayState.finalCurrentPlayer
    : nextCursor === 0
      ? state.startingPlayer
      : otherPlayer(state.moveHistory[nextCursor - 1].player);
  boardEl.classList.remove("game-over", "robot-thinking");
  clearAnalysisCache();
  renderBoard();

  const lastMove = state.moveHistory[state.moveHistory.length - 1];
  if (lastMove) {
    const winningLine = collectLine(lastMove.index, lastMove.player);
    if (winningLine.length) markWinningCells(winningLine);
  }

  updateAiDebugPanel();
  updateStartButtons();
  setStatus(`Replay « ${replayState.positionName} » : coup ${nextCursor} sur ${replayState.moves.length}.`);
  updateHud();
  updateReplayControls();
  return true;
}

function pauseReplay() {
  if (!isReplayActive()) return false;
  replayState.isPlaying = false;
  replayState.playToken += 1;
  updateReplayControls();
  setStatus(`Replay en pause au coup ${replayState.cursor} sur ${replayState.moves.length}.`);
  return true;
}

function scheduleReplayTick(token) {
  const delay = Math.max(250, Math.round(REPLAY_BASE_DELAY_MS / replayState.speed));
  window.setTimeout(() => {
    if (!replayState.isPlaying || token !== replayState.playToken) return;
    if (replayState.cursor >= replayState.moves.length) {
      pauseReplay();
      return;
    }
    applyReplayCursor(replayState.cursor + 1);
    if (replayState.cursor >= replayState.moves.length) pauseReplay();
    else scheduleReplayTick(token);
  }, delay);
}

function playReplay() {
  if (!isReplayActive() || !replayState.moves.length) return false;
  if (replayState.cursor >= replayState.moves.length) applyReplayCursor(0);
  replayState.isPlaying = true;
  replayState.playToken += 1;
  const token = replayState.playToken;
  updateReplayControls();
  setStatus(`Lecture du replay « ${replayState.positionName} » a ${replayState.speed}x.`);
  scheduleReplayTick(token);
  return true;
}

function toggleReplayPlayback() {
  return replayState.isPlaying ? pauseReplay() : playReplay();
}

function stepReplay(offset) {
  if (!isReplayActive()) return false;
  pauseReplay();
  return applyReplayCursor(replayState.cursor + offset);
}

function seekReplay(cursor) {
  if (!isReplayActive()) return false;
  pauseReplay();
  return applyReplayCursor(cursor);
}

function cycleReplaySpeed() {
  if (!isReplayActive()) return false;
  const speeds = [1, 2, 4];
  return setReplaySpeed(speeds[(speeds.indexOf(replayState.speed) + 1) % speeds.length]);
}

function setReplaySpeed(speed) {
  if (!isReplayActive() || ![1, 2, 4].includes(Number(speed))) return false;
  replayState.speed = Number(speed);
  if (replayState.isPlaying) {
    replayState.playToken += 1;
    scheduleReplayTick(replayState.playToken);
  }
  updateReplayControls();
  setStatus(`Vitesse du replay : ${replayState.speed}x.`);
  return replayState.speed;
}

function handleReplayShortcut(event) {
  if (!isReplayActive() || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  const tagName = target?.tagName?.toLowerCase?.();
  if (target?.isContentEditable || ["input", "textarea", "select", "button"].includes(tagName)) return false;

  const actions = {
    " ": toggleReplayPlayback,
    ArrowLeft: () => stepReplay(-1),
    ArrowRight: () => stepReplay(1),
    Home: () => seekReplay(0),
    End: () => seekReplay(replayState.moves.length),
    "1": () => setReplaySpeed(1),
    "2": () => setReplaySpeed(2),
    "4": () => setReplaySpeed(4),
    b: () => branchFromReplay(),
    B: () => branchFromReplay(),
  };
  const action = actions[event.key];
  if (!action) return false;
  event.preventDefault();
  action();
  return true;
}

function startSavedReplay(id, autoplay = true) {
  const snapshot = normalizeSavedPosition(savedPositions.find((position) => position.id === id));
  if (!snapshot || !snapshot.moveHistory.length) return false;
  clearReplayState();
  state.startingPlayer = snapshot.startingPlayer;
  state.showThreats = snapshot.showThreats;
  replayState.positionId = snapshot.id;
  replayState.positionName = snapshot.name;
  replayState.moves = snapshot.moveHistory.map((move) => ({ ...move }));
  replayState.finalCurrentPlayer = snapshot.currentPlayer;
  applyReplayCursor(0);
  if (autoplay) playReplay();
  return true;
}

function branchFromReplay(scheduleRobot = true) {
  if (!isReplayActive()) return false;
  const cursor = replayState.cursor;
  const total = replayState.moves.length;
  replayState.playToken += 1;
  replayState.positionId = null;
  replayState.positionName = "";
  replayState.moves = [];
  replayState.cursor = 0;
  replayState.isPlaying = false;
  replayState.speed = 1;
  replayState.finalCurrentPlayer = HUMAN;
  updateReplayControls();
  setStatus(`Nouvelle branche creee depuis le coup ${cursor} sur ${total}.`);
  updateHud();
  if (scheduleRobot && state.currentPlayer === ROBOT) {
    scheduleRobotTurn("Nouvelle branche. Le robot analyse cette position...");
  }
  return true;
}

function setStatus(message) {
  statusTextEl.textContent = message;
}

function displaySymbol(player) {
  if (state.humanMark === HUMAN) return player;
  return player === HUMAN ? ROBOT : HUMAN;
}

function updateStartButtons() {
  humanStartsBtn.classList.toggle("is-active", state.startingPlayer === HUMAN);
  robotStartsBtn.classList.toggle("is-active", state.startingPlayer === ROBOT);
  humanStartsBtn.setAttribute("aria-pressed", String(state.startingPlayer === HUMAN));
  robotStartsBtn.setAttribute("aria-pressed", String(state.startingPlayer === ROBOT));
}

function updateHud() {
  turnSymbolEl.textContent = displaySymbol(state.currentPlayer);
  turnSymbolEl.classList.toggle("bg-cyan-500", state.currentPlayer === HUMAN);
  turnSymbolEl.classList.toggle("bg-rose-400", state.currentPlayer === ROBOT);
  boardEl.classList.toggle("robot-thinking", state.isRobotThinking);
  moveCounterEl.textContent = `${state.moves} / ${TOTAL_CELLS}`;
  scoreXEl.textContent = state.scores.X;
  scoreOEl.textContent = state.scores.O;
  scoreDrawEl.textContent = state.scores.draw;
  if (undoMoveBtn) undoMoveBtn.disabled = state.moveHistory.length === 0;
  updateLastMoveMarker();
  updateMoveHistory();
  updateLeadHud();
  if (!state.isRobotThinking) updateThreatVisualization();
}

function updateLeadHud() {
  if (!leadCardEl || !leadOwnerEl || !leadReasonEl) return;
  const lead = getLeadState();
  leadOwnerEl.textContent = lead.label;
  leadReasonEl.textContent = lead.reason;
  leadCardEl.classList.toggle("is-robot", lead.owner === "robot");
  leadCardEl.classList.toggle("is-human", lead.owner === "human");
  leadCardEl.classList.toggle("is-neutral", lead.owner === "neutral");
}

function renderBoard() {
  for (let index = 0; index < TOTAL_CELLS; index += 1) {
    const cell = boardEl.children[index];
    const value = state.board[index];
    cell.textContent = value ? displaySymbol(value) : "";
    const visibleValue = value ? displaySymbol(value) : "";
    cell.classList.toggle("x", visibleValue === HUMAN);
    cell.classList.toggle("o", visibleValue === ROBOT);
    cell.classList.remove("win", "last-move", "threat-human", "threat-robot", "threat-critical");
  }
  updateLastMoveMarker();
}

function collectLine(index, player) {
  const [row, col] = getRowCol(index);

  for (const [rowStep, colStep] of DIRECTIONS) {
    const line = [index];

    for (const sign of [-1, 1]) {
      let nextRow = row + rowStep * sign;
      let nextCol = col + colStep * sign;

      while (isInside(nextRow, nextCol) && state.board[getIndex(nextRow, nextCol)] === player) {
        line.push(getIndex(nextRow, nextCol));
        nextRow += rowStep * sign;
        nextCol += colStep * sign;
      }
    }

    if (line.length >= WIN_LENGTH) return line.slice(0, WIN_LENGTH);
  }

  return [];
}

function wouldWin(index, player) {
  if (state.board[index]) return false;
  state.board[index] = player;
  const wins = collectLine(index, player).length >= WIN_LENGTH;
  state.board[index] = EMPTY;
  return wins;
}

function getLineCode(index, rowStep, colStep, radius = 5) {
  const [row, col] = getRowCol(index);
  let code = "";
  let centerOffset = 0;
  const indices = [];

  for (let offset = -radius; offset <= radius; offset += 1) {
    const nextRow = row + rowStep * offset;
    const nextCol = col + colStep * offset;

    if (!isInside(nextRow, nextCol)) {
      if (offset < 0) centerOffset = 0;
      continue;
    }

    if (offset < 0) centerOffset += 1;
    const lineIndex = getIndex(nextRow, nextCol);
    indices.push(lineIndex);
    code += CELL_CODE[state.board[lineIndex]];
  }

  return { code, centerOffset, indices };
}

function findPatternMatches(lineCode, centerOffset, player, directionIndex, lineIndices = []) {
  const matches = [];

  for (const figure of PATTERN_BOOK) {
    if (figure.owner !== player) continue;

    let start = lineCode.indexOf(figure.code);
    while (start !== -1) {
      const end = start + figure.code.length;
      if (start <= centerOffset && centerOffset < end) {
        matches.push({
          ...figure,
          directionIndex,
          start,
          end,
          matchedIndices: lineIndices.slice(start, end),
        });
      }
      start = lineCode.indexOf(figure.code, start + 1);
    }
  }

  return matches;
}

function emptyAnalysis(index, player) {
  return {
    index,
    player,
    valid: false,
    winsNow: false,
    score: -Infinity,
    rank: 0,
    className: null,
    classLabel: "aucune",
    label: "coup invalide",
    primaryCode: null,
    matches: [],
    fourDirections: 0,
    openThreeDirections: 0,
    closedThreeDirections: 0,
    openTwoDirections: 0,
    secondaryRank: 0,
    secondaryScore: 0,
    doubleThreat: false,
    forcing: false,
  };
}

function analyzeMove(index, player) {
  if (state.board[index]) return emptyAnalysis(index, player);

  const cacheKey = `${player}:${index}:${getBoardSignature()}`;
  const cached = analysisCache.get(cacheKey);
  if (cached) return cached;

  state.board[index] = player;
  const winsNow = collectLine(index, player).length >= WIN_LENGTH;
  const allMatches = [];
  const bestByDirection = new Map();

  DIRECTIONS.forEach(([rowStep, colStep], directionIndex) => {
    const { code, centerOffset, indices } = getLineCode(index, rowStep, colStep);
    const matches = findPatternMatches(code, centerOffset, player, directionIndex, indices);
    allMatches.push(...matches);

    const best = matches.sort((a, b) => b.classInfo.rank - a.classInfo.rank || b.classInfo.score - a.classInfo.score)[0];
    if (best) bestByDirection.set(directionIndex, best);
  });

  state.board[index] = EMPTY;

  const directionMatches = [...bestByDirection.values()];
  const fourDirections = new Set(directionMatches.filter((match) => match.family === "four").map((match) => match.directionIndex));
  const openThreeDirections = new Set(
    directionMatches
      .filter((match) => match.family === "open-three" || match.family === "spaced-three")
      .map((match) => match.directionIndex)
  );
  const closedThreeDirections = new Set(
    directionMatches.filter((match) => match.family === "closed-three").map((match) => match.directionIndex)
  );
  const openTwoDirections = new Set(
    directionMatches.filter((match) => match.family === "open-two" || match.family === "seed").map((match) => match.directionIndex)
  );
  const doubleConstruction = openTwoDirections.size >= 2;
  const forcingDirections = new Set([...fourDirections, ...openThreeDirections]);
  const doubleThreat = forcingDirections.size >= 2 || fourDirections.size >= 2;
  let primary = directionMatches.sort((a, b) => b.classInfo.rank - a.classInfo.rank || b.classInfo.score - a.classInfo.score)[0];
  const secondaryMatches = primary
    ? directionMatches.filter((match) => match.directionIndex !== primary.directionIndex)
    : [];
  const secondaryRank = secondaryMatches.reduce((best, match) => Math.max(best, match.classInfo.rank), 0);
  const secondaryScore = secondaryMatches.reduce((total, match) => total + match.classInfo.score, 0);
  let rank = winsNow ? FIGURE_CLASSES.WIN.rank : primary?.classInfo.rank ?? 0;
  let score = winsNow ? FIGURE_CLASSES.WIN.score : 0;

  for (const match of directionMatches) score += match.classInfo.score;
  if (doubleThreat) {
    rank = Math.max(rank, 92);
    score += 48000000;
  }
  score += openTwoDirections.size >= 2 ? 180000 : 0;
  if (doubleConstruction) {
    rank = Math.max(rank, 50);
    score += 15000000;
  }
  score += centerBias(index);

  if (winsNow) {
    primary = {
      key: "FIVE",
      code: player === HUMAN ? "11111" : "22222",
      className: "WIN",
      classInfo: FIGURE_CLASSES.WIN,
      family: "five",
      forcing: true,
    };
  }

  const result = {
    index,
    player,
    valid: true,
    winsNow,
    score,
    rank,
    className: doubleThreat ? "S_PLUS" : primary?.className ?? null,
    classLabel: doubleThreat ? "classe S+" : doubleConstruction ? "construction 2x2" : primary?.classInfo.label ?? "aucune",
    label: doubleThreat ? "double menace" : doubleConstruction ? "construction 2x2" : primary?.key ?? "coup de construction",
    primaryCode: primary?.code ?? null,
    matches: allMatches,
    fourDirections: fourDirections.size,
    openThreeDirections: openThreeDirections.size,
    closedThreeDirections: closedThreeDirections.size,
    openTwoDirections: openTwoDirections.size,
    doubleConstruction,
    secondaryRank,
    secondaryScore,
    doubleThreat,
    forcing: winsNow || doubleThreat || doubleConstruction || Boolean(primary?.forcing),
  };

  if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) analysisCache.clear();
  analysisCache.set(cacheKey, result);
  return result;
}

function hasNeighbor(index, radius = 2) {
  const [row, col] = getRowCol(index);

  for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
    for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (isInside(nextRow, nextCol) && state.board[getIndex(nextRow, nextCol)]) return true;
    }
  }

  return false;
}

function getLocalInfluenceBalance(index, player, radius = 2) {
  const opponent = otherPlayer(player);
  const [row, col] = getRowCol(index);
  let balance = 0;

  for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
    for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (!isInside(nextRow, nextCol)) continue;
      const distance = Math.max(Math.abs(rowOffset), Math.abs(colOffset));
      const weight = radius + 1 - distance;
      const value = state.board[getIndex(nextRow, nextCol)];
      if (value === player) balance += weight;
      else if (value === opponent) balance -= weight;
    }
  }

  return balance;
}

function getCandidateMoves(radius = 2) {
  if (state.moves === 0) {
    return [getIndex(Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2))];
  }

  const candidates = [];
  for (let index = 0; index < TOTAL_CELLS; index += 1) {
    if (!state.board[index] && hasNeighbor(index, radius)) candidates.push(index);
  }
  return candidates;
}

function findImmediateWins(player) {
  return getCandidateMoves(2).filter((index) => wouldWin(index, player));
}

function chooseDiagonalOpeningResponse() {
  const firstHumanMove = state.moveHistory.find((move) => move.player === HUMAN)?.index
    ?? state.board.findIndex((cell) => cell === HUMAN);
  if (firstHumanMove < 0) return null;

  const [humanRow, humanCol] = getRowCol(firstHumanMove);
  const diagonalMoves = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]
    .map(([rowOffset, colOffset]) => [humanRow + rowOffset, humanCol + colOffset])
    .filter(([row, col]) => isInside(row, col))
    .map(([row, col]) => getIndex(row, col))
    .filter((index) => state.board[index] === EMPTY)
    .sort((a, b) => centerBias(b) - centerBias(a) || a - b);

  return diagonalMoves[0] ?? null;
}

function rankMoves(player, limit = ROOT_CANDIDATE_LIMIT) {
  const opponent = otherPlayer(player);
  return getCandidateMoves(2)
    .map((index) => {
      const attack = analyzeMove(index, player);
      const defense = analyzeMove(index, opponent);
      const urgentDefenseWeight = defense.rank >= 85 ? 1.48 : defense.rank >= 60 ? 0.92 : 0.58;
      const score =
        attack.score * 1.18 +
        defense.score * urgentDefenseWeight +
        attack.rank * 85000 +
        defense.rank * 52000 +
        centerBias(index);
      return { index, attack, defense, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function rankAttackMoves(player, limit = ROOT_CANDIDATE_LIMIT) {
  return getCandidateMoves(2)
    .map((index) => ({ index, attack: analyzeMove(index, player) }))
    .sort((a, b) =>
      b.attack.rank - a.attack.rank ||
      b.attack.score - a.attack.score ||
      centerBias(b.index) - centerBias(a.index)
    )
    .slice(0, limit);
}

function findExistingOpenThrees(player) {
  const expectedCodes = new Set(
    CURRENT_OPEN_THREE_CODES.flatMap((code) => {
      const ownedCode = player === HUMAN ? code : swapPlayersInCode(code);
      return [ownedCode, [...ownedCode].reverse().join("")];
    })
  );
  const lengths = [...new Set([...expectedCodes].map((code) => code.length))];
  const occurrences = [];
  const seen = new Set();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
        const [rowStep, colStep] = DIRECTIONS[directionIndex];

        for (const length of lengths) {
          const endRow = row + rowStep * (length - 1);
          const endCol = col + colStep * (length - 1);
          if (!isInside(endRow, endCol)) continue;

          const indices = [];
          let code = "";
          for (let offset = 0; offset < length; offset += 1) {
            const index = getIndex(row + rowStep * offset, col + colStep * offset);
            indices.push(index);
            code += CELL_CODE[state.board[index]];
          }

          if (!expectedCodes.has(code)) continue;
          const key = `${directionIndex}:${indices.join(",")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          occurrences.push({
            player,
            code,
            directionIndex,
            indices,
            emptyIndices: indices.filter((index) => state.board[index] === EMPTY),
          });
        }
      }
    }
  }

  return occurrences;
}

function findExistingClosedThreeCuts(player) {
  const humanForms = [
    { code: "21110", blockOffset: 4 },
    { code: "01112", blockOffset: 0 },
  ];
  const forms = humanForms.map((form) => ({
    code: player === HUMAN ? form.code : swapPlayersInCode(form.code),
    blockOffset: form.blockOffset,
  }));
  const cuts = [];
  const seen = new Set();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
        const [rowStep, colStep] = DIRECTIONS[directionIndex];
        const endRow = row + rowStep * 4;
        const endCol = col + colStep * 4;
        if (!isInside(endRow, endCol)) continue;

        const indices = [];
        let code = "";
        for (let offset = 0; offset < 5; offset += 1) {
          const index = getIndex(row + rowStep * offset, col + colStep * offset);
          indices.push(index);
          code += CELL_CODE[state.board[index]];
        }

        const form = forms.find((candidate) => candidate.code === code);
        if (!form) continue;
        const blockIndex = indices[form.blockOffset];
        if (state.board[blockIndex] !== EMPTY || seen.has(blockIndex)) continue;
        seen.add(blockIndex);
        cuts.push({ player, code, directionIndex, indices, blockIndex });
      }
    }
  }

  return cuts;
}

function findExistingOpenTwos(player) {
  const expectedCodes = new Set(
    CURRENT_OPEN_TWO_CODES.flatMap((code) => {
      const ownedCode = player === HUMAN ? code : swapPlayersInCode(code);
      return [ownedCode, [...ownedCode].reverse().join("")];
    })
  );
  const lengths = [...new Set([...expectedCodes].map((code) => code.length))];
  const occurrences = [];
  const seen = new Set();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
        const [rowStep, colStep] = DIRECTIONS[directionIndex];
        for (const length of lengths) {
          const endRow = row + rowStep * (length - 1);
          const endCol = col + colStep * (length - 1);
          if (!isInside(endRow, endCol)) continue;

          const indices = [];
          let code = "";
          for (let offset = 0; offset < length; offset += 1) {
            const index = getIndex(row + rowStep * offset, col + colStep * offset);
            indices.push(index);
            code += CELL_CODE[state.board[index]];
          }

          if (!expectedCodes.has(code)) continue;
          const key = `${directionIndex}:${indices.join(",")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          occurrences.push({
            player,
            code,
            directionIndex,
            indices,
            emptyIndices: indices.filter((index) => state.board[index] === EMPTY),
          });
        }
      }
    }
  }

  return occurrences;
}

function getOffAxisConstructionDanger(analysis, excludedDirectionIndex) {
  if (!analysis) return 0;
  const bestByDirection = new Map();

  for (const match of analysis.matches) {
    if (match.directionIndex === excludedDirectionIndex) continue;
    const current = bestByDirection.get(match.directionIndex);
    if (!current || match.classInfo.rank > current.classInfo.rank ||
        (match.classInfo.rank === current.classInfo.rank && match.classInfo.score > current.classInfo.score)) {
      bestByDirection.set(match.directionIndex, match);
    }
  }

  const constructions = [...bestByDirection.values()];
  const maxRank = constructions.reduce((best, match) => Math.max(best, match.classInfo.rank), 0);
  const totalScore = constructions.reduce((total, match) => total + match.classInfo.score, 0);
  const forcingDirections = constructions.filter((match) => match.forcing).length;

  return (
    maxRank * 2000000 +
    totalScore * 2 +
    forcingDirections * 12000000 +
    (forcingDirections >= 2 ? 80000000000 : 0)
  );
}

function getLocalPlanningMatchValue(match) {
  if (match.family === "closed-three") {
    return match.classInfo.score * 0.12 + 12 * 220000;
  }
  return match.classInfo.score + match.classInfo.rank * 220000;
}

function getLocalFuturePotential(player, anchorIndex, radius = 4, requiredAnchorIndex = null, excludedIndex = null) {
  const [anchorRow, anchorCol] = getRowCol(anchorIndex);
  const candidates = [];

  for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
    for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
      const row = anchorRow + rowOffset;
      const col = anchorCol + colOffset;
      if (!isInside(row, col)) continue;
      const index = getIndex(row, col);
      if (state.board[index] !== EMPTY || index === excludedIndex) continue;
      const analysis = analyzeMove(index, player);
      const causalByDirection = new Map();
      for (const match of analysis.matches) {
        if (requiredAnchorIndex !== null && !match.matchedIndices.includes(requiredAnchorIndex)) continue;
        const current = causalByDirection.get(match.directionIndex);
        if (!current || getLocalPlanningMatchValue(match) > getLocalPlanningMatchValue(current)) {
          causalByDirection.set(match.directionIndex, match);
        }
      }
      const causalMatches = [...causalByDirection.values()];
      const causalRank = causalMatches.reduce((best, match) => Math.max(best, match.classInfo.rank), 0);
      candidates.push({
        index,
        analysis,
        causalMatches,
        causalRank,
        value: causalMatches.reduce((total, match) => total + getLocalPlanningMatchValue(match), 0),
      });
    }
  }

  candidates.sort((a, b) => b.value - a.value);
  const weights = [1, 0.55, 0.3, 0.16, 0.08];
  const score = candidates
    .slice(0, weights.length)
    .reduce((total, candidate, index) => total + candidate.value * weights[index], 0);

  return { score, candidates: candidates.slice(0, weights.length) };
}

function evaluateExistingThreeCut(figure, blockIndex) {
  const counterAttack = analyzeMove(blockIndex, ROBOT);
  state.board[blockIndex] = ROBOT;
  state.moves += 1;

  const remainingReplies = figure.emptyIndices
    .filter((index) => index !== blockIndex && state.board[index] === EMPTY)
    .map((index) => ({ index, attack: analyzeMove(index, HUMAN) }))
    .filter((reply) => reply.attack.rank >= 85)
    .sort((a, b) => b.attack.rank - a.attack.rank || b.attack.score - a.attack.score);
  const forcedReply = remainingReplies[0] ?? null;
  const offAxisDanger = getOffAxisConstructionDanger(forcedReply?.attack, figure.directionIndex);
  let futurePotential = 0;
  let futureCandidates = [];
  let forcedWinBlock = null;

  if (forcedReply) {
    const baselineLocal = getLocalFuturePotential(HUMAN, forcedReply.index, 4, null, forcedReply.index);
    state.board[forcedReply.index] = HUMAN;
    state.moves += 1;
    const winningCells = findImmediateWins(HUMAN);

    if (winningCells.length >= 2) {
      futurePotential = 1000000000000;
    } else {
      forcedWinBlock = winningCells[0] ?? null;
      if (forcedWinBlock !== null) {
        state.board[forcedWinBlock] = ROBOT;
        state.moves += 1;
      }

      const causalFuture = getLocalFuturePotential(HUMAN, forcedReply.index, 4, forcedReply.index);
      const fullFuture = getLocalFuturePotential(HUMAN, forcedReply.index);
      const territorialGain = Math.max(0, fullFuture.score - baselineLocal.score);
      futurePotential = causalFuture.score + territorialGain;
      futureCandidates = causalFuture.candidates;

      if (forcedWinBlock !== null) {
        state.moves -= 1;
        state.board[forcedWinBlock] = EMPTY;
      }
    }

    state.moves -= 1;
    state.board[forcedReply.index] = EMPTY;
  }

  state.moves -= 1;
  state.board[blockIndex] = EMPTY;

  return {
    figure,
    index: blockIndex,
    counterAttack,
    forcedReply,
    remainingReplies,
    offAxisDanger,
    forcedWinBlock,
    futurePotential,
    futureCandidates,
  };
}

function chooseExistingOpenThreeCut(player = HUMAN) {
  const options = [];

  for (const figure of findExistingOpenThrees(player)) {
    const dangerousPoints = figure.emptyIndices
      .map((index) => ({ index, attack: analyzeMove(index, player) }))
      .filter((move) => move.attack.rank >= 85);
    const figureRank = dangerousPoints.reduce((best, move) => Math.max(best, move.attack.rank), 0);

    for (const point of dangerousPoints) {
      options.push({ ...evaluateExistingThreeCut(figure, point.index), figureRank });
    }
  }

  return options.sort((a, b) =>
    b.figureRank - a.figureRank ||
    (b.counterAttack.forcing ? b.counterAttack.rank : 0) -
      (a.counterAttack.forcing ? a.counterAttack.rank : 0) ||
    a.offAxisDanger - b.offAxisDanger ||
    a.futurePotential - b.futurePotential ||
    b.counterAttack.score - a.counterAttack.score
  )[0] ?? null;
}

function chooseExistingOpenTwoCut(player = HUMAN) {
  const options = [];

  for (const figure of findExistingOpenTwos(player)) {
    for (const index of figure.emptyIndices) {
      const attack = analyzeMove(index, player);
      if (attack.rank < 85) continue;

      const offAxisDanger = getOffAxisConstructionDanger(attack, figure.directionIndex);
      state.board[index] = player;
      state.moves += 1;
      const localFuture = getLocalFuturePotential(player, index, 4, index);
      state.moves -= 1;
      state.board[index] = EMPTY;

      const counterAttack = analyzeMove(index, otherPlayer(player));
      const counterConstructionBranches = counterAttack.openTwoDirections;
      const constructionBranches = attack.openTwoDirections;
      const defensiveRichGrowth =
        attack.doubleThreat ||
        attack.secondaryRank >= 35 ||
        constructionBranches >= 2;
      const multiPurposeGrowth = counterConstructionBranches >= 2;

      options.push({
        figure,
        index,
        attack,
        counterAttack,
        defensiveRichGrowth,
        multiPurposeGrowth,
        richGrowth: defensiveRichGrowth || multiPurposeGrowth,
        constructionBranches,
        criticalConstructionFork: constructionBranches >= 2,
        counterConstructionBranches,
        combinedConstructionBranches: constructionBranches + counterConstructionBranches,
        growthDanger:
          attack.rank * 1000000 +
          attack.openTwoDirections * 100000000 +
          offAxisDanger +
          localFuture.score,
      });
    }
  }

  return options.sort((a, b) =>
    b.attack.rank - a.attack.rank ||
    Number(b.criticalConstructionFork) - Number(a.criticalConstructionFork) ||
    b.combinedConstructionBranches - a.combinedConstructionBranches ||
    Number(b.richGrowth) - Number(a.richGrowth) ||
    b.counterConstructionBranches - a.counterConstructionBranches ||
    b.constructionBranches - a.constructionBranches ||
    b.growthDanger - a.growthDanger ||
    b.counterAttack.score - a.counterAttack.score
  )[0] ?? null;
}

function evaluateExistingClosedThreeDanger(figure) {
  const index = figure.blockIndex;
  const attack = analyzeMove(index, figure.player);
  const counterAttack = analyzeMove(index, otherPlayer(figure.player));
  const offAxisDanger = getOffAxisConstructionDanger(attack, figure.directionIndex);
  const baselineLocal = getLocalFuturePotential(figure.player, index, 4, null, index);
  const [anchorRow, anchorCol] = getRowCol(index);
  const nearbyOpenTwos = findExistingOpenTwos(figure.player).filter((openTwo) =>
    openTwo.indices.some((point) => {
      const [row, col] = getRowCol(point);
      return Math.max(Math.abs(row - anchorRow), Math.abs(col - anchorCol)) <= 4;
    })
  ).length;

  state.board[index] = figure.player;
  state.moves += 1;
  const winningCells = findImmediateWins(figure.player);
  let futurePotential = 0;
  let forcedBlock = null;

  if (winningCells.length >= 2) {
    futurePotential = 1000000000000;
  } else {
    forcedBlock = winningCells[0] ?? null;
    if (forcedBlock !== null) {
      state.board[forcedBlock] = otherPlayer(figure.player);
      state.moves += 1;
    }

    const causalFuture = getLocalFuturePotential(figure.player, index, 4, index);
    const fullFuture = getLocalFuturePotential(figure.player, index);
    futurePotential = causalFuture.score + Math.max(0, fullFuture.score - baselineLocal.score);

    if (forcedBlock !== null) {
      state.moves -= 1;
      state.board[forcedBlock] = EMPTY;
    }
  }

  state.moves -= 1;
  state.board[index] = EMPTY;

  return {
    figure,
    index,
    attack,
    counterAttack,
    forcedBlock,
    nearbyOpenTwos,
    futurePotential,
    dangerScore: offAxisDanger + futurePotential + nearbyOpenTwos * 6000000,
  };
}

function chooseExistingClosedThreeCut(player = HUMAN) {
  return findExistingClosedThreeCuts(player)
    .map(evaluateExistingClosedThreeDanger)
    .sort((a, b) =>
      b.dangerScore - a.dangerScore ||
      b.attack.rank - a.attack.rank ||
      b.counterAttack.score - a.counterAttack.score
    )[0] ?? null;
}

function getContinuationDanger(analysis) {
  if (!analysis) return 0;
  if (analysis.winsNow) return 1000000000000;

  return (
    (analysis.doubleThreat ? 80000000000 : 0) +
    analysis.secondaryRank * 2000000 +
    analysis.secondaryScore * 2 +
    analysis.openThreeDirections * 2400000 +
    analysis.closedThreeDirections * 900000 +
    analysis.openTwoDirections * 520000 +
    analysis.rank * 100000
  );
}

function getResidualThreatBreadth(player) {
  const threats = getCandidateMoves(2)
    .map((index) => analyzeMove(index, player))
    .filter((analysis) => analysis.rank >= 85);

  return {
    count: threats.length,
    fourDirections: threats.reduce((total, threat) => total + threat.fourDirections, 0),
    openThreeDirections: threats.reduce((total, threat) => total + threat.openThreeDirections, 0),
    doubleThreats: threats.filter((threat) => threat.doubleThreat).length,
  };
}

function evaluateDefensiveCut(index) {
  const counterAttack = analyzeMove(index, ROBOT);
  state.board[index] = ROBOT;
  state.moves += 1;

  const immediateWinsLeft = findImmediateWins(HUMAN).length;
  const replies = rankAttackMoves(HUMAN, REPLY_CANDIDATE_LIMIT + 4);
  let worstReply = null;
  let worstDanger = immediateWinsLeft * 600000000000;

  for (const reply of replies) {
    const danger = getContinuationDanger(reply.attack);
    if (danger > worstDanger) {
      worstReply = reply;
      worstDanger = danger;
    }
  }

  state.moves -= 1;
  state.board[index] = EMPTY;

  return {
    index,
    counterAttack,
    worstReply,
    worstDanger,
    safetyScore: -worstDanger + counterAttack.score * 0.04,
  };
}

function chooseBestDefensiveCut(humanMoves) {
  const strongestRank = humanMoves[0]?.attack.rank ?? 0;
  const candidates = humanMoves.filter(
    (move) => move.attack.rank >= 85 && move.attack.rank >= strongestRank - 5
  );
  if (!candidates.length) return null;

  return candidates
    .map((move) => evaluateDefensiveCut(move.index))
    .sort((a, b) =>
      b.safetyScore - a.safetyScore ||
      b.counterAttack.score - a.counterAttack.score
    )[0];
}

function getLeadPressure(player) {
  const best = rankAttackMoves(player, 1)[0]?.attack ?? null;
  if (!best) {
    return { player, score: 0, best: null, label: "aucune pression" };
  }

  const score =
    best.rank * 1200000 +
    best.score * 0.08 +
    best.fourDirections * 18000000 +
    best.openThreeDirections * 9000000 +
    best.closedThreeDirections * 2600000 +
    best.openTwoDirections * 800000 +
    (best.doubleConstruction ? 9000000 : 0) +
    (best.forcing ? 6000000 : 0) +
    (best.doubleThreat ? 14000000 : 0);

  return { player, score, best, label: best.primaryCode ?? "construction" };
}

function getLeadState() {
  if (state.isGameOver) {
    return { owner: "neutral", label: "Termine", reason: "La manche est finie", margin: 0 };
  }
  if (state.moves === 0) {
    return { owner: "neutral", label: "Neutre", reason: "Aucune initiative claire", margin: 0 };
  }

  const robot = getLeadPressure(ROBOT);
  const human = getLeadPressure(HUMAN);
  const margin = robot.score - human.score;
  const threshold = 1800000;

  if (margin > threshold) {
    return {
      owner: "robot",
      label: "Bot",
      reason: `${robot.best?.primaryCode ?? "attaque"} force X a repondre`,
      margin,
      robot,
      human,
    };
  }

  if (margin < -threshold) {
    return {
      owner: "human",
      label: "Adversaire",
      reason: `${human.best?.primaryCode ?? "attaque"} force O a defendre`,
      margin,
      robot,
      human,
    };
  }

  return {
    owner: "neutral",
    label: "Neutre",
    reason: "Initiative partagee",
    margin,
    robot,
    human,
  };
}

function evaluateLeadMaintainingCut(index) {
  const preventedAttack = analyzeMove(index, HUMAN);
  const counterAttack = analyzeMove(index, ROBOT);
  const localInfluence = getLocalInfluenceBalance(index, ROBOT, 2);

  state.board[index] = ROBOT;
  state.moves += 1;

  const immediateWinsLeft = findImmediateWins(HUMAN).length;
  const residualThreats = getResidualThreatBreadth(HUMAN);
  const robotFollowUp = rankAttackMoves(ROBOT, 1)[0] ?? null;
  const humanFollowUp = rankAttackMoves(HUMAN, 1)[0] ?? null;

  state.moves -= 1;
  state.board[index] = EMPTY;

  return {
    index,
    preventedAttack,
    counterAttack,
    localInfluence,
    immediateWinsLeft,
    residualThreats,
    robotFollowUp,
    humanFollowUp,
    leadScore:
      -immediateWinsLeft * 1000000000000 -
      residualThreats.doubleThreats * 180000000 -
      residualThreats.fourDirections * 60000000 -
      residualThreats.openThreeDirections * 42000000 -
      residualThreats.count * 9000000 +
      (robotFollowUp?.attack.rank ?? 0) * 1400000 +
      (robotFollowUp?.attack.score ?? 0) * 0.18 -
      (humanFollowUp?.attack.rank ?? 0) * 620000 -
      (humanFollowUp?.attack.score ?? 0) * 0.06 +
      counterAttack.score * 0.12 +
      localInfluence * 650000,
  };
}

function chooseLeadMaintainingCut(humanMoves) {
  const candidates = humanMoves
    .filter((move) => move.attack.rank >= 85)
    .slice(0, 4)
    .map((move) => evaluateLeadMaintainingCut(move.index));
  if (!candidates.length) return null;

  const selected = candidates.sort((a, b) =>
    a.immediateWinsLeft - b.immediateWinsLeft ||
    a.residualThreats.doubleThreats - b.residualThreats.doubleThreats ||
    a.residualThreats.fourDirections - b.residualThreats.fourDirections ||
    a.residualThreats.openThreeDirections - b.residualThreats.openThreeDirections ||
    a.residualThreats.count - b.residualThreats.count ||
    (b.robotFollowUp?.attack.rank ?? 0) - (a.robotFollowUp?.attack.rank ?? 0) ||
    b.localInfluence - a.localInfluence ||
    b.leadScore - a.leadScore
  )[0];

  if (!selected || selected.immediateWinsLeft > 0) return null;
  if ((selected.robotFollowUp?.attack.rank ?? 0) < 60 && selected.residualThreats.openThreeDirections > 0) return null;
  return selected;
}

function evaluateRobotPlan(index, deadline) {
  const opening = analyzeMove(index, ROBOT);
  if (opening.winsNow) return { score: 2000000000, worstReply: null, followUp: null };

  state.board[index] = ROBOT;
  state.moves += 1;
  const replies = rankMoves(HUMAN, REPLY_CANDIDATE_LIMIT);
  let worstScore = Infinity;
  let worstReply = null;
  let bestFollowUp = null;

  for (const reply of replies) {
    if (nowMs() >= deadline) break;
    state.board[reply.index] = HUMAN;
    state.moves += 1;

    let lineScore;
    if (collectLine(reply.index, HUMAN).length >= WIN_LENGTH) {
      lineScore = -1800000000;
    } else {
      const followUp = rankMoves(ROBOT, FOLLOW_UP_LIMIT)[0] ?? null;
      const humanNext = rankMoves(HUMAN, 3)[0] ?? null;
      lineScore =
        opening.score * 0.72 -
        reply.attack.score * 1.08 +
        (followUp?.attack.score ?? 0) * 0.58 -
        (humanNext?.attack.score ?? 0) * 0.34 +
        (opening.forcing ? 9000000 : 0) +
        (followUp?.attack.forcing ? 4500000 : 0);
      if (!bestFollowUp || (followUp?.attack.score ?? 0) > bestFollowUp.attack.score) bestFollowUp = followUp;
    }

    state.moves -= 1;
    state.board[reply.index] = EMPTY;

    if (lineScore < worstScore) {
      worstScore = lineScore;
      worstReply = reply;
    }
  }

  state.moves -= 1;
  state.board[index] = EMPTY;

  if (!Number.isFinite(worstScore)) worstScore = opening.score;
  return { score: worstScore, worstReply, followUp: bestFollowUp };
}

function setRobotDecision(index, priority, reason, tags = [], analysis = null) {
  const figure = analysis?.primaryCode ? ` Figure ${analysis.primaryCode}.` : "";
  state.lastRobotDecision = {
    index,
    priority,
    reason: `${reason}${figure}`,
    tags,
  };
  return index;
}

function setHumanDecision(index) {
  const robotWins = findImmediateWins(ROBOT);
  const blockedWin = robotWins.includes(index);
  const analysis = analyzeMove(index, HUMAN);
  const figure = analysis.primaryCode ? ` Figure ${analysis.primaryCode}.` : "";
  let priority = "POSITION";
  let reason = "X joue dans une zone active pour rester connecte aux pions deja poses.";
  const tags = ["adversaire"];

  if (analysis.winsNow) {
    priority = "WIN";
    reason = "X complete cinq symboles alignes et gagne immediatement.";
    tags.push("victoire");
  } else if (blockedWin) {
    priority = "BLOCK-WIN";
    reason = "X ferme une case ou O pouvait gagner au prochain coup.";
    tags.push("defense", "urgence");
  } else if (analysis.doubleThreat) {
    priority = "DOUBLE-THREAT";
    reason = "X choisit cette case parce qu'elle cree plusieurs axes dangereux en meme temps.";
    tags.push("attaque", "double-menace");
  } else if (analysis.fourDirections > 0) {
    priority = "FOUR";
    reason = "X pose ici pour former un quatre: O devra repondre vite pour eviter la victoire.";
    tags.push("attaque", "quatre");
  } else if (analysis.openThreeDirections > 0) {
    priority = "OPEN-THREE";
    reason = "X cree un trois ouvert, une menace forcing qui peut devenir quatre au tour suivant.";
    tags.push("attaque", "trois-ouvert");
  } else if (analysis.closedThreeDirections > 0) {
    priority = "CLOSED-THREE";
    reason = "X construit un trois barre: moins urgent qu'un trois ouvert, mais il prepare une prolongation.";
    tags.push("construction", "trois-barre");
  } else if (analysis.openTwoDirections > 0) {
    priority = "OPEN-TWO";
    reason = "X developpe un deux ouvert pour preparer une future chaine de menaces.";
    tags.push("construction", "deux-ouvert");
  } else if (analysis.rank > 0) {
    priority = "BUILD";
    reason = "X renforce une figure existante meme si elle n'est pas encore forcing.";
    tags.push("construction", analysis.classLabel);
  } else {
    tags.push("position", "proximite");
  }

  state.lastHumanDecision = {
    index,
    priority,
    reason: `${reason}${figure}`,
    tags,
  };
  return index;
}

function evaluateRobotFourSafety(move, deadline = Infinity) {
  const defenderHadOpenThree = findExistingOpenThrees(HUMAN).length > 0;
  state.board[move.index] = ROBOT;
  state.moves += 1;
  const winningCells = findImmediateWins(ROBOT);
  let forcedBlock = null;
  let forcedBlockAnalysis = null;
  let poisoned = false;
  let continuationPlan = null;
  let continuationExhausted = false;

  if (winningCells.length === 1) {
    forcedBlock = winningCells[0];
    forcedBlockAnalysis = analyzeMove(forcedBlock, HUMAN);
    state.board[forcedBlock] = HUMAN;
    state.moves += 1;
    const humanWinsByBlocking = collectLine(forcedBlock, HUMAN).length >= WIN_LENGTH;
    if (!humanWinsByBlocking) {
      const continuationBudget = { nodes: 0, limit: 320, exhausted: false };
      continuationPlan = searchForcingWin(ROBOT, {
        deadline: Infinity,
        maxDepth: FORCING_CHAIN_DEPTH,
        budget: continuationBudget,
      });
      continuationExhausted = continuationBudget.exhausted;
    }
    state.moves -= 1;
    state.board[forcedBlock] = EMPTY;
    poisoned = humanWinsByBlocking || forcedBlockAnalysis.rank >= 85;
  }

  state.moves -= 1;
  state.board[move.index] = EMPTY;

  const guaranteed = winningCells.length >= 2;
  const planUsesOpenThreeTempo = Boolean(
    continuationPlan?.steps.some((step) => step.responseOptions?.length)
  );
  const planCreatesFourByThree = Boolean(
    (move.attack.fourDirections > 0 && move.attack.openThreeDirections > 0) ||
    continuationPlan?.steps.some((step) => step.fourDirections > 0 && step.openThreeDirections > 0)
  );
  const continuationWinsRace =
    !defenderHadOpenThree ||
    !planUsesOpenThreeTempo ||
    planCreatesFourByThree;
  const provenContinuation =
    Boolean(continuationPlan) &&
    !continuationExhausted &&
    continuationWinsRace;
  const provenWinningAttack = guaranteed || provenContinuation;
  return {
    ...move,
    winningCells,
    forcedBlock,
    forcedBlockAnalysis,
    guaranteed,
    continuationPlan,
    continuationExhausted,
    defenderHadOpenThree,
    planUsesOpenThreeTempo,
    planCreatesFourByThree,
    continuationWinsRace,
    raceRejected: Boolean(continuationPlan) && !continuationWinsRace,
    provenContinuation,
    provenWinningAttack,
    tempoOnly: !provenWinningAttack && winningCells.length === 1 && !poisoned,
    poisoned,
    safe: provenWinningAttack || (winningCells.length === 1 && !poisoned),
  };
}

function evaluateRobotLeadAttack(move, continuationDepth = 0) {
  if (
    move.attack.fourDirections > 0 ||
    move.attack.openThreeDirections === 0 ||
    move.attack.secondaryRank < 35 ||
    (move.attack.openTwoDirections === 0 && move.attack.secondaryRank < 60)
  ) return null;

  state.board[move.index] = ROBOT;
  state.moves += 1;

  const responseIndices = [...new Set(
    findExistingOpenThrees(ROBOT)
      .filter((figure) => figure.indices.includes(move.index))
      .flatMap((figure) => figure.emptyIndices)
  )].filter((index) => state.board[index] === EMPTY);
  const responses = [];
  let safeLead = responseIndices.length > 0;
  let worstFuturePotential = Infinity;
  let maxResponseDanger = 0;
  const localInfluence = getLocalInfluenceBalance(move.index, ROBOT);

  for (const index of responseIndices) {
    const humanConstruction = analyzeMove(index, HUMAN);
    if (humanConstruction.rank >= 85 || humanConstruction.winsNow) safeLead = false;

    state.board[index] = HUMAN;
    state.moves += 1;
    const humanImmediateWins = findImmediateWins(HUMAN).length;
    const futurePotential = getLocalFuturePotential(ROBOT, move.index, 4, move.index).score;
    worstFuturePotential = Math.min(worstFuturePotential, futurePotential);
    maxResponseDanger = Math.max(maxResponseDanger, humanConstruction.rank);
    const followUpCandidates = rankAttackMoves(ROBOT, 4)
      .filter((candidate) => candidate.attack.forcing && candidate.attack.rank >= 85);
    const followUp = continuationDepth > 0
      ? followUpCandidates
        .map((candidate) => evaluateRobotLeadAttack(candidate, continuationDepth - 1))
        .find((candidate) => candidate?.safeLead) ?? null
      : followUpCandidates[0] ?? null;
    state.moves -= 1;
    state.board[index] = EMPTY;

    if (humanImmediateWins > 0 || !followUp) safeLead = false;
    responses.push({ index, humanConstruction, followUp, futurePotential });
  }

  state.moves -= 1;
  state.board[move.index] = EMPTY;

  return {
    ...move,
    safeLead,
    responseIndices,
    responses,
    worstFuturePotential: Number.isFinite(worstFuturePotential) ? worstFuturePotential : 0,
    maxResponseDanger,
    localInfluence,
  };
}

function evaluateRobotLeadConstruction(move) {
  if (
    move.attack.fourDirections > 0 ||
    move.attack.openThreeDirections === 0 ||
    move.attack.openTwoDirections === 0 ||
    move.attack.rank < 85
  ) return null;

  const leadAttack = evaluateRobotLeadAttack(move, 0);
  if (!leadAttack?.safeLead) return null;

  const leadScore =
    leadAttack.worstFuturePotential +
    leadAttack.localInfluence * 1800000 +
    leadAttack.responseIndices.length * 4200000 +
    move.attack.score * 0.1 +
    (move.attack.doubleThreat ? 18000000 : 0) +
    18000000;

  return {
    ...leadAttack,
    leadScore,
    leadShape: "3x2",
  };
}

function evaluateRobotTwoByTwo(move) {
  if (
    move.attack.fourDirections > 0 ||
    move.attack.openThreeDirections > 0 ||
    move.attack.openTwoDirections < 2 ||
    move.attack.rank < 35
  ) return null;

  state.board[move.index] = ROBOT;
  state.moves += 1;

  const humanImmediateWins = findImmediateWins(HUMAN).length;
  const humanOpenThrees = findExistingOpenThrees(HUMAN).length;
  const localFuture = getLocalFuturePotential(ROBOT, move.index, 4, move.index);
  const followUp = rankAttackMoves(ROBOT, 6).find((candidate) =>
    candidate.attack.rank >= 35 ||
    candidate.attack.openTwoDirections >= 1 ||
    candidate.attack.secondaryRank >= 35
  ) ?? null;
  const humanNext = rankAttackMoves(HUMAN, 3)[0] ?? null;

  state.moves -= 1;
  state.board[move.index] = EMPTY;

  const useful =
    humanImmediateWins === 0 &&
    humanOpenThrees === 0 &&
    Boolean(followUp) &&
    (localFuture.score >= 180000 || (followUp?.attack.rank ?? 0) >= 35 || (followUp?.attack.openTwoDirections ?? 0) >= 1);

  return {
    ...move,
    localFuture,
    followUp,
    humanImmediateWins,
    humanOpenThrees,
    useful,
    leadScore:
      move.attack.score * 0.22 +
      localFuture.score +
      (followUp?.attack.score ?? 0) * 0.35 +
      move.attack.openTwoDirections * 7000000 -
      (humanNext?.attack.score ?? 0) * 0.08,
    leadShape: "2x2",
  };
}

function evaluateRobotTempoLead(move) {
  if (
    !move.tempoOnly ||
    move.attack.secondaryRank < 35 ||
    move.attack.openTwoDirections === 0 ||
    move.forcedBlock === null ||
    (move.forcedBlockAnalysis?.rank ?? 100) >= 85
  ) return null;

  state.board[move.index] = ROBOT;
  state.moves += 1;
  state.board[move.forcedBlock] = HUMAN;
  state.moves += 1;

  const humanImmediateWins = findImmediateWins(HUMAN).length;
  const humanOpenThrees = findExistingOpenThrees(HUMAN).length;
  const followUp = rankAttackMoves(ROBOT, 6)
    .find((candidate) => candidate.attack.fourDirections === 0 && candidate.attack.rank >= 35) ?? null;

  state.moves -= 2;
  state.board[move.forcedBlock] = EMPTY;
  state.board[move.index] = EMPTY;

  return {
    ...move,
    followUp,
    safeLead: humanImmediateWins === 0 && humanOpenThrees === 0 && Boolean(followUp),
  };
}

function chooseLeadConstructiveAttack(robotAttackMoves) {
  return robotAttackMoves
    .filter((move) => move.attack.rank >= 85)
    .map(evaluateRobotLeadConstruction)
    .filter((move) => move?.leadShape === "3x2" && move.safeLead)
    .sort((a, b) =>
      b.leadScore - a.leadScore ||
      b.worstFuturePotential - a.worstFuturePotential ||
      b.localInfluence - a.localInfluence ||
      b.attack.score - a.attack.score
    )[0] ?? null;
}

function chooseLeadTwoByTwo(robotAttackMoves) {
  return robotAttackMoves
    .filter((move) => move.attack.rank >= 35)
    .map(evaluateRobotTwoByTwo)
    .filter((move) => move?.leadShape === "2x2" && move.useful)
    .sort((a, b) =>
      b.leadScore - a.leadScore ||
      b.localFuture.score - a.localFuture.score ||
      (b.followUp?.attack.rank ?? 0) - (a.followUp?.attack.rank ?? 0) ||
      b.attack.score - a.attack.score
    )[0] ?? null;
}

function evaluateRobotOpportunity(move) {
  if (!move?.tempoOnly || move.poisoned || move.forcedBlock === null) return null;
  if ((move.forcedBlockAnalysis?.rank ?? 100) >= 85) return null;

  state.board[move.index] = ROBOT;
  state.moves += 1;
  state.board[move.forcedBlock] = HUMAN;
  state.moves += 1;

  const humanImmediateWins = findImmediateWins(HUMAN).length;
  const humanOpenThrees = findExistingOpenThrees(HUMAN).length;
  const localFuture = getLocalFuturePotential(ROBOT, move.index, 4, move.index);
  const followUp = rankAttackMoves(ROBOT, 6)
    .find((candidate) =>
      candidate.attack.rank >= 35 ||
      candidate.attack.openTwoDirections >= 1 ||
      candidate.attack.secondaryRank >= 35
    ) ?? null;
  const humanNext = rankAttackMoves(HUMAN, 3)[0] ?? null;

  state.moves -= 2;
  state.board[move.forcedBlock] = EMPTY;
  state.board[move.index] = EMPTY;

  const remembered = state.robotOpportunities.find((opportunity) => opportunity.index === move.index);
  const opportunityScore =
    move.attack.score * 0.42 +
    localFuture.score +
    (followUp?.attack.score ?? 0) * 0.45 +
    (followUp?.attack.rank ?? 0) * 1400000 -
    (humanNext?.attack.score ?? 0) * 0.08 -
    humanOpenThrees * 80000000 -
    humanImmediateWins * 1000000000000 +
    (remembered ? Math.min(24000000, remembered.score * 0.16) : 0);

  const useful =
    humanImmediateWins === 0 &&
    humanOpenThrees === 0 &&
    Boolean(followUp) &&
    (localFuture.score >= 250000 || (followUp?.attack.rank ?? 0) >= 35);

  return {
    ...move,
    localFuture,
    followUp,
    humanNext,
    humanImmediateWins,
    humanOpenThrees,
    opportunityScore,
    remembered: Boolean(remembered),
    useful,
  };
}

function chooseRobotOpportunity(robotFourEvaluations) {
  const opportunities = robotFourEvaluations
    .slice(0, 6)
    .map(evaluateRobotOpportunity)
    .filter((opportunity) => opportunity?.useful)
    .sort((a, b) =>
      b.opportunityScore - a.opportunityScore ||
      (b.followUp?.attack.rank ?? 0) - (a.followUp?.attack.rank ?? 0) ||
      b.localFuture.score - a.localFuture.score ||
      b.attack.score - a.attack.score
    );

  state.robotOpportunities = opportunities.slice(0, 6).map((opportunity) => ({
    index: opportunity.index,
    score: opportunity.opportunityScore,
    code: opportunity.attack.primaryCode,
    forcedBlock: opportunity.forcedBlock,
    followUp: opportunity.followUp?.index ?? null,
    savedAtMove: state.moves,
  }));

  return opportunities[0] ?? null;
}

function continueActiveRobotPlan(deadline = Infinity) {
  const plan = state.activeRobotPlan;
  if (!plan) return null;

  const lastMove = state.moveHistory[state.moveHistory.length - 1];
  if (!lastMove || lastMove.player !== HUMAN || !plan.expectedHumanMoves.includes(lastMove.index)) {
    state.activeRobotPlan = null;
    return null;
  }

  if (plan.replanAfterResponse) {
    const continuationBudget = { nodes: 0, limit: 1200, exhausted: false };
    const continuation = searchForcingWin(ROBOT, {
      deadline: Math.min(deadline, nowMs() + 650),
      maxDepth: FORCING_CHAIN_DEPTH,
      budget: continuationBudget,
    });
    if (!continuation || continuationBudget.exhausted) {
      state.activeRobotPlan = null;
      return null;
    }
    plan.steps = continuation.steps.map((step) => ({ ...step }));
    plan.cursor = 0;
    plan.replanAfterResponse = false;
  }

  const step = plan.steps[plan.cursor];
  if (!step || state.board[step.attackIndex] !== EMPTY) {
    state.activeRobotPlan = null;
    return null;
  }

  plan.cursor += 1;
  if (step.forcedBlock !== null) {
    plan.expectedHumanMoves = [step.forcedBlock];
  } else if (step.responseOptions?.length) {
    plan.expectedHumanMoves = [...step.responseOptions];
    plan.replanAfterResponse = true;
  } else {
    state.activeRobotPlan = null;
  }
  if (plan.cursor >= plan.steps.length && !step.responseOptions?.length) state.activeRobotPlan = null;

  return setRobotDecision(
    step.attackIndex,
    "ATTACK-PLAN",
    "Le flux suit le plan de victoire deja prouve; le bot continue la sequence au lieu de lancer une nouvelle attaque.",
    ["attaque", "niveau-1-victoire-assuree", "plan-verrouille", "victoire-forcee-prouvee", `${plan.cursor}/${plan.steps.length}`],
    analyzeMove(step.attackIndex, ROBOT)
  );
}

function searchForcingWin(player, options = {}) {
  const defender = otherPlayer(player);
  const deadline = options.deadline ?? Infinity;
  const maxDepth = options.maxDepth ?? FORCING_CHAIN_DEPTH;
  const budget = options.budget ?? { nodes: 0, limit: FORCING_CHAIN_NODE_LIMIT };

  function search(depth, forcedReplies = 0) {
    if (depth <= 0) return null;
    if (nowMs() >= deadline || budget.nodes >= budget.limit) {
      budget.exhausted = true;
      return null;
    }
    budget.nodes += 1;

    const winsNow = findImmediateWins(player);
    if (winsNow.length) {
      return {
        terminal: "win",
        steps: [],
        winningCells: winsNow,
      };
    }

    if (findImmediateWins(defender).length) return null;

    const moveIndices = forcedReplies === 0 && options.rootIndices?.length
      ? options.rootIndices.filter((index) => state.board[index] === EMPTY)
      : getCandidateMoves(1);
    const allowOpenThree = forcedReplies >= 2 || (forcedReplies === 0 && options.rootIndices?.length);
    const forcingMoves = moveIndices
      .map((index) => ({ index, attack: analyzeMove(index, player) }))
      .filter((move) =>
        move.attack.fourDirections > 0 ||
        move.attack.winsNow ||
        (allowOpenThree && move.attack.openThreeDirections > 0)
      )
      .sort((a, b) =>
        b.attack.fourDirections - a.attack.fourDirections ||
        b.attack.rank - a.attack.rank ||
        b.attack.score - a.attack.score
      )
      .slice(0, FORCING_CHAIN_CANDIDATES);

    for (const move of forcingMoves) {
      if (nowMs() >= deadline || budget.nodes >= budget.limit) break;
      state.board[move.index] = player;
      state.moves += 1;

      const directWin = collectLine(move.index, player).length >= WIN_LENGTH;
      const winningCells = directWin ? [move.index] : findImmediateWins(player);
      let result = null;

      if (directWin || winningCells.length >= 2) {
        result = {
          terminal: directWin ? "win" : "double-four",
          steps: [{
            attackIndex: move.index,
            forcedBlock: null,
            winningCells,
            code: move.attack.primaryCode,
            fourDirections: move.attack.fourDirections,
            openThreeDirections: move.attack.openThreeDirections,
          }],
          winningCells,
        };
      } else if (
        winningCells.length === 0 &&
        allowOpenThree &&
        move.attack.openThreeDirections > 0 &&
        depth > 1
      ) {
        const openThreeResponses = [...new Set(
          findExistingOpenThrees(player)
            .filter((figure) => figure.indices.includes(move.index))
            .flatMap((figure) => figure.emptyIndices)
        )].filter((index) => state.board[index] === EMPTY);
        let representativeContinuation = null;
        let winsAgainstEveryResponse = openThreeResponses.length > 0;

        for (const response of openThreeResponses) {
          state.board[response] = defender;
          state.moves += 1;
          const continuation = search(depth - 1, forcedReplies + 1);
          state.moves -= 1;
          state.board[response] = EMPTY;

          if (!continuation) {
            winsAgainstEveryResponse = false;
            break;
          }
          representativeContinuation = continuation;
        }

        if (winsAgainstEveryResponse && representativeContinuation) {
          result = {
            terminal: representativeContinuation.terminal,
            steps: [{
              attackIndex: move.index,
              forcedBlock: null,
              winningCells: openThreeResponses,
              responseOptions: openThreeResponses,
              code: move.attack.primaryCode,
              fourDirections: move.attack.fourDirections,
              openThreeDirections: move.attack.openThreeDirections,
            }, ...representativeContinuation.steps],
            winningCells: representativeContinuation.winningCells,
          };
        }
      } else if (winningCells.length === 1 && depth > 1) {
        const forcedBlock = winningCells[0];
        const defenderWinsByBlocking = wouldWin(forcedBlock, defender);

        if (!defenderWinsByBlocking) {
          state.board[forcedBlock] = defender;
          state.moves += 1;

          if (!findImmediateWins(defender).length) {
            const continuation = search(depth - 1, forcedReplies + 1);
            if (continuation) {
              result = {
                terminal: continuation.terminal,
                steps: [{
                  attackIndex: move.index,
                  forcedBlock,
                  winningCells,
                  code: move.attack.primaryCode,
                  fourDirections: move.attack.fourDirections,
                  openThreeDirections: move.attack.openThreeDirections,
                }, ...continuation.steps],
                winningCells: continuation.winningCells,
              };
            }
          }

          state.moves -= 1;
          state.board[forcedBlock] = EMPTY;
        }
      }

      state.moves -= 1;
      state.board[move.index] = EMPTY;
      if (result) return { ...result, nodes: budget.nodes };
    }

    return null;
  }

  return search(maxDepth, 0);
}

function findForcedAttackDefense(player = HUMAN, deadline = Infinity) {
  const defender = otherPlayer(player);
  const fastTactical = state.moves <= 14;
  const planBudget = { nodes: 0, limit: fastTactical ? 220 : FORCING_CHAIN_NODE_LIMIT, exhausted: false };
  const plan = searchForcingWin(player, { deadline, budget: planBudget });
  if (!plan?.steps.length || planBudget.exhausted) return null;

  const criticalIndices = [...new Set(plan.steps.flatMap((step) => [
    step.attackIndex,
    step.forcedBlock,
    ...step.winningCells,
  ]))].filter((index) => index !== null && state.board[index] === EMPTY);
  const closedThreeEvaluations = findExistingClosedThreeCuts(player).map(evaluateExistingClosedThreeDanger);
  const closedThreeDangerByIndex = new Map();
  for (const evaluation of closedThreeEvaluations) {
    const index = evaluation.figure.blockIndex;
    closedThreeDangerByIndex.set(index, Math.max(closedThreeDangerByIndex.get(index) ?? 0, evaluation.dangerScore));
  }
  const closedThreeIndices = [...closedThreeDangerByIndex.keys()];
  const openTwoGrowthIndices = findExistingOpenTwos(player).flatMap((figure) =>
    figure.emptyIndices.filter((index) => state.board[index] === EMPTY && analyzeMove(index, player).rank >= 60)
  );
  const rootThreatByIndex = new Map();
  const rootThreatCandidates = [...new Set([...closedThreeIndices, ...openTwoGrowthIndices])]
    .map((index) => ({
      index,
      attack: analyzeMove(index, player),
      closedThreeDanger: closedThreeDangerByIndex.get(index) ?? 0,
    }))
    .sort((a, b) =>
      b.attack.rank - a.attack.rank ||
      b.closedThreeDanger - a.closedThreeDanger ||
      b.attack.score - a.attack.score
    )
    .slice(0, 6)
    .map((candidate) => candidate.index);
  for (const index of rootThreatCandidates) {
    if (state.moves <= 14 && nowMs() >= deadline) break;
    const rootBudget = { nodes: 0, limit: fastTactical ? 120 : 320, exhausted: false };
    const rootPlan = searchForcingWin(player, {
      deadline: state.moves > 14 ? Infinity : deadline,
      maxDepth: FORCING_CHAIN_DEPTH,
      budget: rootBudget,
      rootIndices: [index],
    });
    if (rootPlan && !rootBudget.exhausted) rootThreatByIndex.set(index, rootPlan.steps.length);
  }
  const strongHumanIndices = getCandidateMoves(2)
    .map((index) => ({ index, attack: analyzeMove(index, player) }))
    .filter((move) => move.attack.rank >= 60)
    .map((move) => move.index);
  const candidateIndices = [...new Set([
    ...criticalIndices,
    ...closedThreeIndices,
    ...openTwoGrowthIndices,
    ...strongHumanIndices,
  ])].filter((index) => state.board[index] === EMPTY);
  const candidateCuts = candidateIndices
    .map((index) => ({
      index,
      counterAttack: analyzeMove(index, defender),
      preventedAttack: analyzeMove(index, player),
      isFirstForcingMove: index === plan.steps[0]?.attackIndex,
      isCritical: criticalIndices.includes(index),
      isExactClosedThree: closedThreeIndices.includes(index),
      closedThreeDanger: closedThreeDangerByIndex.get(index) ?? 0,
      rootThreatDepth: rootThreatByIndex.get(index) ?? Infinity,
    }))
    .sort((a, b) =>
      b.preventedAttack.rank - a.preventedAttack.rank ||
      Number(b.isExactClosedThree) - Number(a.isExactClosedThree) ||
      Number(Number.isFinite(b.rootThreatDepth)) - Number(Number.isFinite(a.rootThreatDepth)) ||
      a.rootThreatDepth - b.rootThreatDepth ||
      b.closedThreeDanger - a.closedThreeDanger ||
      b.preventedAttack.score - a.preventedAttack.score ||
      Number(b.isCritical) - Number(a.isCritical) ||
      Number(b.isFirstForcingMove) - Number(a.isFirstForcingMove) ||
      b.counterAttack.score - a.counterAttack.score
    );
  const defenses = [];

  for (const candidate of candidateCuts.slice(0, fastTactical ? 2 : 4)) {
    if (state.moves <= 14 && nowMs() >= deadline) break;
    const {
      index,
      counterAttack,
      preventedAttack,
      isFirstForcingMove,
      isCritical,
      isExactClosedThree,
      closedThreeDanger,
      rootThreatDepth,
    } = candidate;
    state.board[index] = defender;
    state.moves += 1;

    const validationBudget = {
      nodes: 0,
      limit: fastTactical ? 140 : 360,
      exhausted: false,
    };
    const remainingPlan = searchForcingWin(player, {
      deadline: state.moves > 14 ? Infinity : deadline,
      budget: validationBudget,
    });
    const immediateDanger = findImmediateWins(player).length;
    const residualThreats = getResidualThreatBreadth(player);

    state.moves -= 1;
    state.board[index] = EMPTY;
    defenses.push({
      index,
      counterAttack,
      preventedAttack,
      remainingPlan,
      immediateDanger,
      isFirstForcingMove,
      isCritical,
      isExactClosedThree,
      closedThreeDanger,
      rootThreatDepth,
      residualThreats,
      exhausted: validationBudget.exhausted,
      safe: !remainingPlan && !validationBudget.exhausted && immediateDanger === 0,
      safetyScore:
        (!remainingPlan && !validationBudget.exhausted && immediateDanger === 0 ? 2000000000000 : 0) +
        (remainingPlan ? -900000000000 : 0) -
        (validationBudget.exhausted ? 800000000000 : 0) -
        immediateDanger * 600000000000 +
        residualThreats.doubleThreats * -180000000 -
        residualThreats.fourDirections * 42000000 -
        residualThreats.openThreeDirections * 24000000 -
        residualThreats.count * 9000000 +
        (isCritical ? 180000000 : 0) +
        (isExactClosedThree ? 520000000 : 0) +
        (Number.isFinite(rootThreatDepth) ? 900000000 - rootThreatDepth * 120000000 : 0) +
        closedThreeDanger * 0.08 +
        (isFirstForcingMove ? 120000000 : 0) +
        preventedAttack.score * 1.1 +
        counterAttack.score * 0.35,
    });
  }

  const defense = defenses.sort((a, b) =>
    Number(b.safe) - Number(a.safe) ||
    a.immediateDanger - b.immediateDanger ||
    a.residualThreats.doubleThreats - b.residualThreats.doubleThreats ||
    a.residualThreats.fourDirections - b.residualThreats.fourDirections ||
    a.residualThreats.openThreeDirections - b.residualThreats.openThreeDirections ||
    a.residualThreats.count - b.residualThreats.count ||
    b.safetyScore - a.safetyScore ||
    b.counterAttack.score - a.counterAttack.score
  )[0] ?? candidateCuts[0] ?? null;

  if (defense) {
    const residualUnits = (profile = {}) => (
      (profile.doubleThreats ?? 0) * 4 +
      (profile.fourDirections ?? 0) * 3 +
      (profile.openThreeDirections ?? 0) * 2 +
      (profile.count ?? 0)
    );
    const bestExactUnits = defenses
      .filter((candidate) => candidate.isExactClosedThree)
      .reduce((best, candidate) => Math.min(best, residualUnits(candidate.residualThreats)), Infinity);
    defense.residualUnits = residualUnits(defense.residualThreats);
    defense.multiThreatGain = Number.isFinite(bestExactUnits)
      ? Math.max(0, bestExactUnits - defense.residualUnits)
      : 0;
  }

  return defense ? { plan, defense, criticalIndices, defenses } : null;
}

function chooseRobotMove() {
  clearAnalysisCache();
  const deadline = nowMs() + SEARCH_TIME_MS;

  if (state.moves === 0) {
    return setRobotDecision(
      getIndex(Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2)),
      "OPEN",
      "Ouverture propre: le bot prend le centre.",
      ["ouverture", "centre"]
    );
  }

  if (state.moves === 1 && state.board.includes(HUMAN)) {
    const diagonalMove = chooseDiagonalOpeningResponse();
    if (diagonalMove !== null) {
      return setRobotDecision(
        diagonalMove,
        "OPEN-DIAGONAL",
        "Premier coup du bot: placement diagonal obligatoire par rapport au premier X.",
        ["ouverture", "diagonale", "centre"]
      );
    }
  }

  const robotWins = findImmediateWins(ROBOT);
  if (robotWins.length) {
    const analysis = analyzeMove(robotWins[0], ROBOT);
    return setRobotDecision(robotWins[0], "WIN", "Victoire immediate avec cinq O.", ["attaque", "victoire"], analysis);
  }

  const humanWins = findImmediateWins(HUMAN);
  if (humanWins.length >= 2) {
    const attack = rankAttackMoves(ROBOT, 1)[0];
    const fallback = attack?.index ?? getCandidateMoves(2).find((index) => !humanWins.includes(index));
    return setRobotDecision(
      fallback,
      "LOST-ATTACK",
      "X possede plusieurs victoires immediates: un seul blocage est inutile, le bot joue son meilleur coup offensif.",
      ["attaque", "defense-impossible", `${humanWins.length}-victoires-X`],
      attack?.attack ?? null
    );
  }

  if (humanWins.length) {
    const block = humanWins
      .map((index) => ({ index, counter: analyzeMove(index, ROBOT) }))
      .sort((a, b) => b.counter.score - a.counter.score)[0];
    return setRobotDecision(block.index, "BLOCK-WIN", "Blocage obligatoire d'une victoire X immediate.", ["defense", "urgence"], analyzeMove(block.index, HUMAN));
  }

  const activePlanMove = continueActiveRobotPlan(deadline);
  if (activePlanMove !== null) return activePlanMove;

  const forcedAttackDefense = findForcedAttackDefense(HUMAN, deadline);
  const robotMoves = rankMoves(ROBOT, ROOT_CANDIDATE_LIMIT);
  const humanMoves = rankMoves(HUMAN, ROOT_CANDIDATE_LIMIT);
  const robotAttackMoves = rankAttackMoves(ROBOT, ROOT_CANDIDATE_LIMIT);
  const closedThreeCut = chooseExistingClosedThreeCut(HUMAN);
  const existingThreeCut = chooseExistingOpenThreeCut(HUMAN);
  const openTwoCut = chooseExistingOpenTwoCut(HUMAN);
  const leadMaintainingCut = state.moves <= 10 ? chooseLeadMaintainingCut(humanMoves) : null;
  const robotFourEvaluations = robotAttackMoves
    .filter((move) => move.attack.forcing && move.attack.fourDirections > 0)
    .map((move) => evaluateRobotFourSafety(move, deadline));
  const leadContextSafe =
    !forcedAttackDefense?.defense &&
    !existingThreeCut &&
    !closedThreeCut &&
    (!openTwoCut || openTwoCut.constructionBranches === 0);
  const safeRobotLead = leadContextSafe
    ? robotAttackMoves
      .filter((move) =>
        move.attack.openThreeDirections > 0 &&
        move.attack.secondaryRank >= 35 &&
        (move.attack.openTwoDirections > 0 || move.attack.secondaryRank >= 60)
      )
      .map((move) => evaluateRobotLeadAttack(move, 0))
      .filter((move) => move?.safeLead)
      .sort((a, b) =>
        b.worstFuturePotential - a.worstFuturePotential ||
        b.localInfluence - a.localInfluence ||
        a.maxResponseDanger - b.maxResponseDanger ||
        b.attack.score - a.attack.score
      )[0] ?? null
    : null;
  const provenRobotFour = robotFourEvaluations.find((move) => move.provenWinningAttack) ?? null;
  const rejectedOpenThreeRace = robotFourEvaluations.find((move) => move.raceRejected) ?? null;
  const robotOpportunity = state.moves <= 10 ? chooseRobotOpportunity(robotFourEvaluations) : null;
  if (!robotOpportunity && state.moves > 10) state.robotOpportunities = [];
  const safeTempoLead = state.moves <= 10
    ? robotFourEvaluations
      .map(evaluateRobotTempoLead)
      .find((move) => move?.safeLead) ?? null
    : null;
  const leadConstructiveAttack = state.moves <= 10 ? chooseLeadConstructiveAttack(robotAttackMoves) : null;
  const leadTwoByTwo = state.moves <= 10 ? chooseLeadTwoByTwo(robotAttackMoves) : null;
  const unplannedFourIndices = new Set(
    robotFourEvaluations.filter((move) => !move.provenWinningAttack).map((move) => move.index)
  );
  const strategicRobotMoves = robotMoves.filter((move) => !unplannedFourIndices.has(move.index));
  const robotBest = strategicRobotMoves[0] ?? null;
  const humanBest = humanMoves[0];
  const selectedTrapClosedThree = forcedAttackDefense?.defense
    ? findExistingClosedThreeCuts(HUMAN)
      .find((figure) => figure.blockIndex === forcedAttackDefense.defense.index) ?? null
    : null;

  if (provenRobotFour) {
    const fourReason = provenRobotFour.guaranteed
      ? "Le bot cree un quatre a plusieurs sorties: X ne peut pas fermer toutes les cases gagnantes."
      : "Le bot cree un quatre a sortie unique et a prouve une continuation forcee jusqu'a une menace gagnante apres le blocage obligatoire de X.";
    if (provenRobotFour.provenContinuation && provenRobotFour.forcedBlock) {
      state.activeRobotPlan = {
        sourceIndex: provenRobotFour.index,
        expectedHumanMoves: [provenRobotFour.forcedBlock],
        steps: provenRobotFour.continuationPlan.steps.map((step) => ({ ...step })),
        cursor: 0,
        replanAfterResponse: false,
      };
    } else {
      state.activeRobotPlan = null;
    }
    return setRobotDecision(
      provenRobotFour.index,
      "ATTACK-FOUR",
      fourReason,
      ["attaque", "niveau-1-victoire-assuree", "quatre-forcant", "initiative", `${provenRobotFour.winningCells.length}-sortie`, "victoire-forcee-prouvee"],
      provenRobotFour.attack
    );
  }

  if (existingThreeCut) {
    const figureAnalysis = { primaryCode: existingThreeCut.figure.code };
    const tags = ["defense", "trois-ouvert-present", "extremite-simulee", "horizon-apres-quatre"];
    if (rejectedOpenThreeRace) tags.push("3x3-perd-la-course", "4x3-requis");
    if (existingThreeCut.offAxisDanger === 0) tags.push("reponse-X-sans-construction");
    else tags.push("construction-X-secondaire");
    return setRobotDecision(
      existingThreeCut.index,
      "DEF-OPEN-THREE",
      rejectedOpenThreeRace
        ? "Le bot rejette son plan 3x3: il ne bat pas le trois ouvert X deja actif; il faudrait un 4x3, un 4x4 ou une chaine pure de quatre."
        : "Le bot simule la prolongation, le blocage obligatoire du quatre, puis choisit le cote qui laisse a X le moins de constructions locales.",
      tags,
      figureAnalysis
    );
  }

  if (safeRobotLead) {
    return setRobotDecision(
      safeRobotLead.index,
      "ATTACK-LEAD",
      "Le bot conserve le lead avec un trois ouvert et un deux developpable apres avoir verifie la reponse X et la prochaine attaque O.",
      [
        "attaque",
        "niveau-2-lead-sur",
        "lead",
        "double-construction",
        "reponses-X-simulees",
        `${safeRobotLead.responseIndices.length}-reponses-sures`,
      ],
      safeRobotLead.attack
    );
  }

  if (leadConstructiveAttack && (!leadMaintainingCut || leadConstructiveAttack.leadScore >= leadMaintainingCut.leadScore)) {
    return setRobotDecision(
      leadConstructiveAttack.index,
      "ATTACK-LEAD-3X2",
      "Le bot garde le lead avec un trois ouvert et un deux developpable; la construction 3x2 reste plus riche qu'un blocage local.",
      [
        "attaque",
        "niveau-2-lead-sur",
        "lead",
        "3x2",
        "reponses-X-simulees",
        `${leadConstructiveAttack.responseIndices.length}-reponses-sures`,
      ],
      leadConstructiveAttack.attack
    );
  }

  const robotHasTempoLead = safeTempoLead && !forcedAttackDefense?.defense && !closedThreeCut;
  if (robotHasTempoLead) {
    return setRobotDecision(
      safeTempoLead.index,
      "ATTACK-LEAD",
      "Le bot prend le lead avec un quatre de tempo: X est force de repondre sans creer de menace S, tandis que O conserve un deux a developper.",
      [
        "attaque",
        "niveau-2-lead-sur",
        "lead",
        "quatre-de-tempo-constructif",
        "reponse-X-sure",
        "deux-O-conserve",
      ],
      safeTempoLead.attack
    );
  }

  if (
    leadTwoByTwo &&
    !robotOpportunity &&
    !safeTempoLead &&
    !leadConstructiveAttack &&
    (humanBest?.attack.rank ?? 0) < 60 &&
    !openTwoCut &&
    !existingThreeCut &&
    !closedThreeCut &&
    (!leadMaintainingCut || leadTwoByTwo.leadScore >= leadMaintainingCut.leadScore)
  ) {
    return setRobotDecision(
      leadTwoByTwo.index,
      "ATTACK-LEAD-2X2",
      "Le bot construit un 2x2: deux directions ouvertes en meme temps pour garder le lead avant le middle game.",
      [
        "attaque",
        "niveau-2-lead-sur",
        "lead",
        "2x2",
        "reponses-X-simulees",
        `${leadTwoByTwo.attack.openTwoDirections}-axes-ouverts`,
      ],
      leadTwoByTwo.attack
    );
  }

  if (robotBest?.attack.fourDirections === 0 && robotBest.attack.rank >= 90 && robotBest.attack.rank >= (humanBest?.attack.rank ?? 0)) {
    return setRobotDecision(robotBest.index, "FORCE", "Le bot possede la figure forcing la plus forte et garde l'initiative.", ["attaque", robotBest.attack.classLabel], robotBest.attack);
  }

  if (forcedAttackDefense?.defense?.multiThreatGain > 0) {
    const { plan, defense } = forcedAttackDefense;
    return setRobotDecision(
      defense.index,
      "DEF-MULTI-CUT",
      "Le bot prefere le point qui casse simultanement plusieurs axes dangereux et laisse moins de menaces residuelles que le blocage isole du trois barre.",
      [
        "defense",
        "blocage-multiple",
        "menaces-comparees",
        `${defense.multiThreatGain}-unites-danger-coupees`,
        `${defense.residualThreats.count}-menaces-restantes`,
        `${defense.residualThreats.openThreeDirections}-axes-trois-ouverts`,
      ],
      { primaryCode: plan.steps[0]?.code ?? "21110" }
    );
  }

  if (forcedAttackDefense?.defense.safe && selectedTrapClosedThree) {
    return setRobotDecision(
      selectedTrapClosedThree.blockIndex,
      "DEF-TRAP-CLOSED-THREE",
      "Le bot ferme le zero exact d'un trois barre apres avoir verifie qu'aucune autre chaine gagnante de X ne subsiste.",
      ["defense", "pion-piege", "classe-S+", "trois-barre", "blocage-exact", "toutes-branches-verifiees"],
      { primaryCode: selectedTrapClosedThree.code }
    );
  }

  if (forcedAttackDefense?.defense) {
    const { plan, defense } = forcedAttackDefense;
    const terminalLabel = plan.terminal === "double-four" ? "4x4" : "suite gagnante";
    const verification = defense.safe
      ? "aucune autre branche gagnante de X ne subsiste"
      : "ce point reduit la pire branche trouvee dans le budget de calcul";
    return setRobotDecision(
      defense.index,
      "DEF-TRAP-S+",
      `X a prepare une semence piegee menant a ${terminalLabel}; le bot simule chaque blocage candidat et choisit celui ou ${verification}.`,
      ["defense", "pion-piege", "classe-S+", `${plan.steps.length}-etages`, defense.safe ? "toutes-branches-verifiees" : "meilleur-rempart"],
      { primaryCode: plan.steps[0]?.code ?? "0110" }
    );
  }

  if (robotBest?.attack.fourDirections === 0 && robotBest.attack.forcing && robotBest.attack.rank >= 85) {
    return setRobotDecision(
      robotBest.index,
      "ATTACK-FORCE",
      "X n'a pas de menace presente plus urgente; le bot prend l'initiative avec son trois ouvert.",
      ["attaque", "initiative", robotBest.attack.classLabel],
      robotBest.attack
    );
  }

  if (leadMaintainingCut && (robotBest?.attack.rank ?? 0) < 90) {
    return setRobotDecision(
      leadMaintainingCut.index,
      "DEF-LEAD-HOLD",
      "Le bot coupe la menace qui donnerait le lead a X tout en gardant une prochaine attaque O disponible.",
      [
        "defense",
        "lead",
        "tempo",
        "blocage-actif",
        `${leadMaintainingCut.residualThreats.count}-menaces-X-restantes`,
        `${leadMaintainingCut.robotFollowUp?.attack.primaryCode ?? "suite-O"}-suite-O`,
      ],
      leadMaintainingCut.preventedAttack
    );
  }

  if (robotOpportunity && (robotBest?.attack.rank ?? 0) < 90) {
    return setRobotDecision(
      robotOpportunity.index,
      "ATTACK-OPPORTUNITY",
      "Le bot memorise une opportunite de tempo: il force X a bloquer puis conserve une construction O exploitable au coup suivant.",
      [
        "attaque",
        "opportunite",
        "memoire",
        "lead",
        `${robotOpportunity.attack.primaryCode ?? "four"}-force-X`,
        `${robotOpportunity.followUp?.attack.primaryCode ?? "suite"}-suite-O`,
      ],
      robotOpportunity.attack
    );
  }

  const openTwoDefenseEligible = openTwoCut && (
    openTwoCut.defensiveRichGrowth ||
    (openTwoCut.multiPurposeGrowth && !closedThreeCut)
  );
  if (openTwoDefenseEligible && (humanBest?.attack.rank ?? 0) <= openTwoCut.attack.rank) {
    return setRobotDecision(
      openTwoCut.index,
      "DEF-OPEN-TWO",
      "Le bot bloque la construction X la plus urgente; a danger egal, il choisit la case qui cree le plus de branches de construction pour O.",
      [
        "defense",
        "deux-ouvert",
        "construction-future",
        `${openTwoCut.constructionBranches}-branches-X`,
        `${openTwoCut.counterConstructionBranches}-branches-O`,
        `${1 + openTwoCut.counterConstructionBranches}-effets`,
      ],
      { primaryCode: openTwoCut.figure.code }
    );
  }

  if (closedThreeCut && closedThreeCut.attack.rank >= (humanBest?.attack.rank ?? 0)) {
    return setRobotDecision(
      closedThreeCut.figure.blockIndex,
      "DEF-CLOSED-THREE",
      "Le bot compare tous les trois barres, simule leur prolongation et ferme celui qui alimente les constructions locales les plus dangereuses.",
      ["defense", "trois-barre", "blocage-exact", `${closedThreeCut.nearbyOpenTwos}-deux-proches`],
      { primaryCode: closedThreeCut.figure.code }
    );
  }

  if ((humanBest?.attack.rank ?? 0) >= 85 && (robotBest?.attack.rank ?? 0) < 90) {
    return setRobotDecision(
      humanBest.index,
      "DEF-PREVENT",
      "X pourrait creer cette figure au prochain coup; le bot coupe directement sa case de creation.",
      ["defense", "menace-future", humanBest.attack.classLabel],
      humanBest.attack
    );
  }

  if (robotBest?.attack.rank >= 60 && robotBest.attack.rank >= (humanBest?.attack.rank ?? 0)) {
    return setRobotDecision(robotBest.index, "ATTACK", "Le bot cree la meilleure figure active avant que X ne prenne le tempo.", ["attaque", robotBest.attack.classLabel], robotBest.attack);
  }

  let selected = robotBest ?? null;
  let selectedPlan = selected ? { score: selected.score, worstReply: null, followUp: null } : null;

  for (const candidate of strategicRobotMoves) {
    if (nowMs() >= deadline) break;
    const plan = evaluateRobotPlan(candidate.index, deadline);
    const planScore = plan.score + candidate.score * 0.24;
    if (!selectedPlan || planScore > selectedPlan.score) {
      selected = candidate;
      selectedPlan = { ...plan, score: planScore };
    }
  }

  if (!selected) {
    const fallback = getCandidateMoves(2)[0] ?? state.board.findIndex((cell) => !cell);
    return setRobotDecision(fallback, "SAFE", "Coup legal de secours.", ["securite"]);
  }

  const planTags = ["plan", selected.attack.classLabel];
  if (selectedPlan?.worstReply) planTags.push("reponse-X-simulee");
  if (selectedPlan?.followUp) planTags.push("suite-O");
  return setRobotDecision(
    selected.index,
    "PLAN",
    "Le bot compare les meilleures reponses X et conserve le coup dont la pire suite reste la plus favorable.",
    planTags,
    selected.attack
  );
}

function getDetectedThreats() {
  const threats = [];

  for (const player of [HUMAN, ROBOT]) {
    for (const move of rankMoves(player, 10)) {
      if (move.attack.rank < 35) continue;
      threats.push({
        player,
        index: move.index,
        type: move.attack.label,
        code: move.attack.primaryCode,
        rank: move.attack.rank,
        score: move.attack.score,
        isCritical: move.attack.rank >= 85,
      });
    }
  }

  return threats.sort((a, b) => b.rank - a.rank || b.score - a.score);
}

function updateThreatVisualization() {
  if (!threatSummaryCountEl || !threatSummaryListEl) return;

  for (const cell of boardEl.children) {
    cell.classList.remove("threat-human", "threat-robot", "threat-critical");
    delete cell.dataset.threatLabel;
  }

  const threats = getDetectedThreats();
  const humanCritical = threats.filter((threat) => threat.player === HUMAN && threat.isCritical).length;
  const robotCritical = threats.filter((threat) => threat.player === ROBOT && threat.isCritical).length;
  threatSummaryCountEl.textContent = `X:${humanCritical} O:${robotCritical}`;

  if (state.showThreats) {
    for (const threat of threats.slice(0, 8)) {
      const cell = boardEl.children[threat.index];
      cell.classList.add(threat.player === HUMAN ? "threat-human" : "threat-robot");
      if (threat.isCritical) cell.classList.add("threat-critical");
      cell.dataset.threatLabel = `${threat.player} ${threat.code ?? threat.type}`;
    }
  }

  const rows = threats.slice(0, 6).map((threat) => {
    const row = document.createElement("div");
    row.className = `threat-row ${threat.player === HUMAN ? "is-human" : "is-robot"}`;
    row.textContent = `${threat.player} ${threat.code ?? threat.type} -> ${formatMoveLabel(threat.index)}`;
    return row;
  });

  if (!rows.length) {
    const row = document.createElement("div");
    row.className = "threat-row";
    row.textContent = "Aucune figure dangereuse.";
    rows.push(row);
  }

  threatSummaryListEl.replaceChildren(...rows);
}

function updateThreatToggle() {
  if (!toggleThreatsBtn) return;
  toggleThreatsBtn.setAttribute("aria-pressed", String(state.showThreats));
  const label = toggleThreatsBtn.querySelector?.("span");
  if (label) label.textContent = state.showThreats ? "Masquer les reperes" : "Afficher les reperes";
}

function toggleThreatVisualization() {
  state.showThreats = !state.showThreats;
  updateThreatToggle();
  updateThreatVisualization();
}

function renderDebugPanel(priorityEl, reasonEl, moveEl, tagsEl, decision, fallbackReason) {
  if (!priorityEl || !reasonEl || !moveEl || !tagsEl) return;
  priorityEl.textContent = decision?.priority ?? "Pret";
  reasonEl.textContent = decision?.reason ?? fallbackReason;
  moveEl.textContent = decision ? formatMoveLabel(decision.index) : "-";

  const tags = (decision?.tags ?? []).map((tag) => {
    const element = document.createElement("span");
    element.className = "debug-tag";
    element.textContent = tag;
    return element;
  });
  tagsEl.replaceChildren(...tags);
}

function updateAiDebugPanel() {
  renderDebugPanel(
    aiDebugPriorityEl,
    aiDebugReasonEl,
    aiDebugMoveEl,
    aiDebugTagsEl,
    state.lastRobotDecision,
    "Le prochain coup du robot sera explique ici."
  );
  renderDebugPanel(
    opponentDebugPriorityEl,
    opponentDebugReasonEl,
    opponentDebugMoveEl,
    opponentDebugTagsEl,
    state.lastHumanDecision,
    "Le prochain coup de X sera explique ici."
  );
}

function markWinningCells(indices) {
  for (const index of indices) boardEl.children[index].classList.add("win");
}

function finishGame(winner, winningLine = []) {
  state.isGameOver = true;
  state.isRobotThinking = false;
  boardEl.classList.add("game-over");

  if (winner) {
    state.roundResult = winner;
    state.scores[winner] += 1;
    setStatus(winner === HUMAN ? `Vous gagnez avec cinq ${displaySymbol(HUMAN)}.` : `Le bot gagne avec cinq ${displaySymbol(ROBOT)}.`);
    markWinningCells(winningLine);
  } else {
    state.roundResult = "draw";
    state.scores.draw += 1;
    setStatus("Match nul.");
  }

  updateHud();
  animate(turnCardEl, { y: -4 }, { y: 0, duration: 0.3 });
}

function placeSymbol(index, player) {
  clearAnalysisCache();
  state.board[index] = player;
  state.moves += 1;
  const sourceDecision = player === ROBOT ? state.lastRobotDecision : state.lastHumanDecision;
  const decision = normalizeReplayDecision(sourceDecision, index);
  state.moveHistory.push(decision ? { index, player, decision } : { index, player });
  updateLastMoveMarker();

  const cell = boardEl.children[index];
  cell.textContent = displaySymbol(player);
  cell.classList.add(displaySymbol(player).toLowerCase());
  animate(cell, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22 });

  const winningLine = collectLine(index, player);
  if (winningLine.length) {
    finishGame(player, winningLine);
    return true;
  }

  if (state.moves >= TOTAL_CELLS) {
    finishGame(null);
    return true;
  }

  return false;
}

function playRobotTurn(turnId) {
  if (turnId !== state.robotTurnId || state.isGameOver) return;

  let move;
  try {
    move = chooseTrainingRobotMove();
  } catch (error) {
    console.error("[pattern-bot] decision failed", error);
    move = getCandidateMoves(2)[0] ?? state.board.findIndex((cell) => !cell);
    setRobotDecision(move, "SAFE", "Le moteur a utilise un coup legal de secours.", ["securite"]);
  }

  if (move === null || move < 0 || state.board[move]) {
    move = state.board.findIndex((cell) => !cell);
  }
  if (move < 0) return finishGame(null);

  const ended = placeSymbol(move, ROBOT);
  updateAiDebugPanel();
  if (ended) return;

  state.isRobotThinking = false;
  state.currentPlayer = HUMAN;
  setStatus("A toi de jouer.");
  updateHud();
}

function chooseTrainingRobotMove() {
  const difficulty = difficultySelectEl?.value || "hard";
  if (difficulty === "hard") return chooseRobotMove();

  const robotWins = findImmediateWins(ROBOT);
  if (robotWins.length) return robotWins[0];
  const humanWins = findImmediateWins(HUMAN);
  if (humanWins.length) return humanWins[0];

  if (difficulty === "medium") {
    const ranked = rankMoves(ROBOT, 5);
    if (ranked.length) return ranked[Math.floor(Math.random() * Math.min(2, ranked.length))].index;
  }

  const candidates = getCandidateMoves(2);
  if (!candidates.length) return state.board.findIndex((cell) => !cell);
  const pool = candidates.slice(0, Math.min(12, candidates.length));
  return pool[Math.floor(Math.random() * pool.length)];
}

function scheduleRobotTurn(message = "Le robot lit les figures 0/1/2...") {
  state.currentPlayer = ROBOT;
  state.isRobotThinking = true;
  state.robotTurnId += 1;
  const turnId = state.robotTurnId;
  setStatus(message);
  updateHud();
  window.setTimeout(() => playRobotTurn(turnId), 180);
}

function playHumanMove(cell) {
  if (state.isGameOver || state.isRobotThinking || replayState.isPlaying) return;
  if (isReplayActive()) {
    if (state.currentPlayer !== HUMAN) return;
    branchFromReplay(false);
  }
  if (state.currentPlayer !== HUMAN) return;
  const index = Number(cell.dataset.index);
  if (!Number.isInteger(index) || state.board[index]) return;
  setHumanDecision(index);
  updateAiDebugPanel();
  if (placeSymbol(index, HUMAN)) return;
  scheduleRobotTurn();
}

function undoLastMove() {
  if (isReplayActive()) {
    if (replayState.cursor <= 0) return false;
    return stepReplay(-1);
  }
  if (!state.moveHistory.length) return false;

  clearAnalysisCache();
  state.robotTurnId += 1;
  state.isRobotThinking = false;

  if (state.roundResult) {
    const scoreKey = state.roundResult;
    state.scores[scoreKey] = Math.max(0, state.scores[scoreKey] - 1);
    state.roundResult = null;
  }

  const undone = state.moveHistory.pop();
  state.board[undone.index] = EMPTY;
  state.moves = Math.max(0, state.moves - 1);
  state.currentPlayer = undone.player;
  state.isGameOver = false;
  state.lastRobotDecision = getReplayDebugDecision(state.moveHistory);
  state.lastHumanDecision = getReplayDebugDecision(state.moveHistory, HUMAN);
  state.activeRobotPlan = null;
  state.robotOpportunities = [];
  boardEl.classList.remove("game-over", "robot-thinking");

  renderBoard();
  updateAiDebugPanel();
  updateStartButtons();
  setStatus(
    state.currentPlayer === HUMAN
      ? "Coup annule. Place un X sur une case vide."
      : "Coup annule. Le plateau est revenu au tour de O."
  );
  updateHud();
  return true;
}

function resetRound() {
  clearReplayState();
  clearAnalysisCache();
  state.board = Array(TOTAL_CELLS).fill(EMPTY);
  state.currentPlayer = state.startingPlayer;
  state.moves = 0;
  state.moveHistory = [];
  state.lastRobotDecision = null;
  state.lastHumanDecision = null;
  state.activeRobotPlan = null;
  state.robotOpportunities = [];
  state.roundResult = null;
  state.isGameOver = false;
  state.isRobotThinking = false;
  state.robotTurnId += 1;
  boardEl.classList.remove("game-over", "robot-thinking");
  renderBoard();
  updateAiDebugPanel();
  updateStartButtons();

  if (state.startingPlayer === ROBOT) scheduleRobotTurn("Le robot ouvre la partie...");
  else {
    setStatus(`Place un ${displaySymbol(HUMAN)} sur une case vide.`);
    updateHud();
  }
}

function setStartingPlayer(player) {
  if (player !== HUMAN && player !== ROBOT) return;
  state.startingPlayer = player;
  resetRound();
}

function setHumanMark(mark) {
  if (mark !== HUMAN && mark !== ROBOT) return;
  state.humanMark = mark;
  humanMarkXBtn?.classList.toggle("is-active", mark === HUMAN);
  humanMarkOBtn?.classList.toggle("is-active", mark === ROBOT);
  humanMarkXBtn?.setAttribute("aria-pressed", String(mark === HUMAN));
  humanMarkOBtn?.setAttribute("aria-pressed", String(mark === ROBOT));
  resetRound();
}

function resetScores() {
  state.scores = { X: 0, O: 0, draw: 0 };
  resetRound();
}

boardEl.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (cell) playHumanMove(cell);
});
resetRoundBtn.addEventListener("click", resetRound);
undoMoveBtn.addEventListener("click", undoLastMove);
resetScoresBtn.addEventListener("click", resetScores);
toggleThreatsBtn.addEventListener("click", toggleThreatVisualization);
copyHistoryBtn.addEventListener("click", copyMoveHistory);
savePositionBtn.addEventListener("click", () => saveCurrentPosition());
positionNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveCurrentPosition();
});
savedPositionListEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-saved-action]");
  if (!button) return;
  if (button.dataset.savedAction === "replay") startSavedReplay(button.dataset.savedPositionId);
  if (button.dataset.savedAction === "load") loadSavedPosition(button.dataset.savedPositionId);
  if (button.dataset.savedAction === "delete") deleteSavedPosition(button.dataset.savedPositionId);
});
replayStartBtn.addEventListener("click", () => seekReplay(0));
replayBackBtn.addEventListener("click", () => stepReplay(-1));
replayPlayPauseBtn.addEventListener("click", toggleReplayPlayback);
replayForwardBtn.addEventListener("click", () => stepReplay(1));
replayEndBtn.addEventListener("click", () => seekReplay(replayState.moves.length));
replaySpeedBtn.addEventListener("click", cycleReplaySpeed);
replayBranchBtn.addEventListener("click", () => branchFromReplay());
document.addEventListener("keydown", handleReplayShortcut);
humanStartsBtn.addEventListener("click", () => setStartingPlayer(HUMAN));
robotStartsBtn.addEventListener("click", () => setStartingPlayer(ROBOT));
humanMarkXBtn?.addEventListener("click", () => setHumanMark(HUMAN));
humanMarkOBtn?.addEventListener("click", () => setHumanMark(ROBOT));
difficultySelectEl?.addEventListener("change", resetRound);

buildBoard();
readSavedPositions();
renderSavedPositions();
updateReplayControls();
updateStartButtons();
updateAiDebugPanel();
updateThreatToggle();
updateHud();

if (window.lucide) window.lucide.createIcons();
