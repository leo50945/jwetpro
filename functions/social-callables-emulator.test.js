const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-jwetpro';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('social callable emulator suite requires Firestore emulator', {skip:true}, () => {});
} else {
  if (!admin.apps.length) admin.initializeApp({projectId:PROJECT_ID});
  const db = admin.firestore();
  const social = require('./social-system')({admin,db});
  const sharing = require('./jwetpro-sharing')({admin,db});
  after(async () => { await db.terminate(); await Promise.all(admin.apps.map(app => app.delete())); });

  const authenticated = (uid, extra = {}) => ({uid,token:{firebase:{sign_in_provider:'password'},...extra}});
  const call = (fn,uid,data,extra = {}) => fn.run({auth:uid ? authenticated(uid,extra) : null,data,rawRequest:{}});
  const expectCode = async (promise,code) => {
    await assert.rejects(promise,error => error?.code === code || error?.code === `functions/${code}`);
  };

  test('likes are idempotent and every child round resolves to one parent series', async () => {
    const prefix=`like-${Date.now()}`;
    const alice=`${prefix}-alice`;const simulated=`${prefix}-sim`;const championship=`${prefix}-championship`;const series=`${prefix}-series`;const game=`${prefix}-game`;
    await Promise.all([
      db.doc(`users/${alice}`).set({firstName:'Alice',status:'active',profilePublic:true}),
      db.doc(`users/${simulated}`).set({firstName:'Bot',status:'active',simulation:true,socialPlayerId:`sim_${prefix}`}),
      db.doc(`championships/${championship}`).set({game:'Mopyon',status:'registration-open',number:'101'}),
      db.doc(`matches/${series}`).set({kind:'series',game:'Mopyon',status:'completed',championshipId:championship,number:'12'}),
      db.doc(`matches/${game}`).set({kind:'game',game:'Mopyon',status:'completed',championshipId:championship,seriesId:series,number:'12-1'}),
      db.doc(`matches/${prefix}-training`).set({kind:'match',game:'Mopyon',status:'live',number:'training'})
    ]);

    const first=await call(social.setEntityLike,alice,{kind:'match',entityId:game,liked:true});
    const second=await call(social.setEntityLike,alice,{kind:'match',entityId:game,liked:true});
    assert.equal(first.entityId,series);assert.equal(first.likeCount,1);assert.equal(second.likeCount,1);
    const state=await call(social.getEntitySocialStates,alice,{entities:[{kind:'match',entityId:game},{kind:'match',entityId:series}]});
    assert.deepEqual(state.states.map(item=>[item.entityId,item.likeCount,item.liked]),[[series,1,true],[series,1,true]]);
    const favorites=await db.collection('users').doc(alice).collection('favorites').get();
    assert.equal(favorites.size,1);assert.equal(favorites.docs[0].data().entityId,series);
    await call(social.setEntityLike,alice,{kind:'match',entityId:series,liked:false});
    const repeatedUnlike=await call(social.setEntityLike,alice,{kind:'match',entityId:series,liked:false});
    assert.equal(repeatedUnlike.likeCount,0);
    assert.equal((await db.collection('users').doc(alice).collection('favorites').get()).size,0);
    await expectCode(call(social.setEntityLike,alice,{kind:'match',entityId:`${prefix}-training`,liked:true}),'failed-precondition');
    await expectCode(call(social.setEntityLike,simulated,{kind:'championship',entityId:championship,liked:true}),'permission-denied');
  });

  test('mutual follows gate messages; unfollow and block preserve safe history', async () => {
    const prefix=`follow-${Date.now()}`;const alice=`${prefix}-alice`;const bob=`${prefix}-bob`;const simUid=`${prefix}-sim-user`;const simSocialId=`sim_${prefix}`;
    await Promise.all([
      db.doc(`users/${alice}`).set({firstName:'Alice',status:'active',profilePublic:true,notificationPreferences:{social:true}}),
      db.doc(`users/${bob}`).set({firstName:'Bob',status:'active',profilePublic:true,notificationPreferences:{social:true}}),
      db.doc(`users/${simUid}`).set({firstName:'Bot',status:'active',simulation:true,socialPlayerId:simSocialId}),
      db.doc(`socialProfiles/${simSocialId}`).set({displayName:'Bot Stable',playerType:'simulated',profilePublic:true,active:true,followerCount:0})
    ]);

    await expectCode(call(social.setFollow,alice,{targetSocialId:alice,followed:true}),'invalid-argument');
    const first=await call(social.setFollow,alice,{targetSocialId:bob,followed:true});
    const duplicate=await call(social.setFollow,alice,{targetSocialId:bob,followed:true});
    assert.equal(first.followerCount,1);assert.equal(duplicate.followerCount,1);
    await expectCode(call(social.createDirectConversation,alice,{targetSocialId:bob}),'failed-precondition');
    const reciprocal=await call(social.setFollow,bob,{targetSocialId:alice,followed:true});
    assert.equal(reciprocal.mutual,true);
    const [aliceFollowers,aliceFollowing]=await Promise.all([
      call(social.listSocialRelationships,alice,{direction:'followers',limit:10}),
      call(social.listSocialRelationships,alice,{direction:'following',limit:10})
    ]);
    assert.deepEqual(aliceFollowers.items.map(item=>item.socialId),[bob]);
    assert.deepEqual(aliceFollowing.items.map(item=>item.socialId),[bob]);
    assert.equal(aliceFollowers.items[0].mutual,true);
    assert.equal(aliceFollowing.items[0].mutual,true);
    const conversation=await call(social.createDirectConversation,alice,{targetSocialId:bob});
    await call(social.sendDirectMessage,alice,{conversationId:conversation.conversationId,body:'Bonjour <script>alert(1)</script>'});
    const storedMessage=await db.collection('directConversations').doc(conversation.conversationId).collection('messages').limit(1).get();
    assert.equal(storedMessage.docs[0].data().body,'Bonjour <script>alert(1)</script>');
    await call(social.setFollow,alice,{targetSocialId:bob,followed:false});
    assert.equal((await db.doc(`directConversations/${conversation.conversationId}`).get()).data().sendEnabled,false);
    await expectCode(call(social.sendDirectMessage,alice,{conversationId:conversation.conversationId,body:'Interdit'}),'failed-precondition');
    await call(social.setFollow,alice,{targetSocialId:bob,followed:true});
    await call(social.setSocialBlock,alice,{targetSocialId:bob,blocked:true});
    assert.equal((await db.doc(`directConversations/${conversation.conversationId}`).get()).data().blocked,true);
    await expectCode(call(social.setFollow,bob,{targetSocialId:alice,followed:true}),'failed-precondition');
    const report=await call(social.createSocialReport,alice,{targetSocialId:bob,conversationId:conversation.conversationId,reason:'harassment',details:'Test de signalement'});
    const moderation=await call(social.getSocialReportConversation,alice,{reportId:report.reportId},{admin:true});
    assert.equal(moderation.conversation.id,conversation.conversationId);assert.equal(moderation.messages.length,1);
    const simulatedFollow=await call(social.setFollow,alice,{targetSocialId:simSocialId,followed:true});
    assert.equal(simulatedFollow.followed,true);assert.equal(simulatedFollow.mutual,false);
    await expectCode(call(social.createDirectConversation,alice,{targetSocialId:simSocialId}),'failed-precondition');
    await expectCode(call(social.setFollow,simUid,{targetSocialId:alice,followed:true}),'permission-denied');
  });

  test('follower share events expose the count but never the latest follower identity', async () => {
    const uid=`share-${Date.now()}`;
    await Promise.all([
      db.doc(`users/${uid}`).set({firstName:'Profil',lastName:'Public',status:'active',profilePublic:true,points:150}),
      db.doc(`socialProfiles/${uid}`).set({displayName:'Profil Public',ownerUid:uid,playerType:'real',profilePublic:true,active:true,followerCount:25})
    ]);
    const result=await call(sharing.createShareEvent,uid,{type:'followers'});
    const snapshot=await db.doc(`shareEvents/${result.shareId}`).get();
    const payload=snapshot.data();
    assert.equal(payload.followerCount,25);assert.equal(payload.milestone,'25');
    assert.equal('actorSocialId' in payload,false);assert.equal('followerUid' in payload,false);
  });

  test('social directory backfill is admin-only and never merges ambiguous legacy simulations', async () => {
    const prefix=`backfill-${Date.now()}`;
    const adminUid=`${prefix}-admin`;
    const privateUid=`${prefix}-private`;
    const legacyOne=`${prefix}-legacy-one`;
    const legacyTwo=`${prefix}-legacy-two`;
    const declaredUid=`${prefix}-declared`;
    const declaredSocialId=`sim_${prefix.replace(/[^a-z0-9_-]/gi,'_')}`;
    await Promise.all([
      db.doc(`users/${adminUid}`).set({firstName:'Admin',role:'admin',status:'active'}),
      db.doc(`users/${privateUid}`).set({firstName:'Profil',lastName:'Privé',status:'active',profilePublic:false,level:'Expert',points:900}),
      db.doc(`users/${legacyOne}`).set({firstName:'Même',lastName:'Nom',status:'active',simulation:true,profilePublic:true}),
      db.doc(`users/${legacyTwo}`).set({firstName:'Même',lastName:'Nom',status:'active',simulation:true,profilePublic:true}),
      db.doc(`users/${declaredUid}`).set({firstName:'Persona',lastName:'Stable',status:'active',simulation:true,profilePublic:true,socialPlayerId:declaredSocialId,level:'Confirmé',points:175}),
      db.doc(`socialProfiles/${privateUid}`).set({displayName:'Ancien profil',profilePublic:true,level:'Expert',points:900})
    ]);

    await expectCode(call(social.rebuildSocialDirectory,privateUid,{}),'permission-denied');
    const result=await call(social.rebuildSocialDirectory,adminUid,{}, {admin:true});
    assert.ok(result.processed >= 5);

    const privateProfile=(await db.doc(`socialProfiles/${privateUid}`).get()).data();
    assert.equal(privateProfile.profilePublic,false);
    assert.equal(privateProfile.ownerUid,privateUid);
    assert.equal('level' in privateProfile,false);
    assert.equal('points' in privateProfile,false);

    const declaredProfile=(await db.doc(`socialProfiles/${declaredSocialId}`).get()).data();
    assert.equal(declaredProfile.displayName,'Persona Stable');
    assert.equal(declaredProfile.playerType,'simulated');
    assert.equal(declaredProfile.points,175);
    assert.equal('ownerUid' in declaredProfile,false);

    const ambiguous=(await db.collection('socialProfiles').where('displayName','==','Même Nom').get()).docs;
    assert.equal(ambiguous.length,2);
    assert.notEqual(ambiguous[0].id,ambiguous[1].id);
    assert.ok(ambiguous.every(item=>item.id.startsWith('sim_legacy_')));
  });
}
