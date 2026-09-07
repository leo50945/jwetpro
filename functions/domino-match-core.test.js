'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createSet, createGameState, playableSides, applyAction, playBotTurn, publicState} = require('./domino-match-core');

test('double-six set contains 28 unique tiles', () => {
  const tiles = createSet();
  assert.equal(tiles.length, 28);
  assert.equal(new Set(tiles.map(tile => tile.id)).size, 28);
});

test('first move is restricted to the automatically selected starter', () => {
  const state = createGameState(['p1','p2'], () => .25);
  const uid = state.currentTurnUid;
  const starter = state.hands[uid].find(tile => tile.id === state.starterTileId);
  const other = state.hands[uid].find(tile => tile.id !== state.starterTileId);
  assert.deepEqual(playableSides(starter, [], state.starterTileId), ['start']);
  assert.deepEqual(playableSides(other, [], state.starterTileId), []);
});

test('a legal tile is removed from the hand and published on the board', () => {
  const state = createGameState(['p1','p2'], () => .4);
  const uid = state.currentTurnUid;
  const before = state.hands[uid].length;
  const result = applyAction(state, uid, {type:'play', tileId:state.starterTileId, side:'start'});
  assert.equal(result.state.hands[uid].length, before - 1);
  assert.equal(result.state.boardTiles.length, 1);
  assert.equal(result.event.type, 'play');
});

test('public state never exposes hands or the draw pile', () => {
  const state = createGameState(['p1','p2']);
  const visible = publicState(state);
  assert.equal('hands' in visible, false);
  assert.equal('drawPile' in visible, false);
  assert.deepEqual(visible.handCounts, {p1:7,p2:7});
});

test('bot completes its turn without changing the human hand', () => {
  const source = createGameState(['human','bot'], () => .1);
  source.currentTurnUid = 'bot';
  source.starterTileId = source.hands.bot[0].id;
  const humanHand = source.hands.human.map(tile => tile.id);
  const result = playBotTurn(source, 'bot');
  assert.notEqual(result.state.currentTurnUid, 'bot');
  assert.deepEqual(result.state.hands.human.map(tile => tile.id), humanHand);
  assert.ok(result.events.length >= 1);
});
