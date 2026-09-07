'use strict';

const assert = require('node:assert/strict');
const {BOARD_CELLS, applyMove, winningLine, chooseBotMove} = require('./mopyon-match-core');

const emptyBoard = () => Array(BOARD_CELLS).fill('');

for (const line of [
  [41, 42, 43, 44, 45],
  [41, 61, 81, 101, 121],
  [41, 62, 83, 104, 125],
  [45, 64, 83, 102, 121]
]) {
  const board = emptyBoard();
  line.forEach(index => { board[index] = 'X'; });
  assert.equal(winningLine(board, line[2], 'X').length, 5);
}

const board = emptyBoard();
const result = applyMove(board, 200, 'O');
assert.equal(result.board[200], 'O');
assert.equal(board[200], '');
assert.throws(() => applyMove(result.board, 200, 'X'), /occupied-cell/);
assert.throws(() => applyMove(board, -1, 'X'), /invalid-index/);
assert.throws(() => applyMove(board, BOARD_CELLS, 'X'), /invalid-index/);

const winningBoard = emptyBoard();
[41, 42, 43, 44].forEach(index => { winningBoard[index] = 'O'; });
assert.equal(chooseBotMove(winningBoard, 'O'), 40);

const blockingBoard = emptyBoard();
[81, 82, 83, 84].forEach(index => { blockingBoard[index] = 'X'; });
assert.equal(chooseBotMove(blockingBoard, 'O'), 80);
assert.equal(chooseBotMove(emptyBoard(), 'X'), 189);

console.log('Mopyon match core tests passed.');
