const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const {
  cleanId, stableId, likeDocumentId, entityStatsId, followDocumentId,
  conversationId, blockDocumentId, matchIsChildRound, followerMilestone, publicEntityStatus, assertEntityInput
} = require('./social-core');

const REGION = 'us-central1';
const MAX_BATCH_ENTITIES = 50;
const MAX_RELATION_PAGE = 50;
const MAX_MESSAGE_LENGTH = 2000;

module.exports = ({admin, db}) => {
  const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
  const increment = value => admin.firestore.FieldValue.increment(value);
  const safeImage = value => {
    const url = String(value || '').trim().slice(0, 800);
    return /^https:\/\/firebasestorage\.googleapis\.com\//i.test(url) ? url : '';
  };
  const displayName = data => cleanId(`${data?.firstName || ''} ${data?.lastName || ''}`, 120)
    || cleanId(data?.displayName || data?.username, 120) || 'Joueur JWETPRO';
  const validSocialId = value => /^[A-Za-z0-9_-]{1,150}$/.test(String(value || ''));
  const socialIdForUser = (uid, data = {}) => {
    if (data.simulation === true) {
      const declared = cleanId(data.socialPlayerId || data.simulationPersonaId);
      if(validSocialId(declared)&&declared.startsWith('sim_'))return declared;
      // Legacy simulations without a declared persona remain isolated. A display name alone is not
      // strong enough evidence to merge two historical identities during the backfill.
      return `sim_legacy_${stableId(uid).slice(0,24)}`;
    }
    return uid;
  };
  const requireRealPlayer = async request => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated', 'Connectez-vous avec un compte JWETPRO pour continuer.');
    }
    const uid = request.auth.uid;
    const snapshot = await db.collection('users').doc(uid).get();
    const data = snapshot.data() || {};
    if (!snapshot.exists || data.simulation === true || data.status === 'suspended' || data.status === 'disabled') {
      throw new HttpsError('permission-denied', 'Ce compte ne peut pas utiliser les fonctions sociales.');
    }
    return {uid, data, socialId:socialIdForUser(uid, data)};
  };
  const requireAdmin = async request => {
    const actor = await requireRealPlayer(request);
    if (request.auth.token?.admin !== true && actor.data.role !== 'admin') throw new HttpsError('permission-denied', 'Administrator access is required.');
    return actor;
  };
  const canonicalEntity = async input => {
    const parsed = assertEntityInput(input);
    let snapshot = await db.collection(parsed.kind === 'match' ? 'matches' : 'championships').doc(parsed.entityId).get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'Élément JWETPRO introuvable.');
    let data = snapshot.data() || {};
    let entityId = snapshot.id;
    const requestedChildRound = parsed.kind === 'match' && matchIsChildRound(data);
    if (parsed.kind === 'match' && data.kind !== 'series') {
      const parentId = cleanId(data.seriesId || data.parentSeriesId || data.matchSeriesId);
      if (parentId && validSocialId(parentId)) {
        const parent = await db.collection('matches').doc(parentId).get();
        if (parent.exists) { snapshot = parent; data = parent.data() || {}; entityId = parent.id; }
      }
    }
    if (requestedChildRound && entityId === parsed.entityId) {
      throw new HttpsError('failed-precondition', 'Une manche ne peut pas être aimée ou partagée séparément du match.');
    }
    const status = cleanId(data.status || data.state, 40).toLowerCase();
    if (!publicEntityStatus(parsed.kind, status) || status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'Cet élément n’est pas publié.');
    }
    if (parsed.kind === 'match' && !cleanId(data.championshipId || data.tournamentId || data.competitionId)) {
      throw new HttpsError('failed-precondition', 'Les parties d’entraînement ne sont pas sociales.');
    }
    const game = cleanId(data.game || data.type, 40).toLowerCase() === 'domino' ? 'Domino' : 'Mopyon';
    const number = cleanId(data.number || data.championshipNumber || entityId, 80);
    return {kind:parsed.kind, entityId, data, status, title:`${game} #${number}`, game};
  };
  const publicProfile = async socialId => {
    if (!validSocialId(socialId)) throw new HttpsError('invalid-argument', 'Profil invalide.');
    const snapshot = await db.collection('socialProfiles').doc(socialId).get();
    if (!snapshot.exists) {
      const user = await db.collection('users').doc(socialId).get();
      if (user.exists && user.data()?.simulation !== true) {
        const data = user.data() || {};
        const projected = {
          ownerUid:socialId, displayName:displayName(data), avatarUrl:safeImage(data.photoURL), imageName:cleanId(data.imageName,180),
          playerType:'real', profilePublic:data.profilePublic === true, active:data.status !== 'suspended' && data.status !== 'disabled',
          followerCount:0, updatedAt:timestamp()
        };
        if (data.profilePublic === true) { projected.level=cleanId(data.level,60)||'Débutant'; projected.points=Math.max(0,Number(data.points)||0); projected.matchesPlayed=Math.max(0,Number(data.matchesPlayed??data.matches)||0); projected.wins=Math.max(0,Number(data.wins??data.victories)||0); }
        await snapshot.ref.set(projected,{merge:true});
        return {id:socialId,ref:snapshot.ref,data:projected};
      }
      // Les identifiants de simulation peuvent ne pas encore avoir de projection
      // socialProfiles. Ils restent néanmoins des profils connus, toujours privés.
      if (/(simulation|simulated|sim[-_]|bot[-_]|demo[-_])/i.test(socialId)) {
        return {id:socialId,ref:snapshot.ref,data:{displayName:'Joueur simulé',playerType:'simulated',profilePublic:false,active:true,followerCount:0}};
      }
      throw new HttpsError('not-found', 'Profil introuvable.');
    }
    if (snapshot.data()?.active === false) throw new HttpsError('not-found', 'Profil introuvable.');
    return {id:snapshot.id, ref:snapshot.ref, data:snapshot.data() || {}};
  };
  const relationshipSnapshot = document => {
    const data = document.data() || {};
    return {id:document.id, socialId:data.targetSocialId || data.followerSocialId || '', createdAt:data.createdAt, mutual:data.mutual === true};
  };

  const setEntityLike = onCall({region:REGION, cors:true}, async request => {
    const actor = await requireRealPlayer(request);
    const entity = await canonicalEntity(request.data || {});
    const liked = request.data?.liked === true;
    const likeRef = db.collection('socialLikes').doc(likeDocumentId(actor.uid, entity.kind, entity.entityId));
    const statsRef = db.collection('socialEntityStats').doc(entityStatsId(entity.kind, entity.entityId));
    const favoriteRef = db.collection('users').doc(actor.uid).collection('favorites').doc(`${entity.kind}_${stableId(entity.entityId).slice(0, 30)}`);
    const likeCount = await db.runTransaction(async transaction => {
      const [likeSnapshot, statsSnapshot] = await Promise.all([transaction.get(likeRef), transaction.get(statsRef)]);
      const exists = likeSnapshot.exists;
      const current = Math.max(0, Number(statsSnapshot.data()?.likeCount) || 0);
      if (exists === liked) return current;
      const next = liked ? current + 1 : Math.max(0, current - 1);
      if (liked) {
        transaction.create(likeRef, {userUid:actor.uid, kind:entity.kind, entityId:entity.entityId, createdAt:timestamp()});
        transaction.set(favoriteRef, {kind:entity.kind, entityId:entity.entityId, title:entity.title, game:entity.game, status:entity.status, createdAt:timestamp(), updatedAt:timestamp()});
      } else {
        transaction.delete(likeRef);
        transaction.delete(favoriteRef);
      }
      transaction.set(statsRef, {kind:entity.kind, entityId:entity.entityId, likeCount:next, updatedAt:timestamp()}, {merge:true});
      return next;
    });
    return {kind:entity.kind, entityId:entity.entityId, liked, likeCount};
  });

  const getSocialProfile = onCall({region:REGION, cors:true}, async request => {
    const socialId = cleanId(request.data?.socialId);
    const target = await publicProfile(socialId);
    const data = target.data;
    let viewer = {authenticated:false,following:false,followedBy:false,mutual:false,blocked:false,blockedByViewer:false,blockedViewer:false,self:false};
    if (request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous') {
      const user = await db.collection('users').doc(request.auth.uid).get();
      if (user.exists && user.data()?.simulation !== true) {
        const actorSocialId=socialIdForUser(request.auth.uid,user.data()||{});
        const targetUid=data.playerType==='real'?cleanId(data.ownerUid||socialId):'';
        const refs=[db.collection('socialFollows').doc(followDocumentId(request.auth.uid,socialId))];
        if(targetUid)refs.push(db.collection('socialFollows').doc(followDocumentId(targetUid,actorSocialId)),db.collection('socialBlocks').doc(blockDocumentId(request.auth.uid,targetUid)),db.collection('socialBlocks').doc(blockDocumentId(targetUid,request.auth.uid)));
        const snapshots=await db.getAll(...refs);
        viewer={authenticated:true,following:snapshots[0]?.exists===true,followedBy:snapshots[1]?.exists===true,mutual:snapshots[0]?.exists===true&&snapshots[1]?.exists===true,blocked:snapshots.slice(2).some(item=>item?.exists),blockedByViewer:snapshots[2]?.exists===true,blockedViewer:snapshots[3]?.exists===true,self:actorSocialId===socialId};
      }
    }
    // Simulated players are directory identities only. Their profile page must
    // remain private even when a legacy document still carries profilePublic:true.
    const detailed=data.profilePublic===true&&data.playerType!=='simulated';
    return {profile:{socialId,displayName:data.displayName||'Joueur JWETPRO',avatarUrl:data.avatarUrl||'',imageName:data.imageName||'',playerType:data.playerType||'real',profilePublic:data.profilePublic===true,followerCount:Math.max(0,Number(data.followerCount)||0),level:detailed?data.level||'Débutant':null,points:detailed?Math.max(0,Number(data.points)||0):null,matchesPlayed:detailed?Math.max(0,Number(data.matchesPlayed)||0):null,wins:detailed?Math.max(0,Number(data.wins)||0):null},viewer};
  });

  const getEntitySocialStates = onCall({region:REGION, cors:true}, async request => {
    const raw = Array.isArray(request.data?.entities) ? request.data.entities.slice(0, MAX_BATCH_ENTITIES) : [];
    const requested = raw.map(assertEntityInput);
    const entities = await Promise.all(requested.map(canonicalEntity));
    let actorUid = '';
    if (request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous') {
      const profile = await db.collection('users').doc(request.auth.uid).get();
      if (profile.exists && profile.data()?.simulation !== true) actorUid = request.auth.uid;
    }
    const statsRefs = entities.map(item => db.collection('socialEntityStats').doc(entityStatsId(item.kind, item.entityId)));
    const likeRefs = actorUid ? entities.map(item => db.collection('socialLikes').doc(likeDocumentId(actorUid, item.kind, item.entityId))) : [];
    const [stats, likes] = await Promise.all([
      statsRefs.length ? db.getAll(...statsRefs) : [],
      likeRefs.length ? db.getAll(...likeRefs) : []
    ]);
    return {states:entities.map((item, index) => ({
      kind:item.kind, entityId:item.entityId, requestedEntityId:requested[index].entityId,
      likeCount:Math.max(0, Number(stats[index]?.data()?.likeCount) || 0),
      liked:Boolean(likes[index]?.exists)
    }))};
  });

  const setFollow = onCall({region:REGION, cors:true}, async request => {
    const actor = await requireRealPlayer(request);
    const targetSocialId = cleanId(request.data?.targetSocialId);
    const followed = request.data?.followed === true;
    if (!validSocialId(targetSocialId) || targetSocialId === actor.socialId) throw new HttpsError('invalid-argument', 'Abonnement invalide.');
    const target = await publicProfile(targetSocialId);
    const targetUid = target.data.playerType === 'real' ? cleanId(target.data.ownerUid || targetSocialId) : '';
    const targetUserData = targetUid ? (await db.collection('users').doc(targetUid).get()).data() || {} : {};
    const edgeRef = db.collection('socialFollows').doc(followDocumentId(actor.uid, targetSocialId));
    const reverseRef = targetUid ? db.collection('socialFollows').doc(followDocumentId(targetUid, actor.socialId)) : null;
    const actorStatsRef = db.collection('socialPrivateStats').doc(actor.uid);
    const targetPrivateStatsRef = targetUid ? db.collection('socialPrivateStats').doc(targetUid) : null;
    const conversationRef = targetUid ? db.collection('directConversations').doc(conversationId(actor.uid, targetUid)) : null;
    const blockRefs = targetUid ? [
      db.collection('socialBlocks').doc(blockDocumentId(actor.uid, targetUid)),
      db.collection('socialBlocks').doc(blockDocumentId(targetUid, actor.uid))
    ] : [];
    const result = await db.runTransaction(async transaction => {
      const refs = [edgeRef, target.ref, actorStatsRef];
      if (reverseRef) refs.push(reverseRef, targetPrivateStatsRef, conversationRef, ...blockRefs);
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
      const edgeSnapshot = snapshots[0];
      const currentTarget = snapshots[1].data() || {};
      const actorStats = snapshots[2].data() || {};
      let cursor = 3;
      const reverseSnapshot = reverseRef ? snapshots[cursor++] : null;
      const targetStats = targetPrivateStatsRef ? snapshots[cursor++].data() || {} : {};
      const conversationSnapshot = conversationRef ? snapshots[cursor++] : null;
      const blocked = blockRefs.length ? snapshots.slice(cursor).some(item => item.exists) : false;
      if (followed && blocked) throw new HttpsError('failed-precondition', 'Cet abonnement est bloqué.');
      const exists = edgeSnapshot.exists;
      const mutual = followed && Boolean(reverseSnapshot?.exists);
      if (exists !== followed) {
        const followerCount = Math.max(0, Number(currentTarget.followerCount) || 0) + (followed ? 1 : -1);
        const followingCount = Math.max(0, Number(actorStats.followingCount) || 0) + (followed ? 1 : -1);
        if (followed) transaction.create(edgeRef, {
          followerUid:actor.uid, followerSocialId:actor.socialId, targetSocialId, targetUid:targetUid || null,
          mutual, createdAt:timestamp(), updatedAt:timestamp()
        });
        else transaction.delete(edgeRef);
        transaction.set(target.ref, {followerCount, updatedAt:timestamp()}, {merge:true});
        transaction.set(actorStatsRef, {followingCount, updatedAt:timestamp()}, {merge:true});
        if (targetPrivateStatsRef) transaction.set(targetPrivateStatsRef, {followerCount, updatedAt:timestamp()}, {merge:true});
        if (reverseSnapshot?.exists) transaction.set(reverseRef, {mutual, updatedAt:timestamp()}, {merge:true});
        if (conversationSnapshot?.exists) transaction.set(conversationRef, {sendEnabled:mutual && !blocked, updatedAt:timestamp()}, {merge:true});
        if (followed && targetUid && targetUserData.notificationPreferences?.social !== false) {
          const notificationRef = db.collection('users').doc(targetUid).collection('notifications').doc(`follow_${followDocumentId(actor.uid, targetSocialId)}`);
          transaction.set(notificationRef, {
            type:reverseSnapshot?.exists ? 'follow-back' : 'new-follower', actorSocialId:actor.socialId,
            actorDisplayName:displayName(actor.data),
            title:reverseSnapshot?.exists ? 'Vous vous suivez maintenant' : 'Nouvel abonné',
            body:`${displayName(actor.data)} suit maintenant votre profil.`, read:false,
            shareMilestone:followerMilestone(followerCount), followerCount, createdAt:timestamp(), updatedAt:timestamp()
          });
        }
        return {followed, mutual, followerCount, followingCount};
      }
      return {followed, mutual:Boolean(edgeSnapshot.data()?.mutual), followerCount:Math.max(0, Number(currentTarget.followerCount) || 0), followingCount:Math.max(0, Number(actorStats.followingCount) || 0)};
    });
    return {targetSocialId, ...result};
  });

  const listRelationships = (direction, runtimeOptions = {}) => onCall({region:REGION, cors:true, ...runtimeOptions}, async request => {
    const actor = await requireRealPlayer(request);
    const relationshipDirection = direction === 'requested'
      ? (request.data?.direction === 'following' ? 'following' : 'followers')
      : direction;
    const requestedLimit = Math.min(MAX_RELATION_PAGE, Math.max(1, Number(request.data?.limit) || 30));
    const cursorId = cleanId(request.data?.cursor);
    let query = relationshipDirection === 'followers'
      ? db.collection('socialFollows').where('targetSocialId', '==', actor.socialId).orderBy('createdAt', 'desc')
      : db.collection('socialFollows').where('followerUid', '==', actor.uid).orderBy('createdAt', 'desc');
    if (cursorId) {
      const cursor = await db.collection('socialFollows').doc(cursorId).get();
      const cursorData = cursor.data() || {};
      const belongsToActor = relationshipDirection === 'followers'
        ? cursorData.targetSocialId === actor.socialId
        : cursorData.followerUid === actor.uid;
      if (!cursor.exists || !belongsToActor) throw new HttpsError('invalid-argument', 'Curseur de liste invalide.');
      query = query.startAfter(cursor);
    }
    query = query.limit(requestedLimit + 1);
    const snapshot = await query.get();
    const pageDocuments = snapshot.docs.slice(0, requestedLimit);
    const relationships = pageDocuments.map(document => {
      const data = document.data() || {};
      return {document, socialId:relationshipDirection === 'followers' ? data.followerSocialId : data.targetSocialId, mutual:data.mutual === true, createdAt:data.createdAt};
    }).filter(item => validSocialId(item.socialId));
    const profiles = relationships.length ? await db.getAll(...relationships.map(item => db.collection('socialProfiles').doc(item.socialId))) : [];
    return {items:relationships.map((item, index) => ({
      socialId:item.socialId, mutual:item.mutual, createdAt:item.createdAt,
      profile:profiles[index]?.exists ? profiles[index].data() : null
    })).filter(item => item.profile), nextCursor:snapshot.size > requestedLimit ? pageDocuments.at(-1)?.id || null : null};
  });

  const setSocialBlock = onCall({region:REGION, cors:true}, async request => {
    const actor = await requireRealPlayer(request);
    const targetSocialId = cleanId(request.data?.targetSocialId);
    const blocked = request.data?.blocked === true;
    const target = await publicProfile(targetSocialId);
    const targetUid = target.data.playerType === 'real' ? cleanId(target.data.ownerUid || targetSocialId) : '';
    if (!targetUid || targetUid === actor.uid) throw new HttpsError('invalid-argument', 'Blocage invalide.');
    const blockRef = db.collection('socialBlocks').doc(blockDocumentId(actor.uid, targetUid));
    const reverseBlockRef = db.collection('socialBlocks').doc(blockDocumentId(targetUid, actor.uid));
    const outgoingRef = db.collection('socialFollows').doc(followDocumentId(actor.uid, targetSocialId));
    const incomingRef = db.collection('socialFollows').doc(followDocumentId(targetUid, actor.socialId));
    const actorProfileRef = db.collection('socialProfiles').doc(actor.socialId);
    const actorStatsRef = db.collection('socialPrivateStats').doc(actor.uid);
    const targetStatsRef = db.collection('socialPrivateStats').doc(targetUid);
    const conversationRef = db.collection('directConversations').doc(conversationId(actor.uid, targetUid));
    await db.runTransaction(async transaction => {
      const [blockSnapshot, reverseBlockSnapshot, outgoing, incoming, actorProfile, targetProfile, actorStats, targetStats, conversation] = await Promise.all([
        blockRef, reverseBlockRef, outgoingRef, incomingRef, actorProfileRef, target.ref, actorStatsRef, targetStatsRef, conversationRef
      ].map(ref => transaction.get(ref)));
      if (blockSnapshot.exists === blocked) return;
      if (!blocked) {
        transaction.delete(blockRef);
        if (conversation.exists) transaction.set(conversationRef, {sendEnabled:false, blocked:reverseBlockSnapshot.exists, blockedByUid:reverseBlockSnapshot.exists ? targetUid : admin.firestore.FieldValue.delete(), updatedAt:timestamp()}, {merge:true});
        return;
      }
      transaction.create(blockRef, {blockerUid:actor.uid, targetUid, createdAt:timestamp()});
      if (outgoing.exists) {
        transaction.delete(outgoingRef);
        transaction.set(target.ref, {followerCount:Math.max(0, Number(targetProfile.data()?.followerCount) || 0) - 1, updatedAt:timestamp()}, {merge:true});
        transaction.set(actorStatsRef, {followingCount:Math.max(0, Number(actorStats.data()?.followingCount) || 0) - 1, updatedAt:timestamp()}, {merge:true});
      }
      if (incoming.exists) {
        transaction.delete(incomingRef);
        transaction.set(actorProfileRef, {followerCount:Math.max(0, Number(actorProfile.data()?.followerCount) || 0) - 1, updatedAt:timestamp()}, {merge:true});
        transaction.set(targetStatsRef, {followingCount:Math.max(0, Number(targetStats.data()?.followingCount) || 0) - 1, updatedAt:timestamp()}, {merge:true});
      }
      if (conversation.exists) transaction.set(conversationRef, {sendEnabled:false, blocked:true, blockedByUid:actor.uid, updatedAt:timestamp()}, {merge:true});
    });
    return {targetSocialId, blocked};
  });

  const createSocialReport = onCall({region:REGION, cors:true}, async request => {
    const actor = await requireRealPlayer(request);
    const targetSocialId = cleanId(request.data?.targetSocialId);
    await publicProfile(targetSocialId);
    const reason = cleanId(request.data?.reason, 50).toLowerCase();
    if (!['spam', 'harassment', 'impersonation', 'inappropriate', 'other'].includes(reason)) throw new HttpsError('invalid-argument', 'Motif invalide.');
    const details = String(request.data?.details || '').trim().slice(0, 500);
    const reportedConversationId = cleanId(request.data?.conversationId);
    const reference = db.collection('socialReports').doc();
    await db.runTransaction(async transaction => {
      if (reportedConversationId) {
        const conversation = await transaction.get(db.collection('directConversations').doc(reportedConversationId));
        const data = conversation.data() || {};
        if (!conversation.exists || !(data.participantIds || []).includes(actor.uid) || !(data.participantSocialIds || []).includes(targetSocialId)) throw new HttpsError('permission-denied', 'Conversation signalée inaccessible.');
      }
      transaction.create(reference,{reporterUid:actor.uid,targetSocialId,reason,details,conversationId:reportedConversationId,status:'open',createdAt:timestamp(),updatedAt:timestamp()});
    });
    return {reportId:reference.id};
  });

  const getSocialReportConversation = onCall({region:REGION, cors:true}, async request => {
    await requireAdmin(request);
    const reportId=cleanId(request.data?.reportId);
    if(!validSocialId(reportId))throw new HttpsError('invalid-argument','Signalement invalide.');
    const reportSnapshot=await db.collection('socialReports').doc(reportId).get();
    if(!reportSnapshot.exists)throw new HttpsError('not-found','Signalement introuvable.');
    const report=reportSnapshot.data()||{};
    const reportedConversationId=cleanId(report.conversationId);
    if(!reportedConversationId)throw new HttpsError('failed-precondition','Ce signalement ne concerne pas une conversation.');
    const conversationSnapshot=await db.collection('directConversations').doc(reportedConversationId).get();
    const conversation=conversationSnapshot.data()||{};
    if(!conversationSnapshot.exists||!(conversation.participantIds||[]).includes(report.reporterUid)||!(conversation.participantSocialIds||[]).includes(report.targetSocialId))throw new HttpsError('permission-denied','Le contexte du signalement ne correspond pas à cette conversation.');
    const messages=await conversationSnapshot.ref.collection('messages').orderBy('createdAt','asc').limit(200).get();
    return {report:{id:reportId,targetSocialId:report.targetSocialId,reason:report.reason,details:report.details,status:report.status,createdAt:report.createdAt},conversation:{id:reportedConversationId,participantSocialIds:conversation.participantSocialIds||[]},messages:messages.docs.map(document=>({id:document.id,authorUid:document.data()?.authorUid||'',body:String(document.data()?.body||'').slice(0,MAX_MESSAGE_LENGTH),createdAt:document.data()?.createdAt}))};
  });

  const createDirectConversation = onCall({region:REGION, cors:true}, async request => {
    const actor = await requireRealPlayer(request);
    const targetSocialId = cleanId(request.data?.targetSocialId);
    const target = await publicProfile(targetSocialId);
    const targetUid = target.data.playerType === 'real' ? cleanId(target.data.ownerUid || targetSocialId) : '';
    if (!targetUid || targetUid === actor.uid) throw new HttpsError('failed-precondition', 'Les messages privés sont réservés aux vrais joueurs.');
    const id = conversationId(actor.uid, targetUid);
    const conversationRef = db.collection('directConversations').doc(id);
    await db.runTransaction(async transaction => {
      const refs = [
        db.collection('socialFollows').doc(followDocumentId(actor.uid, targetSocialId)),
        db.collection('socialFollows').doc(followDocumentId(targetUid, actor.socialId)),
        db.collection('socialBlocks').doc(blockDocumentId(actor.uid, targetUid)),
        db.collection('socialBlocks').doc(blockDocumentId(targetUid, actor.uid)),
        conversationRef
      ];
      const [outgoing, incoming, blockedByActor, blockedByTarget, existing] = await Promise.all(refs.map(ref => transaction.get(ref)));
      if (!outgoing.exists || !incoming.exists || blockedByActor.exists || blockedByTarget.exists) throw new HttpsError('failed-precondition', 'Vous devez vous suivre mutuellement pour écrire.');
      transaction.set(conversationRef, {
        participantIds:[actor.uid, targetUid].sort(), participantSocialIds:[actor.socialId, targetSocialId].sort(),
        sendEnabled:true, blocked:false, unreadCounts:existing.data()?.unreadCounts || {[actor.uid]:0, [targetUid]:0},
        lastMessageAt:existing.data()?.lastMessageAt || timestamp(),
        createdAt:existing.exists ? existing.data()?.createdAt || timestamp() : timestamp(), updatedAt:timestamp()
      }, {merge:true});
    });
    return {conversationId:id};
  });

  const sendDirectMessage = onCall({region:REGION, cors:true}, async request => {
    const actor = await requireRealPlayer(request);
    const id = cleanId(request.data?.conversationId);
    const body = String(request.data?.body || '').trim();
    if (!validSocialId(id) || !body || body.length > MAX_MESSAGE_LENGTH) throw new HttpsError('invalid-argument', 'Message invalide.');
    const conversationRef = db.collection('directConversations').doc(id);
    const messageRef = conversationRef.collection('messages').doc();
    await db.runTransaction(async transaction => {
      const conversation = await transaction.get(conversationRef);
      const data = conversation.data() || {};
      const participants = Array.isArray(data.participantIds) ? data.participantIds : [];
      if (!conversation.exists || !participants.includes(actor.uid) || participants.length !== 2) throw new HttpsError('permission-denied', 'Conversation inaccessible.');
      const targetUid = participants.find(uid => uid !== actor.uid);
      const targetProfileSnapshot = await transaction.get(db.collection('users').doc(targetUid));
      const targetSocialId = socialIdForUser(targetUid, targetProfileSnapshot.data() || {});
      const refs = [
        db.collection('socialFollows').doc(followDocumentId(actor.uid, targetSocialId)),
        db.collection('socialFollows').doc(followDocumentId(targetUid, actor.socialId)),
        db.collection('socialBlocks').doc(blockDocumentId(actor.uid, targetUid)),
        db.collection('socialBlocks').doc(blockDocumentId(targetUid, actor.uid))
      ];
      const [outgoing, incoming, blockedByActor, blockedByTarget] = await Promise.all(refs.map(ref => transaction.get(ref)));
      if (!outgoing.exists || !incoming.exists || blockedByActor.exists || blockedByTarget.exists) throw new HttpsError('failed-precondition', 'Cette conversation est maintenant en lecture seule.');
      const unreadCounts = {...(data.unreadCounts || {}), [targetUid]:Math.max(0, Number(data.unreadCounts?.[targetUid]) || 0) + 1};
      transaction.create(messageRef, {authorUid:actor.uid, body, createdAt:timestamp()});
      transaction.set(conversationRef, {sendEnabled:true, blocked:false, lastMessage:body.slice(0, 180), lastMessageAuthorUid:actor.uid, lastMessageAt:timestamp(), unreadCounts, updatedAt:timestamp()}, {merge:true});
      if (targetProfileSnapshot.data()?.notificationPreferences?.social !== false) {
        transaction.set(db.collection('users').doc(targetUid).collection('notifications').doc(`message_${id}`), {
          type:'direct-message', actorSocialId:actor.socialId, actorDisplayName:displayName(actor.data), conversationId:id, title:'Nouveau message privé',
          body:`${displayName(actor.data)} vous a envoyé un message.`, read:false, createdAt:timestamp(), updatedAt:timestamp()
        }, {merge:true});
      }
    });
    return {conversationId:id, messageId:messageRef.id};
  });

  const markConversationRead = onCall({region:REGION, cors:true}, async request => {
    const actor = await requireRealPlayer(request);
    const id = cleanId(request.data?.conversationId);
    const reference = db.collection('directConversations').doc(id);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || !(snapshot.data()?.participantIds || []).includes(actor.uid)) throw new HttpsError('permission-denied', 'Conversation inaccessible.');
      const unreadCounts = {...(snapshot.data()?.unreadCounts || {}), [actor.uid]:0};
      transaction.set(reference, {unreadCounts, lastReadAt:{[actor.uid]:timestamp()}, updatedAt:timestamp()}, {merge:true});
    });
    return {conversationId:id};
  });

  const markNotificationsRead = onCall({region:REGION, cors:true}, async request => {
    const actor = await requireRealPlayer(request);
    const ids = Array.isArray(request.data?.notificationIds) ? request.data.notificationIds.filter(validSocialId).slice(0, 100) : [];
    const collection = db.collection('users').doc(actor.uid).collection('notifications');
    const candidates = ids.length ? ids.map(id => collection.doc(id)) : (await collection.where('read', '==', false).limit(100).get()).docs.map(item => item.ref);
    const updated = await db.runTransaction(async transaction => {
      const snapshots = await Promise.all(candidates.map(reference => transaction.get(reference)));
      snapshots.filter(item => item.exists).forEach(item => transaction.set(item.ref, {read:true, readAt:timestamp(), updatedAt:timestamp()}, {merge:true}));
      return snapshots.filter(item => item.exists).length;
    });
    return {updated};
  });

  const rebuildSocialDirectory = onCall({region:REGION, cors:true, timeoutSeconds:120}, async request => {
    await requireAdmin(request);
    const cursor=cleanId(request.data?.cursor);
    let query=db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(300);
    if(cursor)query=query.startAfter(cursor);
    const snapshot=await query.get();
    const batch=db.batch();
    snapshot.docs.forEach(document=>{
      const data=document.data()||{};const socialId=socialIdForUser(document.id,data);const projected={displayName:displayName(data),avatarUrl:safeImage(data.photoURL),imageName:cleanId(data.imageName,180),playerType:data.simulation===true?'simulated':'real',profilePublic:data.profilePublic===true,active:data.status!=='suspended'&&data.status!=='disabled',updatedAt:timestamp()};
      if(data.simulation!==true)projected.ownerUid=document.id;
      if(data.profilePublic===true||data.simulation===true){projected.level=cleanId(data.level,60)||'Débutant';projected.points=Math.max(0,Number(data.points)||0);projected.matchesPlayed=Math.max(0,Number(data.matchesPlayed??data.matches)||0);projected.wins=Math.max(0,Number(data.wins??data.victories)||0)}
      else{projected.level=admin.firestore.FieldValue.delete();projected.points=admin.firestore.FieldValue.delete();projected.matchesPlayed=admin.firestore.FieldValue.delete();projected.wins=admin.firestore.FieldValue.delete()}
      batch.set(db.collection('socialProfiles').doc(socialId),projected,{merge:true});
    });
    await batch.commit();
    return {processed:snapshot.size,nextCursor:snapshot.size===300?snapshot.docs.at(-1).id:null};
  });

  const syncSocialProfileFromUser = onDocumentWritten({document:'users/{uid}', region:REGION}, async event => {
    const uid = event.params.uid;
    const beforeData = event.data?.before?.data() || {};
    const after = event.data?.after;
    const beforeSocialId = socialIdForUser(uid, beforeData);
    if (!after?.exists) {
      await db.collection('socialProfiles').doc(beforeSocialId).set({active:false, updatedAt:timestamp()}, {merge:true});
      return;
    }
    const data = after.data() || {};
    const socialId = socialIdForUser(uid, data);
    if (beforeSocialId !== socialId) await db.collection('socialProfiles').doc(beforeSocialId).set({active:false, updatedAt:timestamp()}, {merge:true});
    const publicData = {
      displayName:displayName(data), avatarUrl:safeImage(data.photoURL), imageName:cleanId(data.imageName, 180),
      playerType:data.simulation === true ? 'simulated' : 'real', profilePublic:data.profilePublic === true,
      active:data.status !== 'suspended' && data.status !== 'disabled', updatedAt:timestamp()
    };
    if (data.simulation !== true) publicData.ownerUid = uid;
    if (data.profilePublic === true || data.simulation === true) {
      publicData.level = cleanId(data.level, 60) || 'Débutant';
      publicData.points = Math.max(0, Number(data.points) || 0);
      publicData.matchesPlayed = Math.max(0, Number(data.matchesPlayed ?? data.matches) || 0);
      publicData.wins = Math.max(0, Number(data.wins ?? data.victories) || 0);
    } else {
      publicData.level = admin.firestore.FieldValue.delete();
      publicData.points = admin.firestore.FieldValue.delete();
      publicData.matchesPlayed = admin.firestore.FieldValue.delete();
      publicData.wins = admin.firestore.FieldValue.delete();
    }
    await db.collection('socialProfiles').doc(socialId).set(publicData, {merge:true});
  });

  return {
    setEntityLike, getEntitySocialStates, getSocialProfile, setFollow,
    // One deployed service handles both authenticated relationship lists. This
    // avoids coupling the UI to a second Cloud Run service when regional quota
    // temporarily prevents a new revision from becoming public.
    listFollowers:listRelationships('requested'),
    // This read-only endpoint uses the fractional Gen 1 CPU profile so it can be
    // deployed safely even when the regional Cloud Run CPU quota is nearly full.
    listFollowing:listRelationships('following', {cpu:'gcf_gen1', concurrency:1, maxInstances:1}),
    // Relationship pagination is exposed through one low-frequency endpoint in
    // a secondary US region because us-central1 can temporarily exhaust its
    // Cloud Run deployment CPU quota. Authentication and Firestore stay shared.
    listSocialRelationships:listRelationships('requested', {region:'us-east1', cpu:'gcf_gen1', concurrency:1, maxInstances:1}),
    setSocialBlock, createSocialReport, getSocialReportConversation, createDirectConversation, sendDirectMessage,
    markConversationRead, markNotificationsRead, rebuildSocialDirectory, syncSocialProfileFromUser
  };
};
