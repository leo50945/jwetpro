'use strict';

const BOARD_SIZE = 20;
const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
const WIN_LENGTH = 5;

const isCellValue = value => value === '' || value === 'X' || value === 'O';

function isValidBoard(board) {
  return Array.isArray(board) && board.length === BOARD_CELLS && board.every(isCellValue);
}

function winningLine(board, index, symbol) {
  if (!isValidBoard(board) || !Number.isInteger(index) || index < 0 || index >= BOARD_CELLS) return [];
  if (!['X', 'O'].includes(symbol) || board[index] !== symbol) return [];

  const row = Math.floor(index / BOARD_SIZE);
  const column = index % BOARD_SIZE;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (const [rowStep, columnStep] of directions) {
    const cells = [index];
    for (const sign of [-1, 1]) {
      let nextRow = row + rowStep * sign;
      let nextColumn = column + columnStep * sign;
      while (nextRow >= 0 && nextRow < BOARD_SIZE && nextColumn >= 0 && nextColumn < BOARD_SIZE) {
        const nextIndex = nextRow * BOARD_SIZE + nextColumn;
        if (board[nextIndex] !== symbol) break;
        if (sign < 0) cells.unshift(nextIndex);
        else cells.push(nextIndex);
        nextRow += rowStep * sign;
        nextColumn += columnStep * sign;
      }
    }
    if (cells.length >= WIN_LENGTH) return cells;
  }
  return [];
}

function applyMove(board, index, symbol) {
  if (!isValidBoard(board)) throw new Error('invalid-board');
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_CELLS) throw new Error('invalid-index');
  if (!['X', 'O'].includes(symbol)) throw new Error('invalid-symbol');
  if (board[index] !== '') throw new Error('occupied-cell');

  const nextBoard = board.slice();
  nextBoard[index] = symbol;
  const line = winningLine(nextBoard, index, symbol);
  return {board: nextBoard, winningLine: line, won: line.length >= WIN_LENGTH, draw: !line.length && nextBoard.every(Boolean)};
}

function chooseBotMove(board, symbol) {
  if (!isValidBoard(board)) throw new Error('invalid-board');
  if (!['X', 'O'].includes(symbol)) throw new Error('invalid-symbol');
  const opponent = symbol === 'X' ? 'O' : 'X';
  const empty = board.map((value, index) => value === '' ? index : -1).filter(index => index >= 0);
  if (!empty.length) return -1;

  const winningMove = empty.find(index => applyMove(board, index, symbol).won);
  if (Number.isInteger(winningMove)) return winningMove;
  const blockingMove = empty.find(index => applyMove(board, index, opponent).won);
  if (Number.isInteger(blockingMove)) return blockingMove;

  const center = (BOARD_SIZE - 1) / 2;
  return empty.sort((left, right) => {
    const leftDistance = Math.abs(Math.floor(left / BOARD_SIZE) - center) + Math.abs(left % BOARD_SIZE - center);
    const rightDistance = Math.abs(Math.floor(right / BOARD_SIZE) - center) + Math.abs(right % BOARD_SIZE - center);
    return leftDistance - rightDistance || left - right;
  })[0];
}

module.exports = {BOARD_SIZE, BOARD_CELLS, WIN_LENGTH, isValidBoard, winningLine, applyMove, chooseBotMove};
