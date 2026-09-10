'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {victoryPoints,playerLevelName,eliminationCoupon}=require('./domino-rewards-core');

test('official Domino round victories use the published point scale',()=>{
  assert.equal(victoryPoints({round:'16e'}),10);
  assert.equal(victoryPoints({round:'8e'}),15);
  assert.equal(victoryPoints({round:'quart'}),25);
  assert.equal(victoryPoints({round:'demi'}),40);
  assert.equal(victoryPoints({round:'finale'}),75);
});

test('elimination coupon is 25 HTG except for the runner-up',()=>{
  assert.deepEqual(eliminationCoupon({round:'quart'}),{type:'fixed_discount',value:25,label:'Réduction de 25 HTG'});
  assert.deepEqual(eliminationCoupon({round:'finale'}),{type:'free_entry',value:null,label:'Inscription gratuite'});
});

test('level projection follows the official thresholds',()=>{
  assert.equal(playerLevelName(49),'Débutant');
  assert.equal(playerLevelName(50),'Intermédiaire');
  assert.equal(playerLevelName(600),'Élite');
});
