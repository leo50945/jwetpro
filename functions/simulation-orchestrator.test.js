'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const orchestrator=require('./simulation-orchestrator');

const {BRACKET_SIZE,MAX_DRAW_GAMES,ROUNDS,seedOrder,seriesIdFor,seriesIsBotOnly,selectBotSeries,roundDefinition}=orchestrator._test;

test('32-player seed order is deterministic and complete',()=>{
  const first=seedOrder(BRACKET_SIZE),second=seedOrder(BRACKET_SIZE);
  assert.deepEqual(first,second);
  assert.equal(first.length,32);
  assert.equal(new Set(first).size,32);
  assert.deepEqual([...first].sort((a,b)=>a-b),Array.from({length:32},(_,index)=>index+1));
  assert.deepEqual(first.slice(0,4),[1,32,16,17]);
});

test('series identifiers and round table are stable',()=>{
  assert.equal(seriesIdFor('simulation-abc','16e',0),'simulation-abc-16e-1');
  assert.deepEqual(ROUNDS.map(round=>round.matches),[16,8,4,2,1]);
  assert.equal(roundDefinition('quart').points,25);
  assert.equal(roundDefinition('unknown'),null);
  assert.equal(MAX_DRAW_GAMES,8);
});

test('a series containing any real player is never bot-only',()=>{
  assert.equal(seriesIsBotOnly({player1:{real:false},player2:{real:false}}),true);
  assert.equal(seriesIsBotOnly({player1:{real:true},player2:{real:false}}),false);
  assert.equal(seriesIsBotOnly({player1:{real:false},player2:{real:true}}),false);
});

test('round-wide simulation skips real-player series without blocking bot matches',()=>{
  const document=(id,player1Real,player2Real)=>({id,data:()=>({player1:{real:player1Real},player2:{real:player2Real}})});
  const botMatch=document('bots',false,false),realMatch=document('real',true,false);
  const all=selectBotSeries([botMatch,realMatch],[]);
  assert.deepEqual(all.candidates.map(item=>item.id),['bots']);
  assert.equal(all.containsReal,false);
  const explicit=selectBotSeries([botMatch,realMatch],['real']);
  assert.equal(explicit.containsReal,true);
});
