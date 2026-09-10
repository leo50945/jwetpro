const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./social-core');

test('social ids are deterministic and scoped', () => {
  assert.equal(core.likeDocumentId('u1', 'match', 'm1'), core.likeDocumentId('u1', 'match', 'm1'));
  assert.notEqual(core.likeDocumentId('u1', 'match', 'm1'), core.likeDocumentId('u1', 'match', 'm2'));
  assert.equal(core.conversationId('u1', 'u2'), core.conversationId('u2', 'u1'));
});

test('follower milestones remain discreet', () => {
  [10, 25, 50, 100, 200, 900].forEach(value => assert.equal(core.followerMilestone(value), true));
  [0, 1, 24, 99, 101, 150].forEach(value => assert.equal(core.followerMilestone(value), false));
});

test('only published entities can be social', () => {
  assert.equal(core.publicEntityStatus('championship', 'registration-open'), true);
  assert.equal(core.publicEntityStatus('championship', 'open'), true);
  assert.equal(core.publicEntityStatus('championship', 'cancelled'), false);
  assert.equal(core.publicEntityStatus('match', 'scheduled'), true);
  assert.equal(core.publicEntityStatus('match', 'in-progress'), true);
  assert.equal(core.publicEntityStatus('match', 'draft'), false);
});

test('entity destinations follow current status', () => {
  assert.match(core.entityDestination('championship', 'c 1', 'registration-open'), /registration-checkout\.html\?id=c%201$/);
  assert.match(core.entityDestination('match', 'm1', 'completed'), /play\.html\?replay=m1$/);
  assert.match(core.entityDestination('match', 'm1', 'live'), /play\.html\?match=m1$/);
});

test('individual rounds are never independent social entities', () => {
  assert.equal(core.matchIsChildRound({kind:'game',seriesId:'series-1'}), true);
  assert.equal(core.matchIsChildRound({kind:'match',parentSeriesId:'series-1'}), true);
  assert.equal(core.matchIsChildRound({kind:'series',seriesId:'legacy-value'}), false);
  assert.equal(core.matchIsChildRound({kind:'match'}), false);
});
