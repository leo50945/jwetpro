'use strict';

const MAX_PIP = 6;
const MAX_ACTIONS_PER_BOT_TURN = 40;

const tileId = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
const validTile = tile => tile && Number.isInteger(tile.a) && Number.isInteger(tile.b)
  && tile.a >= 0 && tile.a <= MAX_PIP && tile.b >= 0 && tile.b <= MAX_PIP
  && tile.id === tileId(tile.a, tile.b);

const createSet = () => {
  const tiles = [];
  for (let a = 0; a <= MAX_PIP; a += 1) {
    for (let b = a; b <= MAX_PIP; b += 1) tiles.push({id:tileId(a, b), a, b});
  }
  return tiles;
};

const shuffled = (values, random = Math.random) => {
  const result = values.map(value => ({...value}));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const handPoints = hand => hand.reduce((total, tile) => total + tile.a + tile.b, 0);
const boardEnds = boardTiles => boardTiles.length
  ? {left:boardTiles[0].a, right:boardTiles[boardTiles.length - 1].b}
  : {left:null, right:null};

const playableSides = (tile, boardTiles, starterTileId = '') => {
  if (!validTile(tile)) return [];
  if (!boardTiles.length) return starterTileId && tile.id !== starterTileId ? [] : ['start'];
  const {left, right} = boardEnds(boardTiles);
  const sides = [];
  if (tile.a === left || tile.b === left) sides.push('left');
  if (tile.a === right || tile.b === right) sides.push('right');
  return sides;
};

const orientTile = (tile, side, boardTiles) => {
  if (side === 'start' || !boardTiles.length) return {...tile};
  const {left, right} = boardEnds(boardTiles);
  if (side === 'left') return tile.b === left ? {...tile} : {id:tile.id, a:tile.b, b:tile.a};
  return tile.a === right ? {...tile} : {id:tile.id, a:tile.b, b:tile.a};
};

const starter = (hands, participantIds) => {
  for (let value = MAX_PIP; value >= 0; value -= 1) {
    const id = tileId(value, value);
    const uid = participantIds.find(playerId => hands[playerId].some(tile => tile.id === id));
    if (uid) return {uid, tileId:id};
  }
  let selected = null;
  participantIds.forEach(uid => hands[uid].forEach(tile => {
    const points = tile.a + tile.b;
    if (!selected || points > selected.points) selected = {uid, tileId:tile.id, points};
  }));
  return selected;
};

const createGameState = (participantIds, random = Math.random) => {
  if (!Array.isArray(participantIds) || participantIds.length !== 2 || participantIds.some(uid => typeof uid !== 'string' || !uid)) {
    throw new Error('invalid-participants');
  }
  const deck = shuffled(createSet(), random);
  const hands = {[participantIds[0]]:deck.slice(0, 7), [participantIds[1]]:deck.slice(7, 14)};
  const opening = starter(hands, participantIds);
  return {
    participantIds:[...participantIds],
    hands,
    drawPile:deck.slice(14),
    boardTiles:[],
    currentTurnUid:opening.uid,
    starterTileId:opening.tileId,
    passStreak:0,
    winnerId:null,
    draw:false,
    blocked:false,
    winReason:null,
    actionNumber:0
  };
};

const cloneState = state => ({
  ...state,
  participantIds:[...state.participantIds],
  hands:Object.fromEntries(state.participantIds.map(uid => [uid, state.hands[uid].map(tile => ({...tile}))])),
  drawPile:state.drawPile.map(tile => ({...tile})),
  boardTiles:state.boardTiles.map(tile => ({...tile}))
});

const playableTiles = (state, uid) => state.hands[uid]
  .map(tile => ({tile, sides:playableSides(tile, state.boardTiles, state.starterTileId)}))
  .filter(entry => entry.sides.length);

const concludeBlockedGame = state => {
  const [first, second] = state.participantIds;
  const firstPoints = handPoints(state.hands[first]);
  const secondPoints = handPoints(state.hands[second]);
  state.winnerId = firstPoints === secondPoints ? null : firstPoints < secondPoints ? first : second;
  state.draw = firstPoints === secondPoints;
  state.blocked = true;
  state.winReason = state.draw ? 'blocked-draw' : 'blocked-lowest-hand';
  state.currentTurnUid = null;
};

const applyAction = (source, uid, action) => {
  const state = cloneState(source);
  if (!state.participantIds.includes(uid)) throw new Error('not-participant');
  if (state.winnerId || state.draw || !state.currentTurnUid) throw new Error('game-over');
  if (state.currentTurnUid !== uid) throw new Error('not-your-turn');
  const type = String(action?.type || '');
  const opponentId = state.participantIds.find(id => id !== uid);
  let event;

  if (type === 'play') {
    const index = state.hands[uid].findIndex(tile => tile.id === action.tileId);
    if (index < 0) throw new Error('tile-not-owned');
    const tile = state.hands[uid][index];
    const sides = playableSides(tile, state.boardTiles, state.starterTileId);
    const side = action.side === 'left' || action.side === 'right' || action.side === 'start' ? action.side : sides[0];
    if (!sides.includes(side)) throw new Error('illegal-side');
    const oriented = orientTile(tile, side, state.boardTiles);
    if (side === 'left') state.boardTiles.unshift({...oriented, playedBy:uid});
    else state.boardTiles.push({...oriented, playedBy:uid});
    state.hands[uid].splice(index, 1);
    state.passStreak = 0;
    state.actionNumber += 1;
    event = {type:'play', playerId:uid, tile:{...oriented}, tileId:tile.id, side, boardAfter:state.boardTiles.map(item => ({...item})), actionNumber:state.actionNumber};
    if (!state.hands[uid].length) {
      state.winnerId = uid;
      state.winReason = 'emptied-hand';
      state.currentTurnUid = null;
    } else state.currentTurnUid = opponentId;
  } else if (type === 'draw') {
    if (playableTiles(state, uid).length) throw new Error('play-available');
    if (!state.drawPile.length) throw new Error('draw-pile-empty');
    const tile = state.drawPile.shift();
    state.hands[uid].push(tile);
    state.actionNumber += 1;
    event = {type:'draw', playerId:uid, tileId:tile.id, actionNumber:state.actionNumber};
  } else if (type === 'pass') {
    if (playableTiles(state, uid).length) throw new Error('play-available');
    if (state.drawPile.length) throw new Error('draw-required');
    state.passStreak += 1;
    state.actionNumber += 1;
    event = {type:'pass', playerId:uid, actionNumber:state.actionNumber};
    if (state.passStreak >= 2) concludeBlockedGame(state);
    else state.currentTurnUid = opponentId;
  } else throw new Error('invalid-action');

  return {state, event};
};

const playBotTurn = (source, botUid) => {
  let state = cloneState(source);
  const events = [];
  let guard = 0;
  while (state.currentTurnUid === botUid && !state.winnerId && !state.draw && guard < MAX_ACTIONS_PER_BOT_TURN) {
    guard += 1;
    const playable = playableTiles(state, botUid);
    const action = playable.length
      ? {type:'play', tileId:playable[0].tile.id, side:playable[0].sides[0]}
      : state.drawPile.length ? {type:'draw'} : {type:'pass'};
    const result = applyAction(state, botUid, action);
    state = result.state;
    events.push({...result.event, automated:true});
  }
  return {state, events};
};

const publicState = state => ({
  boardTiles:state.boardTiles,
  currentTurnUid:state.currentTurnUid,
  starterTileId:state.starterTileId,
  handCounts:Object.fromEntries(state.participantIds.map(uid => [uid, state.hands[uid].length])),
  drawPileCount:state.drawPile.length,
  winnerId:state.winnerId,
  draw:state.draw,
  blocked:state.blocked,
  winReason:state.winReason
});

module.exports = {MAX_PIP, createSet, validTile, handPoints, boardEnds, playableSides, createGameState, playableTiles, applyAction, playBotTurn, publicState};
