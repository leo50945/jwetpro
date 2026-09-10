'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createSet, createGameState, playableSides, applyAction, applyTimeout, playBotAction, playBotTurn, publicState} = require('./domino-match-core');

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
  assert.equal(visible.actionNumber, 0);
});

test('a paced bot call performs exactly one authoritative action', () => {
  const source = createGameState(['human','bot'], () => .1);
  source.currentTurnUid = 'bot';
  source.starterTileId = source.hands.bot[0].id;
  const result = playBotAction(source, 'bot');
  assert.equal(result.state.actionNumber, source.actionNumber + 1);
  assert.equal(result.event.actionNumber, result.state.actionNumber);
  assert.equal(result.event.automated, true);
});

test('the hidden pile choice draws the selected authoritative domino', () => {
  const source={
    participantIds:['human','bot'],
    hands:{human:[{id:'0-0',a:0,b:0}],bot:[{id:'3-3',a:3,b:3}]},
    drawPile:[{id:'1-1',a:1,b:1},{id:'2-6',a:2,b:6}],
    boardTiles:[{id:'4-4',a:4,b:4,playedBy:'bot'}],
    currentTurnUid:'human',starterTileId:'',passStreak:0,winnerId:null,draw:false,blocked:false,winReason:null,actionNumber:3
  };
  const result=applyAction(source,'human',{type:'draw',drawIndex:1});
  assert.equal(result.state.hands.human.at(-1).id,'2-6');
  assert.deepEqual(result.state.drawPile.map(tile=>tile.id),['1-1']);
});

test('an authoritative turn timeout awards the manche to the opponent once', () => {
  const source=createGameState(['human','bot'],()=>.2);
  source.currentTurnUid='human';
  const result=applyTimeout(source,'human');
  assert.equal(result.state.winnerId,'bot');
  assert.equal(result.state.winReason,'turn-timeout');
  assert.equal(result.state.actionNumber,source.actionNumber+1);
  assert.equal(result.event.type,'timeout');
  assert.throws(()=>applyTimeout(result.state,'human'),/game-over/);
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
