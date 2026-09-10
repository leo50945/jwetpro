const {onCall, HttpsError} = require('firebase-functions/v2/https');
const crypto = require('crypto');
const {COMMUNITY_PERSONAS, isRealDay, normalizeCommunityProgram, buildCommunityTimeline, pickCommunityProgramMetadata} = require('./community-programs-core');

module.exports = ({admin, db}) => {
  const requireAdmin = async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion administrateur requise.');
    if (request.auth.token?.admin === true) return;
    const profile = await db.collection('users').doc(request.auth.uid).get();
    if (!profile.exists || profile.data().role !== 'admin') throw new HttpsError('permission-denied', 'Accès administrateur requis.');
  };
  const programRef = dayKey => db.collection('communityDailyPrograms').doc(dayKey);

  const saveCommunityDayProgram = onCall({region:'us-central1',cors:true,timeoutSeconds:300}, async request => {
    await requireAdmin(request);
    const dayKey = String(request.data?.dayKey || '').trim();
    if (!isRealDay(dayKey)) throw new HttpsError('invalid-argument', 'La date doit respecter le format AAAA-MM-JJ.');
    let normalized;
    try { normalized = normalizeCommunityProgram(request.data); }
    catch (error) { throw new HttpsError('invalid-argument', error.message); }
    const revision = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const revisionKey = `${dayKey}|${revision}`;
    const writer = db.bulkWriter();
    normalized.conversations.forEach(conversation => {
      const documentId = `${dayKey}_${revision}_${crypto.createHash('sha256').update(conversation.id).digest('hex').slice(0,16)}`;
      writer.create(db.collection('communityProgramConversations').doc(documentId), {...conversation, dayKey, revision, revisionKey});
    });
    await writer.close();
    const previous = await programRef(dayKey).get();
    const previousRevision = previous.data()?.activeRevision || '';
    await programRef(dayKey).set({
      dayKey,
      activeRevision:revision,
      enabled:true,
      conversationCount:normalized.conversations.length,
      messageCount:normalized.totalMessages,
      updatedAt:admin.firestore.FieldValue.serverTimestamp(),
      updatedBy:request.auth.uid,
      createdAt:previous.exists ? previous.data().createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    if (previousRevision && previousRevision !== revision) {
      const stale = await db.collection('communityProgramConversations').where('revisionKey','==',`${dayKey}|${previousRevision}`).get();
      const cleanup = db.bulkWriter();
      stale.docs.forEach(document => cleanup.delete(document.ref));
      await cleanup.close();
    }
    return {dayKey,revision,conversationCount:normalized.conversations.length,messageCount:normalized.totalMessages};
  });

  const deleteCommunityDayProgram = onCall({region:'us-central1',cors:true,timeoutSeconds:300}, async request => {
    await requireAdmin(request);
    const dayKey = String(request.data?.dayKey || '').trim();
    if (!isRealDay(dayKey)) throw new HttpsError('invalid-argument', 'Date invalide.');
    const snapshot = await db.collection('communityProgramConversations').where('dayKey','==',dayKey).get();
    const writer = db.bulkWriter();
    snapshot.docs.forEach(document => writer.delete(document.ref));
    writer.delete(programRef(dayKey));
    await writer.close();
    return {dayKey,deleted:true};
  });

  const sendCommunityReply = onCall({region:'us-central1',cors:true}, async request => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated','Connexion requise.');
    const parentMessageId = String(request.data?.parentMessageId || '').trim();
    const body = String(request.data?.body || '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,2000);
    const language = request.data?.language === 'ht' ? 'ht' : 'fr';
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(parentMessageId) || !body) throw new HttpsError('invalid-argument','Message ou réponse invalide.');
    const [parent, profile] = await Promise.all([
      db.collection('communityMessages').doc(parentMessageId).get(),
      db.collection('users').doc(request.auth.uid).get()
    ]);
    if (!parent.exists || parent.data().roomId !== 'general') throw new HttpsError('not-found','Message d’origine introuvable.');
    const parentData = parent.data();
    const profileData = profile.exists ? profile.data() : {};
    const authorName = `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim() || profileData.username || request.auth.token?.email || 'Utilisateur';
    const document = await db.collection('communityMessages').add({
      roomId:'general',authorId:request.auth.uid,authorName,authorImageName:profileData.imageName || '',authorRole:'user',language,body,
      threadId:parentData.threadId || parent.id,
      replyToMessageId:parent.id,
      replyTo:{messageId:parent.id,authorName:String(parentData.authorName || 'Utilisateur').slice(0,60),body:String(parentData.body || '').slice(0,180)},
      createdAt:admin.firestore.FieldValue.serverTimestamp()
    });
    return {messageId:document.id};
  });

  const loadProgramForDay = async dayKey => {
    const exact = await programRef(dayKey).get();
    let metadata = exact.exists && exact.data().enabled === true && exact.data().activeRevision ? exact : null;
    if (!metadata) {
      const all = await db.collection('communityDailyPrograms').get();
      metadata = pickCommunityProgramMetadata(dayKey,all.docs.map(document => ({id:document.id,data:document.data(),document})))?.document || null;
    }
    if (!metadata) return null;
    const data = metadata.data();
    const sourceDay = data.dayKey || metadata.id;
    const revision = data.activeRevision;
    const snapshot = await db.collection('communityProgramConversations').where('revisionKey','==',`${sourceDay}|${revision}`).get();
    const conversations = snapshot.docs.map(document => document.data()).sort((a,b) => String(a.id).localeCompare(String(b.id)));
    return conversations.length ? {sourceDay,revision,conversations} : null;
  };

  const prepareProgramTimeline = async (actualDay, usedConversationKeys) => {
    const program = await loadProgramForDay(actualDay);
    if (!program) return {programFound:false,selectedKeys:[],timeline:[]};
    return {programFound:true,sourceDay:program.sourceDay,revision:program.revision,...buildCommunityTimeline({actualDay,...program,usedConversationKeys})};
  };

  return {
    functions:{saveCommunityDayProgram,deleteCommunityDayProgram,sendCommunityReply},
    personas:COMMUNITY_PERSONAS,
    prepareProgramTimeline
  };
};
