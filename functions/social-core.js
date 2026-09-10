const crypto = require('crypto');

const ENTITY_KINDS = new Set(['championship', 'match']);
const PUBLIC_CHAMPIONSHIP_STATUSES = new Set([
  'upcoming', 'scheduled', 'registration-open', 'registration-closed', 'open', 'closed',
  'ongoing', 'in-progress', 'active', 'live', 'completed', 'finished', 'ended', 'termine', 'terminé'
]);
const PUBLIC_MATCH_STATUSES = new Set([
  'preview', 'upcoming', 'scheduled', 'waiting-opponent', 'ongoing', 'in-progress', 'active',
  'playing', 'live', 'completed', 'finished', 'ended', 'termine', 'terminé', 'replay'
]);

const cleanId = (value, max = 150) => String(value || '').trim().slice(0, max);
const stableId = (...parts) => crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
const likeDocumentId = (uid, kind, entityId) => stableId('like', uid, kind, entityId);
const entityStatsId = (kind, entityId) => `${kind}_${stableId(kind, entityId)}`;
const followDocumentId = (followerUid, targetSocialId) => stableId('follow', followerUid, targetSocialId);
const conversationId = (firstUid, secondUid) => stableId('conversation', ...[firstUid, secondUid].sort());
const blockDocumentId = (blockerUid, targetUid) => stableId('block', blockerUid, targetUid);
const matchIsChildRound = data => Boolean(data && data.kind !== 'series' && (
  data.kind === 'game' || cleanId(data.seriesId || data.parentSeriesId || data.matchSeriesId)
));

const followerMilestone = count => {
  const value = Math.max(0, Number(count) || 0);
  return [10, 25, 50, 100].includes(value) || (value > 100 && value % 100 === 0);
};

const publicEntityStatus = (kind, status) => {
  const normalizedKind = cleanId(kind, 30).toLowerCase();
  const normalizedStatus = cleanId(status, 40).toLowerCase();
  if (normalizedKind === 'championship') return PUBLIC_CHAMPIONSHIP_STATUSES.has(normalizedStatus);
  if (normalizedKind === 'match') return PUBLIC_MATCH_STATUSES.has(normalizedStatus);
  return false;
};

const assertEntityInput = input => {
  const kind = cleanId(input?.kind, 30).toLowerCase();
  const entityId = cleanId(input?.entityId);
  if (!ENTITY_KINDS.has(kind) || !/^[A-Za-z0-9_-]{1,150}$/.test(entityId)) {
    const error = new Error('INVALID_ENTITY');
    error.code = 'INVALID_ENTITY';
    throw error;
  }
  return {kind, entityId};
};

const entityDestination = (kind, entityId, status) => {
  const id = encodeURIComponent(cleanId(entityId));
  const normalized = cleanId(status, 40).toLowerCase();
  if (kind === 'championship') {
    if (['registration-open','open'].includes(normalized)) return `https://jwetpro.com/registration-checkout.html?id=${id}`;
    if (['completed', 'finished', 'ended', 'termine', 'terminé'].includes(normalized)) return `https://jwetpro.com/championship.html?id=${id}`;
    return `https://jwetpro.com/progress.html?id=${id}`;
  }
  if (['completed', 'finished', 'ended', 'termine', 'terminé', 'replay'].includes(normalized)) return `https://jwetpro.com/play.html?replay=${id}`;
  return `https://jwetpro.com/play.html?match=${id}`;
};

module.exports = {
  ENTITY_KINDS,
  cleanId,
  stableId,
  likeDocumentId,
  entityStatsId,
  followDocumentId,
  conversationId,
  blockDocumentId,
  matchIsChildRound,
  followerMilestone,
  publicEntityStatus,
  assertEntityInput,
  entityDestination
};
