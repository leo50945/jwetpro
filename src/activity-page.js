const runActivityPage = () => initActivityPage();
window.addEventListener('shared-shell-ready', runActivityPage, { once: true });
const sharedShellScript = document.createElement('script');
sharedShellScript.src = './shared-shell.js?v=20260909-social-v3';
document.head.append(sharedShellScript);

const firebaseConfig = {
  apiKey: 'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',
  authDomain: 'mopyonlakay.firebaseapp.com',
  projectId: 'mopyonlakay',
  storageBucket: 'mopyonlakay.firebasestorage.app',
  messagingSenderId: '307157893690',
  appId: '1:307157893690:web:4e5a033d13d54ce86feb03',
  measurementId: 'G-N32D8NS82V'
};

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const toDate = value => { const date = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const dateLabel = value => { const date = toDate(value); return date ? date.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}) : 'Date non publiée'; };
const gameLabel = value => String(value || 'Mopyon').toLowerCase() === 'domino' ? 'DOMINO' : 'MOPYON';
const ACTIVITY_PREVIEW_LIMIT = 3;
const CHAMPIONSHIP_DURATION_MS = 90 * 60 * 1000;
const statusText = value => ({'registration-open':'INSCRIPTIONS OUVERTES',open:'INSCRIPTIONS OUVERTES','registration-closed':'INSCRIPTIONS TERMINÉES',closed:'INSCRIPTIONS TERMINÉES',ongoing:'CHAMPIONNAT EN COURS',live:'CHAMPIONNAT EN COURS',completed:'CHAMPIONNAT TERMINÉ',finished:'CHAMPIONNAT TERMINÉ',upcoming:'À VENIR',scheduled:'PLANIFIÉ'}[value] || String(value || 'PUBLIÉ').toUpperCase());
const participantCount = data => {
  const count = [data.registeredCount,data.registrationCount,data.registrationsCount,data.participantCount,data.participantsCount,data.playersCount].map(Number).find(Number.isFinite);
  if (Number.isFinite(count)) return count;
  const participants = data.participants || data.registeredPlayers || data.registrations || data.players;
  return Array.isArray(participants) ? participants.length : 0;
};
const championshipState = data => {
  const start = toDate(data.startAt || data.startDate);
  const registrationEnd = toDate(data.registrationEndAt || data.registrationDeadline || data.registrationClosesAt || data.registrationCloseAt || data.endRegistrationAt) || start;
  const stored = String(data.status || 'upcoming').toLowerCase();
  const now = Date.now();
  let status = stored;
  if (stored !== 'cancelled') {
    if (['completed','finished','ended','termine','terminé'].includes(stored) || (start && now >= start.getTime() + CHAMPIONSHIP_DURATION_MS)) status = 'completed';
    else if (start && now >= start.getTime()) status = 'ongoing';
    else if ((registrationEnd && now >= registrationEnd.getTime()) || participantCount(data) >= (Number(data.maxPlayers) || 32) || ['registration-closed','closed'].includes(stored)) status = 'registration-closed';
    else if (['registration-open','open'].includes(stored)) status = 'registration-open';
  }
  const createdAt = toDate(data.createdAt);
  const updatedAt = toDate(data.updatedAt);
  const activityAt = status === 'completed' && start ? start.getTime() + CHAMPIONSHIP_DURATION_MS : status === 'ongoing' && start ? start.getTime() : status === 'registration-closed' ? (registrationEnd || updatedAt || createdAt || start)?.getTime() : (createdAt || updatedAt || start)?.getTime();
  return {...data,status,activityAt:activityAt || 0};
};
const progressHref = championshipId => championshipId ? `./progress.html?id=${encodeURIComponent(championshipId)}` : './progress.html';
const championshipAction = (status, championshipId = '') => status === 'registration-open'
  ? {label:'S’INSCRIRE',href:championshipId ? `./registration-checkout.html?id=${encodeURIComponent(championshipId)}` : './calendar.html',tone:'open'}
  : status === 'ongoing'
    ? {label:'SUIVRE LE CHAMPIONNAT',href:progressHref(championshipId),tone:'live'}
    : status === 'completed'
      ? {label:'REVOIR LE CHAMPIONNAT',href:championshipId ? `./championship.html?id=${encodeURIComponent(championshipId)}` : './activity.html',tone:'done'}
      : {label:'VOIR LE CHAMPIONNAT',href:progressHref(championshipId),tone:'soon'};
const isLive = value => /live|direct|en cours|ongoing/.test(String(value || '').toLowerCase());
const isFinished = value => /complete|completed|finished|ended|termine|terminé|replay/.test(String(value || '').toLowerCase());
const matchActivityTime = data => toDate(data.endedAt || data.completedAt || data.startedAt || data.updatedAt || data.createdAt || data.startAt)?.getTime() || 0;
const normalizedActivityName = value => String(value || '').trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
const activityProfilesById = new Map();
const activityProfilesByName = new Map();
const matchPlayers = data => {
  const ids = Array.isArray(data.participantIds) ? data.participantIds.filter(id => typeof id === 'string') : [];
  const names = data.participantNames || data.playerNames || {};
  const socialIds = data.participantSocialIds || {};
  const embeddedProfiles = data.participantProfiles || data.playerProfiles || {};
  let rawPlayers = [];
  if (Array.isArray(data.players)) rawPlayers = data.players;
  else if (typeof data.players === 'string') rawPlayers = data.players.split('/').map(name => name.trim());
  else rawPlayers = [data.player1 || data.firstPlayer, data.player2 || data.secondPlayer].filter(Boolean);
  if (!rawPlayers.length) rawPlayers = ids;
  return rawPlayers.slice(0,2).map((value,index) => {
    const player = typeof value === 'string' ? (ids.includes(value) ? {uid:value} : {name:value}) : {...(value || {})};
    const uid = String(player.uid || player.id || player.userId || player.playerId || ids[index] || '');
    const explicitName = player.name || player.displayName || player.username || names[uid] || '';
    const embedded = uid && embeddedProfiles[uid] && typeof embeddedProfiles[uid] === 'object' ? embeddedProfiles[uid] : {};
    const profile = (uid && activityProfilesById.get(uid)) || activityProfilesByName.get(normalizedActivityName(explicitName)) || {};
    return {...profile,...embedded,...player,uid,socialPlayerId:player.socialPlayerId||socialIds[uid]||profile.socialPlayerId||uid,name:explicitName || embedded.displayName || embedded.name || profile.displayName || profile.name || ''};
  });
};
const playerName = player => player?.name || player?.displayName || player?.username || 'Joueur';
const initialsFrom = value => String(value || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?';
const activitySocialId = player => String(player?.socialPlayerId || player?.uid || player?.userId || player?.playerId || player?.id || '').trim();
const activityAvatarLink = (player, markup) => /^[A-Za-z0-9_-]{1,150}$/.test(activitySocialId(player)) ? `<a class="player-social-link" href="./player.html?id=${encodeURIComponent(activitySocialId(player))}" aria-label="Voir le profil de ${escapeHTML(playerName(player))}">${markup}</a>` : markup;
const playerAvatar = player => {
  const label = playerName(player);
  const photoURL = String(player?.photoURL || '').trim().replace(/'/g, '%27');
  const image = String(player?.imageName || '');
  if (/^https:\/\//.test(photoURL)) return activityAvatarLink(player,`<span class="public-avatar" style="background-image:url('${photoURL}');background-size:cover;background-position:center" role="img" aria-label="Avatar de ${escapeHTML(label)}"></span>`);
  if (/^[A-Za-z0-9._-]+$/.test(image)) return activityAvatarLink(player,`<span class="public-avatar" style="background-image:url('./src/profilimage/${encodeURIComponent(image)}');background-size:cover;background-position:center" role="img" aria-label="Avatar de ${escapeHTML(label)}"></span>`);
  return activityAvatarLink(player,`<span class="public-avatar" style="display:grid;place-items:center;background-image:none;background-color:#172738;color:#c9d6e2;font-size:14px;font-weight:800" role="img" aria-label="Avatar de ${escapeHTML(label)}">${initialsFrom(label)}</span>`);
};
const activityCurrentUserId = () => window.JwetproCurrentUserId || window.firebase?.auth?.().currentUser?.uid || '';
const activityIsParticipant = data => Boolean(activityCurrentUserId()) && Array.isArray(data.participantIds) && data.participantIds.includes(activityCurrentUserId());
const activityMatchSocialAttributes = data => data.kind === 'game' || (data.kind !== 'series' && (data.seriesId || data.parentSeriesId || data.matchSeriesId)) ? ' data-social-disabled="true"' : ` data-social-kind="match" data-social-id="${escapeHTML(data.id)}"`;
const matchCard = (data, replay = false) => {
  const players = matchPlayers(data);
  const game = gameLabel(data.game || data.type);
  const number = data.number || data.championshipNumber || '';
  const participant = !replay && activityIsParticipant(data);
  const isSeries = data.kind === 'series';
  const watchId = isSeries ? String(data.currentGameId || data.activeGameId || '') : data.id;
  const score = isSeries && data.seriesScore ? `${Number(data.seriesScore.p1) || 0}–${Number(data.seriesScore.p2) || 0}` : '';
  const action = replay
    ? `<a href="./play.html?replay=${encodeURIComponent(data.id)}">VOIR LE REPLAY <i data-lucide="ArrowRight"></i></a>`
    : watchId ? `<a href="./play.html?${participant ? 'join' : 'match'}=${encodeURIComponent(participant ? data.id : watchId)}">${participant ? 'REJOINDRE LE MATCH' : 'REGARDER LE MATCH'} <i data-lucide="ArrowRight"></i></a>` : '';
  return `<article class="activity-public-card match-public-card ${replay ? 'is-replay' : 'is-live'}"${activityMatchSocialAttributes(data)}><div class="public-card-top"><span class="public-status ${replay ? 'replay' : 'live'}"><i></i>${replay ? 'REPLAY' : 'EN DIRECT'}</span><time>${escapeHTML(dateLabel(data.createdAt || data.startedAt || data.startAt))}</time></div><h3>${game}${number ? ` <span>#${escapeHTML(number)}</span>` : ''}</h3><div class="public-versus"><div>${playerAvatar(players[0])}${activityAvatarLink(players[0],`<b>${escapeHTML(playerName(players[0]))}</b>`)}</div><strong>${score ? escapeHTML(score) : 'VS'}</strong><div>${playerAvatar(players[1])}${activityAvatarLink(players[1],`<b>${escapeHTML(playerName(players[1]))}</b>`)}</div></div><div class="public-card-bottom"><span>${replay ? `${isSeries ? 'Match' : 'Manche'} terminé${isSeries ? ' · 2 manches gagnantes' : ''}` : `${escapeHTML(data.viewers || 0)} spectateurs`}</span>${action}</div></article>`;
};
const championshipCard = data => { const action = championshipAction(data.status, data.id); return `<article class="activity-public-card championship-public-card" data-social-kind="championship" data-social-id="${escapeHTML(data.id)}"><div class="championship-public-icon"><i data-lucide="${gameLabel(data.game) === 'DOMINO' ? 'Dice5' : 'Grid3X3'}"></i></div><div><p class="public-card-kicker">${escapeHTML(statusText(data.status))}</p><h3>${gameLabel(data.game)} <span>#${escapeHTML(data.number || data.id || '')}</span></h3><p>${escapeHTML(dateLabel(data.startAt || data.startDate))}${data.time ? ` · ${escapeHTML(data.time)}` : ''}</p></div><dl><div><dt>Participation</dt><dd>${Number(data.entryFee || 0).toLocaleString('fr-FR')} HTG</dd></div><div><dt>Gain</dt><dd>${Number(data.prize || 0).toLocaleString('fr-FR')} HTG</dd></div></dl><a class="championship-public-action ${action.tone}" href="${action.href}">${action.label} <i data-lucide="ArrowRight"></i></a></article>`; };
const winnerCard = data => `<article class="activity-public-card winner-public-card" data-social-kind="championship" data-social-id="${escapeHTML(data.id)}"><span class="winner-medal"><i data-lucide="Crown"></i></span><div><p class="public-card-kicker">CHAMPION PUBLIÉ</p><h3>${escapeHTML(data.name)}</h3><p>${escapeHTML(data.game)}${data.number ? ` #${escapeHTML(data.number)}` : ''}</p></div><strong>${Number(data.prize || 0).toLocaleString('fr-FR')} HTG</strong></article>`;
const emptyCard = (title, detail) => `<div class="activity-public-empty"><i data-lucide="Inbox"></i><strong>${title}</strong><span>${detail}</span></div>`;
const renderList = (name, html, count, emptyTitle, emptyDetail) => { const list = document.querySelector(`[data-list="${name}"]`); if (list) list.innerHTML = html || emptyCard(emptyTitle, emptyDetail); const badge = document.querySelector(`[data-count="${name}"]`); if (badge) badge.textContent = count; };
const loadReadableMatches = async db => {
  const queries = ['ongoing', 'live', 'completed', 'finished'].map(status => db.collection('matches').where('status', '==', status).limit(100).get());
  queries.push(db.collection('matches').where('visibility', '==', 'public').limit(100).get());
  const snapshots = await Promise.allSettled(queries);
  const unique = new Map();
  snapshots.forEach(result => {
    if (result.status !== 'fulfilled') {
      console.warn('Public activity matches query skipped:', result.reason?.code || result.reason?.message || result.reason);
      return;
    }
    result.value.docs.forEach(doc => unique.set(doc.id, {id: doc.id, ...doc.data()}));
  });
  const missingSeriesIds = [...new Set([...unique.values()].map(match => String(match.seriesId || match.parentSeriesId || match.matchSeriesId || '')).filter(id => /^[A-Za-z0-9_-]{1,150}$/.test(id) && !unique.has(id)))].slice(0,50);
  if (missingSeriesIds.length) {
    const parents = await Promise.all(missingSeriesIds.map(id => db.collection('matches').doc(id).get().catch(() => null)));
    parents.filter(document => document?.exists).forEach(document => unique.set(document.id,{id:document.id,...document.data()}));
  }
  const matches = [...unique.values()];
  const seriesIds = new Set(matches.filter(match => match.kind === 'series').map(match => match.id));
  // The series is the match shown to the public. Child game documents are its manches and must not
  // inflate activity counts or appear as separate matches when their parent is available.
  return matches.filter(match => match.kind === 'series' || !(match.seriesId || match.parentSeriesId || match.matchSeriesId) || !seriesIds.has(String(match.seriesId || match.parentSeriesId || match.matchSeriesId)));
};
const initActivityPage = async () => {
  window.renderIcons?.();
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const [matches, championshipsSnapshot, leaderboardSnapshot] = await Promise.all([loadReadableMatches(db), db.collection('championships').limit(200).get(), db.collection('leaderboard').limit(500).get().catch(() => null)]);
    activityProfilesById.clear();
    activityProfilesByName.clear();
    leaderboardSnapshot?.docs.forEach(doc => {
      const profile = {uid:doc.id,...doc.data()};
      activityProfilesById.set(doc.id,profile);
      const profileName = profile.displayName || profile.name || profile.username || '';
      if (profileName) activityProfilesByName.set(normalizedActivityName(profileName),profile);
    });
    const championships = championshipsSnapshot.docs.map(doc => championshipState({id:doc.id,...doc.data()}));
    const liveMatches = matches.filter(match => isLive(match.status || match.state || match.liveStatus)).sort((a,b) => matchActivityTime(b) - matchActivityTime(a));
    const replayMatches = matches.filter(match => !isLive(match.status || match.state || match.liveStatus) && isFinished(match.status || match.state || match.liveStatus)).sort((a,b) => matchActivityTime(b) - matchActivityTime(a));
    const now = Date.now();
    const activityScore = item => item.activityAt > now ? now - (item.activityAt - now) : item.activityAt;
    const publishedChampionships = championships.filter(item => item.status !== 'cancelled').sort((a,b) => {
      const completionOrder = Number(a.status === 'completed') - Number(b.status === 'completed');
      return completionOrder || activityScore(b) - activityScore(a);
    });
    const winners = publishedChampionships.map(item => { const winner = item.winner || item.champion || {}; const name = item.winnerName || item.championName || winner.name || winner.displayName; return name ? {id:item.id,name,game:gameLabel(item.game),number:item.number,prize:item.prize} : null; }).filter(Boolean);
    renderList('live', liveMatches.slice(0, ACTIVITY_PREVIEW_LIMIT).map(match => matchCard(match)).join(''), liveMatches.length, 'Aucun match en direct', 'Les matchs en direct seront affichés ici dès qu’une compétition commencera.');
    renderList('replays', replayMatches.slice(0, ACTIVITY_PREVIEW_LIMIT).map(match => matchCard(match, true)).join(''), replayMatches.length, 'Aucun replay publié', 'Les matchs terminés apparaîtront ici lorsqu’un replay sera disponible.');
    renderList('champions', winners.slice(0, ACTIVITY_PREVIEW_LIMIT).map(winnerCard).join(''), winners.length, 'Aucun vainqueur publié', 'Les résultats officiels apparaîtront ici après validation.');
    renderList('championships', publishedChampionships.slice(0, ACTIVITY_PREVIEW_LIMIT).map(championshipCard).join(''), publishedChampionships.length, 'Aucun championnat publié', 'Les prochains championnats apparaîtront ici dès leur publication.');
  } catch (error) {
    console.error('Public activity read failed:', error);
    ['live','replays','champions','championships'].forEach(name => renderList(name, '', 0, 'Données indisponibles', 'Impossible de charger cette activité pour le moment.'));
  }
  window.renderIcons?.();
};
window.addEventListener('jwetpro-auth-ready', () => initActivityPage());
