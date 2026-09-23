const test = require('node:test');
const assert = require('node:assert/strict');
const {COMMUNITY_PERSONAS,isRealDay,normalizeCommunityProgram,buildCommunityTimeline,pickCommunityProgramMetadata} = require('./community-programs-core');

test('validates real calendar dates',() => {
  assert.equal(isRealDay('2026-02-28'),true);
  assert.equal(isRealDay('2026-02-30'),false);
});

test('normalizes a threaded conversation',() => {
  const result = normalizeCommunityProgram({conversations:[{id:'salon',messages:[
    {id:'m1',author:COMMUNITY_PERSONAS[0],text:'Bonjou'},
    {id:'m2',author:COMMUNITY_PERSONAS[1],text:'Sak pase?',replyTo:'m1'}
  ]}]});
  assert.equal(result.totalMessages,2);
  assert.equal(result.conversations[0].messages[1].replyTo,'m1');
});

test('rejects replies to a following message',() => {
  assert.throws(() => normalizeCommunityProgram({conversations:[{id:'bad',messages:[
    {id:'m1',author:COMMUNITY_PERSONAS[0],text:'Bonjou',replyTo:'m2'},
    {id:'m2',author:COMMUNITY_PERSONAS[1],text:'Hello'}
  ]}]}),/avant la réponse/);
});

test('interleaves discussions and resolves stable reply snapshots',() => {
  const normalized = normalizeCommunityProgram({conversations:[
    {id:'a',startOffsetSeconds:0,messages:[{id:'a1',author:COMMUNITY_PERSONAS[0],text:'A1'},{id:'a2',author:COMMUNITY_PERSONAS[1],text:'A2',replyTo:'a1',delaySeconds:8}]},
    {id:'b',startOffsetSeconds:3,messages:[{id:'b1',author:COMMUNITY_PERSONAS[2],text:'B1'},{id:'b2',author:COMMUNITY_PERSONAS[3],text:'B2',replyTo:'b1',delaySeconds:8}]}
  ]}).conversations;
  const first = buildCommunityTimeline({actualDay:'2026-09-07',sourceDay:'2026-09-07',revision:'r1',conversations:normalized});
  const second = buildCommunityTimeline({actualDay:'2026-09-07',sourceDay:'2026-09-07',revision:'r1',conversations:normalized});
  assert.deepEqual(first.timeline.map(line => line.documentId),second.timeline.map(line => line.documentId));
  assert.deepEqual(first.timeline.map(line => line.offsetSeconds),[0,3,8,11]);
  const reply = first.timeline.find(line => line.text === 'A2');
  assert.ok(reply.replyToMessageId);
  assert.equal(reply.replyTo.authorName,COMMUNITY_PERSONAS[0]);
});

test('prioritizes a programmed conversation matching the current context',() => {
  const normalized = normalizeCommunityProgram({conversations:[
    {id:'general',contexts:['general'],messages:[{id:'g1',author:COMMUNITY_PERSONAS[0],text:'Tout moun la?'}]},
    {id:'live',contexts:['live-match'],messages:[{id:'l1',author:COMMUNITY_PERSONAS[1],text:'M ap swiv match la.'}]}
  ]}).conversations;
  const result = buildCommunityTimeline({actualDay:'2026-09-07',sourceDay:'2026-09-07',revision:'r1',conversations:normalized,contextHint:'live-match'});
  assert.deepEqual(result.timeline.map(line => line.conversationId),['live']);
});

test('uses the exact day, otherwise the greatest stored day',() => {
  const records = [
    {id:'2026-09-01',data:{enabled:true,activeRevision:'a'}},
    {id:'2026-09-30',data:{enabled:true,activeRevision:'b'}},
    {id:'2026-10-15',data:{enabled:false,activeRevision:'c'}}
  ];
  assert.equal(pickCommunityProgramMetadata('2026-09-01',records).id,'2026-09-01');
  assert.equal(pickCommunityProgramMetadata('2026-09-07',records).id,'2026-09-30');
});
