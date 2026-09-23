'use strict';

// Rapfi is loaded once per Functions instance and receives the complete board
// for every request, so the engine never carries state between matches.
const path = require('node:path');
const Rapfi = require(path.join(__dirname, 'rapfi', 'rapfi-single-simd128.js'));

const BOARD_SIZE = 20;
const ENGINE_TIMEOUT_MS = 1800;
let enginePromise = null;
let engineWaiter = null;
let queue = Promise.resolve();

const parseMove = line => {
  const match = String(line || '').trim().match(/^(\d+)\s*,\s*(\d+)$/);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
    ? y * BOARD_SIZE + x
    : null;
};

const getEngine = () => {
  if (!enginePromise) {
    enginePromise = Rapfi({
      locateFile: file => path.join(__dirname, 'rapfi', file),
      noInitialRun: true,
      noExitRuntime: true,
      onReceiveStdout: line => {
        const move = parseMove(line);
        if (move === null || !engineWaiter) return;
        const waiter = engineWaiter;
        engineWaiter = null;
        clearTimeout(waiter.timer);
        waiter.resolve(move);
      },
      onReceiveStderr: () => {}
    });
  }
  return enginePromise;
};

const fallbackMove = (board, symbol) => {
  const opponent = symbol === 'X' ? 'O' : 'X';
  const empty = board.map((value, index) => value === '' ? index : -1).filter(index => index >= 0);
  if (!empty.length) return -1;
  // Keep the fallback deliberately small: the official JS rules engine remains
  // the safety net if the WASM engine cannot initialize on a cold start.
  const center = (BOARD_SIZE - 1) / 2;
  return empty.sort((left, right) => {
    const ld = Math.abs(Math.floor(left / BOARD_SIZE) - center) + Math.abs(left % BOARD_SIZE - center);
    const rd = Math.abs(Math.floor(right / BOARD_SIZE) - center) + Math.abs(right % BOARD_SIZE - center);
    return ld - rd || left - right;
  })[0];
};

const calculateRapfiMove = async (board, symbol) => {
  const run = async () => {
    const engine = await getEngine();
    const occupied = board.map((value, index) => value ? {index, value} : null).filter(Boolean);
    const lastOpponent = [...occupied].reverse().find(move => move.value !== symbol);
    const command = () => {
      engine.sendCommand('START 20');
      engine.sendCommand(`INFO TIMEOUT_TURN ${ENGINE_TIMEOUT_MS}`);
      if (!occupied.length) {
        engine.sendCommand('BEGIN');
        return;
      }
      const boardCommand = ['BOARD', ...occupied.map(({index, value}) => `${index % BOARD_SIZE},${Math.floor(index / BOARD_SIZE)},${value === 'X' ? 1 : 2}`), 'DONE'].join(' ');
      engine.sendCommand(boardCommand);
    };    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (engineWaiter?.resolve === resolve) engineWaiter = null;
        reject(new Error('rapfi-timeout'));
      }, ENGINE_TIMEOUT_MS + 1000);
      engineWaiter = {resolve, reject, timer};
      command();
    });
  };
  const task = queue.then(run, run);
  queue = task.catch(() => {});
  return task;
};

const chooseRapfiMove = async (board, symbol) => {
  try {
    const move = await calculateRapfiMove(board, symbol);
    if (Number.isInteger(move) && board[move] === '') return move;
  } catch (error) {
    console.warn('Rapfi Mopyon engine unavailable; using fallback move:', error?.message || error);
  }
  return fallbackMove(board, symbol);
};

module.exports = {chooseRapfiMove};