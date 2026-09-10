'use strict';

const roundKey = data => String(data?.stage||data?.round||data?.roundLabel||data?.phase||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

const victoryPoints = data => {
  const round=roundKey(data);
  if(/finale|final/.test(round)) return 75;
  if(/demi|semi/.test(round)) return 40;
  if(/quart|quarter/.test(round)) return 25;
  if(/8e|huit|round.?of.?8/.test(round)) return 15;
  if(/16e|seiz|round.?of.?16/.test(round)) return 10;
  return 0;
};

const playerLevelName = points => points>=600?'Élite':points>=300?'Expert':points>=150?'Confirmé':points>=50?'Intermédiaire':'Débutant';

const eliminationCoupon = data => /finale|final/.test(roundKey(data))
  ? {type:'free_entry',value:null,label:'Inscription gratuite'}
  : {type:'fixed_discount',value:25,label:'Réduction de 25 HTG'};

module.exports={roundKey,victoryPoints,playerLevelName,eliminationCoupon};
