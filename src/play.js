(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const matchPanels = {training:$('#training-panel'),matches:$('#matches-panel'),live:$('#live-panel')};
  const tabs = {training:$('#training-tab'),matches:$('#matches-tab'),live:$('#live-tab')};
  const trainingGamePanels = {mopyon:$('#mopyon-training'),domino:$('#domino-training')};
  const trainingGameButtons = [...document.querySelectorAll('[data-training-game]')];
  const dominoFrame = $('#domino-training-frame');
  const dominoFrameStatus = $('#domino-frame-status');
  const matchList = $('#player-matches');
  const liveMatchesList = $('#live-matches');
  const liveMatchCount = $('#live-match-count');
  const officialSection = $('#official-match');
  const officialBoard = $('#official-board');
  const matchEndModal = $('#match-end-modal');
  const matchEndTitle = $('#match-end-title');
  const matchEndSubtitle = $('#match-end-subtitle');
  const matchEndReplay = $('#match-end-replay');
  const matchEndNext = $('#match-end-next');
  const replayMancheSelector = $('#replay-manche-selector');
  const replayView = $('#match-replay-view');
  const replayBoard = $('#match-replay-board');
  const replayDominoBoard = $('#match-replay-domino-board');
  const matchCount = $('#match-count');
  const ACCESS_WINDOW_MS = 15 * 60 * 1000;
  const OPPONENT_GRACE_PERIOD_MS = 5 * 60 * 1000;
  const MATCH_DURATION_MS = 90 * 60 * 1000;
  const BOARD_CELLS = 400;
  const pageQuery = new URLSearchParams(window.location.search);
  const replayMatchId = pageQuery.get('replay');
  const liveMatchId = pageQuery.get('match');
  const joinMatchId = pageQuery.get('join');
  let auth = null;
  let db = null;
  let functions = null;
  let currentUser = null;
  let currentMatches = [];
  let rawPlayerMatches = [];
  let completedChampionshipIds = new Set();
  let matchesUnsubscribe = null;
  let championshipsUnsubscribe = null;
  let currentLiveMatches = [];
  let liveQueryDocs = [];
  let liveMatchesUnsubscribe = [];
  let officialUnsubscribe = null;
  let viewingOfficialMatchId = null;
  let officialSeriesUnsubscribe = null;
  let officialWatchedSeriesId = null;
  let officialSeriesData = null;
  let officialLastGame = null;
  let countdownTimer = null;
  let attendanceTimer = null;
  let forfeitClaimPending = false;
  let officialMovePending = false;
  let seriesAdvancePending = false;
  let seriesSyncedGameId = null;
  let pendingFinishedGameId = null;
  let spectatorMode = false;
  let activeTrainingGame = 'mopyon';
  let requestedJoinHandled = false;
  let replayMoves = [];
  let replayIndex = 0;
  let replayTimer = null;
  let replaySpeed = 1;
  let replayMatch = null;
  let replaySeries = null;
  let replaySeriesGames = [];
  let officialDominoHand = [];
  let officialDominoHandMatchId = null;
  let officialDominoHandPending = false;
  let selectedOfficialDominoTileId = '';
  let officialDominoFrame = null;
  let officialDominoFrameReady = false;
  let officialDominoFramePayload = null;

  const resetOfficialDominoFrame = () => {
    officialDominoFrame = null;
    officialDominoFrameReady = false;
    officialDominoFramePayload = null;
    officialSection?.classList.remove('is-domino-match');
  };

  const postOfficialDominoState = () => {
    if (!officialDominoFrameReady || !officialDominoFramePayload || !officialDominoFrame?.contentWindow) return;
    officialDominoFrame.contentWindow.postMessage({
      type:'jwetpro-domino-state',
      payload:officialDominoFramePayload
    },window.location.origin);
  };

  window.addEventListener('message',event => {
    if (event.origin !== window.location.origin || event.source !== officialDominoFrame?.contentWindow) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'jwetpro-domino-ready') {
      officialDominoFrameReady = true;
      postOfficialDominoState();
      return;
    }
    if (message.type !== 'jwetpro-domino-action' || message.matchId !== viewingOfficialMatchId) return;
    if (!officialDominoFramePayload?.interactive || officialMovePending) return;
    const action = String(message.action || '');
    const tileId = String(message.tileId || '');
    const side = String(message.side || '');
    if (!['play','draw','pass'].includes(action)) return;
    if (action === 'play' && (!/^[0-6]-[0-6]$/.test(tileId) || !['start','left','right'].includes(side))) return;
    submitOfficialDominoAction(message.matchId,action,tileId,side);
  });

  const toDate = value => {
    if (value?.toDate) return value.toDate();
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const normalizeStatus = value => String(value || 'scheduled').toLowerCase();
  const isCompleted = status => ['completed','finished','ended','termine','terminé','cancelled'].includes(status);
  const LIVE_STATUSES = ['ongoing','live','in-progress','active'];
  const isLive = status => LIVE_STATUSES.includes(status);
  // Only 'ongoing' and 'live' are covered by the firestore.rules public-read allowlist for
  // matches (see the `matches/{matchId}` rule); querying any other status publicly is rejected
  // outright as "Missing or insufficient permissions", so the live-matches tab must stick to these.
  const PUBLIC_LIVE_QUERY_STATUSES = ['ongoing','live'];
  const isCurrentlyLive = data => {
    // A bracket confrontation (kind:'series') is a wrapper around its individual manches (kind:'game')
    // and has no board/moves of its own — only the manche docs are actually watchable live matches.
    if (data.kind === 'series') return false;
    if (!isLive(normalizeStatus(data.status || data.state))) return false;
    if (data.winnerId || data.winner || data.draw === true || data.completedAt || data.endedAt || data.finishedAt) return false;
    const start = toDate(data.startedAt || data.startAt || data.scheduledAt || data.matchDate || data.date);
    if (!start) return true;
    const elapsed = Date.now() - start.getTime();
    return elapsed >= 0 && elapsed <= MATCH_DURATION_MS;
  };
  const isMopyon = data => /mopyon|morpion|gomoku/i.test(String(data.game || data.type || ''));
  const isDomino = data => /domino/i.test(String(data.game || data.type || ''));
  const participantIds = data => Array.isArray(data.participantIds) ? data.participantIds.filter(id => typeof id === 'string') : [];

  const participantDetails = data => {
    return [...[data.participants,data.players].filter(Array.isArray).flat(),data.player1,data.player2].filter(item => item && typeof item === 'object');
  };

  const participantName = (data, uid) => {
    const names = data.participantNames || data.playerNames || {};
    if (typeof names?.[uid] === 'string') return names[uid];
    const participant = participantDetails(data).find(item => [item.uid,item.id,item.userId,item.playerId].includes(uid));
    return participant ? String(participant.name || participant.displayName || participant.username || '') : '';
  };

  const isBotParticipant = (data, uid, realUid = currentUser?.uid || '') => {
    if (!uid) return false;
    if ([data.botParticipantIds,data.simulatedParticipantIds].some(ids => Array.isArray(ids) && ids.includes(uid))) return true;
    if ([data.botParticipantId,data.simulatedParticipantId].includes(uid)) return true;
    if (['bot','simulated','simulation'].includes(String(data.participantTypes?.[uid] || '').toLowerCase())) return true;
    const record = participantDetails(data).find(item => [item.uid,item.id,item.userId,item.playerId].includes(uid));
    if (record?.real === false) return true;
    if (record?.real === true) return false;
    if (record && (record.isBot === true || record.bot === true || record.simulated === true || record.isSimulation === true || ['bot','simulated','simulation'].includes(String(record.type || record.role || '').toLowerCase()))) return true;
    return /^(?:bot|sim(?:ulated|ulation)?)[_-]/i.test(uid) || (data.simulation === true && uid !== realUid);
  };

  const attendanceDeadline = data => {
    const explicit = toDate(data.attendanceDeadlineAt)?.getTime();
    if (Number.isFinite(explicit)) return explicit;
    const waitingSince = toDate(data.waitingForOpponentSince)?.getTime();
    return Number.isFinite(waitingSince) ? waitingSince + OPPONENT_GRACE_PERIOD_MS : Number.NaN;
  };

  const matchTitle = (data, id) => {
    const number = data.number || data.matchNumber || data.championshipNumber || '';
    const championship = data.championshipName || data.championshipTitle;
    const game = isDomino(data) ? 'Domino' : 'Mopyon';
    return championship ? String(championship) : `${game}${number ? ` #${String(number).replace(/^#+/,'')}` : ''}`;
  };

  const dateLabel = date => date ? new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date) : 'Horaire non publié';
  const durationParts = milliseconds => {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    return {days:Math.floor(total / 86400),hours:Math.floor(total % 86400 / 3600),minutes:Math.floor(total % 3600 / 60),seconds:total % 60};
  };

  const setDominoFrameActive = active => {
    if (!dominoFrame) return;
    const currentSource = dominoFrame.getAttribute('src');
    if (active) {
      if (!currentSource || currentSource === 'about:blank') {
        dominoFrameStatus.hidden = false;
        dominoFrame.src = dominoFrame.dataset.src;
      }
      return;
    }
    if (currentSource && currentSource !== 'about:blank') {
      dominoFrame.src = 'about:blank';
      dominoFrameStatus.hidden = false;
    }
  };

  const setTrainingGame = name => {
    if (!trainingGamePanels[name]) return;
    activeTrainingGame = name;
    Object.entries(trainingGamePanels).forEach(([key,panel]) => { panel.hidden = key !== name; });
    trainingGameButtons.forEach(button => {
      const active = button.dataset.trainingGame === name;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    setDominoFrameActive(name === 'domino' && !matchPanels.training.hidden);
  };

  trainingGameButtons.forEach(button => button.addEventListener('click',() => setTrainingGame(button.dataset.trainingGame)));
  dominoFrame?.addEventListener('load',() => {
    if (dominoFrame.getAttribute('src')?.includes('dominocash/')) dominoFrameStatus.hidden = true;
  });
  const activateTab = name => {
    Object.entries(tabs).forEach(([key,button]) => {
      const active = key === name;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',String(active));
      matchPanels[key].hidden = !active;
    });
  };

  const closeOfficialMatch = () => {
    officialUnsubscribe?.();
    officialUnsubscribe = null;
    viewingOfficialMatchId = null;
    officialSection.hidden = true;
    resetOfficialSeriesState();
  };

  const setTab = name => {
    closeOfficialMatch();
    activateTab(name);
    setDominoFrameActive(name === 'training' && activeTrainingGame === 'domino');
    if (name === 'matches') loadPlayerMatches();
    if (name === 'live') loadLiveMatches();
  };

  Object.entries(tabs).forEach(([name,button]) => {
    button.addEventListener('click',() => setTab(name));
    button.addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const names = Object.keys(tabs);
      const currentIndex = names.indexOf(name);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
      setTab(names[nextIndex]);
      tabs[names[nextIndex]].focus();
    });
  });

  if (pageQuery.get('game') === 'domino') setTrainingGame('domino');
  if (pageQuery.get('game') === 'mopyon') setTrainingGame('mopyon');
  if (pageQuery.get('view') === 'matches') activateTab('matches');

  document.querySelectorAll('.difficulty-choice').forEach(button => button.addEventListener('click',() => {
    const select = $('#difficultySelect');
    document.querySelectorAll('.difficulty-choice').forEach(choice => {
      const active = choice === button;
      choice.classList.toggle('is-active',active);
      choice.setAttribute('aria-pressed',String(active));
    });
    select.value = button.dataset.difficulty;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }));

  const renderState = (title,message,iconName='calendar-x',action=null) => {
    const actionMarkup = action ? `<a class="match-action play-state-action" href="${escapeHtml(action.href)}">${icon(action.icon || 'arrow-up-right')}${escapeHtml(action.label)}</a>` : '';
    matchList.innerHTML = `<div class="play-state">${icon(iconName)}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${actionMarkup}</div>`;
    window.renderIcons?.();
  };

  const getMatchAction = match => {
    if (match.data.kind === 'series') {
      const status = normalizeStatus(match.data.status || match.data.state);
      return isCompleted(status) || match.data.winnerId || match.data.winnerUid
        ? {label:'Revoir le replay',enabled:true,kind:'result'}
        : {label:'Rejoindre le match',enabled:true,kind:'join'};
    }
    const status = normalizeStatus(match.data.status || match.data.state);
    const now = Date.now();
    const start = match.startAt?.getTime();
    if (isCompleted(status)) return {label:'Voir le replay',enabled:true,kind:'result'};
    // The five-minute attendance period starts when the first real player enters the room.
    const deadline = attendanceDeadline(match.data);
    if (Number.isFinite(deadline) && now >= deadline) {
      const opponentId = participantIds(match.data).find(id => id !== currentUser?.uid);
      const selfPresent = Boolean(match.data.presence?.[currentUser?.uid]);
      const opponentPresent = opponentId ? Boolean(match.data.presence?.[opponentId]) : false;
      if (selfPresent && !opponentPresent && !isBotParticipant(match.data,opponentId)) return {label:'Valider le forfait',enabled:true,kind:'forfeit'};
    }
    if (isLive(status)) return {label:'Rejoindre le match',enabled:true,kind:'join'};
    if (!start) return {label:'Horaire a confirmer',enabled:false,kind:'wait'};
    if (now >= start - ACCESS_WINDOW_MS && now <= start + MATCH_DURATION_MS) return {label:'Rejoindre le match',enabled:true,kind:'join'};
    return {label:'A venir',enabled:false,kind:'wait'};
  };

  const countdownMarkup = match => {
    if (isCompleted(normalizeStatus(match.data.status || match.data.state)) || match.data.winnerId || match.data.winnerUid) {
      const score = match.data.seriesScore;
      const scoreLabel = score && Number.isFinite(Number(score.p1)) && Number.isFinite(Number(score.p2)) ? `${Number(score.p1)} - ${Number(score.p2)}` : 'Terminé';
      return `<div class="match-series-score"><span>Score final</span><b>${escapeHtml(scoreLabel)}</b></div>`;
    }
    const deadline = attendanceDeadline(match.data);
    if (Number.isFinite(deadline) && match.data.presence?.[currentUser?.uid]) {
      const parts = durationParts(deadline - Date.now());
      return `<div class="countdown attendance-countdown" data-attendance-countdown="${escapeHtml(match.id)}"><div><b data-unit="minutes">${String(parts.minutes).padStart(2,'0')}</b><span>min</span></div><div><b data-unit="seconds">${String(parts.seconds).padStart(2,'0')}</b><span>sec</span></div></div>`;
    }
    const start = match.startAt?.getTime();
    if (!start) return '<div class="countdown" data-countdown-empty><span>Horaire non publie</span></div>';
    const parts = durationParts(start - Date.now());
    return `<div class="countdown" data-countdown="${escapeHtml(match.id)}"><div><b data-unit="days">${parts.days}</b><span>jours</span></div><div><b data-unit="hours">${String(parts.hours).padStart(2,'0')}</b><span>heures</span></div><div><b data-unit="minutes">${String(parts.minutes).padStart(2,'0')}</b><span>min</span></div><div><b data-unit="seconds">${String(parts.seconds).padStart(2,'0')}</b><span>sec</span></div></div>`;
  };

  const renderMatches = () => {
    // The "my matches" query re-fires on any write to any of the player's matches — including the
    // presence write joinMopyonMatch itself makes when opening a match. Without this guard, that
    // re-fire immediately forced the view back to the list, so the official board would flash open
    // and instantly close again right after "Rejoindre le match".
    if (viewingOfficialMatchId) return;
    officialSection.hidden = true;
    matchList.hidden = false;
    if (!currentMatches.length) {
      matchCount.hidden = true;
      renderState('Aucun match planifié','Lorsqu’un match officiel vous sera attribué, son horaire et son compte à rebours apparaîtront ici.','calendar-days',{label:'S’INSCRIRE AU PROCHAIN CHAMPIONNAT',href:'./calendar.html',icon:'arrow-up-right'});
      return;
    }
    matchCount.hidden = false;
    matchCount.textContent = String(currentMatches.length);
    matchList.innerHTML = currentMatches.map(match => {
      const ids = participantIds(match.data);
      const opponentId = ids.find(id => id !== currentUser.uid);
      const opponent = opponentId ? participantName(match.data,opponentId) || 'Adversaire attribue' : 'Adversaire a attribuer';
      const action = getMatchAction(match);
      const actionMarkup = `<button class="match-action" type="button" data-match-action="${action.kind}" data-match-id="${escapeHtml(match.id)}" ${action.enabled?'':'disabled'}>${icon(action.kind==='join'?'log-in':action.kind==='result'?'play-circle':action.kind==='forfeit'?'flag':'clock-3')}${escapeHtml(action.label)}</button>`;
      return `<article class="match-card" data-match-card="${escapeHtml(match.id)}"><div class="match-info"><span>${escapeHtml(normalizeStatus(match.data.status || match.data.state).toUpperCase())}</span><h3>${escapeHtml(matchTitle(match.data,match.id))}</h3><p>${escapeHtml(dateLabel(match.startAt))}</p></div><div class="match-opponent"><span>ADVERSAIRE</span><strong>${escapeHtml(opponent)}</strong><small>${ids.length}/2 participants confirmes</small></div><div class="match-countdown">${countdownMarkup(match)}${actionMarkup}</div></article>`;
    }).join('');
    matchList.querySelectorAll('[data-match-action]').forEach(button => button.addEventListener('click',() => handleMatchAction(button)));
    window.renderIcons?.();
    startCountdowns();
  };

  const updateCountdowns = () => {
    currentMatches.forEach(match => {
      const root = matchList.querySelector(`[data-countdown="${CSS.escape(match.id)}"]`);
      if (root && match.startAt) {
        const parts = durationParts(match.startAt.getTime() - Date.now());
        Object.entries(parts).forEach(([unit,value]) => { const target=root.querySelector(`[data-unit="${unit}"]`); if(target) target.textContent=unit==='days'?value:String(value).padStart(2,'0'); });
      }
      const attendanceRoot = matchList.querySelector(`[data-attendance-countdown="${CSS.escape(match.id)}"]`);
      const deadline = attendanceDeadline(match.data);
      if (attendanceRoot && Number.isFinite(deadline)) {
        const parts = durationParts(deadline - Date.now());
        ['minutes','seconds'].forEach(unit => { const target=attendanceRoot.querySelector(`[data-unit="${unit}"]`); if(target) target.textContent=String(parts[unit]).padStart(2,'0'); });
      }
      const button = matchList.querySelector(`[data-match-id="${CSS.escape(match.id)}"]`);
      if (button && button.dataset.matchAction !== 'result') {
        const action = getMatchAction(match);
        button.disabled = !action.enabled;
        button.dataset.matchAction = action.kind;
        const labelNode = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
        if (labelNode) labelNode.nodeValue = action.label;
      }
    });
  };

  const startCountdowns = () => {
    window.clearInterval(countdownTimer);
    updateCountdowns();
    countdownTimer = window.setInterval(updateCountdowns,1000);
  };

  const handleMatchAction = async button => {
    const match = currentMatches.find(item => item.id === button.dataset.matchId);
    if (!match) return;
    if (button.dataset.matchAction === 'result') {
      location.href = `./play.html?replay=${encodeURIComponent(match.id)}`;
      return;
    }
    if (match.data.kind === 'series') {
      button.disabled = true;
      openPlannedSeriesLobby(match);
      return;
    }
    if (button.dataset.matchAction === 'forfeit') {
      button.disabled = true;
      button.setAttribute('aria-busy','true');
      const oldLabel = button.textContent;
      button.textContent = 'Reclamation...';
      try {
        const claimForfeit = functions.httpsCallable(isDomino(match.data) ? 'claimDominoForfeit' : 'claimMopyonForfeit');
        await claimForfeit({matchId:match.id});
      } catch (error) {
        console.error('Forfeit claim failed:',error);
        button.textContent = 'Pas encore disponible';
        window.setTimeout(() => { button.textContent=oldLabel; button.disabled=!getMatchAction(match).enabled; button.removeAttribute('aria-busy'); },2200);
      }
      return;
    }
    button.disabled = true;
    button.setAttribute('aria-busy','true');
    const oldText = button.textContent;
    button.textContent = 'Connexion...';
    try {
      const joinMatch = functions.httpsCallable(isDomino(match.data) ? 'joinDominoMatch' : 'joinMopyonMatch');
      await joinMatch({matchId:match.id});
      openOfficialMatch(match.id);
    } catch (error) {
      console.error('Official match join failed:',error);
      button.textContent = error?.code === 'functions/failed-precondition' ? 'Pas encore accessible' : 'Acces refuse';
      window.setTimeout(() => { button.textContent=oldText; button.disabled=!getMatchAction(match).enabled; button.removeAttribute('aria-busy'); },2200);
    }
  };

  const playerMatchChampionshipId = match => String(match.data.championshipId || match.data.tournamentId || match.data.competitionId || '');
  const rebuildPlayerMatches = () => {
    const seriesIds = new Set(rawPlayerMatches.filter(match => match.data.kind === 'series').map(match => match.id));
    currentMatches = rawPlayerMatches
      .filter(match => match.data.kind === 'series' || !match.data.seriesId || !seriesIds.has(String(match.data.seriesId)))
      .filter(match => {
        const championshipId = playerMatchChampionshipId(match);
        return !championshipId || !completedChampionshipIds.has(championshipId);
      })
      .sort((a,b) => (a.startAt?.getTime() || Number.MAX_SAFE_INTEGER) - (b.startAt?.getTime() || Number.MAX_SAFE_INTEGER));
    renderMatches();
  };

  const loadPlayerMatches = () => {
    if (!auth || !db) return renderState('Service indisponible','Firebase ne peut pas etre charge pour le moment.','wifi-off');
    matchesUnsubscribe?.();
    championshipsUnsubscribe?.();
    officialUnsubscribe?.();
    officialUnsubscribe = null;
    viewingOfficialMatchId = null;
    officialSection.hidden = true;
    if (!currentUser) {
      renderState('Connexion necessaire','Connectez-vous pour consulter uniquement les matchs officiels lies a votre compte.','lock-keyhole');
      const state = matchList.querySelector('.play-state');
      state?.insertAdjacentHTML('beforeend','<a class="match-action" href="./index.html#login">Se connecter</a>');
      return;
    }
    matchList.innerHTML='<div class="play-state is-loading"><span class="state-spinner"></span><strong>Chargement de vos matchs...</strong></div>';
    rawPlayerMatches = [];
    completedChampionshipIds = new Set();
    championshipsUnsubscribe = db.collection('championships').limit(200).onSnapshot(snapshot => {
      completedChampionshipIds = new Set(snapshot.docs.filter(doc => {
        const data = doc.data();
        const status = normalizeStatus(data.status || data.state);
        return isCompleted(status) || status === 'complete' || Boolean(data.completedAt || data.finishedAt || data.endedAt);
      }).map(doc => doc.id));
      rebuildPlayerMatches();
    },error => console.warn('Championship status read skipped:',error?.code || error?.message));
    matchesUnsubscribe = db.collection('matches').where('participantIds','array-contains',currentUser.uid).limit(200).onSnapshot(snapshot => {
      rawPlayerMatches = snapshot.docs.map(doc => ({id:doc.id,data:doc.data(),startAt:toDate(doc.data().startAt || doc.data().scheduledAt || doc.data().date)})).filter(match => isMopyon(match.data) || isDomino(match.data));
      rebuildPlayerMatches();
    },error => {
      console.error('Player matches read failed:',error);
      renderState('Matchs indisponibles',`Nous ne pouvons pas charger vos matchs pour le moment. [${error?.code || 'erreur'}] ${error?.message || ''}`,'triangle-alert');
    });
  };

  const liveMatchCardMarkup = data => {
    const ids = participantIds(data);
    const opponentOne = participantName(data,ids[0]) || 'Joueur 1';
    const opponentTwo = participantName(data,ids[1]) || 'Joueur 2';
    const participant = Boolean(currentUser?.uid) && ids.includes(currentUser.uid);
    const action = participant
      ? `<a class="match-action" href="./play.html?join=${encodeURIComponent(data.id)}">${icon('log-in')}Rejoindre le match</a>`
      : `<button class="match-action" type="button" data-watch-match="${escapeHtml(data.id)}">${icon('eye')}Regarder</button>`;
    return `<article class="match-card" data-live-card="${escapeHtml(data.id)}"><div class="match-info"><span class="live-badge"><i aria-hidden="true"></i>EN DIRECT</span><h3>${escapeHtml(matchTitle(data,data.id))}</h3><p>${isDomino(data) ? 'Domino' : 'Mopyon'}</p></div><div class="match-opponent"><span>JOUEURS</span><strong>${escapeHtml(opponentOne)} vs ${escapeHtml(opponentTwo)}</strong><small>${ids.length}/2 participants</small></div><div class="match-countdown">${action}</div></article>`;
  };

  const renderLiveMatches = () => {
    if (viewingOfficialMatchId) return;
    liveMatchCount.hidden = !currentLiveMatches.length;
    liveMatchCount.textContent = String(currentLiveMatches.length);
    if (!currentLiveMatches.length) {
      liveMatchesList.innerHTML = `<div class="play-state">${icon('radio')}<strong>Aucun match en direct pour le moment</strong><p>Dès qu’une rencontre officielle JWETPRO commencera, elle apparaîtra ici. Vous pourrez la suivre coup par coup.</p></div>`;
      window.renderIcons?.();
      return;
    }
    liveMatchesList.innerHTML = currentLiveMatches.map(liveMatchCardMarkup).join('');
    liveMatchesList.querySelectorAll('[data-watch-match]').forEach(button => button.addEventListener('click',() => openOfficialMatch(button.dataset.watchMatch,{spectator:true})));
    window.renderIcons?.();
  };

  const mergeAndRenderLive = () => {
    const unique = new Map();
    liveQueryDocs.forEach(docs => docs.forEach(doc => unique.set(doc.id,{id:doc.id,...doc.data()})));
    currentLiveMatches = [...unique.values()].filter(isCurrentlyLive).sort((a,b) => (toDate(a.startedAt || a.startAt)?.getTime() || 0) - (toDate(b.startedAt || b.startAt)?.getTime() || 0));
    renderLiveMatches();
  };

  const loadLiveMatches = () => {
    if (!db) return;
    liveMatchesUnsubscribe.forEach(unsubscribe => unsubscribe());
    liveMatchesList.innerHTML = '<div class="play-state is-loading"><span class="state-spinner"></span><strong>Recherche de matchs en direct...</strong></div>';
    liveQueryDocs = PUBLIC_LIVE_QUERY_STATUSES.map(() => []);
    liveMatchesUnsubscribe = PUBLIC_LIVE_QUERY_STATUSES.map((statusValue,index) => db.collection('matches').where('status','==',statusValue).limit(50).onSnapshot(snapshot => {
      liveQueryDocs[index] = snapshot.docs;
      mergeAndRenderLive();
    },error => {
      // A single failed status query shouldn't blank out matches already found by the others.
      console.warn('Live matches query skipped:',statusValue,error?.code || error?.message);
      liveQueryDocs[index] = [];
      mergeAndRenderLive();
    }));
  };

  const seriesScoreLabel = seriesData => seriesData?.seriesScore && Number.isFinite(seriesData.seriesScore.p1) && Number.isFinite(seriesData.seriesScore.p2) ? `${seriesData.seriesScore.p1} - ${seriesData.seriesScore.p2}` : null;
  const projectedSeriesScore = (seriesData,game) => {
    if (!seriesData?.seriesScore || !game?.data) return null;
    const score = {p1:Number(seriesData.seriesScore.p1) || 0,p2:Number(seriesData.seriesScore.p2) || 0};
    const alreadyRecorded = Array.isArray(seriesData.gameIds) && seriesData.gameIds.includes(game.id);
    const ids = participantIds(seriesData);
    if (!alreadyRecorded && game.data.winnerId === ids[0]) score.p1 += 1;
    if (!alreadyRecorded && game.data.winnerId === ids[1]) score.p2 += 1;
    if (game.data.forfeitReason === 'attendance-timeout' && game.data.winnerId === ids[0]) score.p1 = Math.max(2,score.p1);
    if (game.data.forfeitReason === 'attendance-timeout' && game.data.winnerId === ids[1]) score.p2 = Math.max(2,score.p2);
    return score;
  };
  const projectedSeriesScoreLabel = (seriesData,game) => {
    const score = projectedSeriesScore(seriesData,game);
    return score ? `${score.p1} - ${score.p2}` : null;
  };

  // A bracket confrontation is played as a best-of-N series of individual manches (kind:'game' docs,
  // each with its own winnerId/draw). A manche ending is not the match ending: the series doc (linked
  // via seriesId) is the only source of truth for whether the whole confrontation is actually over.
  const officialMatchEndInfo = data => {
    const gameOver = Boolean(data.winnerId) || data.draw === true;
    const seriesId = data.seriesId || null;
    if (!gameOver || !seriesId) return {gameOver,seriesId,seriesData:null,matchTrulyOver:gameOver,mancheOverOnly:false};
    const seriesData = officialWatchedSeriesId === seriesId ? officialSeriesData : null;
    const seriesOver = Boolean(seriesData?.winnerUid) || isCompleted(normalizeStatus(seriesData?.status));
    return {gameOver,seriesId,seriesData,matchTrulyOver:Boolean(seriesData) && seriesOver,mancheOverOnly:!seriesData || !seriesOver};
  };

  const hideMatchEndModal = () => { if (matchEndModal) matchEndModal.hidden = true; };

  const showMatchEndModal = ({winnerName,winnerId,draw,replayId,scoreLabel,forfeit,mancheOnly=false,canAdvance=false,shareable=false}) => {
    if (!matchEndModal) return;
    matchEndModal.querySelector('.match-end-kicker').textContent = mancheOnly ? 'MANCHE TERMINÉE' : 'MATCH TERMINÉ';
    matchEndTitle.textContent = draw
      ? (mancheOnly ? 'Manche nulle' : 'Match nul')
      : winnerName ? `${winnerName} remporte ${mancheOnly ? 'la manche' : 'le match'}` : (mancheOnly ? 'Manche terminée' : 'Match terminé');
    matchEndSubtitle.textContent = forfeit
      ? 'L’adversaire a perdu par forfait de temps après cinq minutes d’absence.'
      : mancheOnly
        ? `${scoreLabel ? `Score de la rencontre : ${scoreLabel}. ` : ''}Le match continue jusqu’à deux manches gagnées.`
        : scoreLabel ? `Score final de la rencontre : ${scoreLabel}.` : 'Cette rencontre officielle est maintenant terminée.';
    matchEndReplay.href = `./play.html?replay=${encodeURIComponent(replayId)}`;
    matchEndReplay.innerHTML = `${icon('play-circle')}${mancheOnly ? 'Revoir cette manche' : 'Voir le replay du match'}`;
    matchEndNext.hidden = !canAdvance;
    matchEndNext.disabled = false;
    matchEndNext.innerHTML = `${icon('arrow-right')}${forfeit ? 'Finaliser le match' : 'Passer à la manche suivante'}`;
    const shareButton = $('#match-end-share');
    if (shareButton) {
      shareButton.hidden = Boolean(!shareable || mancheOnly || draw || !winnerId || winnerId !== currentUser?.uid || !replayId);
      shareButton.dataset.matchId = shareButton.hidden ? '' : replayId;
    }
    matchEndModal.hidden = false;
    window.renderIcons?.();
  };

  const evaluateMatchEndState = match => {
    const data = match.data;
    const info = officialMatchEndInfo(data);
    if (!info.gameOver) { hideMatchEndModal(); return; }
    // Wait for the parent series before deciding which modal to show. Without its current score,
    // a second victory could briefly be mistaken for an intermediate manche.
    if (info.seriesId && !info.seriesData) { hideMatchEndModal(); return; }
    if (!info.matchTrulyOver) {
      pendingFinishedGameId = match.id;
      const winnerName = data.draw ? null : participantName(data,data.winnerId) || 'Le vainqueur';
      const participantCanAdvance = !spectatorMode && participantIds(data).includes(currentUser?.uid);
      const projectedScore = projectedSeriesScore(info.seriesData,match);
      const matchEndsWithThisManche = Boolean(projectedScore && (projectedScore.p1 >= 2 || projectedScore.p2 >= 2)) || data.forfeitReason === 'attendance-timeout';
      showMatchEndModal({winnerName,winnerId:data.winnerId,draw:Boolean(data.draw),replayId:matchEndsWithThisManche ? info.seriesId : match.id,scoreLabel:projectedScore ? `${projectedScore.p1} - ${projectedScore.p2}` : null,forfeit:data.forfeitReason === 'attendance-timeout',mancheOnly:!matchEndsWithThisManche,canAdvance:participantCanAdvance && !matchEndsWithThisManche});
      // Persist the manche result immediately. The next board is prepared server-side but remains
      // closed until the player explicitly chooses “Passer à la manche suivante” in this modal.
      if (participantCanAdvance && functions && seriesSyncedGameId !== match.id) {
        seriesSyncedGameId = match.id;
        functions.httpsCallable(isDomino(data) ? 'advanceDominoSeries' : 'advanceMopyonSeries')({gameId:match.id}).catch(error => {
          console.error('Automatic series score sync failed:',error);
          seriesSyncedGameId = null;
        });
      }
      return;
    }
    pendingFinishedGameId = null;
    const winnerName = data.draw ? null : info.seriesId
      ? (info.seriesData.winnerName || (info.seriesData.winnerUid && participantName(data,info.seriesData.winnerUid)) || participantName(data,data.winnerId) || 'Le vainqueur')
      : (participantName(data,data.winnerId) || 'Le vainqueur');
    showMatchEndModal({winnerName,winnerId:info.seriesData?.winnerUid || data.winnerId,draw:Boolean(data.draw),replayId:info.seriesId || match.id,scoreLabel:seriesScoreLabel(info.seriesData),forfeit:data.forfeitReason === 'attendance-timeout',shareable:true});
  };

  const watchOfficialSeries = seriesId => {
    if (officialWatchedSeriesId === (seriesId || null)) return;
    officialSeriesUnsubscribe?.();
    officialSeriesUnsubscribe = null;
    officialSeriesData = null;
    officialWatchedSeriesId = seriesId || null;
    if (!seriesId) return;
    officialSeriesUnsubscribe = db.collection('matches').doc(seriesId).onSnapshot(snapshot => {
      officialSeriesData = snapshot.exists ? snapshot.data() : null;
      if (officialLastGame) { renderOfficialBoard(officialLastGame); evaluateMatchEndState(officialLastGame); }
    },error => console.error('Series stream failed:',error));
  };

  const resetOfficialSeriesState = () => {
    officialSeriesUnsubscribe?.();
    officialSeriesUnsubscribe = null;
    officialSeriesData = null;
    officialWatchedSeriesId = null;
    officialLastGame = null;
    seriesSyncedGameId = null;
    officialDominoHand = [];
    officialDominoHandMatchId = null;
    officialDominoHandPending = false;
    selectedOfficialDominoTileId = '';
    resetOfficialDominoFrame();
    hideMatchEndModal();
  };

  matchEndModal?.addEventListener('click',event => { if (event.target === matchEndModal) hideMatchEndModal(); });
  $('#match-end-close')?.addEventListener('click',hideMatchEndModal);
  $('#match-end-share')?.addEventListener('click',event => {
    const matchId = event.currentTarget.dataset.matchId;
    if (matchId) window.JwetproShare?.open({type:'qualification',matchId});
  });
  matchEndNext?.addEventListener('click',async () => {
    if (seriesAdvancePending || !pendingFinishedGameId || !functions) return;
    seriesAdvancePending = true;
    matchEndNext.disabled = true;
    matchEndNext.innerHTML = '<span class="state-spinner"></span>Préparation de la manche…';
    try {
      const dominoGame = isDomino(officialLastGame?.data || {});
      const response = await functions.httpsCallable(dominoGame ? 'advanceDominoSeries' : 'advanceMopyonSeries')({gameId:pendingFinishedGameId});
      const result = response.data || {};
      if (result.seriesComplete) {
        pendingFinishedGameId = null;
        return;
      }
      const nextGameId = String(result.nextGameId || '');
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(nextGameId)) throw new Error('NEXT_GAME_NOT_PUBLISHED');
      await functions.httpsCallable(dominoGame ? 'joinDominoMatch' : 'joinMopyonMatch')({matchId:nextGameId});
      pendingFinishedGameId = null;
      hideMatchEndModal();
      openOfficialMatch(nextGameId,{spectator:false});
    } catch (error) {
      console.error('Series advance failed:',error);
      matchEndSubtitle.textContent = 'La manche suivante n’a pas pu être ouverte. Réessayez dans quelques instants.';
      matchEndNext.disabled = false;
      matchEndNext.innerHTML = `${icon('refresh-cw')}Réessayer`;
      window.renderIcons?.();
    } finally {
      seriesAdvancePending = false;
    }
  });

  const officialPlayerMarkup = (data,uid,index,showSymbol=true) => {
    const name = participantName(data,uid) || `Joueur ${index + 1}`;
    const symbol = data.playerSymbols?.[uid] || (index === 0 ? 'X' : 'O');
    const role = spectatorMode ? `Joueur ${index + 1}` : uid === currentUser?.uid ? 'Vous' : 'Adversaire';
    return `${showSymbol ? `<span>${escapeHtml(symbol)}</span>` : ''}<strong>${escapeHtml(name)}</strong><small>${role}</small>`;
  };

  const stopAttendanceTimer = () => {
    window.clearInterval(attendanceTimer);
    attendanceTimer = null;
    forfeitClaimPending = false;
  };

  const claimAttendanceForfeit = async matchId => {
    if (forfeitClaimPending || spectatorMode || !functions) return;
    forfeitClaimPending = true;
    try {
      await functions.httpsCallable(isDomino(officialLastGame?.data || {}) ? 'claimDominoForfeit' : 'claimMopyonForfeit')({matchId});
    } catch (error) {
      // A simultaneous opponent join legitimately makes the claim fail. The Firestore stream will
      // then replace the waiting card with the board, so no alarming message is shown to the player.
      console.warn('Automatic attendance forfeit was not applied:',error?.code || error?.message);
      forfeitClaimPending = false;
    }
  };

  const renderAttendanceWaiting = (match, opponentId) => {
    const deadline = attendanceDeadline(match.data);
    const opponent = participantName(match.data,opponentId) || 'Votre adversaire';
    resetOfficialDominoFrame();
    officialBoard.classList.remove('domino-live-board','domino-official-table','domino-embed-board');
    officialBoard.classList.add('is-waiting');
    officialBoard.setAttribute('role','timer');
    officialBoard.setAttribute('aria-label',`En attente de ${opponent}`);
    officialBoard.innerHTML = `<div class="play-state attendance-waiting">${icon('clock-3')}<span class="attendance-kicker">DÉLAI DE PRÉSENCE</span><strong>En attente de l’adversaire</strong><b class="attendance-clock" data-official-attendance>05:00</b><p>${escapeHtml(opponent)} dispose de cinq minutes pour rejoindre le match. Passé ce délai, la victoire vous sera attribuée automatiquement par forfait de temps.</p></div>`;
    $('#official-match-status').textContent = 'En attente';
    $('#official-turn').textContent = 'Vous êtes présent. Gardez cette page ouverte pendant la vérification de votre adversaire.';
    stopAttendanceTimer();
    const update = () => {
      const remaining = Number.isFinite(deadline) ? Math.max(0,deadline - Date.now()) : OPPONENT_GRACE_PERIOD_MS;
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const clock = officialBoard.querySelector('[data-official-attendance]');
      if (clock) clock.textContent = `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
      if (Number.isFinite(deadline) && remaining <= 0) {
        window.clearInterval(attendanceTimer);
        attendanceTimer = null;
        if (clock) clock.textContent = 'Validation…';
        claimAttendanceForfeit(match.id);
      }
    };
    update();
    if (Number.isFinite(deadline) && deadline > Date.now()) attendanceTimer = window.setInterval(update,1000);
    window.renderIcons?.();
  };

  const dominoDotPositions = value => ({0:[],1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]}[Number(value)] || []);
  const dominoHalfMarkup = value => {
    const dots = new Set(dominoDotPositions(value));
    return `<span class="official-domino-half" aria-label="${escapeHtml(value)}">${Array.from({length:9},(_,index)=>`<i${dots.has(index+1)?' class="is-dot"':''}></i>`).join('')}</span>`;
  };
  const dominoTileMarkup = (tile,{button=false,disabled=false,selected=false,label=''}={}) => {
    const content = `${dominoHalfMarkup(tile.a)}<span class="official-domino-divider"></span>${dominoHalfMarkup(tile.b)}`;
    if (!button) return `<span class="official-domino-tile board-domino" aria-label="Domino ${escapeHtml(tile.a)} et ${escapeHtml(tile.b)}">${content}</span>`;
    return `<button class="official-domino-tile hand-domino${selected?' is-selected':''}" type="button" data-official-domino-tile="${escapeHtml(tile.id)}" aria-label="${escapeHtml(label || `Jouer le domino ${tile.a}-${tile.b}`)}"${disabled?' disabled':''}>${content}</button>`;
  };
  const officialDominoSides = (tile,boardTiles,starterTileId='') => {
    if (!boardTiles.length) return starterTileId && tile.id !== starterTileId ? [] : ['start'];
    const left=boardTiles[0]?.a; const right=boardTiles.at(-1)?.b; const sides=[];
    if(tile.a===left||tile.b===left)sides.push('left');
    if(tile.a===right||tile.b===right)sides.push('right');
    return sides;
  };
  const refreshOfficialDominoHand = async matchId => {
    if (!functions || spectatorMode || !currentUser || officialDominoHandPending) return;
    officialDominoHandPending = true;
    let refreshed = false;
    try {
      const response = await functions.httpsCallable('getDominoMatchState')({matchId});
      officialDominoHand = Array.isArray(response.data?.hand) ? response.data.hand : [];
      officialDominoHandMatchId = matchId;
      if (!officialDominoHand.some(tile=>tile.id===selectedOfficialDominoTileId)) selectedOfficialDominoTileId='';
      refreshed = true;
    } catch(error) {
      console.error('Domino private hand read failed:',error);
      $('#official-turn').textContent='Votre main Domino ne peut pas être chargée pour le moment.';
    } finally {
      officialDominoHandPending=false;
      if (refreshed && officialLastGame?.id === matchId) renderOfficialBoard(officialLastGame);
    }
  };
  const submitOfficialDominoAction = async (matchId,action,tileId='',side='') => {
    if(officialMovePending||!functions)return;
    officialMovePending=true;
    try {
      await functions.httpsCallable('submitDominoMove')({matchId,action,tileId,side});
      selectedOfficialDominoTileId='';
      officialDominoHandMatchId=null;
      await refreshOfficialDominoHand(matchId);
    } catch(error) {
      console.error('Official Domino action failed:',error);
      $('#official-turn').textContent='Cette action Domino n’a pas été acceptée. Le plateau va être resynchronisé.';
    } finally {
      officialMovePending=false;
      if (officialLastGame?.id === matchId) renderOfficialBoard(officialLastGame);
    }
  };

  const renderOfficialDominoBoard = (match,canPlay) => {
    const data=match.data;
    const boardTiles=(Array.isArray(data.boardTiles)?data.boardTiles:Array.isArray(data.board)?data.board:[]).filter(tile=>tile&&Number.isInteger(tile.a)&&Number.isInteger(tile.b));
    const hand=officialDominoHandMatchId===match.id?officialDominoHand:[];
    const ids=participantIds(data);
    const opponentId=ids.find(uid=>uid!==currentUser?.uid);
    const opponentCount=Number(data.handCounts?.[opponentId]);
    officialSection.classList.add('is-domino-match');
    officialBoard.classList.remove('domino-live-board','domino-official-table','is-waiting');
    officialBoard.classList.add('domino-embed-board');
    officialBoard.setAttribute('role','group');
    officialBoard.setAttribute('aria-label','Plateau Domino officiel, identique au mode entraînement');
    if (!officialDominoFrame?.isConnected) {
      officialBoard.innerHTML='<iframe id="official-domino-match-frame" title="Plateau Domino du match officiel" src="./dominocash/index.html?embed=1&intro=0&official=1&v=20260906-official-match" loading="eager" allow="autoplay; fullscreen" allowfullscreen></iframe>';
      officialDominoFrame=officialBoard.querySelector('#official-domino-match-frame');
      officialDominoFrameReady=false;
    }
    officialDominoFramePayload={
      matchId:match.id,
      hand:spectatorMode?[]:hand,
      boardTiles,
      opponentCount:Number.isFinite(opponentCount)?Math.max(0,opponentCount):0,
      drawPileCount:Math.max(0,Number(data.drawPileCount)||0),
      starterTileId:String(data.starterTileId||''),
      currentTurn:data.currentTurnUid===currentUser?.uid?'self':'opponent',
      interactive:Boolean(canPlay&&!spectatorMode&&officialDominoHandMatchId===match.id&&!officialMovePending),
      complete:Boolean(data.winnerId||data.draw),
      spectator:spectatorMode,
      revision:`${Array.isArray(data.moves)?data.moves.length:0}:${boardTiles.length}:${String(data.currentTurnUid||'')}`
    };
    postOfficialDominoState();
  };

  const renderOfficialBoard = match => {
    const data = match.data;
    const ids = participantIds(data);
    const opponentId = ids.find(id => id !== currentUser?.uid);
    const waitingForRealOpponent = !spectatorMode && Boolean(currentUser?.uid) && ids.includes(currentUser.uid)
      && !data.winnerId && !data.draw && Boolean(data.presence?.[currentUser.uid])
      && opponentId && !data.presence?.[opponentId] && !isBotParticipant(data,opponentId);
    if (waitingForRealOpponent) {
      renderAttendanceWaiting(match,opponentId);
      return;
    }
    stopAttendanceTimer();
    officialBoard.classList.remove('is-waiting');
    const dominoMatch = isDomino(data);
    officialSection.classList.toggle('is-domino-match',dominoMatch);
    const liveStatus = isLive(normalizeStatus(data.status || data.state));
    const canPlay = !spectatorMode && Boolean(currentUser?.uid) && liveStatus && data.currentTurnUid === currentUser.uid && !data.winnerId && !data.draw;
    $('#official-player-one').innerHTML = officialPlayerMarkup(data,ids[0],0,!dominoMatch);
    $('#official-player-two').innerHTML = officialPlayerMarkup(data,ids[1],1,!dominoMatch);
    $('#official-match-title').textContent = matchTitle(data,match.id);
    const endInfo = officialMatchEndInfo(data);
    $('#official-match-status').textContent = endInfo.matchTrulyOver
      ? (data.forfeitReason === 'attendance-timeout' ? 'Forfait de temps' : data.draw ? 'Match nul' : 'Match terminé')
      : endInfo.gameOver
        ? (data.draw ? 'Manche nulle' : 'Manche terminée')
        : liveStatus ? 'En direct' : 'Synchronisation';
    const currentPlayer = participantName(data,data.currentTurnUid) || 'Le joueur actif';
    const scoreText = seriesScoreLabel(endInfo.seriesData);
    $('#official-turn').textContent = endInfo.matchTrulyOver
      ? (data.forfeitReason === 'attendance-timeout'
          ? `${participantName(data,data.forfeitedUid) || 'L’adversaire'} perd le match par forfait de temps.`
          : data.draw ? 'La partie se termine sur un match nul.' : `${participantName(data,data.winnerId) || 'Le vainqueur'} remporte le match.`)
      : endInfo.gameOver
        ? (data.draw
            ? `Manche nulle.${scoreText ? ` Score de la rencontre : ${scoreText}.` : ''} La manche suivante va commencer.`
            : `${participantName(data,data.winnerId) || 'Le vainqueur'} remporte cette manche.${scoreText ? ` Score de la rencontre : ${scoreText}.` : ''} La manche suivante va commencer.`)
        : !liveStatus
          ? 'Le match commencera à l’horaire prévu.'
        : spectatorMode
          ? `${currentPlayer} doit jouer.`
          : canPlay ? 'À vous de jouer.' : 'Tour de votre adversaire.';
    if (dominoMatch) {
      renderOfficialDominoBoard(match,canPlay);
      return;
    }
    const board = Array.isArray(data.board) && data.board.length === BOARD_CELLS ? data.board : Array(BOARD_CELLS).fill('');
    resetOfficialDominoFrame();
    officialBoard.classList.remove('domino-live-board','domino-official-table','domino-embed-board');
    officialBoard.setAttribute('role','grid');
    officialBoard.setAttribute('aria-label','Plateau Mopyon du match en direct');
    officialBoard.innerHTML = board.map((value,index) => `<button class="official-cell ${value ? value.toLowerCase() : ''}" type="button" role="gridcell" data-official-index="${index}" aria-label="Ligne ${Math.floor(index/20)+1}, colonne ${index%20+1}${value?`, ${escapeHtml(value)}`:', vide'}" ${canPlay&&!value?'':'disabled'}>${escapeHtml(value)}</button>`).join('');
    officialBoard.querySelectorAll('[data-official-index]:not(:disabled)').forEach(cell => cell.addEventListener('click',() => submitOfficialMove(match.id,Number(cell.dataset.officialIndex))));
  };

  const openOfficialMatch = (matchId,{spectator=false}={}) => {
    spectatorMode = spectator;
    viewingOfficialMatchId = matchId;
    officialUnsubscribe?.();
    resetOfficialSeriesState();
    if (spectatorMode) {
      document.title='Match en direct — JWETPRO';
      activateTab('live');
      liveMatchesList.hidden = true;
      $('#official-match-kicker').textContent = 'MATCH EN DIRECT';
      $('#official-back').setAttribute('aria-label','Retour aux matchs en direct');
    } else {
      activateTab('matches');
      matchList.hidden = true;
      $('#official-match-kicker').textContent = 'MATCH OFFICIEL';
      $('#official-back').setAttribute('aria-label','Retour a mes matchs');
    }
    officialSection.hidden = false;
    officialBoard.classList.remove('domino-live-board','domino-official-table','domino-embed-board');
    officialBoard.classList.add('is-waiting');
    officialBoard.setAttribute('role','status');
    officialBoard.setAttribute('aria-label','Connexion au plateau du match');
    officialBoard.innerHTML='<div class="play-state"><span class="state-spinner"></span><strong>Connexion au plateau...</strong></div>';
    officialUnsubscribe = db.collection('matches').doc(matchId).onSnapshot(snapshot => {
      if (!snapshot.exists) {
        officialBoard.innerHTML='<div class="play-state"><strong>Match introuvable</strong><p>Ce match officiel n’existe plus.</p></div>';
        return;
      }
      const match = {id:snapshot.id,data:snapshot.data()};
      officialLastGame = match;
      watchOfficialSeries(match.data.seriesId || null);
      renderOfficialBoard(match);
      if (isDomino(match.data) && !spectatorMode && participantIds(match.data).includes(currentUser?.uid) && officialDominoHandMatchId !== match.id) refreshOfficialDominoHand(match.id);
      evaluateMatchEndState(match);
    },error => {
      console.error('Official match stream failed:',error);
      $('#official-turn').textContent='Connexion au match interrompue.';
      officialBoard.innerHTML='<div class="play-state"><strong>Match indisponible</strong><p>Ce match ne peut pas être affiché publiquement pour le moment.</p></div>';
    });
  };

  const openPlannedSeriesLobby = match => {
    spectatorMode = false;
    viewingOfficialMatchId = match.id;
    officialUnsubscribe?.();
    resetOfficialSeriesState();
    activateTab('matches');
    matchList.hidden = true;
    officialSection.hidden = false;
    $('#official-match-kicker').textContent = 'VOTRE MATCH PLANIFIÉ';
    $('#official-back').setAttribute('aria-label','Retour à mes matchs');
    let openingGame = false;
    const renderLobby = data => {
      resetOfficialDominoFrame();
      const ids = participantIds(data);
      $('#official-player-one').innerHTML = officialPlayerMarkup(data,ids[0],0,false);
      $('#official-player-two').innerHTML = officialPlayerMarkup(data,ids[1],1,false);
      $('#official-match-title').textContent = matchTitle(data,match.id);
      $('#official-match-status').textContent = 'Match planifié';
      $('#official-turn').textContent = 'Vous avez rejoint votre espace de match. Le plateau s’ouvrira automatiquement dès sa publication.';
      officialBoard.classList.remove('domino-live-board','domino-official-table','domino-embed-board');
      officialBoard.classList.add('is-waiting');
      officialBoard.setAttribute('role','status');
      officialBoard.setAttribute('aria-label','En attente du plateau du match planifié');
      officialBoard.innerHTML = `<div class="play-state">${icon('clock-3')}<strong>En attente du plateau</strong><p>Restez sur cette page. Votre partie démarrera ici dès que l’organisateur ouvrira la première manche.</p></div>`;
      window.renderIcons?.();
    };
    renderLobby(match.data);
    const joinPreparedGame = async gameId => {
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) throw new Error('INVALID_GAME_ID');
      const gameSnapshot = await db.collection('matches').doc(gameId).get();
      if (!gameSnapshot.exists || !participantIds(gameSnapshot.data()).includes(currentUser?.uid)) throw new Error('GAME_ACCESS_DENIED');
      const joinFunction = isDomino(gameSnapshot.data()) ? 'joinDominoMatch' : 'joinMopyonMatch';
      await functions.httpsCallable(joinFunction)({matchId:gameId});
      openOfficialMatch(gameId);
    };
    officialUnsubscribe = db.collection('matches').doc(match.id).onSnapshot(async snapshot => {
      if (!snapshot.exists) return;
      const data = snapshot.data();
      renderLobby(data);
      const gameId = data.currentGameId || data.activeGameId || data.gameId || '';
      if (openingGame) return;
      if (!gameId) {
        const ids = participantIds(data);
        const opponentId = ids.find(id => id !== currentUser?.uid);
        const canPrepareMopyonBot = isMopyon(data) && isBotParticipant(data,opponentId,currentUser?.uid || '');
        const canPrepareDomino = isDomino(data);
        if (!canPrepareMopyonBot && !canPrepareDomino) return;
        openingGame = true;
        $('#official-match-status').textContent = 'Préparation';
        $('#official-turn').textContent = canPrepareDomino ? 'Création sécurisée de la première manche Domino…' : 'Création de la première manche contre le joueur simulé…';
        officialBoard.innerHTML = `<div class="play-state"><span class="state-spinner"></span><strong>Ouverture du plateau…</strong><p>${canPrepareDomino ? 'Le plateau Domino officiel est en préparation.' : 'Votre adversaire simulé est en cours de connexion.'}</p></div>`;
        try {
          const preparation = await functions.httpsCallable(canPrepareDomino ? 'joinDominoMatch' : 'joinMopyonMatch')({matchId:match.id});
          const preparedId = String(preparation.data?.matchId || '');
          if (!preparedId || preparedId === match.id) throw new Error('GAME_NOT_PREPARED');
          await joinPreparedGame(preparedId);
        } catch (error) {
          console.error('Simulated series preparation failed:',error);
          openingGame = false;
          $('#official-match-status').textContent = 'Préparation interrompue';
          $('#official-turn').textContent = 'Le plateau n’a pas pu être ouvert. Réessayez en revenant à vos matchs.';
        }
        return;
      }
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) return;
      openingGame = true;
      try {
        await joinPreparedGame(gameId);
      } catch (error) {
        console.error('Planned series join failed:',error);
        openingGame = false;
        $('#official-turn').textContent = 'Le plateau est en préparation. Il sera ouvert automatiquement dès qu’il sera disponible.';
      }
    },error => {
      console.error('Planned series stream failed:',error);
      $('#official-turn').textContent = 'La connexion à votre match planifié est momentanément interrompue.';
    });
  };

  const submitOfficialMove = async (matchId,index) => {
    if (officialMovePending) return;
    officialMovePending = true;
    officialBoard.querySelectorAll('button').forEach(button => {button.disabled=true;});
    try {
      const submitMove = functions.httpsCallable('submitMopyonMove');
      await submitMove({matchId,index});
    } catch (error) {
      console.error('Official move failed:',error);
      $('#official-turn').textContent = 'Ce coup n’a pas ete accepte. Le plateau va etre resynchronise.';
    } finally {
      officialMovePending = false;
    }
  };

  $('#official-back').addEventListener('click',() => {
    officialUnsubscribe?.();
    officialUnsubscribe=null;
    viewingOfficialMatchId=null;
    officialSection.hidden=true;
    resetOfficialSeriesState();
    if (spectatorMode) {
      liveMatchesList.hidden=false;
      activateTab('live');
      renderLiveMatches();
      return;
    }
    matchList.hidden=false;
    activateTab('matches');
  });

  const isSimulation = (data,id) => Boolean(data.simulated || data.isSimulation || data.simulationId || /(^|[-_])sim(?:ulation)?(?:[-_]|$)/i.test(String(id || '')));

  const replayPlayers = data => {
    const ids = participantIds(data);
    const objects = participantDetails(data);
    const rawPlayers = Array.isArray(data.players) ? data.players : [data.player1 || data.firstPlayer,data.player2 || data.secondPlayer].filter(Boolean);
    return [0,1].map(index => {
      const raw = rawPlayers[index];
      const id = ids[index] || (raw && typeof raw === 'object' ? raw.uid || raw.id || raw.userId || raw.playerId : '');
      const object = objects[index] || (raw && typeof raw === 'object' ? raw : null);
      const name = participantName(data,id) || (typeof raw === 'string' ? raw : '') || object?.name || object?.displayName || object?.username || `Joueur ${index + 1}`;
      const symbol = String(data.playerSymbols?.[id] || object?.symbol || (index === 0 ? 'X' : 'O')).toUpperCase() === 'O' ? 'O' : 'X';
      return {id,name:String(name),symbol};
    });
  };

  const normalizeReplayMoves = data => {
    const rawMoves = [data.moves,data.moveHistory,data.history].find(Array.isArray) || [];
    const seen = new Set();
    return rawMoves.map((move,order) => {
      const item = move && typeof move === 'object' ? move : {index:move};
      const index = Number(item.index ?? item.cell ?? item.position);
      const mapped = item.playerId ? data.playerSymbols?.[item.playerId] : '';
      const symbol = String(item.symbol || item.mark || mapped || (order % 2 ? 'O' : 'X')).toUpperCase();
      if (!Number.isInteger(index) || index < 0 || index >= BOARD_CELLS || !['X','O'].includes(symbol) || seen.has(index)) return null;
      seen.add(index);
      return {index,symbol};
    }).filter(Boolean);
  };

  const normalizeDominoReplayMoves = data => {
    const rawMoves = Array.isArray(data.moves) ? data.moves : [];
    return rawMoves.map(move => {
      if (!move || typeof move !== 'object') return null;
      const boardAfter = Array.isArray(move.boardAfter) ? move.boardAfter.filter(tile => tile && typeof tile.a === 'number' && typeof tile.b === 'number') : null;
      if (!boardAfter) return null;
      return {type:move.type || 'play',playerId:move.playerId || '',tileId:move.tileId || '',side:move.side || '',boardAfter};
    }).filter(Boolean);
  };

  const stringHash = value => [...String(value)].reduce((hash,character) => Math.imul(hash ^ character.charCodeAt(0),16777619) >>> 0,2166136261);

  const simulatedReplayMoves = (data,id,players) => {
    const hash = stringHash(id);
    if (data.draw) {
      const cells = [42,63,84,105,126,58,77,96,115,134,247,268,289,310,331,253,272,291];
      const shift = hash % 3;
      return cells.map((index,order) => ({index:index + shift,symbol:order % 2 ? 'O' : 'X'}));
    }
    const winnerName = String(data.winnerName || data.championName || data.winner?.name || (typeof data.winner === 'string' ? data.winner : '')).toLocaleLowerCase('fr');
    const explicitWinner = String(data.winnerSymbol || data.winnerMark || data.playerSymbols?.[data.winnerId] || '').toUpperCase();
    const winner = ['X','O'].includes(explicitWinner) ? explicitWinner : players.find(player => (player.id && player.id === data.winnerId) || (winnerName && player.name.toLocaleLowerCase('fr') === winnerName))?.symbol || 'X';
    const loser = winner === 'X' ? 'O' : 'X';
    const horizontal = hash % 2 === 0;
    const row = 5 + hash % 9;
    const column = 4 + (hash >>> 4) % 10;
    const line = Array.from({length:5},(_,offset) => horizontal ? row * 20 + column + offset : (row + offset) * 20 + column);
    const occupied = new Set(line);
    const distractions = [];
    let seed = hash || 1;
    while (distractions.length < 5) {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      const index = seed % BOARD_CELLS;
      if (!occupied.has(index)) { occupied.add(index); distractions.push(index); }
    }
    const winnerStarts = winner === 'X';
    const moves = [];
    for (let index=0; index<5; index += 1) {
      if (winnerStarts) moves.push({index:line[index],symbol:winner});
      moves.push({index:distractions[index],symbol:loser});
      if (!winnerStarts) moves.push({index:line[index],symbol:winner});
    }
    return moves;
  };

  const replayPlayerMarkup = (player,showSymbol = true) => showSymbol ? `<span>${escapeHtml(player.symbol)}</span><div><strong>${escapeHtml(player.name)}</strong><small>Joue avec ${escapeHtml(player.symbol)}</small></div>` : `<div><strong>${escapeHtml(player.name)}</strong></div>`;

  const stopReplay = () => {
    window.clearInterval(replayTimer);
    replayTimer = null;
    const button = $('#match-replay-play');
    if (button) {
      button.innerHTML = `${icon('play')}<span>Lire</span>`;
      button.setAttribute('aria-label','Lire le replay');
    }
    window.renderIcons?.();
  };

  const replayResultText = () => {
    const data = replayMatch?.data || {};
    if (data.forfeitReason === 'attendance-timeout' || (data.forfeit === true && data.completionReason === 'attendance-timeout')) {
      const forfeited = replayMatch?.players.find(player => player.id && player.id === data.forfeitedUid);
      return `${forfeited?.name || 'Le joueur absent'} a perdu par forfait de temps après cinq minutes d’absence.`;
    }
    if (data.draw) return 'Match nul. Le replay est termine.';
    const winner = replayMatch?.players.find(player => player.id && player.id === data.winnerId);
    const winnerName = winner?.name || data.winnerName || data.championName || data.winner?.name || (typeof data.winner === 'string' ? data.winner : '');
    return winnerName ? `${winnerName} remporte le match.` : 'Match termine. Fin du replay.';
  };

  const renderMopyonReplayFrame = index => {
    replayIndex = Math.max(0,Math.min(index,replayMoves.length));
    const board = Array(BOARD_CELLS).fill('');
    replayMoves.slice(0,replayIndex).forEach(move => { board[move.index]=move.symbol; });
    const lastMove = replayIndex ? replayMoves[replayIndex - 1].index : -1;
    replayBoard.innerHTML = board.map((value,cellIndex) => `<button class="official-cell ${value ? value.toLowerCase() : ''}${cellIndex === lastMove ? ' last-move' : ''}" type="button" role="gridcell" aria-label="Ligne ${Math.floor(cellIndex/20)+1}, colonne ${cellIndex%20+1}${value ? `, ${value}` : ', vide'}" disabled>${escapeHtml(value)}</button>`).join('');
    $('#match-replay-progress').textContent = `Coup ${replayIndex} / ${replayMoves.length}`;
    $('#match-replay-progress-bar').style.width = `${replayMoves.length ? replayIndex / replayMoves.length * 100 : 0}%`;
    $('#match-replay-status').textContent = replayIndex === replayMoves.length ? replayResultText() : replayIndex ? `Coup ${replayIndex} : ${replayMoves[replayIndex-1].symbol} vient de jouer.` : replayMatch?.simulation ? 'Cette séquence est un replay simulé de la partie.' : 'Le match va commencer.';
    $('#match-replay-start').disabled = replayIndex === 0;
    $('#match-replay-back').disabled = replayIndex === 0;
    $('#match-replay-forward').disabled = replayIndex === replayMoves.length;
    $('#match-replay-end').disabled = replayIndex === replayMoves.length;
    if (replayIndex === replayMoves.length) stopReplay();
  };

  const dominoMoveLabel = move => {
    if (!move) return 'La manche va commencer.';
    if (move.type === 'draw') return 'Pioche.';
    if (move.type === 'pass') return 'Passe (bloqué).';
    return `Tuile ${move.tileId} posée${move.side && move.side !== 'start' ? ` (${move.side === 'left' ? 'à gauche' : 'à droite'})` : ''}.`;
  };

  const renderDominoReplayFrame = index => {
    replayIndex = Math.max(0,Math.min(index,replayMoves.length));
    const move = replayIndex ? replayMoves[replayIndex - 1] : null;
    const boardTiles = move ? move.boardAfter : [];
    if (replayDominoBoard) replayDominoBoard.innerHTML = boardTiles.length ? boardTiles.map(tile => `<span class="domino-replay-tile">${escapeHtml(tile.a)}|${escapeHtml(tile.b)}</span>`).join('') : '<p class="replay-empty">Plateau vide.</p>';
    $('#match-replay-progress').textContent = `Coup ${replayIndex} / ${replayMoves.length}`;
    $('#match-replay-progress-bar').style.width = `${replayMoves.length ? replayIndex / replayMoves.length * 100 : 0}%`;
    $('#match-replay-status').textContent = replayIndex === replayMoves.length ? replayResultText() : dominoMoveLabel(move);
    $('#match-replay-start').disabled = replayIndex === 0;
    $('#match-replay-back').disabled = replayIndex === 0;
    $('#match-replay-forward').disabled = replayIndex === replayMoves.length;
    $('#match-replay-end').disabled = replayIndex === replayMoves.length;
    if (replayIndex === replayMoves.length) stopReplay();
  };

  const renderReplayFrame = index => replayMatch?.isDomino ? renderDominoReplayFrame(index) : renderMopyonReplayFrame(index);

  const startReplay = () => {
    if (replayIndex === replayMoves.length) renderReplayFrame(0);
    window.clearInterval(replayTimer);
    const button = $('#match-replay-play');
    button.innerHTML = `${icon('pause')}<span>Pause</span>`;
    button.setAttribute('aria-label','Mettre le replay en pause');
    window.renderIcons?.();
    replayTimer = window.setInterval(() => renderReplayFrame(replayIndex + 1),Math.max(180,900 / replaySpeed));
  };

  const showReplayError = (title,message) => {
    replayView.hidden=false;
    replayView.innerHTML=`<div class="replay-error">${icon('circle-alert')}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p><a class="match-action" href="./activity.html">Retour aux activites</a></div>`;
    window.renderIcons?.();
  };

  const replayGameNumber = (game,index) => Number(game?.data?.gameNumber) || index + 1;

  const selectReplayGame = (game,index) => {
    stopReplay();
    const data = game.data || {};
    const matchIsDomino = isDomino(data);
    const players = replayPlayers(data);
    const simulationMatch = isSimulation(data,game.id);
    const attendanceForfeit = data.forfeitReason === 'attendance-timeout' || (data.forfeit === true && data.completionReason === 'attendance-timeout');
    let moves = matchIsDomino ? normalizeDominoReplayMoves(data) : normalizeReplayMoves(data);
    if (!moves.length && simulationMatch && !matchIsDomino && !attendanceForfeit) moves = simulatedReplayMoves(data,game.id,players);
    if (!moves.length && !attendanceForfeit) {
      showReplayError('Replay indisponible',`Aucun historique de coups n’a été enregistré pour la manche ${replayGameNumber(game,index)}.`);
      return;
    }
    replayMatch={id:game.id,data,players,simulation:simulationMatch,isDomino:matchIsDomino};
    replayMoves=moves;
    replayIndex=0;
    if (replayBoard) replayBoard.hidden = matchIsDomino;
    if (replayDominoBoard) replayDominoBoard.hidden = !matchIsDomino;
    const titleData = replaySeries?.data || data;
    $('#match-replay-title').textContent = `${String(titleData.game || titleData.type || 'Mopyon').toUpperCase()} #${titleData.number || titleData.matchNumber || replaySeries?.id || game.id}`;
    const source = simulationMatch ? 'REPLAY SIMULÉ' : 'REPLAY OFFICIEL';
    $('#match-replay-source').textContent=source;
    $('#match-replay-source').classList.toggle('is-simulated',source === 'REPLAY SIMULÉ');
    $('#match-replay-player-one').innerHTML=replayPlayerMarkup(players[0],!matchIsDomino);
    $('#match-replay-player-two').innerHTML=replayPlayerMarkup(players[1],!matchIsDomino);
    renderReplayFrame(0);
    $('#match-replay-play').disabled = !moves.length;
    $('#match-replay-speed').disabled = !moves.length;
    replayMancheSelector?.querySelectorAll('[data-replay-game]').forEach((button,buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-current',active ? 'true' : 'false');
    });
    window.renderIcons?.();
  };

  const renderReplayMancheSelector = () => {
    if (!replayMancheSelector) return;
    replayMancheSelector.hidden = !replaySeries || replaySeriesGames.length < 1;
    replayMancheSelector.innerHTML = replaySeriesGames.map((game,index) => {
      const winner = game.data?.draw ? 'Nulle' : replayPlayers(game.data)[0]?.id === game.data?.winnerId ? 'Joueur 1' : replayPlayers(game.data)[1]?.id === game.data?.winnerId ? 'Joueur 2' : 'Terminée';
      return `<button type="button" data-replay-game="${escapeHtml(game.id)}"><span>Manche ${replayGameNumber(game,index)}</span><small>${escapeHtml(winner)}</small></button>`;
    }).join('');
    replayMancheSelector.querySelectorAll('[data-replay-game]').forEach((button,index) => button.addEventListener('click',() => selectReplayGame(replaySeriesGames[index],index)));
  };

  const readReplaySeriesGames = async (series,extraGame=null) => {
    const ids = Array.isArray(series.data.gameIds) ? series.data.gameIds.filter(id => typeof id === 'string') : [];
    const currentId = String(series.data.currentGameId || series.data.activeGameId || '');
    if (currentId && !ids.includes(currentId)) ids.push(currentId);
    if (extraGame?.id && !ids.includes(extraGame.id)) ids.push(extraGame.id);
    const snapshots = await Promise.all(ids.filter(id => /^[A-Za-z0-9_-]{1,160}$/.test(id)).map(id => db.collection('matches').doc(id).get()));
    const games = snapshots.filter(snapshot => snapshot.exists).map(snapshot => ({id:snapshot.id,data:snapshot.data() || {}}));
    if (extraGame && !games.some(game => game.id === extraGame.id)) games.push(extraGame);
    return games.sort((a,b) => (Number(a.data.gameNumber) || ids.indexOf(a.id) + 1) - (Number(b.data.gameNumber) || ids.indexOf(b.id) + 1));
  };

  const loadMatchReplay = async id => {
    document.querySelector('.play-tabs').hidden=true;
    Object.values(matchPanels).forEach(panel => {panel.hidden=true;});
    replayView.hidden=false;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return showReplayError('Lien de replay invalide','Revenez aux activites et selectionnez de nouveau le match.');
    try {
      const snapshot = await db.collection('matches').doc(id).get();
      if (!snapshot.exists) return showReplayError('Replay introuvable','Ce match n’existe plus ou son replay n’est pas public.');
      const data = snapshot.data() || {};
      const requestedGame = data.kind === 'series' ? null : {id:snapshot.id,data};
      if (data.kind === 'series') replaySeries = {id:snapshot.id,data};
      else if (data.seriesId && /^[A-Za-z0-9_-]{1,160}$/.test(data.seriesId)) {
        const seriesSnapshot = await db.collection('matches').doc(data.seriesId).get();
        replaySeries = seriesSnapshot.exists ? {id:seriesSnapshot.id,data:seriesSnapshot.data() || {}} : null;
      } else replaySeries = null;

      if (replaySeries) {
        replaySeriesGames = await readReplaySeriesGames(replaySeries,requestedGame);
        if (!replaySeriesGames.length) return showReplayError('Replay indisponible','Aucune manche terminée n’a encore été publiée pour ce match.');
        renderReplayMancheSelector();
        selectReplayGame(replaySeriesGames[0],0);
      } else {
        replaySeriesGames = [];
        renderReplayMancheSelector();
        selectReplayGame(requestedGame,0);
      }
    } catch (error) {
      console.error('Replay read failed:',error);
      showReplayError('Replay indisponible','Impossible de charger ce replay pour le moment. Reessayez dans quelques instants.');
    }
  };

  $('#match-replay-start')?.addEventListener('click',() => {stopReplay(); renderReplayFrame(0);});
  $('#match-replay-back')?.addEventListener('click',() => {stopReplay(); renderReplayFrame(replayIndex-1);});
  $('#match-replay-forward')?.addEventListener('click',() => {stopReplay(); renderReplayFrame(replayIndex+1);});
  $('#match-replay-end')?.addEventListener('click',() => {stopReplay(); renderReplayFrame(replayMoves.length);});
  $('#match-replay-play')?.addEventListener('click',() => replayTimer ? stopReplay() : startReplay());
  $('#match-replay-speed')?.addEventListener('click',event => {
    const speeds=[1,2,4]; replaySpeed=speeds[(speeds.indexOf(replaySpeed)+1)%speeds.length]; event.currentTarget.textContent=`${replaySpeed}×`;
    if (replayTimer) startReplay();
  });
  document.addEventListener('keydown',event => {
    if (!replayMatchId || event.target.closest('button,a,input,select,textarea')) return;
    if (event.key === 'ArrowLeft') {event.preventDefault(); stopReplay(); renderReplayFrame(replayIndex-1);}
    if (event.key === 'ArrowRight') {event.preventDefault(); stopReplay(); renderReplayFrame(replayIndex+1);}
    if (event.key === ' ') {event.preventDefault(); replayTimer ? stopReplay() : startReplay();}
  });

  const showLiveUnavailable = message => {
    resetOfficialDominoFrame();
    spectatorMode=true;
    viewingOfficialMatchId=liveMatchId || 'invalid';
    activateTab('live');
    liveMatchesList.hidden = true;
    officialSection.hidden=false;
    $('#official-match-kicker').textContent='MATCH EN DIRECT';
    $('#official-back').setAttribute('aria-label','Retour aux matchs en direct');
    officialBoard.innerHTML=`<div class="play-state"><strong>${escapeHtml(message.title)}</strong><p>${escapeHtml(message.text)}</p></div>`;
  };

  const openRequestedPlayerMatch = async user => {
    if (requestedJoinHandled || !joinMatchId) return;
    requestedJoinHandled = true;
    activateTab('matches');
    if (!user || user.isAnonymous) {
      renderState('Connexion nécessaire','Connectez-vous avec le compte auquel ce match a été attribué.','lock-keyhole',{label:'Se connecter',href:'./index.html#login',icon:'log-in'});
      return;
    }
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(joinMatchId)) {
      renderState('Lien de match invalide','Revenez à l’accueil et sélectionnez de nouveau votre rencontre.','triangle-alert',{label:'Retour à l’accueil',href:'./index.html',icon:'arrow-left'});
      return;
    }
    try {
      const snapshot = await db.collection('matches').doc(joinMatchId).get();
      if (!snapshot.exists || !participantIds(snapshot.data()).includes(user.uid)) {
        renderState('Accès refusé','Ce match n’est pas attribué à votre compte JWETPRO.','shield-alert',{label:'Voir mes matchs',href:'./play.html',icon:'calendar-days'});
        return;
      }
      const data = snapshot.data();
      const match = {id:snapshot.id,data,startAt:toDate(data.startAt || data.scheduledAt || data.date)};
      if (data.kind === 'series') {
        openPlannedSeriesLobby(match);
        return;
      }
      const action = getMatchAction(match);
      if (action.kind === 'result') {
        location.replace(`./play.html?replay=${encodeURIComponent(match.id)}`);
        return;
      }
      if (action.kind === 'join' && action.enabled && (isMopyon(data) || isDomino(data))) {
        await functions.httpsCallable(isDomino(data) ? 'joinDominoMatch' : 'joinMopyonMatch')({matchId:match.id});
      }
      openOfficialMatch(match.id);
    } catch (error) {
      console.error('Homepage match join failed:',error);
      renderState('Match temporairement indisponible','Le plateau ne peut pas être ouvert pour le moment. Réessayez depuis la liste de vos matchs.','triangle-alert',{label:'Voir mes matchs',href:'./play.html',icon:'calendar-days'});
    }
  };

  const initFirebase = () => {
    if (replayMatchId) {
      if (!window.firebase?.firestore) return showReplayError('Service indisponible','Le service de replay JWETPRO ne peut pas etre charge pour le moment.');
      db=firebase.firestore();
      loadMatchReplay(replayMatchId);
      return;
    }
    if (!window.firebase?.auth || !window.firebase?.firestore || !window.firebase?.functions) {
      if (liveMatchId) return showLiveUnavailable({title:'Service indisponible',text:'Le direct JWETPRO ne peut pas être chargé pour le moment.'});
      renderState('Service indisponible','Les services JWETPRO ne sont pas accessibles.','wifi-off');
      return;
    }
    auth=firebase.auth(); db=firebase.firestore(); functions=firebase.app().functions('us-central1');
    auth.onAuthStateChanged(user => {
      currentUser=user;
      if (!user) currentMatches=[];
      if (joinMatchId) { openRequestedPlayerMatch(user); return; }
      if (tabs.matches.classList.contains('is-active')) loadPlayerMatches();
      if (tabs.live.classList.contains('is-active')) renderLiveMatches();
    });
    if (joinMatchId) activateTab('matches');
    if (liveMatchId) {
      activateTab('live');
      loadLiveMatches();
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(liveMatchId)) {
        return showLiveUnavailable({title:'Lien de match invalide',text:'Revenez aux matchs en direct et sélectionnez de nouveau la rencontre.'});
      }
      openOfficialMatch(liveMatchId,{spectator:true});
    }
  };

  window.addEventListener('beforeunload',() => { matchesUnsubscribe?.(); championshipsUnsubscribe?.(); liveMatchesUnsubscribe.forEach(unsubscribe => unsubscribe()); officialUnsubscribe?.(); window.clearInterval(countdownTimer); window.clearInterval(replayTimer); });
  initFirebase();
  window.renderIcons?.();
})();
