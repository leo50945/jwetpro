const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-jwetpro';
const AUTH_ORIGIN = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;
const FIRESTORE_ORIGIN = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`;
const DOCUMENTS_ORIGIN = `${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  test('social Firestore emulator suite requires Firebase emulators', {skip:true}, () => {});
} else {
  if (!admin.apps.length) admin.initializeApp({projectId:PROJECT_ID});
  const db = admin.firestore();
  after(async () => { await db.terminate(); await Promise.all(admin.apps.map(app => app.delete())); });
  const signUp = async label => {
    const response = await fetch(`${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({email:`${label}-${Date.now()}@example.test`,password:'test-password-123',returnSecureToken:true}),
      signal:AbortSignal.timeout(8000)
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload;
  };
  const requestDocument = (path, token = '') => fetch(`${DOCUMENTS_ORIGIN}/${path}`, {
    headers:token ? {authorization:`Bearer ${token}`} : {}, signal:AbortSignal.timeout(8000)
  });

  test('social data stays private to its owner and conversation participants', async () => {
    const [alice,bob,eve] = await Promise.all(['alice','bob','eve'].map(signUp));
    await Promise.all([
      db.doc(`users/${alice.localId}/favorites/favorite-1`).set({kind:'match',entityId:'series-1'}),
      db.doc(`users/${alice.localId}/notifications/notification-1`).set({type:'new-follower',read:false}),
      db.doc(`socialPrivateStats/${alice.localId}`).set({followingCount:1}),
      db.doc('socialProfiles/public-player').set({displayName:'Public Player',playerType:'real',profilePublic:false,followerCount:2,active:true}),
      db.doc('socialEntityStats/match_public').set({kind:'match',entityId:'series-1',likeCount:4}),
      db.doc('socialFollows/private-edge').set({followerUid:alice.localId,targetSocialId:bob.localId}),
      db.doc('directConversations/conversation-1').set({participantIds:[alice.localId,bob.localId],participantSocialIds:[alice.localId,bob.localId]}),
      db.doc('directConversations/conversation-1/messages/message-1').set({authorUid:alice.localId,body:'Bonjour'})
    ]);

    const checks = await Promise.all([
      requestDocument(`users/${alice.localId}/favorites/favorite-1`, alice.idToken),
      requestDocument(`users/${alice.localId}/favorites/favorite-1`, bob.idToken),
      requestDocument(`users/${alice.localId}/notifications/notification-1`, alice.idToken),
      requestDocument(`users/${alice.localId}/notifications/notification-1`, eve.idToken),
      requestDocument(`socialPrivateStats/${alice.localId}`, alice.idToken),
      requestDocument(`socialPrivateStats/${alice.localId}`, bob.idToken),
      requestDocument('socialProfiles/public-player'),
      requestDocument('socialEntityStats/match_public'),
      requestDocument('socialFollows/private-edge', alice.idToken),
      requestDocument('directConversations/conversation-1', alice.idToken),
      requestDocument('directConversations/conversation-1', bob.idToken),
      requestDocument('directConversations/conversation-1', eve.idToken),
      requestDocument('directConversations/conversation-1/messages/message-1', bob.idToken),
      requestDocument('directConversations/conversation-1/messages/message-1', eve.idToken)
    ]);
    const statuses = checks.map(response => response.status);
    assert.deepEqual(statuses, [200,403,200,403,200,403,200,200,403,200,200,403,200,403]);
  });

  test('clients cannot mutate server-owned social projections', async () => {
    const actor = await signUp('mutator');
    const attempts = [
      ['socialProfiles/forbidden',{displayName:'Changed'}],
      ['socialEntityStats/forbidden',{likeCount:999}],
      [`users/${actor.localId}/favorites/forbidden`,{kind:'match'}],
      [`users/${actor.localId}/notifications/forbidden`,{read:true}],
      ['directConversations/forbidden',{participantIds:[actor.localId]}]
    ];
    for (const [path,fields] of attempts) {
      const response = await fetch(`${DOCUMENTS_ORIGIN}/${path}`, {
        method:'PATCH',
        headers:{authorization:`Bearer ${actor.idToken}`,'content-type':'application/json'},
        body:JSON.stringify({fields:Object.fromEntries(Object.entries(fields).map(([key,value]) => [key,typeof value === 'number' ? {integerValue:String(value)} : Array.isArray(value) ? {arrayValue:{values:value.map(item=>({stringValue:item}))}} : {stringValue:String(value)}]))}),
        signal:AbortSignal.timeout(8000)
      });
      assert.equal(response.status, 403, `${path} should be server-owned`);
    }
  });
}
