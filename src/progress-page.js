(() => {
  'use strict';

  const FIREBASE_CONFIG = {apiKey:'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',authDomain:'mopyonlakay.firebaseapp.com',projectId:'mopyonlakay',storageBucket:'mopyonlakay.firebasestorage.app',messagingSenderId:'307157893690',appId:'1:307157893690:web:4e5a033d13d54ce86feb03'};
  const EXPECTED_PLAYERS = 32;
  const REGISTRATION_SHARE = 15;
  const CHAMPIONSHIP_DURATION_MS = 90 * 60 * 1000;
  const STAGES = [
    {key:'16e', label:'16èmes de finale', short:'1/16', slots:16},
    {key:'8e', label:'8èmes de finale', short:'1/8', slots:8},
    {key:'quart', label:'Quarts de finale', short:'1/4', slots:4},
    {key:'demi', label:'Demi-finales', short:'1/2', slots:2},
    {key:'finale', label:'Finale', short:'FINALE', slots:1}
  ];
  const TOTAL_BRACKET_MATCHES = STAGES.reduce((total, stage) => total + stage.slots, 0);
  const STATUS_LABEL = {'registration-open':'INSCRIPTIONS OUVERTES', open:'INSCRIPTIONS OUVERTES', 'registration-closed':'INSCRIPTIONS TERMINÉES', closed:'INSCRIPTIONS TERMINÉES', ongoing:'CHAMPIONNAT EN COURS', live:'CHAMPIONNAT EN COURS', completed:'CHAMPIONNAT TERMINÉ', finished:'CHAMPIONNAT TERMINÉ', upcoming:'À VENIR', scheduled:'À VENIR'};

  const byId = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
  const firstValue = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
  const asArray = value => Array.isArray(value) ? value : [];
  const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const toDate = value => { if (!value) return null; const date = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
  const formatDate = value => { const date = toDate(value); return date ? date.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) : 'Date non publiée'; };
  const formatTime = value => { const date = toDate(value); return date ? date.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : ''; };
  const initials = name => String(name || 'Joueur').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const safeAvatar = value => /^[A-Za-z0-9._-]+$/.test(String(value || '')) ? `./src/profilimage/${encodeURIComponent(value)}` : '';
  const safePhotoURL = value => { const url = String(value || '').trim(); return /^https:\/\//.test(url) ? url.replace(/'/g, '%27') : ''; };
  const avatarStyle = player => { const image = safePhotoURL(player.photoURL) || safeAvatar(firstValue(player.imageName, player.avatar, player.photo)); return image ? ` style="background-image:url('${image}')"` : ''; };

  const participantId = player => String(firstValue(player?.id, player?.uid, player?.userId, player?.playerId, '') || '');
  const playerName = player => String(firstValue(player?.displayName, player?.name, player?.username, player?.label, 'Joueur'));
  const normalizePlayer = (value, fallbackId = '') => { if (typeof value === 'string') return {id:value || fallbackId, displayName:''}; const player = asObject(value); return {...player, id:participantId(player) || fallbackId}; };
  const playerKey = player => participantId(player) || playerName(player).toLocaleLowerCase('fr');

  const championshipParticipants = championship => {
    const raw = [championship.participants, championship.registeredPlayers, championship.registrations, championship.players].find(Array.isArray) || [];
    const idList = asArray(championship.participantIds);
    const merged = [...raw.map(player => normalizePlayer(player)), ...idList.map(id => normalizePlayer(id, id))];
    const unique = new Map();
    merged.forEach(player => { const key = playerKey(player); if (key && !unique.has(key)) unique.set(key, player); });
    return [...unique.values()].slice(0, EXPECTED_PLAYERS);
  };
  const participantCount = championship => {
    const numeric = [championship.registeredCount, championship.registrationCount, championship.registrationsCount, championship.participantCount, championship.participantsCount, championship.playersCount].map(Number).find(Number.isFinite);
    return Number.isFinite(numeric) ? numeric : championshipParticipants(championship).length;
  };

  const matchPlayers = match => {
    const arrays = [match.participants, match.players].find(Array.isArray);
    if (arrays?.length) return arrays.slice(0, 2).map(player => normalizePlayer(player));
    const ids = asArray(match.participantIds).slice(0, 2);
    const values = [firstValue(match.player1, match.firstPlayer, ids[0]), firstValue(match.player2, match.secondPlayer, ids[1])];
    return values.filter(value => value !== undefined).map(player => normalizePlayer(player));
  };
  const stageKey = match => {
    const roundField = String(firstValue(match.round, '')).toLowerCase();
    if (STAGES.some(stage => stage.key === roundField)) return roundField;
    const source = String(firstValue(match.stage, match.phase, match.roundName, match.roundLabel, match.bracketStage, match.matchType, '')).toLocaleLowerCase('fr').normalize('NFD').replace(/\p{Diacritic}/gu, '');
    if (/16\s*eme|seizieme|1\s*\/\s*16/.test(source)) return '16e';
    if (/8\s*eme|huit|1\s*\/\s*8/.test(source)) return '8e';
    if (/quarter|quart/.test(source)) return 'quart';
    if (/semi|demi/.test(source)) return 'demi';
    if (/final/.test(source)) return 'finale';
    const round = Number(firstValue(match.round, match.roundNumber));
    return ({1:'16e', 2:'8e', 3:'quart', 4:'demi', 5:'finale'})[round] || '';
  };
  const matchPosition = match => Number(firstValue(match.position, match.bracketPosition, match.bracketSlot, match.matchNumber, match.number, 0)) || 0;
  const winnerIdentity = match => {
    const winner = firstValue(match.winner, match.winnerPlayer, {});
    return {id:String(firstValue(match.winnerId, match.winnerUid, participantId(winner), '') || ''), name:String(firstValue(match.winnerName, playerName(winner) === 'Joueur' ? '' : playerName(winner), '') || '')};
  };
  const isWinner = (player, match) => { const winner = winnerIdentity(match); return Boolean((winner.id && participantId(player) === winner.id) || (winner.name && playerName(player).toLocaleLowerCase('fr') === winner.name.toLocaleLowerCase('fr'))); };
  const isDecided = match => Boolean(winnerIdentity(match).id || winnerIdentity(match).name || match.draw === true || /complete|completed|finished/.test(String(match.status || '').toLowerCase()));
  const isLiveMatch = match => /live|direct|en cours|ongoing/.test(String(match.status || match.state || match.liveStatus || '').toLowerCase()) && !isDecided(match);
  const progressCurrentUserId = () => window.JwetproCurrentUserId || window.firebase?.auth?.().currentUser?.uid || '';
  const playableMatchId = match => match.kind === 'series' ? firstValue(match.currentGameId, match.activeGameId, match.gameId, '') : match.id;
  const scoreFor = (match, player, index) => {
    if (match.kind === 'series' && match.seriesScore && typeof match.seriesScore === 'object') {
      const seriesValue = Number(index === 0 ? match.seriesScore.p1 : match.seriesScore.p2);
      if (Number.isFinite(seriesValue)) return seriesValue;
    }
    const scores = firstValue(match.scores, match.score, {});
    if (scores && typeof scores === 'object' && !Array.isArray(scores)) {
      const value = firstValue(scores[participantId(player)], scores[playerName(player)], scores[index], scores[String(index)]);
      if (value !== undefined) return value;
    }
    return firstValue(match[`score${index + 1}`], match[`player${index + 1}Score`], player?.score, '—');
  };

  const effectiveStatus = championship => {
    const start = toDate(championship.startAt || championship.startDate);
    const registrationEnd = toDate(championship.registrationEndAt || championship.registrationDeadline || championship.registrationClosesAt || championship.registrationCloseAt || championship.endRegistrationAt) || start;
    const stored = String(championship.status || 'upcoming').toLowerCase();
    if (stored === 'cancelled') return 'cancelled';
    if (['completed', 'finished', 'ended', 'termine', 'terminé'].includes(stored)) return 'completed';
    if (start) {
      const now = Date.now();
      if (now >= start.getTime() + CHAMPIONSHIP_DURATION_MS) return 'completed';
      if (now >= start.getTime()) return 'ongoing';
    }
    const maxPlayers = Number(championship.maxPlayers) || EXPECTED_PLAYERS;
    if ((registrationEnd && Date.now() >= registrationEnd.getTime()) || (maxPlayers > 0 && participantCount(championship) >= maxPlayers) || ['registration-closed', 'closed'].includes(stored)) return 'registration-closed';
    return ['registration-open', 'open'].includes(stored) ? 'registration-open' : stored;
  };

  const bracketMatch = (match, isFinal) => {
    if (!match) return '<div class="bracket-match-empty">À déterminer</div>';
    const players = matchPlayers(match);
    while (players.length < 2) players.push({displayName:'À déterminer'});
    const live = isLiveMatch(match);
    const playableId = playableMatchId(match);
    const participant = Boolean(progressCurrentUserId()) && asArray(match.participantIds).includes(progressCurrentUserId());
    const action = live && playableId ? `<a class="bracket-watch-link" href="./play.html?${participant ? 'join' : 'match'}=${encodeURIComponent(playableId)}">${participant ? 'REJOINDRE' : 'REGARDER'} <i data-lucide="ArrowRight"></i></a>` : '';
    return `<article class="bracket-match${isFinal ? ' is-final' : ''}${live ? ' is-live' : ''}">${live ? '<span class="bracket-live-tag"><i></i>EN DIRECT</span>' : ''}${players.map((player, index) => `<div class="bracket-player${isWinner(player, match) ? ' is-winner' : ''}"><strong>${escapeHTML(playerName(player))}</strong><b>${escapeHTML(scoreFor(match, player, index))}</b></div>`).join('')}${action}</article>`;
  };
  const renderBracket = matches => {
    byId('progress-bracket').innerHTML = STAGES.map(stage => {
      const stageMatches = matches.filter(match => stageKey(match) === stage.key).sort((a, b) => matchPosition(a) - matchPosition(b));
      const slots = Array.from({length:stage.slots}, (_, index) => bracketMatch(stageMatches[index], stage.key === 'final'));
      return `<section class="bracket-stage" aria-label="${escapeHTML(stage.label)}"><header class="bracket-stage-head"><h3>${escapeHTML(stage.label)}</h3><span>${stage.short}</span></header><div class="bracket-stage-matches">${slots.join('')}</div></section>`;
    }).join('');
    window.renderIcons?.();
  };

  const participantCard = player => { const name = playerName(player); return `<article class="recap-participant"><span class="recap-participant-avatar"${avatarStyle(player)}>${safeAvatar(firstValue(player.imageName, player.avatar, player.photo)) ? '' : escapeHTML(initials(name))}</span><div><strong>${escapeHTML(name)}</strong><small>${player.level ? `Niveau ${escapeHTML(player.level)}` : 'Participant'}</small></div></article>`; };
  const emptyState = (title, detail) => `<div class="recap-empty"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(detail)}</span></div>`;

  const pickChampionshipId = (docs, requestedId) => {
    if (requestedId && docs.some(doc => doc.id === requestedId)) return requestedId;
    const byStart = (a, b) => (toDate(a.data.startAt || a.data.startDate)?.getTime() ?? Infinity) - (toDate(b.data.startAt || b.data.startDate)?.getTime() ?? Infinity);
    const records = docs.map(doc => ({id:doc.id, data:doc.data()})).map(record => ({...record, status:effectiveStatus(record.data)})).filter(record => record.status !== 'cancelled');
    const ongoing = [...records].filter(record => record.status === 'ongoing').sort(byStart)[0];
    if (ongoing) return ongoing.id;
    const open = [...records].filter(record => ['registration-open', 'registration-closed'].includes(record.status)).sort(byStart)[0];
    if (open) return open.id;
    const upcoming = [...records].filter(record => record.status !== 'completed').sort(byStart)[0];
    if (upcoming) return upcoming.id;
    return [...records].sort((a, b) => byStart(b, a))[0]?.id || null;
  };

  let lastRenderedChampionship = null;
  let lastRenderedMatches = [];
  const renderPage = (championship, allMatches) => {
    lastRenderedChampionship = championship;
    lastRenderedMatches = allMatches;
    const matches = allMatches.some(match => match.kind === 'series') ? allMatches.filter(match => match.kind === 'series') : allMatches;
    const status = effectiveStatus(championship);
    const game = String(firstValue(championship.game, championship.type, 'Mopyon'));
    const gameLabel = game.toLowerCase() === 'domino' ? 'Domino' : 'Mopyon';
    const number = firstValue(championship.number, championship.code, championship.id);
    document.title = `${gameLabel} #${number} — Progression — JWETPRO`;
    byId('progress-title').textContent = `${gameLabel} #${number}`;
    const time = formatTime(championship.startAt || championship.startDate);
    byId('progress-date').textContent = `${formatDate(championship.startAt || championship.startDate)}${time ? ` · ${time}` : ''}`;
    const statusBadge = byId('progress-status-badge');
    statusBadge.textContent = STATUS_LABEL[status] || 'PUBLIÉ';
    statusBadge.className = `status ${status === 'ongoing' ? 'live' : status === 'completed' ? 'done' : status === 'registration-open' ? 'open' : 'soon'}`;
    byId('progress-kicker').textContent = status === 'ongoing' ? 'JWETPRO · CHAMPIONNAT EN DIRECT' : status === 'completed' ? 'JWETPRO · CHAMPIONNAT TERMINÉ' : 'JWETPRO · COMPÉTITION';

    const participants = championshipParticipants(championship);
    const maxPlayers = Number(championship.maxPlayers) || EXPECTED_PLAYERS;
    const registeredCount = Math.max(participants.length, participantCount(championship));
    byId('participants-count-badge').textContent = `${registeredCount} / ${maxPlayers}`;
    byId('progress-participants').innerHTML = participants.length ? participants.map(participantCard).join('') : emptyState('Liste non publiée', 'Les participants inscrits apparaîtront ici dès leur publication.');

    const decidedCount = matches.filter(isDecided).length;
    const registrationFraction = maxPlayers > 0 ? Math.min(1, registeredCount / maxPlayers) : 0;
    const tournamentFraction = Math.min(1, decidedCount / TOTAL_BRACKET_MATCHES);
    const percent = status === 'completed' ? 100
      : status === 'ongoing' ? Math.round(REGISTRATION_SHARE + tournamentFraction * (100 - REGISTRATION_SHARE))
      : Math.round(registrationFraction * REGISTRATION_SHARE);
    byId('progress-meter-value').textContent = `${percent}%`;
    byId('progress-meter-fill').style.width = `${percent}%`;

    const registerCta = byId('progress-register-cta');
    registerCta.hidden = status !== 'registration-open';
    registerCta.href = `./registration-checkout.html?id=${encodeURIComponent(championship.id)}`;

    renderBracket(matches);
    byId('progress-loading').hidden = true;
    byId('progress-content').hidden = false;
    byId('progress-error').hidden = true;
  };

  const showError = message => {
    byId('progress-loading').hidden = true;
    byId('progress-content').hidden = true;
    byId('progress-error-message').textContent = message;
    byId('progress-error').hidden = false;
  };

  let matchUnsubscribes = [];
  const stopMatchListeners = () => { matchUnsubscribes.forEach(unsubscribe => unsubscribe()); matchUnsubscribes = []; };

  const watchMatches = championship => {
    stopMatchListeners();
    const currentMatches = new Map();
    const db = firebase.firestore();
    const linkFields = [['championshipId', championship.id], ['tournamentId', championship.id], ['competitionId', championship.id], ['championshipNumber', championship.number]]
      .filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (!linkFields.length) { renderPage(championship, []); return; }
    const handleSnapshot = snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') currentMatches.delete(change.doc.id);
        else currentMatches.set(change.doc.id, {id:change.doc.id, ...change.doc.data()});
      });
      renderPage(championship, [...currentMatches.values()]);
    };
    renderPage(championship, []);
    matchUnsubscribes = linkFields.map(([field, value]) => db.collection('matches')
      .where(field, '==', value)
      .where('status', 'in', ['preview', 'scheduled', 'ongoing', 'live', 'completed', 'finished'])
      .limit(200)
      .onSnapshot(handleSnapshot, error => console.warn('Progress match listener failed:', error)));
  };

  let championshipUnsubscribe = null;
  const watchChampionship = id => {
    championshipUnsubscribe?.();
    championshipUnsubscribe = firebase.firestore().collection('championships').doc(id).onSnapshot(doc => {
      if (!doc.exists) { showError('Ce championnat n’est plus disponible.'); return; }
      watchMatches({id:doc.id, ...doc.data()});
    }, error => { console.error('Progress championship listener failed:', error); showError('Impossible de charger ce championnat pour le moment.'); });
  };

  const initProgressPage = () => {
    window.renderIcons?.();
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const requestedId = new URLSearchParams(window.location.search).get('id');
    const db = firebase.firestore();
    let activeId = null;
    db.collection('championships').limit(200).onSnapshot(snapshot => {
      const records = snapshot.docs.filter(doc => doc.data().status !== 'cancelled');
      const nextId = pickChampionshipId(records, requestedId);
      if (!nextId) { stopMatchListeners(); championshipUnsubscribe?.(); showError('Aucun championnat à suivre pour le moment.'); activeId = null; return; }
      if (nextId !== activeId) { activeId = nextId; watchChampionship(nextId); }
    }, error => { console.error('Progress championships list failed:', error); showError('Impossible de charger les championnats pour le moment.'); });
  };

  const runProgressPage = () => initProgressPage();
  window.addEventListener('jwetpro-auth-ready', () => { if (lastRenderedChampionship) renderPage(lastRenderedChampionship,lastRenderedMatches); });
  window.addEventListener('shared-shell-ready', runProgressPage, {once:true});
  const sharedShellScript = document.createElement('script');
  sharedShellScript.src = './shared-shell.js?v=20260903-auth-match-action';
  document.head.append(sharedShellScript);
})();
