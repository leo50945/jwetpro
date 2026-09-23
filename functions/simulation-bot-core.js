'use strict';

const crypto=require('crypto');
const {BOARD_SIZE,BOARD_CELLS,applyMove}=require('./mopyon-match-core');
const {
  createGameState:createDominoGameState,
  playableTiles:dominoPlayableTiles,
  applyAction:applyDominoAction,
  handPoints:dominoHandPoints,
  boardEnds:dominoBoardEnds
}=require('./domino-match-core');
const {starterUidForGame} = require('./match-start-rules');

const ENGINE_VERSION='simulation-bots-v1';
const PROFILES=Object.freeze(['offensive','positional','counter','balanced']);
const WEIGHTS=Object.freeze({
  offensive:{attack:1.25,defense:.9,position:.75,noise:.12},
  positional:{attack:1,defense:1,position:1.4,noise:.08},
  counter:{attack:.95,defense:1.35,position:.9,noise:.1},
  balanced:{attack:1.08,defense:1.12,position:1,noise:.1}
});
const hashText=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
const seedNumber=value=>Number.parseInt(hashText(value).slice(0,8),16)>>>0;
const createSeededRandom=seed=>{let state=seedNumber(seed)||0x6d2b79f5;return()=>{state+=0x6d2b79f5;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return((value^(value>>>14))>>>0)/4294967296;};};
const profileFor=(playerId,seed)=>PROFILES[seedNumber(`${seed}:${playerId}:profile`)%PROFILES.length];
const seriesProfiles=(participantIds,seed)=>Object.fromEntries(participantIds.map(id=>[id,profileFor(id,seed)]));
const otherSymbol=symbol=>symbol==='X'?'O':'X';
const fingerprintSimilarity=(left,right)=>{
  const a=new Set(Array.isArray(left)?left:[]),b=new Set(Array.isArray(right)?right:[]);
  if(!a.size&&!b.size)return 1;
  let intersection=0;a.forEach(value=>{if(b.has(value))intersection+=1;});
  return intersection/Math.max(a.size,b.size);
};

function mopyonCandidates(board){
  const occupied=[];board.forEach((value,index)=>{if(value)occupied.push(index);});
  if(!occupied.length)return[189,190,209,210,188,191,208,211];
  const candidates=new Set();
  occupied.forEach(index=>{const row=Math.floor(index/BOARD_SIZE),column=index%BOARD_SIZE;for(let dr=-2;dr<=2;dr+=1)for(let dc=-2;dc<=2;dc+=1){const r=row+dr,c=column+dc;if(r>=0&&r<BOARD_SIZE&&c>=0&&c<BOARD_SIZE&&!board[r*BOARD_SIZE+c])candidates.add(r*BOARD_SIZE+c);}});
  return[...candidates];
}

function immediateMoves(board,symbol,candidates=mopyonCandidates(board)){
  return candidates.filter(index=>{try{return applyMove(board,index,symbol).won;}catch{return false;}});
}

function linePotential(board,index,symbol){
  const row=Math.floor(index/BOARD_SIZE),column=index%BOARD_SIZE;
  let score=0,openThrees=0,openFours=0;
  for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){
    let before=0,after=0,r=row-dr,c=column-dc;
    while(r>=0&&r<BOARD_SIZE&&c>=0&&c<BOARD_SIZE&&board[r*BOARD_SIZE+c]===symbol){before+=1;r-=dr;c-=dc;}
    const openBefore=r>=0&&r<BOARD_SIZE&&c>=0&&c<BOARD_SIZE&&board[r*BOARD_SIZE+c]==='';
    r=row+dr;c=column+dc;
    while(r>=0&&r<BOARD_SIZE&&c>=0&&c<BOARD_SIZE&&board[r*BOARD_SIZE+c]===symbol){after+=1;r+=dr;c+=dc;}
    const openAfter=r>=0&&r<BOARD_SIZE&&c>=0&&c<BOARD_SIZE&&board[r*BOARD_SIZE+c]==='';
    const length=before+after+1,open=Number(openBefore)+Number(openAfter);
    if(length>=5)score+=1e10;
    else if(length===4){score+=open===2?4.2e7:open===1?8e6:0;if(open)openFours+=1;}
    else if(length===3){score+=open===2?1.4e6:open===1?170000:0;if(open===2)openThrees+=1;}
    else if(length===2)score+=open===2?42000:6500;
    else score+=open*850;
  }
  if(openFours>=2)score+=8e8;
  if(openFours&&openThrees)score+=2.8e8;
  if(openThrees>=2)score+=4.5e7;
  return score;
}

function chooseMopyonMove(board,symbol,{profile='balanced',random=Math.random}={}){
  if(!Array.isArray(board)||board.length!==BOARD_CELLS)throw new Error('invalid-board');
  const candidates=mopyonCandidates(board);if(!candidates.length)return-1;
  const wins=immediateMoves(board,symbol,candidates);if(wins.length)return wins[Math.floor(random()*wins.length)];
  const blocks=immediateMoves(board,otherSymbol(symbol),candidates);if(blocks.length===1)return blocks[0];
  const pool=blocks.length?blocks:candidates,weights=WEIGHTS[profile]||WEIGHTS.balanced;
  const ranked=pool.map(index=>{
    const own=linePotential(board,index,symbol),denial=linePotential(board,index,otherSymbol(symbol));
    const row=Math.floor(index/BOARD_SIZE),column=index%BOARD_SIZE,center=20-Math.abs(row-9.5)-Math.abs(column-9.5);
    const placed=board.slice();placed[index]=symbol;
    const risk=immediateMoves(placed,otherSymbol(symbol),mopyonCandidates(placed)).length*3.5e9;
    let score=own*weights.attack+denial*weights.defense+center*2400*weights.position-risk;
    score+=Math.abs(score)*weights.noise*(random()-.5);
    return{index,score};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  const best=ranked[0].score,tolerance=Math.max(18000,Math.abs(best)*.035);
  const near=ranked.filter(item=>best-item.score<=tolerance).slice(0,4);
  return near[Math.floor(Math.pow(random(),1.8)*near.length)]?.index??ranked[0].index;
}

function simulateMopyonGame({participantIds,participantNames={},seed,startingPlayerId,profiles={}}){
  if(!Array.isArray(participantIds)||participantIds.length!==2)throw new Error('invalid-participants');
  const random=createSeededRandom(seed),symbols={[participantIds[0]]:'X',[participantIds[1]]:'O'},board=Array(BOARD_CELLS).fill(''),moves=[];
  let current=participantIds.includes(startingPlayerId)?startingPlayerId:participantIds[0],winnerId=null,winningLine=[],elapsedMs=0;
  while(!winnerId&&moves.length<BOARD_CELLS){
    const symbol=symbols[current],index=chooseMopyonMove(board,symbol,{profile:profiles[current]||'balanced',random});if(index<0)break;
    const result=applyMove(board,index,symbol);elapsedMs+=Math.round((moves.length<8?1100:moves.length<30?1500:1900)+random()*1700);
    moves.push({index,symbol,player:symbol,playerId:current,automated:true,elapsedMs,decisionProfile:profiles[current]||'balanced'});
    board.splice(0,board.length,...result.board);
    if(result.won){winnerId=current;winningLine=result.winningLine;break;}current=participantIds.find(id=>id!==current);
  }
  const fingerprint=moves.slice(0,24).map(move=>`${move.symbol}:${move.index}`),draw=!winnerId,signature=hashText(fingerprint.join('|')).slice(0,24);
  return{game:'mopyon',participantIds:[...participantIds],participantNames,symbols,board,moves,winnerId,draw,winningLine,durationMs:elapsedMs,signature,fingerprint,seed,profiles};
}

function dominoMoveScore(state,uid,entry,side,profile,random){
  const tile=entry.tile,remaining=state.hands[uid].filter(item=>item.id!==tile.id),board=state.boardTiles;
  let nextEnds;
  if(!board.length)nextEnds={left:tile.a,right:tile.b};else{const ends=dominoBoardEnds(board);nextEnds=side==='left'?{left:tile.a===ends.left?tile.b:tile.a,right:ends.right}:{left:ends.left,right:tile.a===ends.right?tile.b:tile.a};}
  const future=remaining.filter(candidate=>candidate.a===nextEnds.left||candidate.b===nextEnds.left||candidate.a===nextEnds.right||candidate.b===nextEnds.right).length;
  const factor=profile==='offensive'?1.18:profile==='counter'?.95:1;
  return(remaining.length?0:1e7)+((tile.a+tile.b)*3400+(tile.a===tile.b?18000:0))*factor+future*12500-dominoHandPoints(remaining)*900+random()*2800;
}

function chooseStrongDominoAction(state,uid,{profile='balanced',random=Math.random}={}){
  const playable=dominoPlayableTiles(state,uid);
  if(playable.length){const ranked=[];for(const entry of playable)for(const side of entry.sides)ranked.push({type:'play',tileId:entry.tile.id,side,score:dominoMoveScore(state,uid,entry,side,profile,random)});ranked.sort((a,b)=>b.score-a.score||a.tileId.localeCompare(b.tileId));const best=ranked[0].score,near=ranked.filter(item=>best-item.score<=Math.max(2000,Math.abs(best)*.025)).slice(0,3);const selected=near[Math.floor(Math.pow(random(),1.7)*near.length)]||ranked[0];return{type:selected.type,tileId:selected.tileId,side:selected.side};}
  if(state.drawPile.length)return{type:'draw',drawIndex:Math.floor(random()*state.drawPile.length)};
  return{type:'pass'};
}

function simulateDominoGame({participantIds,participantNames={},seed,profiles={},startingPlayerId,gameNumber=1,seriesId=''}){
  const random=createSeededRandom(seed);let state=createDominoGameState(participantIds,random,startingPlayerId||starterUidForGame(participantIds,gameNumber,seriesId)),elapsedMs=0,guard=0;const events=[];
  while(!state.winnerId&&!state.draw&&guard<160){guard+=1;const uid=state.currentTurnUid,action=chooseStrongDominoAction(state,uid,{profile:profiles[uid]||'balanced',random}),result=applyDominoAction(state,uid,action);elapsedMs+=Math.round((action.type==='draw'?650:1100)+random()*(action.type==='draw'?850:1900));events.push({...result.event,automated:true,elapsedMs,decisionProfile:profiles[uid]||'balanced'});state=result.state;}
  if(!state.winnerId&&!state.draw)throw new Error('domino-action-limit');
  const fingerprint=events.filter(event=>event.type==='play').slice(0,24).map(event=>`${event.playerId}:${event.tileId||''}:${event.side||''}`),signature=hashText(fingerprint.join('|')).slice(0,24);
  return{game:'domino',participantIds:[...participantIds],participantNames,state,events,winnerId:state.winnerId,draw:state.draw,durationMs:elapsedMs,signature,fingerprint,seed,profiles};
}

module.exports={ENGINE_VERSION,PROFILES,createSeededRandom,profileFor,seriesProfiles,immediateMoves,chooseMopyonMove,simulateMopyonGame,chooseStrongDominoAction,simulateDominoGame,hashText,fingerprintSimilarity};
