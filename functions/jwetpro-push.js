const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const crypto = require('crypto');

const REGION = 'us-central1';
const MAX_BROADCAST_USERS = 500;

module.exports = ({admin, db, webPushPrivateKey, webPushPublicKey}) => {
  const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
  const validSubscription = value => {
    if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) return false;
    try { if (new URL(value.endpoint).protocol !== 'https:') return false; } catch { return false; }
    return typeof value.keys?.p256dh === 'string' && value.keys.p256dh.length >= 20
      && typeof value.keys?.auth === 'string' && value.keys.auth.length >= 10;
  };
  const safeId = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150) || 'item';
  const tokenId = token => crypto.createHash('sha256').update(token).digest('hex').slice(0, 40);
  const toDate = value => value?.toDate ? value.toDate() : value ? new Date(value) : null;
  const preferenceAllows = (profile, type) => {
    const prefs = profile?.notificationPreferences || {};
    if (/^(championship-open|championship-closed)$/.test(type)) return prefs.championships !== false;
    if (/^(match-start-5m|championship-start-5m)$/.test(type)) return prefs.matchReminders !== false;
    if (/^(championship-winner|coupon-won)$/.test(type)) return prefs.results !== false;
    if (/^(new-follower|follow-back|direct-message|match-like)$/.test(type)) return prefs.social !== false;
    return true;
  };
  const notificationUrl = data => {
    const type = String(data.type || '');
    if (type === 'match-start-5m') return `/play.html?join=${encodeURIComponent(data.matchId || '')}`;
    if (type === 'championship-start-5m') return `/progress.html?id=${encodeURIComponent(data.championshipId || '')}`;
    if (type === 'championship-open') return `/registration-checkout.html?id=${encodeURIComponent(data.championshipId || '')}`;
    if (type === 'championship-closed') return `/progress.html?id=${encodeURIComponent(data.championshipId || '')}`;
    if (type === 'championship-winner') return `/championship.html?id=${encodeURIComponent(data.championshipId || '')}`;
    if (type === 'coupon-won') return '/index.html#profile';
    if (type === 'direct-message' && data.conversationId) return `/community.html?conversation=${encodeURIComponent(data.conversationId)}`;
    if ((type === 'new-follower' || type === 'follow-back') && data.actorSocialId) return `/player.html?id=${encodeURIComponent(data.actorSocialId)}`;
    if (type === 'match-like' && data.matchId) return `/play.html?replay=${encodeURIComponent(data.matchId)}`;
    return '/';
  };

  const notifyUser = async (uid, payload) => {
    if (!uid || !payload?.type) return false;
    const profile = await db.collection('users').doc(uid).get();
    if (!profile.exists || !preferenceAllows(profile.data(), payload.type)) return false;
    const id = safeId(payload.id || `${payload.type}_${payload.championshipId || payload.matchId || payload.couponId || Date.now()}`);
    await db.collection('users').doc(uid).collection('notifications').doc(id).set({
      type:payload.type,
      title:String(payload.title || 'Notification JWETPRO').slice(0, 140),
      body:String(payload.body || '').slice(0, 280),
      championshipId:payload.championshipId || '',
      matchId:payload.matchId || '',
      couponId:payload.couponId || '',
      actorSocialId:payload.actorSocialId || '',
      actorDisplayName:payload.actorDisplayName || '',
      conversationId:payload.conversationId || '',
      read:false,
      pushEventId:payload.pushEventId || `${payload.type}_${Date.now()}`,
      createdAt:timestamp(),
      updatedAt:timestamp()
    }, {merge:true});
    return true;
  };

  const participantUids = data => {
    const values = [
      data.participantIds,
      data.registeredPlayerIds,
      data.playerIds,
      data.userIds,
      data.participants,
      data.registeredPlayers,
      data.registrations,
      data.players
    ];
    const ids = new Set();
    values.forEach(value => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (typeof item === 'string') ids.add(item);
          else if (item && typeof item === 'object') {
            [item.uid, item.userId, item.playerUid, item.id].filter(Boolean).forEach(id => ids.add(String(id)));
          }
        });
      } else if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, item]) => {
          if (/^[A-Za-z0-9_-]{10,150}$/.test(key)) ids.add(key);
          if (item && typeof item === 'object') [item.uid, item.userId, item.playerUid, item.id].filter(Boolean).forEach(id => ids.add(String(id)));
          else if (typeof item === 'string') ids.add(item);
        });
      }
    });
    return [...ids].filter(id => /^[A-Za-z0-9_-]{10,150}$/.test(id));
  };

  const paidRegistrationUids = async championshipId => {
    if (!championshipId) return [];
    try {
      const statuses = ['paid','confirmed','completed','valid','active'];
      const snapshot = await db.collection('championshipTicketRegistrations')
        .where('championshipId','==',championshipId)
        .where('status','in',statuses)
        .limit(200)
        .get();
      return snapshot.docs.map(doc => String(doc.data()?.playerUid || doc.data()?.uid || doc.data()?.userId || '')).filter(uid => /^[A-Za-z0-9_-]{10,150}$/.test(uid));
    } catch (error) {
      console.warn('Championship registration reminder lookup failed:', error);
      return [];
    }
  };

  const broadcast = async payload => {
    const users = await db.collection('users').limit(MAX_BROADCAST_USERS).get();
    const writes = [];
    users.docs.forEach(document => {
      if (!preferenceAllows(document.data(), payload.type)) return;
      const id = safeId(`${payload.type}_${payload.championshipId || payload.matchId || payload.couponId || 'global'}_${document.id}`);
      writes.push({
        ref:document.ref.collection('notifications').doc(id),
        data:{
          type:payload.type,
          title:String(payload.title || 'Notification JWETPRO').slice(0, 140),
          body:String(payload.body || '').slice(0, 280),
          championshipId:payload.championshipId || '',
          matchId:payload.matchId || '',
          couponId:payload.couponId || '',
          read:false,
          pushEventId:payload.pushEventId || `${payload.type}_${payload.championshipId || payload.matchId || payload.couponId || 'global'}_${Date.now()}`,
          createdAt:timestamp(),
          updatedAt:timestamp()
        }
      });
    });
    for (let index = 0; index < writes.length; index += 450) {
      const batch = db.batch();
      writes.slice(index, index + 450).forEach(item => batch.set(item.ref, item.data, {merge:true}));
      await batch.commit();
    }
    return writes.length;
  };

  const registerWebPushSubscription = onCall({region:REGION, cors:true}, async request => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'A player account is required.');
    const subscription = request.data?.subscription;
    if (!validSubscription(subscription)) throw new HttpsError('invalid-argument', 'A valid web push subscription is required.');
    const id = tokenId(subscription.endpoint);
    await db.collection('users').doc(request.auth.uid).collection('pushTokens').doc(id).set({
      subscription,
      endpointHash:id,
      platform:String(request.data?.platform || '').slice(0, 80),
      userAgent:String(request.data?.userAgent || '').slice(0, 260),
      standalone:request.data?.standalone === true,
      disabled:false,
      createdAt:timestamp(),
      updatedAt:timestamp()
    }, {merge:true});
    return {registered:true, endpointHash:id};
  });

  const deactivateWebPushSubscription = onCall({region:REGION, cors:true}, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const endpoint = String(request.data?.endpoint || '').trim();
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 2048) throw new HttpsError('invalid-argument', 'A valid web push endpoint is required.');
    await db.collection('users').doc(request.auth.uid).collection('pushTokens').doc(tokenId(endpoint)).set({disabled:true, updatedAt:timestamp()}, {merge:true});
    return {disabled:true};
  });

  const pushInternalNotification = onDocumentWritten({document:'users/{userId}/notifications/{notificationId}',region:REGION,retry:false,secrets:[webPushPrivateKey]}, async event => {
    const uid = event.params.userId;
    const before = event.data?.before?.data() || null;
    const afterSnapshot = event.data?.after;
    if (!afterSnapshot?.exists) return;
    const data = afterSnapshot.data() || {};
    if (before && (!data.pushEventId || data.pushEventId === before.pushEventId)) return;
    if (data.read === true) return;
    const profile = await db.collection('users').doc(uid).get();
    if (!profile.exists || !preferenceAllows(profile.data(), data.type)) return;
    const tokens = await db.collection('users').doc(uid).collection('pushTokens').get();
    const active = tokens.docs.map(doc => ({id:doc.id, ref:doc.ref, ...doc.data()})).filter(item => item.disabled !== true && validSubscription(item.subscription));
    if (!active.length) return;
    const webPush = require('web-push');
    webPush.setVapidDetails('https://jwetpro.com', webPushPublicKey.value(), webPushPrivateKey.value());
    const message = JSON.stringify({
      title:String(data.title || 'JWETPRO').slice(0, 120),
      body:String(data.body || '').slice(0, 240),
      type:String(data.type || ''),
      url:notificationUrl(data),
      notificationId:event.params.notificationId,
      tag:event.params.notificationId
    });
    const outcomes = await Promise.allSettled(active.map(item => webPush.sendNotification(item.subscription, message, {TTL:60 * 60})));
    const batch = db.batch();
    outcomes.forEach((outcome, index) => {
      const status = outcome.status === 'rejected' ? Number(outcome.reason?.statusCode) : 0;
      if (status === 404 || status === 410) batch.set(active[index].ref, {disabled:true, updatedAt:timestamp()}, {merge:true});
    });
    await batch.commit();
  });

  const notifyChampionshipLifecycle = onDocumentWritten({document:'championships/{championshipId}',region:REGION,retry:false}, async event => {
    const before = event.data?.before?.data() || null;
    const after = event.data?.after?.data() || null;
    if (!after) return;
    const championshipId = event.params.championshipId;
    const beforeStatus = String(before?.status || '').toLowerCase();
    const afterStatus = String(after.status || '').toLowerCase();
    const game = String(after.game || 'Championnat').toUpperCase();
    const number = after.number || after.matchNumber || championshipId;
    if (afterStatus !== beforeStatus && ['registration-open','open'].includes(afterStatus)) {
      await broadcast({type:'championship-open', championshipId, title:'Nouveau championnat ouvert', body:`${game} #${number} est ouvert à l’inscription.`});
    }
    if (afterStatus !== beforeStatus && ['registration-closed','closed'].includes(afterStatus)) {
      await broadcast({type:'championship-closed', championshipId, title:'Inscriptions terminées', body:`${game} #${number} est fermé. Le tableau va commencer.`});
    }
    if (afterStatus !== beforeStatus && ['completed','finished','ended'].includes(afterStatus)) {
      const winnerName = after.winnerName || after.championName || after.winner?.name || after.champion?.name || 'Un champion';
      await broadcast({type:'championship-winner', championshipId, title:'Championnat terminé', body:`${winnerName} remporte ${game} #${number}.`});
    }
  });

  const notifyCouponCreated = onDocumentCreated({document:'jwetproCoupons/{couponId}',region:REGION,retry:false}, async event => {
    const data = event.data?.data() || {};
    const uid = String(data.playerUid || '');
    if (!uid) return;
    await notifyUser(uid, {
      type:'coupon-won',
      id:`coupon_${event.params.couponId}`,
      couponId:event.params.couponId,
      title:'Coupon JWETPRO gagné',
      body:`Tu as reçu un coupon ${data.value ? `${data.value} ${data.currency || 'HTG'}` : 'JWETPRO'} pour une prochaine participation.`
    });
  });

  const sendMatchStartReminders = onSchedule({region:REGION,schedule:'every 1 minutes',timeoutSeconds:60}, async () => {
    const now = Date.now();
    const future = now + 5 * 60 * 1000;
    const statuses = ['scheduled','preview','waiting-opponent','upcoming','published','ready','assigned'];
    let sent = 0;
    for (const status of statuses) {
      const snapshot = await db.collection('matches').where('status','==',status).limit(200).get();
      for (const document of snapshot.docs) {
        const data = document.data() || {};
        if (data.notificationFlags?.matchStart5mSent === true) continue;
        const start = toDate(data.startAt || data.scheduledAt || data.date);
        if (!start || start.getTime() < now || start.getTime() > future) continue;
        const participants = Array.isArray(data.participantIds) ? data.participantIds.filter(Boolean) : [];
        await Promise.all(participants.map(uid => notifyUser(uid, {
          type:'match-start-5m',
          id:`match_start_5m_${document.id}_${uid}`,
          matchId:document.id,
          championshipId:data.championshipId || '',
          title:'Ton match commence bientôt',
          body:'Tu as 5 minutes pour rejoindre ton match JWETPRO.'
        })));
        await document.ref.set({notificationFlags:{...(data.notificationFlags || {}), matchStart5mSent:true}, updatedAt:timestamp()}, {merge:true});
        sent += participants.length;
      }
    }
    return {sent};
  });

  const sendChampionshipStartReminders = onSchedule({region:REGION,schedule:'every 1 minutes',timeoutSeconds:60}, async () => {
    const now = Date.now();
    const future = now + 5 * 60 * 1000;
    const statuses = ['registration-closed','closed','scheduled','upcoming','registration-open','open'];
    let sent = 0;
    for (const status of statuses) {
      const snapshot = await db.collection('championships').where('status','==',status).limit(100).get();
      for (const document of snapshot.docs) {
        const data = document.data() || {};
        if (data.notificationFlags?.championshipStart5mSent === true) continue;
        const start = toDate(data.startAt || data.scheduledAt || data.date);
        if (!start || start.getTime() < now || start.getTime() > future) continue;
        const directParticipants = participantUids(data);
        const ticketParticipants = await paidRegistrationUids(document.id);
        const recipients = [...new Set([...directParticipants, ...ticketParticipants])];
        await Promise.all(recipients.map(uid => notifyUser(uid, {
          type:'championship-start-5m',
          id:`championship_start_5m_${document.id}_${uid}`,
          championshipId:document.id,
          title:'Ton championnat commence bientôt',
          body:'JWETPRO démarre dans environ 5 minutes. Prépare-toi à rejoindre ton match.'
        })));
        await document.ref.set({notificationFlags:{...(data.notificationFlags || {}), championshipStart5mSent:true}, updatedAt:timestamp()}, {merge:true});
        sent += recipients.length;
      }
    }
    return {sent};
  });

  return {
    registerWebPushSubscription,
    deactivateWebPushSubscription,
    pushInternalNotification,
    notifyChampionshipLifecycle,
    notifyCouponCreated,
    sendMatchStartReminders,
    sendChampionshipStartReminders
  };
};
