'use strict';

const crypto = require('crypto');

// Official series rule: game 1 starts with participant 1, game 2 with
// participant 2, and game 3 is selected automatically (stable for retries).
const starterUidForGame = (participantIds, gameNumber, seriesId = '') => {
  if (!Array.isArray(participantIds) || participantIds.length < 2) return '';
  if (Number(gameNumber) === 2) return participantIds[1];
  if (Number(gameNumber) === 3) {
    const digest = crypto.createHash('sha256').update(`${seriesId}:game-3`).digest();
    return participantIds[digest[0] % 2];
  }
  return participantIds[0];
};

module.exports = {starterUidForGame};
