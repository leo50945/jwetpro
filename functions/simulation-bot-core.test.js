'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {BOARD_CELLS}=require('./mopyon-match-core');
const {createGameState,applyAction}=require('./domino-match-core');
const {createSeededRandom,chooseMopyonMove,simulateMopyonGame,chooseStrongDominoAction,simulateDominoGame,seriesProfiles,fingerprintSimilarity}=require('./simulation-bot-core');

test('seeded random is reproducible',()=>{
  const left=createSeededRandom('same'),right=createSeededRandom('same');
  assert.deepEqual([left(),left(),left()],[right(),right(),right()]);
});

test('fingerprints detect similar openings without requiring exact identity',()=>{
  assert.equal(fingerprintSimilarity(['X:1','O:2','X:3'],['X:1','O:2','X:4']),2/3);
  assert.equal(fingerprintSimilarity(['X:1'],['O:2']),0);
});

test('Mopyon bot wins and blocks for both symbols',()=>{
  for(const symbol of ['X','O']){
    const board=Array(BOARD_CELLS).fill('');
    [101,102,103,104].forEach(index=>{board[index]=symbol;});
    assert.ok([100,105].includes(chooseMopyonMove(board,symbol,{random:createSeededRandom(symbol)})));
    const danger=Array(BOARD_CELLS).fill('');
    [201,202,203,204].forEach(index=>{danger[index]=symbol==='X'?'O':'X';});
    assert.ok([200,205].includes(chooseMopyonMove(danger,symbol,{random:createSeededRandom(`block-${symbol}`)})));
  }
});

test('Mopyon simulations are complete, legal, reproducible and varied',()=>{
  const participantIds=['a','b'];
  const first=simulateMopyonGame({participantIds,seed:'alpha',profiles:seriesProfiles(participantIds,'alpha')});
  const repeat=simulateMopyonGame({participantIds,seed:'alpha',profiles:seriesProfiles(participantIds,'alpha')});
  const second=simulateMopyonGame({participantIds,seed:'beta',profiles:seriesProfiles(participantIds,'beta')});
  assert.equal(first.signature,repeat.signature);
  assert.notEqual(first.signature,second.signature);
  assert.ok(first.winnerId||first.draw);
  assert.equal(new Set(first.moves.map(move=>move.index)).size,first.moves.length);
  assert.ok(first.moves.every((move,index)=>index===0||move.elapsedMs>first.moves[index-1].elapsedMs));
});

test('strong Domino draw selects an opaque pile position, not a desired value',()=>{
  let state=createGameState(['a','b'],()=>.15);
  state={...state,currentTurnUid:'a',boardTiles:[{id:'6-6',a:6,b:6}],starterTileId:'',hands:{...state.hands,a:[{id:'0-0',a:0,b:0}]},drawPile:[{id:'1-1',a:1,b:1},{id:'2-6',a:2,b:6}]};
  const action=chooseStrongDominoAction(state,'a',{random:()=>.01});
  assert.deepEqual(action,{type:'draw',drawIndex:0});
  assert.equal(applyAction(state,'a',action).state.hands.a.at(-1).id,'1-1');
});

test('Domino bot-vs-bot produces a reproducible authoritative history',()=>{
  const participantIds=['a','b'];
  const first=simulateDominoGame({participantIds,seed:'domino-a',profiles:seriesProfiles(participantIds,'domino-a')});
  const second=simulateDominoGame({participantIds,seed:'domino-a',profiles:seriesProfiles(participantIds,'domino-a')});
  assert.equal(first.signature,second.signature);
  assert.ok(first.winnerId||first.draw);
  assert.ok(first.events.length>0);
  assert.ok(first.events.every((event,index)=>index===0||event.elapsedMs>first.events[index-1].elapsedMs));
});

test('32 Domino bots complete a full elimination bracket',()=>{
  let players=Array.from({length:32},(_,index)=>`domino-bot-${index+1}`),seriesCount=0,gameCount=0;
  for(let round=0;players.length>1;round+=1){
    const winners=[];
    for(let index=0;index<players.length;index+=2){
      const participantIds=[players[index],players[index+1]],seed=`domino-round-${round}-series-${index/2}`,profiles=seriesProfiles(participantIds,seed),score=[0,0];
      let number=0,draws=0;
      while(score[0]<2&&score[1]<2){
        number+=1;gameCount+=1;
        const result=simulateDominoGame({participantIds,seed:`${seed}-game-${number}`,profiles});
        if(result.draw){draws+=1;assert.ok(draws<8);continue;}
        score[participantIds.indexOf(result.winnerId)]+=1;
      }
      winners.push(participantIds[score[0]===2?0:1]);seriesCount+=1;
    }
    players=winners;
  }
  assert.equal(seriesCount,31);
  assert.ok(gameCount>=62);
  assert.equal(players.length,1);
});
