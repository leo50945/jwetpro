const crypto = require('crypto');
const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const {entityStatsId, entityDestination, publicEntityStatus, matchIsChildRound} = require('./social-core');

const REGION = 'us-central1';
// Keep links operational until the branded custom domain is attached in Firebase Hosting.
// Replace this origin with https://share.jwetpro.com after its DNS validation succeeds.
const SHARE_ORIGIN = 'https://jwetpro-share.web.app';
const SITE_ORIGIN = 'https://jwetpro.com';
const LEVELS = [
  {name:'Débutant',min:0},
  {name:'Intermédiaire',min:50},
  {name:'Confirmé',min:150},
  {name:'Expert',min:300},
  {name:'Élite',min:600}
];

module.exports = ({admin,db}) => {
  const clean = (value,max=180) => String(value || '').trim().slice(0,max);
  const safeImage = value => {
    const image = clean(value,800);
    return /^https:\/\/firebasestorage\.googleapis\.com\//i.test(image) ? image : '';
  };
  const levelForPoints = value => {
    const points = Math.max(0,Number(value) || 0);
    return [...LEVELS].reverse().find(level => points >= level.min) || LEVELS[0];
  };
  const requirePlayer = request => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated','Connectez-vous à JWETPRO pour partager.');
    }
    return request.auth.uid;
  };
  const shareIdFor = (...parts) => crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0,28);
  const shareUrlFor = shareId => `${SHARE_ORIGIN}/s/${shareId}`;
  const referralUrlFor = shareId => `${SITE_ORIGIN}/?ref=${encodeURIComponent(shareId)}#signup`;
  const profileSnapshot = async uid => {
    const [profileDoc,leaderboardDoc] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('leaderboard').doc(uid).get()
    ]);
    if (!profileDoc.exists) throw new HttpsError('not-found','Profil JWETPRO introuvable.');
    const profile = profileDoc.data() || {};
    const leaderboard = leaderboardDoc.data() || {};
    const isPublic = profile.profilePublic === true;
    const publicName = isPublic
      ? clean(`${profile.firstName || ''} ${profile.lastName || ''}`) || clean(profile.username || leaderboard.displayName) || 'Joueur JWETPRO'
      : 'Un joueur JWETPRO';
    const points = Math.max(0,Number(leaderboard.points ?? profile.points ?? profile.totalPoints ?? profile.score) || 0);
    const level = levelForPoints(points).name;
    return {profile,leaderboard,isPublic,publicName,points,level,avatarUrl:isPublic ? safeImage(profile.photoURL || leaderboard.photoURL) : ''};
  };
  const championshipSnapshot = async championshipId => {
    const document = await db.collection('championships').doc(championshipId).get();
    if (!document.exists) throw new HttpsError('not-found','Championnat introuvable.');
    const data = document.data() || {};
    return {id:document.id,data,name:clean(data.name || data.title || `${data.game === 'domino' ? 'Domino' : 'Mopyon'} #${data.number || document.id}`),game:clean(data.game || data.type || 'mopyon',40)};
  };
  const matchSnapshot = async (uid,matchId) => {
    const document = await db.collection('matches').doc(matchId).get();
    if (!document.exists) throw new HttpsError('not-found','Match introuvable.');
    const data = document.data() || {};
    const participantIds = Array.isArray(data.participantIds) ? data.participantIds : [];
    if (!participantIds.includes(uid)) throw new HttpsError('permission-denied','Ce match ne vous appartient pas.');
    const status = clean(data.status || data.state,40).toLowerCase();
    const winnerId = clean(data.winnerUid || data.winnerId,150);
    if (!['completed','finished','ended','termine','terminé'].includes(status) || winnerId !== uid) {
      throw new HttpsError('failed-precondition','Seule une victoire officielle terminée peut être partagée.');
    }
    return {id:document.id,data};
  };
  const qualificationFromStage = value => {
    const stage = clean(value,80).toLowerCase();
    if (/16e|sixteenth|round.?of.?32/.test(stage)) return 'huitièmes de finale';
    if (/8e|eighth|round.?of.?16/.test(stage)) return 'quarts de finale';
    if (/quart|quarter/.test(stage)) return 'demi-finales';
    if (/demi|semi/.test(stage)) return 'finale';
    if (/final/.test(stage)) return 'champion';
    return '';
  };
  const eventPayload = async (uid,type,input) => {
    const player = await profileSnapshot(uid);
    const base = {ownerUid:uid,publicName:player.publicName,profilePublic:player.isPublic,avatarUrl:player.avatarUrl,points:player.points,level:player.level,type};
    if (type === 'profile') {
      if (!player.isPublic) throw new HttpsError('failed-precondition','Activez votre profil public avant de le partager.');
      return {...base,sourceId:uid,milestone:`${player.level}-${player.points}`,title:`Profil de ${player.publicName}`,description:`${player.publicName} joue sur JWETPRO · ${player.level} · ${player.points.toLocaleString('fr-FR')} points.`,shareText:`Découvre mon profil JWETPRO : niveau ${player.level}, ${player.points.toLocaleString('fr-FR')} points. Rejoins-moi !`};
    }
    if (type === 'level') {
      return {...base,sourceId:`level-${player.level}`,milestone:player.level,title:`Niveau ${player.level} atteint`,description:`${player.publicName} a atteint le niveau ${player.level} avec ${player.points.toLocaleString('fr-FR')} points sur JWETPRO.`,shareText:`Je viens d’atteindre le niveau ${player.level} avec ${player.points.toLocaleString('fr-FR')} points sur JWETPRO. Rejoins-moi !`};
    }
    if (type === 'invite') {
      return {...base,sourceId:'invite',milestone:'invite',title:'Rejoins-moi sur JWETPRO',description:`${player.publicName} vous invite à découvrir les championnats de Mopyon et Domino sur JWETPRO.`,shareText:'Viens jouer au Mopyon et au Domino avec moi sur JWETPRO !'};
    }
    if (type === 'welcome') {
      return {...base,sourceId:'welcome',milestone:'account-created',title:'Je rejoins JWETPRO',description:`${player.publicName} vient de rejoindre la communauté JWETPRO.`,shareText:'Je viens de rejoindre JWETPRO pour jouer au Mopyon et au Domino. Rejoins-moi !'};
    }
    if (type === 'followers') {
      if (!player.isPublic) throw new HttpsError('failed-precondition','Activez votre profil public avant de partager vos abonnés.');
      const socialProfile = await db.collection('socialProfiles').doc(uid).get();
      const followerCount = Math.max(0,Number(socialProfile.data()?.followerCount) || 0);
      return {...base,sourceId:`followers-${followerCount}`,milestone:String(followerCount),followerCount,title:`${followerCount.toLocaleString('fr-FR')} abonnés sur JWETPRO`,description:`${player.publicName} rassemble maintenant ${followerCount.toLocaleString('fr-FR')} abonnés sur JWETPRO.`,shareText:`Nous sommes maintenant ${followerCount.toLocaleString('fr-FR')} sur mon profil JWETPRO. Merci pour votre soutien !`};
    }
    if (type === 'registration') {
      const championshipId = clean(input.championshipId,150);
      if (!championshipId) throw new HttpsError('invalid-argument','Identifiant du championnat requis.');
      const registrationId = `${championshipId}__${uid}`;
      const [registration,championship] = await Promise.all([
        db.collection('championshipTicketRegistrations').doc(registrationId).get(),
        championshipSnapshot(championshipId)
      ]);
      if (!registration.exists || registration.data()?.playerUid !== uid || registration.data()?.status !== 'paid') {
        throw new HttpsError('failed-precondition','L’inscription doit être confirmée avant le partage.');
      }
      return {...base,sourceId:registrationId,milestone:'registered',championshipId,game:championship.game,championshipName:championship.name,title:'Inscription confirmée',description:`${player.publicName} participe au championnat ${championship.name} sur JWETPRO.`,shareText:`Je participe au championnat ${championship.name} sur JWETPRO. Rejoins-moi !`};
    }
    if (type === 'result' || type === 'qualification') {
      const matchId = clean(input.matchId,150);
      if (!matchId) throw new HttpsError('invalid-argument','Identifiant du match requis.');
      const match = await matchSnapshot(uid,matchId);
      const championshipId = clean(match.data.championshipId || match.data.tournamentId || match.data.competitionId,150);
      const championship = championshipId ? await championshipSnapshot(championshipId) : null;
      const stage = match.data.stage || match.data.round || match.data.roundLabel || match.data.phase;
      const qualification = qualificationFromStage(stage);
      const isQualification = type === 'qualification' && qualification;
      const title = isQualification ? (qualification === 'champion' ? 'Champion JWETPRO' : `Qualifié pour les ${qualification}`) : 'Victoire officielle';
      const description = isQualification
        ? `${player.publicName} est ${qualification === 'champion' ? 'champion' : `qualifié pour les ${qualification}`} sur JWETPRO.`
        : `${player.publicName} vient de remporter un match officiel sur JWETPRO.`;
      return {...base,sourceId:match.id,milestone:isQualification ? qualification : 'victory',matchId:match.id,championshipId,game:clean(match.data.game || match.data.type || championship?.game,40),championshipName:championship?.name || '',title,description,shareText:`${title} sur JWETPRO ! Rejoins-moi pour jouer au Mopyon et au Domino.`};
    }
    throw new HttpsError('invalid-argument','Type de partage non pris en charge.');
  };

  const createShareEvent = onCall({region:REGION,cors:true},async request => {
    const uid = requirePlayer(request);
    const type = clean(request.data?.type,40).toLowerCase();
    if (!['profile','level','invite','welcome','followers','registration','result','qualification'].includes(type)) throw new HttpsError('invalid-argument','Type de partage invalide.');
    const payload = await eventPayload(uid,type,request.data || {});
    const shareId = shareIdFor(uid,type,payload.sourceId,payload.milestone);
    const reference = db.collection('shareEvents').doc(shareId);
    const existing = await reference.get();
    if (!existing.exists) {
      await reference.create({...payload,shareId,visibility:'public',createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    }
    return {shareId,url:shareUrlFor(shareId),text:payload.shareText,title:payload.title};
  });

  const recordShareReferral = onCall({region:REGION,cors:true},async request => {
    const uid = requirePlayer(request);
    const shareId = clean(request.data?.shareId,80);
    if (!/^[a-f0-9]{28}$/.test(shareId)) throw new HttpsError('invalid-argument','Lien d’invitation invalide.');
    const share = await db.collection('shareEvents').doc(shareId).get();
    if (!share.exists || share.data()?.visibility !== 'public') throw new HttpsError('not-found','Invitation introuvable.');
    if (share.data()?.ownerUid === uid) return {recorded:false,reason:'self-referral'};
    const reference = db.collection('shareReferrals').doc(uid);
    if ((await reference.get()).exists) return {recorded:false,reason:'already-recorded'};
    await reference.create({referredUid:uid,referrerUid:share.data().ownerUid,shareId,shareType:share.data().type || '',createdAt:admin.firestore.FieldValue.serverTimestamp()});
    return {recorded:true};
  });

  const renderSharePage = onRequest({region:REGION,invoker:'public'},async (request,response) => {
    const pathParts = String(request.path || '').split('/').filter(Boolean);
    const entityCode = pathParts.length >= 3 && pathParts[0] === 's' ? pathParts[1] : '';
    const rawId = clean(request.query.id || pathParts.at(-1),150);
    let data;
    let shareUrl;
    let destinationUrl;
    let ctaLabel = 'Rejoindre JWETPRO';
    let eyebrow = 'ACCOMPLISSEMENT JWETPRO';
    let statMarkup = '';
    if (entityCode === 'c' || entityCode === 'm') {
      if (!/^[A-Za-z0-9_-]{1,150}$/.test(rawId)) return response.status(404).send('Partage introuvable.');
      const kind = entityCode === 'c' ? 'championship' : 'match';
      let document = await db.collection(kind === 'championship' ? 'championships' : 'matches').doc(rawId).get();
      if (!document.exists) return response.status(404).send('Partage introuvable.');
      let record = document.data() || {};
      const requestedChildRound = kind === 'match' && matchIsChildRound(record);
      if (kind === 'match' && record.kind !== 'series') {
        const parentId = clean(record.seriesId || record.parentSeriesId || record.matchSeriesId,150);
        if (parentId && /^[A-Za-z0-9_-]{1,150}$/.test(parentId)) {
          const parent = await db.collection('matches').doc(parentId).get();
          if (parent.exists) { document = parent; record = parent.data() || {}; }
        }
      }
      if (requestedChildRound && document.id === rawId) return response.status(404).send('Partage introuvable.');
      const status = clean(record.status || record.state,40).toLowerCase();
      if (!publicEntityStatus(kind,status) || status === 'cancelled' || (kind === 'match' && !clean(record.championshipId || record.tournamentId || record.competitionId,150))) return response.status(404).send('Partage introuvable.');
      const game = clean(record.game || record.type,40).toLowerCase() === 'domino' ? 'Domino' : 'Mopyon';
      const number = clean(record.number || record.championshipNumber || document.id,80);
      const players = Object.values(record.participantNames || {}).map(value => clean(value,80)).filter(Boolean).slice(0,2);
      const isCompleted = ['completed','finished','ended'].includes(status);
      const title = kind === 'championship' ? `${game} #${number}` : `${game} · ${players.length === 2 ? `${players[0]} contre ${players[1]}` : `Match #${number}`}`;
      const description = kind === 'championship'
        ? `${isCompleted ? 'Revivez' : status === 'registration-open' ? 'Inscrivez-vous au' : 'Suivez le'} championnat ${title} sur JWETPRO.`
        : `${isCompleted ? 'Revivez' : 'Suivez'} ce match officiel ${game} sur JWETPRO.`;
      const stats = await db.collection('socialEntityStats').doc(entityStatsId(kind,document.id)).get();
      const likeCount = Math.max(0,Number(stats.data()?.likeCount) || 0);
      data = {title,description,level:kind === 'championship' ? 'Championnat officiel' : 'Match officiel',points:likeCount};
      shareUrl = `${SHARE_ORIGIN}/s/${entityCode}/${encodeURIComponent(document.id)}`;
      destinationUrl = entityDestination(kind,document.id,status);
      ctaLabel = kind === 'championship' ? 'Voir le championnat' : isCompleted ? 'Voir le replay' : 'Voir le match';
      eyebrow = kind === 'championship' ? 'CHAMPIONNAT JWETPRO' : 'MATCH JWETPRO';
      statMarkup = `<span>${kind === 'championship' ? 'Championnat officiel' : 'Match officiel'}</span><span>${likeCount.toLocaleString('fr-FR')} J’aime</span>`;
    } else {
      const shareId = clean(rawId,80);
      if (!/^[a-f0-9]{28}$/.test(shareId)) return response.status(404).send('Partage introuvable.');
      const document = await db.collection('shareEvents').doc(shareId).get();
      if (!document.exists || document.data()?.visibility !== 'public') return response.status(404).send('Partage introuvable.');
      data = document.data() || {};
      shareUrl = shareUrlFor(shareId);
      destinationUrl = referralUrlFor(shareId);
    }
    const escape = value => String(value || '').replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const title = escape(data.title || 'JWETPRO');
    const description = escape(data.description || 'Rejoignez les championnats JWETPRO.');
    const imageUrl = `${SITE_ORIGIN}/og-jwetpro.png`;
    const points = Math.max(0,Number(data.points) || 0).toLocaleString('fr-FR');
    if (!statMarkup) statMarkup = `<span>${escape(data.level || 'Joueur')}</span><span>${data.followerCount != null ? `${Math.max(0,Number(data.followerCount)||0).toLocaleString('fr-FR')} abonnés` : `${points} points`}</span>`;
    response.set('Cache-Control','public, max-age=300, s-maxage=600');
    response.status(200).type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${title} · JWETPRO</title><meta name="description" content="${description}"><meta property="og:type" content="website"><meta property="og:site_name" content="JWETPRO"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${shareUrl}"><meta property="og:image" content="${imageUrl}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${imageUrl}"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#061827;color:#eef5f8;font-family:Arial,sans-serif}.card{width:min(100%,620px);overflow:hidden;border:1px solid #30516a;border-radius:20px;background:linear-gradient(145deg,#0b263a,#071c2c);box-shadow:0 24px 70px #0008}.brand{padding:18px 24px;border-bottom:1px solid #27465c;color:#fff;font-size:23px;font-weight:900}.brand span,.eyebrow{color:#e3aa36}.content{padding:34px 28px;text-align:center}.eyebrow{font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}h1{margin:12px 0;font-size:clamp(28px,7vw,48px);line-height:1.05}p{color:#b8cad5;line-height:1.65}.stats{display:flex;justify-content:center;gap:12px;margin:24px 0;flex-wrap:wrap}.stats span{padding:9px 12px;border:1px solid #31536b;border-radius:999px;color:#eaf1f5;font-size:12px;font-weight:800}.cta{display:inline-flex;padding:14px 21px;border-radius:10px;background:#dda42f;color:#071827;font-weight:900;text-decoration:none}.footer{padding:15px 24px;background:#061522;color:#7891a2;font-size:11px;text-align:center}</style></head><body><main class="card"><header class="brand">JWET<span>PRO</span></header><section class="content"><div class="eyebrow">${escape(eyebrow)}</div><h1>${title}</h1><p>${description}</p><div class="stats">${statMarkup}</div><a class="cta" href="${escape(destinationUrl)}">${escape(ctaLabel)}</a></section><footer class="footer">Mopyon · Domino · Championnats en ligne</footer></main></body></html>`);
  });

  const syncPublicProfileFromUser = onDocumentWritten({document:'users/{uid}',region:REGION},async event => {
    const uid = event.params.uid;
    const after = event.data?.after;
    const reference = db.collection('publicProfiles').doc(uid);
    const leaderboardReference=db.collection('leaderboard').doc(uid);
    if (!after?.exists) {
      await Promise.all([reference.delete().catch(error=>{if(error.code!==5)throw error;}),leaderboardReference.delete().catch(error=>{if(error.code!==5)throw error;})]);
      return;
    }
    const data = after.data() || {};
    const name = clean(`${data.firstName || ''} ${data.lastName || ''}`) || clean(data.username) || 'Joueur JWETPRO';
    const points=Math.max(0,Number(data.points)||0);
    await leaderboardReference.set({displayName:name,points,level:levelForPoints(points).name,imageName:clean(data.imageName,180),photoURL:safeImage(data.photoURL),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    if(data.profilePublic!==true) return reference.delete().catch(error=>{if(error.code!==5)throw error;});
    return reference.set({displayName:name,avatarUrl:safeImage(data.photoURL),points,level:levelForPoints(points).name,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  });
  const syncPublicProfileFromLeaderboard = onDocumentWritten({document:'leaderboard/{uid}',region:REGION},async event => {
    if (!event.data?.after?.exists) return;
    const uid = event.params.uid;
    const profile = await db.collection('users').doc(uid).get();
    if (!profile.exists || profile.data()?.profilePublic !== true) return;
    const data = event.data.after.data() || {};
    const points = Math.max(0,Number(data.points) || 0);
    return db.collection('publicProfiles').doc(uid).set({points,level:levelForPoints(points).name,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  });

  return {createShareEvent,recordShareReferral,renderSharePage,syncPublicProfileFromUser,syncPublicProfileFromLeaderboard};
};
