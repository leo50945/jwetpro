const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');

const REGION = 'us-central1';
const RESERVATION_MS = 20 * 60 * 1000;
const SMARTCUT_SYNC_URL = 'https://us-central1-smartcutservices-9ce54.cloudfunctions.net/syncJwetproTicket';
const SMARTCUT_CHECKOUT_URL = 'https://us-central1-smartcutservices-9ce54.cloudfunctions.net/createJwetproTicketPayment';
const SMARTCUT_CREDIT_USAGE_URL = 'https://us-central1-smartcutservices-9ce54.cloudfunctions.net/syncJwetproCreditUsage';

module.exports = ({ admin, db, integrationSecret }) => {
  const text = (value, max = 240) => String(value || '').trim().slice(0, max);
  const asDate = (value) => value?.toDate ? value.toDate() : value ? new Date(value) : null;
  const secretValue = () => String(integrationSecret.value() || '').trim();
  const stablePayload = (timestamp, eventId, body) => `${timestamp}.${eventId}.${JSON.stringify(body || {})}`;
  const signature = (timestamp, eventId, body) => crypto.createHmac('sha256', secretValue()).update(stablePayload(timestamp, eventId, body)).digest('hex');
  const signedHeaders = (body, eventId = crypto.randomUUID()) => {
    const timestamp = Date.now();
    return {
      'Content-Type': 'application/json',
      'X-Jwetpro-Timestamp': String(timestamp),
      'X-Jwetpro-Event-Id': eventId,
      'X-Jwetpro-Signature': signature(timestamp, eventId, body)
    };
  };
  const verifyRequest = (request, body) => {
    const timestamp = Number(request.headers['x-jwetpro-timestamp']);
    const eventId = text(request.headers['x-jwetpro-event-id'], 180);
    const supplied = text(request.headers['x-jwetpro-signature'], 180);
    if (!timestamp || !eventId || !supplied || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return { ok: false, error: 'invalid-or-expired-signature' };
    const expected = signature(timestamp, eventId, body);
    const left = Buffer.from(supplied), right = Buffer.from(expected);
    return left.length === right.length && crypto.timingSafeEqual(left, right) ? { ok: true, eventId } : { ok: false, error: 'invalid-signature' };
  };
  const settings = async () => {
    const snapshot = await db.collection('integrations').doc('smartcutTickets').get();
    return { enabled: snapshot.exists && snapshot.data()?.enabled === true };
  };
  const releaseCouponReservation = async (couponId, playerUid = '') => db.runTransaction(async transaction => {
    const couponRef=db.collection('jwetproCoupons').doc(couponId);
    const couponSnapshot=await transaction.get(couponRef);
    if(!couponSnapshot.exists)return false;
    const coupon=couponSnapshot.data()||{};
    if(playerUid&&coupon.playerUid!==playerUid)return false;
    if(coupon.status!=='reserved'||!coupon.reservedForIntentId)return false;
    const reservationRef=db.collection('championshipTicketReservations').doc(String(coupon.reservedForIntentId));
    const championshipRef=coupon.targetChampionshipId?db.collection('championships').doc(String(coupon.targetChampionshipId)):null;
    const [reservationSnapshot,championshipSnapshot]=await Promise.all([transaction.get(reservationRef),championshipRef?transaction.get(championshipRef):Promise.resolve(null)]);
    const reservation=reservationSnapshot.data()||{};
    const expired=Number(reservation.expiresAt?.toMillis?.()||0)<=Date.now();
    if(reservationSnapshot.exists&&!expired&&!['payment_error','cancelled'].includes(String(reservation.status||'')))return false;
    const registrationOpen=championshipSnapshot?.exists&&String(championshipSnapshot.data()?.status||'')==='registration-open';
    transaction.set(couponRef,{status:registrationOpen?'available':'expired',reservedForIntentId:admin.firestore.FieldValue.delete(),reservedAt:admin.firestore.FieldValue.delete(),...(registrationOpen?{}:{expiredAt:admin.firestore.FieldValue.serverTimestamp()}),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return true;
  });
  const postSigned = async (url, body, eventId) => {
    const response = await fetch(url, { method: 'POST', headers: signedHeaders(body, eventId), body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
    return payload;
  };
  const ticketPayload = (id, data = {}) => ({
    championshipId: id,
    name: text(data.name || data.title || `${data.game || 'Championnat'} #${data.number || id}`, 180),
    description: text(data.description, 1200),
    imageUrl: text(data.imageUrl || data.coverUrl || data.image, 1500),
    price: Math.max(0, Number(data.entryFee) || 0),
    currency: 'HTG',
    capacity: Math.max(0, Math.floor(Number(data.maxPlayers) || 0)),
    paidCount: Math.max(0, Math.floor(Number(data.paidRegistrationCount || data.registeredCount) || 0)),
    reservedCount: Math.max(0, Math.floor(Number(data.reservedCount) || 0)),
    registrationDeadline: asDate(data.registrationEndAt || data.registrationDeadline)?.toISOString() || '',
    championshipStartsAt: asDate(data.startAt || data.startDate)?.toISOString() || '',
    championshipEndsAt: asDate(data.endAt)?.toISOString() || '',
    jwetproUrl: `https://jwetpro.com/registration-checkout.html?id=${encodeURIComponent(id)}`,
    status: String(data.status || 'closed'),
    testMode: data.simulation === true,
    updatedAt: new Date().toISOString()
  });

  const refreshChampionshipCounts = async (championshipId) => {
    if (!championshipId) return;
    const [paid, reservations, championship] = await Promise.all([
      db.collection('championshipTicketRegistrations').where('championshipId', '==', championshipId).where('status', '==', 'paid').get(),
      db.collection('championshipTicketReservations').where('championshipId', '==', championshipId).where('status', 'in', ['reserved', 'payment_pending']).get(),
      db.collection('championships').doc(championshipId).get()
    ]);
    if (!championship.exists) return;
    const now = Date.now();
    const reservedCount = reservations.docs.filter((item) => Number(item.data()?.expiresAt?.toMillis?.() || 0) > now).length;
    const current = championship.data() || {};
    if (Number(current.paidRegistrationCount || 0) === paid.size && Number(current.reservedCount || 0) === reservedCount) return;
    await championship.ref.set({ paidRegistrationCount: paid.size, registeredCount: paid.size, reservedCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  };

  const refreshTicketCountsFromReservation = onDocumentWritten({ document: 'championshipTicketReservations/{intentId}', region: REGION }, async (event) => {
    const data = event.data?.after?.data() || event.data?.before?.data() || {};
    await refreshChampionshipCounts(String(data.championshipId || ''));
  });

  const refreshTicketCountsFromRegistration = onDocumentWritten({ document: 'championshipTicketRegistrations/{intentId}', region: REGION }, async (event) => {
    const data = event.data?.after?.data() || event.data?.before?.data() || {};
    await refreshChampionshipCounts(String(data.championshipId || ''));
  });

  const createCancellationCredits = async (championshipId) => {
    const paid = await db.collection('championshipTicketRegistrations').where('championshipId', '==', championshipId).where('status', '==', 'paid').get();
    const chunks = [];
    for (let index = 0; index < paid.docs.length; index += 200) chunks.push(paid.docs.slice(index, index + 200));
    for (const docs of chunks) {
      const batch = db.batch();
      docs.forEach((item) => {
        const data = item.data() || {};
        const creditRef = db.collection('jwetproCredits').doc(`cancelled_${item.id}`);
        batch.set(creditRef, { playerUid: data.playerUid, sourceIntentId: item.id, championshipId, amount: Number(data.amount || 0), remainingAmount: Number(data.amount || 0), status: 'available', commissionAlreadyRecorded: true, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        batch.set(item.ref, { status: 'credited', creditAmount: Number(data.amount || 0), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      });
      await batch.commit();
    }
  };

  const syncChampionshipTicketToSmartCut = onDocumentWritten({ document: 'championships/{championshipId}', region: REGION, secrets: [integrationSecret], retry: false }, async (event) => {
    const beforeStatus = String(event.data?.before?.data()?.status || '');
    const data = event.data?.after?.exists ? event.data.after.data() : { status: 'cancelled', name: event.data?.before?.data()?.name || 'Championnat supprime' };
    if (String(data.status) === 'cancelled' && beforeStatus !== 'cancelled') await createCancellationCredits(event.params.championshipId);
    if (!(await settings()).enabled && data.simulation !== true) return;
    const payload = ticketPayload(event.params.championshipId, data);
    try {
      await postSigned(SMARTCUT_SYNC_URL, payload, `ticket-sync-${event.params.championshipId}-${Date.now()}`);
    } catch (error) {
      console.error('Smart Cut ticket sync failed', { championshipId: event.params.championshipId, message: error.message });
      await db.collection('ticketIntegrationAlerts').add({ type: 'sync_failed', championshipId: event.params.championshipId, message: error.message, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  });

  const syncChampionshipTicketNow = onCall({ region: REGION, cors: true, secrets: [integrationSecret] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
    const championshipId = text(request.data?.championshipId, 150);
    const localTest = request.data?.localTest === true;
    if (!championshipId || !localTest) throw new HttpsError('invalid-argument', 'Synchronisation locale invalide.');
    const [profile, championship] = await Promise.all([
      db.collection('users').doc(request.auth.uid).get(),
      db.collection('championships').doc(championshipId).get()
    ]);
    if (request.auth.token?.admin !== true && profile.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Accès administrateur requis.');
    }
    if (!championship.exists || championship.data()?.simulation !== true) {
      throw new HttpsError('failed-precondition', 'Seules les simulations peuvent être synchronisées en mode local.');
    }
    const payload = ticketPayload(championshipId, championship.data() || {});
    await postSigned(SMARTCUT_SYNC_URL, payload, `ticket-local-resync-${championshipId}-${Date.now()}`);
    return { ok: true, championshipId, status: payload.status };
  });

  const createChampionshipRegistrationCheckout = onCall({ region: REGION, cors: true, secrets: [integrationSecret] }, async (request) => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Connectez-vous a JwetPro pour vous inscrire.');
    const championshipId = text(request.data?.championshipId, 150);
    if (!championshipId) throw new HttpsError('invalid-argument', 'Championnat invalide.');
    const requestedReturnBaseUrl = text(request.data?.returnBaseUrl, 300).replace(/\/$/, '');
    const isLocalTestReturn = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestedReturnBaseUrl);
    const returnBaseUrl = isLocalTestReturn
      ? requestedReturnBaseUrl
      : 'https://jwetpro.com';
    const championshipRef = db.collection('championships').doc(championshipId);
    const championshipPreview = await championshipRef.get();
    const isLocalSimulationTest = isLocalTestReturn &&
      championshipPreview.exists &&
      championshipPreview.data()?.simulation === true;
    const integrationSettings = await settings();
    if (!integrationSettings.enabled && !isLocalSimulationTest) {
      throw new HttpsError('unavailable', 'Les inscriptions payantes sont en preparation.');
    }
    const uid = request.auth.uid;
    const intentId = `${championshipId}__${uid}`;
    const reservationRef = db.collection('championshipTicketReservations').doc(intentId);
    const registrationRef = db.collection('championshipTicketRegistrations').doc(intentId);
    const now = Date.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now + RESERVATION_MS);
    let checkoutData;
    let championshipForSync = null;
    let paidWithCredit = false;
    let creditAllocations = [];
    let appliedCoupon = null;
    await db.runTransaction(async (transaction) => {
      const championshipSnapshot = await transaction.get(championshipRef);
      const registrationSnapshot = await transaction.get(registrationRef);
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!championshipSnapshot.exists) throw new HttpsError('not-found', 'Championnat introuvable.');
      const championship = championshipSnapshot.data() || {};
      championshipForSync = championship;
      if (String(championship.status) !== 'registration-open') throw new HttpsError('failed-precondition', 'Les inscriptions sont fermees.');
      const registrationDeadline = asDate(
        championship.registrationEndAt ||
        championship.registrationDeadline ||
        championship.registrationClosesAt ||
        championship.registrationCloseAt ||
        championship.endRegistrationAt
      );
      if (registrationDeadline && registrationDeadline.getTime() <= now) {
        throw new HttpsError('failed-precondition', 'La date limite d inscription est depassee.');
      }
      if (registrationSnapshot.exists && registrationSnapshot.data()?.status === 'paid' && ['jwetpro_credit','jwetpro_coupon'].includes(registrationSnapshot.data()?.paymentMethod)) {
        checkoutData = registrationSnapshot.data();
        creditAllocations = Array.isArray(checkoutData.creditAllocations) ? checkoutData.creditAllocations : [];
        paidWithCredit = true;
        return;
      }
      if (registrationSnapshot.exists && ['paid', 'credited'].includes(registrationSnapshot.data()?.status)) throw new HttpsError('already-exists', 'Vous possédez déjà un ticket pour ce championnat.');
      const registrations = await transaction.get(db.collection('championshipTicketRegistrations').where('championshipId', '==', championshipId).where('status', '==', 'paid'));
      const reservations = await transaction.get(db.collection('championshipTicketReservations').where('championshipId', '==', championshipId).where('status', 'in', ['reserved', 'payment_pending']));
      const activeReservations = reservations.docs.filter((item) => item.id === intentId || Number(item.data()?.expiresAt?.toMillis?.() || 0) > now);
      const capacity = Math.max(0, Number(championship.maxPlayers) || 0);
      if (capacity && registrations.size + activeReservations.filter((item) => item.id !== intentId).length >= capacity) throw new HttpsError('resource-exhausted', 'Le championnat est complet.');
      const profileSnapshot = await transaction.get(db.collection('users').doc(uid));
      const profile = profileSnapshot.data() || {};
      const amount = Math.max(0, Number(championship.entryFee) || 0);
      const coupons = await transaction.get(db.collection('jwetproCoupons').where('playerUid','==',uid).where('status','in',['pending','available','reserved']));
      const couponDocument=[...coupons.docs].sort((left,right)=>Number(left.data()?.createdAt?.toMillis?.()||0)-Number(right.data()?.createdAt?.toMillis?.()||0)).find(item=>{
        const coupon=item.data()||{};
        return (!coupon.targetChampionshipId||coupon.targetChampionshipId===championshipId)&&(coupon.status!=='reserved'||coupon.reservedForIntentId===intentId);
      });
      const coupon=couponDocument?.data()||null;
      const discountAmount=coupon?Math.min(amount,coupon.type==='free_entry'?amount:Math.max(0,Number(coupon.value)||0)):0;
      const amountDue=Math.max(0,amount-discountAmount);
      if(couponDocument) appliedCoupon={id:couponDocument.id,type:String(coupon.type||'fixed_discount'),discountAmount};
      checkoutData = { intentId, reservationId: intentId, championshipId, championshipName: championship.name || championship.title || `${championship.game || 'Championnat'} #${championship.number || championshipId}`, playerUid: uid, playerEmail: request.auth.token.email || profile.email || '', playerName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username || request.auth.token.email || 'Joueur', amount:amountDue, ticketPrice:amount, grossAmount:amount, discountAmount, couponId:couponDocument?.id||'', currency: 'HTG', returnBaseUrl };
      // Firestore transactions require every read to happen before the first write.
      // In particular, a coupon checkout must load credits before reserving the coupon.
      const credits = await transaction.get(db.collection('jwetproCredits').where('playerUid', '==', uid).where('status', '==', 'available'));
      const availableCredits = credits.docs.filter((item) => Number(item.data()?.remainingAmount || 0) > 0);
      const creditTotal = availableCredits.reduce((sum, item) => sum + Number(item.data()?.remainingAmount || 0), 0);
      if(couponDocument) transaction.set(couponDocument.ref,{targetChampionshipId:championshipId,targetChampionshipName:championship.name||championship.title||`${championship.game||'Championnat'} #${championship.number||championshipId}`,status:'reserved',reservedForIntentId:intentId,reservedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      if (amountDue === 0 || (amountDue > 0 && creditTotal >= amountDue)) {
        let remaining = amountDue;
        availableCredits.forEach((credit) => {
          if (remaining <= 0) return;
          const current = Number(credit.data()?.remainingAmount || 0);
          const used = Math.min(current, remaining);
          const next = current - used;
          if (used > 0) creditAllocations.push({ sourceIntentId: String(credit.data()?.sourceIntentId || credit.id.replace(/^cancelled_/, '').replace(/^late_/, '')), amount: used });
          transaction.set(credit.ref, { remainingAmount: next, status: next > 0 ? 'available' : 'used', usedForChampionshipId: championshipId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          remaining -= used;
        });
        transaction.set(registrationRef, { ...checkoutData, status: 'paid', paymentMethod: amountDue===0?'jwetpro_coupon':'jwetpro_credit', creditApplied: amountDue, creditAllocations, paidAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        if(couponDocument) transaction.set(couponDocument.ref,{status:'used',usedForChampionshipId:championshipId,usedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        transaction.set(championshipRef, { paidRegistrationCount: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        paidWithCredit = true;
        return;
      }
      transaction.set(reservationRef, { ...checkoutData, status: 'reserved', expiresAt, createdAt: reservationSnapshot.exists ? reservationSnapshot.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    if (!integrationSettings.enabled && isLocalSimulationTest) {
      try {
        await postSigned(SMARTCUT_SYNC_URL, ticketPayload(championshipId, championshipForSync || {}), `ticket-local-sync-${championshipId}-${Date.now()}`);
      } catch (error) {
        throw new HttpsError('unavailable', error.message || 'Synchronisation locale du ticket impossible.');
      }
    }
    if (paidWithCredit) {
      let syncPending = false;
      try {
        await postSigned(SMARTCUT_CREDIT_USAGE_URL, { targetIntentId: intentId, targetChampionshipId: championshipId, playerUid: uid, allocations: creditAllocations }, `ticket-credit-${intentId}`);
      } catch (error) {
        syncPending = true;
        await db.collection('ticketIntegrationAlerts').add({ type: 'credit_sync_failed', championshipId, intentId, message: text(error.message, 500), createdAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      return { intentId, paidWithCredit: true, coupon:appliedCoupon,amount:Number(checkoutData?.amount)||0,ticketPrice:Number(checkoutData?.ticketPrice)||0,discountAmount:Number(checkoutData?.discountAmount)||0,syncPending, returnUrl: `${returnBaseUrl}/registration-return.html?intent=${encodeURIComponent(intentId)}` };
    }
    try {
      const smartCut = await postSigned(SMARTCUT_CHECKOUT_URL, checkoutData, `ticket-checkout-${intentId}-${Date.now()}`);
      await reservationRef.set({ smartCutSessionId: smartCut.sessionId || '', checkoutUrl: smartCut.checkoutUrl || '', status: 'payment_pending', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { intentId, checkoutUrl: smartCut.checkoutUrl, coupon:appliedCoupon,amount:Number(checkoutData?.amount)||0,ticketPrice:Number(checkoutData?.ticketPrice)||0,discountAmount:Number(checkoutData?.discountAmount)||0,expiresAt: expiresAt.toDate().toISOString() };
    } catch (error) {
      console.error('Smart Cut checkout failed', {
        championshipId,
        intentId,
        playerUid: uid,
        code: text(error?.code, 120),
        message: text(error?.message, 500)
      });
      await reservationRef.set({ status: 'payment_error', errorMessage: text(error.message, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      if(appliedCoupon?.id) await releaseCouponReservation(appliedCoupon.id,uid).catch(releaseError=>console.error('Coupon release failed',{intentId,message:releaseError.message}));
      throw new HttpsError('unavailable', error.message || 'Paiement indisponible.');
    }
  });

  const getChampionshipRegistrationStatus = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
    const intentId = text(request.data?.intentId, 320);
    if (!intentId) throw new HttpsError('invalid-argument', 'Reference invalide.');
    const [registration, reservation] = await Promise.all([db.collection('championshipTicketRegistrations').doc(intentId).get(), db.collection('championshipTicketReservations').doc(intentId).get()]);
    const data = registration.exists ? registration.data() : reservation.data();
    if (!data || data.playerUid !== request.auth.uid) throw new HttpsError('permission-denied', 'Acces refuse.');
    return { intentId, status: data.status || 'pending', championshipId: data.championshipId || '', creditAmount: Number(data.creditAmount || 0), updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || '' };
  });

  const manageSmartCutTicketIntegration = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
    const profile = await db.collection('users').doc(request.auth.uid).get();
    if (request.auth.token?.admin !== true && profile.data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Accès administrateur requis.');
    const enabled = request.data?.enabled === true;
    await db.collection('integrations').doc('smartcutTickets').set({ enabled, updatedBy: request.auth.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { enabled };
  });

  const releaseExpiredCouponReservations = onCall({region:REGION,cors:true},async request=>{
    if(!request.auth||request.auth.token?.firebase?.sign_in_provider==='anonymous') throw new HttpsError('unauthenticated','Connexion requise.');
    const coupons=await db.collection('jwetproCoupons').where('playerUid','==',request.auth.uid).where('status','==','reserved').get();
    let released=0;
    for(const coupon of coupons.docs) if(await releaseCouponReservation(coupon.id,request.auth.uid)) released+=1;
    return {released};
  });

  const confirmChampionshipTicketPayment = onRequest({ region: REGION, secrets: [integrationSecret] }, async (request, response) => {
    if (request.method !== 'POST') return response.status(405).json({ ok: false, error: 'method-not-allowed' });
    const body = request.body || {};
    const verification = verifyRequest(request, body);
    if (!verification.ok) return response.status(401).json({ ok: false, error: verification.error });
    const intentId = text(body.intentId, 320);
    const eventRef = db.collection('jwetproTicketEvents').doc(verification.eventId);
    const reservationRef = db.collection('championshipTicketReservations').doc(intentId);
    const registrationRef = db.collection('championshipTicketRegistrations').doc(intentId);
    const creditRef = db.collection('jwetproCredits').doc(`late_${intentId}`);
    let result = { status: 'paid' };
    await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (eventSnapshot.exists) { result = eventSnapshot.data()?.result || result; return; }
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists) throw new Error('reservation-not-found');
      const reservation = reservationSnapshot.data() || {};
      const championshipRef = db.collection('championships').doc(reservation.championshipId);
      const championshipSnapshot = await transaction.get(championshipRef);
      const championship = championshipSnapshot.data() || {};
      const existing = await transaction.get(registrationRef);
      if (existing.exists && ['paid', 'credited'].includes(existing.data()?.status)) { result = { status: existing.data().status }; transaction.set(eventRef, { result, processedAt: admin.firestore.FieldValue.serverTimestamp() }); return; }
      const couponRef=reservation.couponId?db.collection('jwetproCoupons').doc(String(reservation.couponId)):null;
      const couponSnapshot=couponRef?await transaction.get(couponRef):null;
      const paid = await transaction.get(db.collection('championshipTicketRegistrations').where('championshipId', '==', reservation.championshipId).where('status', '==', 'paid'));
      const capacity = Math.max(0, Number(championship.maxPlayers) || 0);
      const canRegister = String(championship.status) === 'registration-open' && (!capacity || paid.size < capacity);
      const base = { ...reservation, smartCutOrderId: body.smartCutOrderId || '', transactionId: body.transactionId || '', amount: Number(body.amount || reservation.amount || 0), paidAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (canRegister) {
        transaction.set(registrationRef, { ...base, status: 'paid' }, { merge: true });
        transaction.set(reservationRef, { status: 'paid', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        if(couponRef&&couponSnapshot?.exists&&couponSnapshot.data()?.reservedForIntentId===intentId) transaction.set(couponRef,{status:'used',usedForChampionshipId:reservation.championshipId,usedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        transaction.set(championshipRef, { paidRegistrationCount: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        result = { status: 'paid' };
      } else {
        transaction.set(registrationRef, { ...base, status: 'credited', creditAmount: base.amount }, { merge: true });
        transaction.set(creditRef, { playerUid: reservation.playerUid, sourceIntentId: intentId, championshipId: reservation.championshipId, amount: base.amount, remainingAmount: base.amount, status: 'available', commissionAlreadyRecorded: true, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(reservationRef, { status: 'credited', creditAmount: base.amount, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        if(couponRef&&couponSnapshot?.exists&&couponSnapshot.data()?.reservedForIntentId===intentId) transaction.set(couponRef,{status:'expired',expiredAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        result = { status: 'credited', creditAmount: base.amount };
      }
      transaction.set(eventRef, { result, processedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    return response.status(200).json({ ok: true, ...result });
  });

  return { syncChampionshipTicketToSmartCut, syncChampionshipTicketNow, refreshTicketCountsFromReservation, refreshTicketCountsFromRegistration, createChampionshipRegistrationCheckout, getChampionshipRegistrationStatus, releaseExpiredCouponReservations, manageSmartCutTicketIntegration, confirmChampionshipTicketPayment };
};
