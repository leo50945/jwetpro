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
  const registeredChampionshipIds = new Set();
  const registrationChecksInFlight = new Set();

  const byId = id => document.getElementById(id);
  const ensureEliminatedStyles = () => {
    if (document.getElementById('progress-eliminated-styles')) return;
    const style = document.createElement('style');
    style.id = 'progress-eliminated-styles';
    style.textContent = '.recap-participant.is-eliminated{border-color:#d8c6c8;background:#f7f4f4;color:#748797}.recap-participant.is-eliminated .recap-participant-avatar{filter:grayscale(1);opacity:.66}.recap-participant.is-eliminated strong{color:#748797;text-decoration:line-through #a85058 2px;text-decoration-skip-ink:none}.recap-participant.is-eliminated small{color:#8999a5}';
    document.head.append(style);
  };
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

  const participantId = player => String(firstValue(player?.id, player?.uid, player?.userId, player?.authUid, player?.playerId, player?.participantId, player?.playerUid, '') || '');
  const participantSocialId = player => String(firstValue(player?.socialPlayerId, player?.simulationPersonaId, participantId(player), '') || '');
  const playerProfileLink = (player, markup, label = playerName(player)) => /^[A-Za-z0-9_-]{1,150}$/.test(participantSocialId(player)) ? `<a class="player-social-link" href="./player.html?id=${encodeURIComponent(participantSocialId(player))}" aria-label="Voir le profil de ${escapeHTML(label)}">${markup}</a>` : markup;
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
  const isAttendanceForfeit = match => Boolean(match && (match.forfeitReason === 'attendance-timeout' || match.completionReason === 'attendance-timeout' || match.forfeitReason === 'double-attendance-timeout' || match.completionReason === 'double-attendance-timeout'));
  const botIdsForMatch = match => new Set([...(Array.isArray(match?.botParticipantIds) ? match.botParticipantIds : []), ...(Array.isArray(match?.simulatedParticipantIds) ? match.simulatedParticipantIds : []), ...Object.entries(asObject(match?.participantTypes)).filter(([, type]) => /bot|simulat/i.test(String(type))).map(([id]) => id)].filter(Boolean).map(String));
  const inferredAttendanceForfeit = match => {
    if (!match || isAttendanceForfeit(match)) return null;
    const status = String(firstValue(match.status, match.state, '')).toLowerCase();
    if (/complete|completed|finished|ended|termine|terminé|cancelled/.test(status)) return null;
    const explicitDeadline = toDate(match.attendanceDeadlineAt);
    const waitingSince = toDate(match.waitingForOpponentSince);
    const scheduledStart = toDate(match.startAt || match.scheduledAt || match.matchDate || match.date);
    const canUseScheduledFallback = ['preview', 'scheduled', 'waiting-opponent'].includes(status) || (['live', 'ongoing'].includes(status) && !match.currentGameId && !match.activeGameId && !match.gameId);
    if (!explicitDeadline && !waitingSince && !canUseScheduledFallback) return null;
    const deadline = explicitDeadline || (waitingSince ? new Date(waitingSince.getTime() + 5 * 60 * 1000) : scheduledStart ? new Date(scheduledStart.getTime() + 5 * 60 * 1000) : null);
    if (!deadline || Date.now() < deadline.getTime()) return null;
    const ids = asArray(match.participantIds).map(String).filter(Boolean).slice(0, 2);
    if (ids.length !== 2) return null;
    const presence = asObject(match.presence);
    const present = new Set(ids.filter(id => toDate(presence[id])));
    botIdsForMatch(match).forEach(id => { if (ids.includes(id)) present.add(id); });
    if (present.size === 1) {
      const winnerId = [...present][0];
      return {reason:'attendance-timeout', winnerId, forfeitedIds:ids.filter(id => id !== winnerId)};
    }
    if (present.size === 0) return {reason:'double-attendance-timeout', winnerId:'', forfeitedIds:ids};
    return null;
  };
  const enrichSeriesMatch = (series, allMatches) => {
    if (!series || series.kind !== 'series') return series;
    const child = allMatches.filter(match => String(match.seriesId || '') === String(series.id) && isAttendanceForfeit(match)).sort((a,b) => Number(a.gameNumber || 0) - Number(b.gameNumber || 0))[0];
    const inferred = inferredAttendanceForfeit(series);
    const source = child || (isAttendanceForfeit(series) ? series : inferred ? {...series, ...inferred, forfeitedUid: inferred.forfeitedIds[0] || null} : null);
    if (!source) return series;
    const childWinner = winnerIdentity(source);
    const patch = {status: 'completed', forfeit: true, forfeitReason: source.forfeitReason || source.completionReason || inferred?.reason || 'attendance-timeout', completionReason: source.completionReason || source.forfeitReason || inferred?.reason || 'attendance-timeout', forfeitedUid: source.forfeitedUid || inferred?.forfeitedIds?.[0] || null, forfeitedUids: Array.isArray(source.forfeitedUids) ? source.forfeitedUids : (inferred?.forfeitedIds || []), forfeitedName: source.forfeitedName || ''};
    if (!childWinner.id && inferred?.winnerId) childWinner.id = inferred.winnerId;
    if (childWinner.id) { patch.winnerId = childWinner.id; patch.winnerName = childWinner.name; }
    const firstId = participantId((series.participantIds || [])[0]);
    if (childWinner.id || childWinner.name) patch.seriesScore = childWinner.id && firstId && childWinner.id === firstId ? {p1:2,p2:0} : {p1:0,p2:2};
    return {...series,...patch};
  };
  const playerIdentityTokens = player => {
    const tokens = [];
    const id = participantId(player);
    const name = playerName(player).trim().toLocaleLowerCase('fr');
    if (id) tokens.push(`id:${id}`);
    if (name && name !== 'joueur' && name !== 'à déterminer') tokens.push(`name:${name}`);
    return tokens;
  };
  const isCompleteOfficialMatch = match => {
    const status = String(firstValue(match.status, match.state, '')).toLocaleLowerCase('fr');
    const isChildGame = Boolean(match.seriesId) || match.kind === 'game';
    const isOfficialMatch = match.kind === 'series' || !isChildGame || isAttendanceForfeit(match);
    const attendance = isAttendanceForfeit(match) || Boolean(inferredAttendanceForfeit(match));
    return isOfficialMatch && (/complete|completed|finished|ended|termine|terminé/.test(status) || attendance) && (Boolean(winnerIdentity(match).id || winnerIdentity(match).name) || attendance);
  };
  const matchLosers = match => {
    const players = matchPlayers(match);
    const persistedForfeitedIds = asArray(match.forfeitedUids).map(String).filter(Boolean);
    if (persistedForfeitedIds.length) return persistedForfeitedIds.map(id => players.find(player => participantId(player) === id) || {id, displayName:''});
    if (match.forfeitReason === 'double-attendance-timeout' || match.completionReason === 'double-attendance-timeout') return players;
    const inferred = inferredAttendanceForfeit(match);
    if (inferred?.forfeitedIds?.length) return inferred.forfeitedIds.map(id => players.find(player => participantId(player) === id) || {id, displayName:''});
    const explicitLoser = firstValue(match.loser, match.loserPlayer, {});
    const explicitLoserId = String(firstValue(match.loserId, match.loserUid, match.forfeitedUid, participantId(explicitLoser), '') || '');
    const explicitLoserName = String(firstValue(match.loserName, match.forfeitedName, playerName(explicitLoser) === 'Joueur' ? '' : playerName(explicitLoser), '') || '');
    if (explicitLoserId || explicitLoserName) return [{...asObject(explicitLoser), id:explicitLoserId, displayName:explicitLoserName}];
    return matchPlayers(match).filter(player => !isWinner(player, match));
  };
  const eliminatedPlayerTokens = matches => {
    const eliminated = new Set();
    matches.filter(isCompleteOfficialMatch).forEach(match => {
      matchLosers(match).forEach(player => {
        playerIdentityTokens(player).forEach(token => eliminated.add(token));
      });
    });
    return eliminated;
  };
  const isEliminatedParticipant = (player, eliminated) => playerIdentityTokens(player).some(token => eliminated.has(token));
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
    const forfeitNote = match.forfeitReason === 'double-attendance-timeout' || match.completionReason === 'double-attendance-timeout' ? '<small class="bracket-forfeit-note">Double forfait de temps — les deux joueurs étaient absents</small>' : isAttendanceForfeit(match) ? '<small class="bracket-forfeit-note">Gagné par forfait de temps — adversaire absent à l’heure</small>' : '';
    return `<article class="bracket-match${isFinal ? ' is-final' : ''}${live ? ' is-live' : ''}" data-social-kind="match" data-social-id="${escapeHTML(firstValue(match.seriesId,match.id,''))}">${live ? '<span class="bracket-live-tag"><i></i>EN DIRECT</span>' : ''}${players.map((player, index) => `<div class="bracket-player${isWinner(player, match) ? ' is-winner' : ''}">${playerProfileLink(player,`<strong>${escapeHTML(playerName(player))}</strong>`)}<b>${escapeHTML(scoreFor(match, player, index))}</b></div>`).join('')}${forfeitNote}${action}</article>`;
  };
  const resultPlayers = (series, games) => {
    const players = matchPlayers(series);
    const sample = games[0] || {};
    const ids = asArray(series.participantIds).length ? asArray(series.participantIds).slice(0, 2) : asArray(sample.participantIds).slice(0, 2);
    const names = asObject(series.participantNames || sample.participantNames);
    ids.forEach((id, index) => {
      if (!players[index] || playerName(players[index]) === 'Joueur') players[index] = {id, uid:id, displayName:names[id] || ''};
    });
    while (players.length < 2) players.push({displayName:'À déterminer'});
    return players.slice(0, 2);
  };
  const seriesScore = (series, games, players) => {
    const stored = asObject(series.seriesScore);
    let p1 = Number(firstValue(stored.p1, stored[players[0] && participantId(players[0])], NaN));
    let p2 = Number(firstValue(stored.p2, stored[players[1] && participantId(players[1])], NaN));
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) {
      p1 = 0; p2 = 0;
      games.forEach(game => {
        const winner = winnerIdentity(game).id;
        if (winner && winner === participantId(players[0])) p1 += 1;
        else if (winner && winner === participantId(players[1])) p2 += 1;
      });
    }
    return {p1:Number.isFinite(p1) ? p1 : 0, p2:Number.isFinite(p2) ? p2 : 0};
  };
  const renderResults = allMatches => {
    const target = byId('progress-results');
    if (!target) return;
    const series = allMatches.filter(match => match.kind === 'series').map(match => enrichSeriesMatch(match, allMatches)).sort((a, b) => {
      const stage = stageKey(a).localeCompare(stageKey(b));
      return stage || matchPosition(a) - matchPosition(b);
    });
    if (!series.length) { target.innerHTML = emptyState('Aucun résultat publié', 'Les matchs terminés apparaîtront ici avec leur score final.'); return; }
    const gamesBySeries = new Map();
    allMatches.filter(match => match.kind === 'game' && match.seriesId).forEach(game => {
      const list = gamesBySeries.get(String(game.seriesId)) || [];
      list.push(game); gamesBySeries.set(String(game.seriesId), list);
    });
    target.innerHTML = series.map(seriesMatch => {
      const games = (gamesBySeries.get(String(seriesMatch.id)) || []).sort((a, b) => Number(a.gameNumber || 0) - Number(b.gameNumber || 0));
      const players = resultPlayers(seriesMatch, games);
      const score = seriesScore(seriesMatch, games, players);
      const complete = Boolean(seriesMatch.winnerUid || seriesMatch.winnerId || isDecided(seriesMatch));
      const winner = winnerIdentity(seriesMatch);
      const winnerName = winner.name || players.find(player => participantId(player) === winner.id)?.displayName || '';
       const forfeitNote = seriesMatch.forfeitReason === 'double-attendance-timeout' || seriesMatch.completionReason === 'double-attendance-timeout' ? 'Double forfait de temps : les deux joueurs étaient absents après cinq minutes. Aucun joueur ne remporte ce match.' : isAttendanceForfeit(seriesMatch) ? 'Gagné par forfait de temps : l’adversaire n’était pas présent dans les cinq minutes demandées.' : '';
      const mancheSummary = games.length ? games.map((game, index) => {
        const gameWinner = winnerIdentity(game);
        const name = gameWinner.name || players.find(player => participantId(player) === gameWinner.id)?.displayName || 'Manche nulle';
        return `<span>Manche ${index + 1} : ${escapeHTML(name)}</span>`;
      }).join('') : '<span>Manches disponibles dans le replay</span>';
      return `<article class="progress-result-card"><div class="progress-result-head"><div><small>${escapeHTML(firstValue(seriesMatch.roundLabel, STAGES.find(stage => stage.key === stageKey(seriesMatch))?.label, 'Match'))}</small><strong>${escapeHTML(firstValue(seriesMatch.number, seriesMatch.championshipName, 'Match'))}</strong></div><span class="progress-result-status">${complete ? 'TERMINÉ' : 'À VENIR'}</span></div><div class="progress-result-players"><div class="progress-result-player${winner.id && participantId(players[0]) === winner.id ? ' is-winner' : ''}"><strong>${escapeHTML(playerName(players[0]))}</strong><span>${score.p1} manche${score.p1 === 1 ? '' : 's'}</span></div><b class="progress-result-score">${score.p1} – ${score.p2}</b><div class="progress-result-player${winner.id && participantId(players[1]) === winner.id ? ' is-winner' : ''}"><strong>${escapeHTML(playerName(players[1]))}</strong><span>${score.p2} manche${score.p2 === 1 ? '' : 's'}</span></div></div><div class="progress-result-meta"><span>${games.length || 0} manche${games.length === 1 ? '' : 's'} · ${winnerName ? 'Vainqueur : ' + escapeHTML(winnerName) : 'Résultat en attente'}${forfeitNote ? ' · ' + escapeHTML(forfeitNote) : ''}</span><div class="progress-result-games">${mancheSummary}</div><a class="progress-result-replay" href="./play.html?replay=${encodeURIComponent(seriesMatch.id)}">Voir le replay <i data-lucide="ArrowRight"></i></a></div></article>`;
    }).join('');
    window.renderIcons?.();
  };
  const renderBracket = matches => {
    byId('progress-bracket').innerHTML = STAGES.map(stage => {
      const stageMatches = matches.filter(match => stageKey(match) === stage.key).sort((a, b) => matchPosition(a) - matchPosition(b));
      const slots = Array.from({length:stage.slots}, (_, index) => bracketMatch(stageMatches[index], stage.key === 'final'));
      return `<section class="bracket-stage" aria-label="${escapeHTML(stage.label)}"><header class="bracket-stage-head"><h3>${escapeHTML(stage.label)}</h3><span>${stage.short}</span></header><div class="bracket-stage-matches">${slots.join('')}</div></section>`;
    }).join('');
    window.renderIcons?.();
  };

  const participantCard = (player, eliminated) => { const name = playerName(player); const isEliminated = isEliminatedParticipant(player, eliminated); return `<article class="recap-participant${isEliminated ? ' is-eliminated' : ''}"${isEliminated ? ` aria-label="${escapeHTML(name)}, éliminé du championnat"` : ''}>${playerProfileLink(player,`<span class="recap-participant-avatar"${avatarStyle(player)}>${safeAvatar(firstValue(player.imageName, player.avatar, player.photo)) ? '' : escapeHTML(initials(name))}</span>`)}<div>${playerProfileLink(player,`<strong>${escapeHTML(name)}</strong>`)}<small>${isEliminated ? 'Éliminé' : player.level ? `Niveau ${escapeHTML(player.level)}` : 'Participant'}</small></div></article>`; };
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
    ensureEliminatedStyles();
    lastRenderedChampionship = championship;
    lastRenderedMatches = allMatches;
    const matches = allMatches.some(match => match.kind === 'series') ? allMatches.filter(match => match.kind === 'series').map(match => enrichSeriesMatch(match, allMatches)) : allMatches;
    const status = effectiveStatus(championship);
    const hero=document.querySelector('.recap-hero');
    if(hero){hero.querySelector(':scope > .entity-social-actions')?.remove();hero.dataset.socialKind='championship';hero.dataset.socialId=championship.id;window.JwetproSocial?.decorate?.(hero)}
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
    const eliminated = eliminatedPlayerTokens(matches);
    byId('participants-count-badge').textContent = `${registeredCount} / ${maxPlayers}`;
    byId('progress-participants').innerHTML = participants.length ? participants.map(player => participantCard(player, eliminated)).join('') : emptyState('Liste non publiée', 'Les participants inscrits apparaîtront ici dès leur publication.');

    const decidedCount = matches.filter(isDecided).length;
    const registrationFraction = maxPlayers > 0 ? Math.min(1, registeredCount / maxPlayers) : 0;
    const tournamentFraction = Math.min(1, decidedCount / TOTAL_BRACKET_MATCHES);
    const percent = status === 'completed' ? 100
      : status === 'ongoing' ? Math.round(REGISTRATION_SHARE + tournamentFraction * (100 - REGISTRATION_SHARE))
      : Math.round(registrationFraction * REGISTRATION_SHARE);
    byId('progress-meter-value').textContent = `${percent}%`;
    byId('progress-meter-fill').style.width = `${percent}%`;

    const currentUid = progressCurrentUserId();
    const publicParticipantValues = [championship.participantIds, championship.participants, championship.registeredPlayers, championship.registrations]
      .flatMap(value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []);
    if (currentUid && publicParticipantValues.some(value => String(typeof value === 'object' ? value?.uid || value?.userId || value?.playerUid || value?.authUid || '' : value) === currentUid)) registeredChampionshipIds.add(String(championship.id));
    const registerCta = byId('progress-register-cta');
    registerCta.hidden = status !== 'registration-open';
    registerCta.href = registeredChampionshipIds.has(String(championship.id)) ? `./progress.html?id=${encodeURIComponent(championship.id)}` : `./registration-checkout.html?id=${encodeURIComponent(championship.id)}`;
    registerCta.innerHTML = registeredChampionshipIds.has(String(championship.id)) ? 'VOIR LE CHAMPIONNAT <i data-lucide="ArrowRight"></i>' : 'S’INSCRIRE AU CHAMPIONNAT <i data-lucide="ArrowRight"></i>';
    window.renderIcons?.();
    const uid = currentUid;
    const registrationKey = `${championship.id}__${uid}`;
    if (status === 'registration-open' && uid && !registeredChampionshipIds.has(String(championship.id)) && !registrationChecksInFlight.has(registrationKey)) {
      registrationChecksInFlight.add(registrationKey);
      firebase.firestore().collection('championshipTicketRegistrations').doc(registrationKey).get().then(snapshot => {
        const ticketStatus = String(snapshot.data()?.status || '').toLowerCase();
        if (snapshot.exists && ['paid','credited'].includes(ticketStatus)) {
          registeredChampionshipIds.add(String(championship.id));
          if (lastRenderedChampionship?.id === championship.id) renderPage(championship, allMatches);
        }
      }).catch(() => null).finally(() => registrationChecksInFlight.delete(registrationKey));
    }

    renderBracket(matches);
    renderResults(allMatches);
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
    };
    renderPage(championship, []);
    const visibleStatuses = new Set(['preview', 'scheduled', 'waiting-opponent', 'ongoing', 'live', 'completed', 'finished', 'forfeited']);
    const belongsToChampionship = match => linkFields.some(([field, value]) => String(match[field] ?? '') === String(value));
    const renderVisibleMatches = () => renderPage(championship, [...currentMatches.values()].filter(match => belongsToChampionship(match) && visibleStatuses.has(String(match.status || match.state || '').toLowerCase())));
    const handleVisibleSnapshot = snapshot => {
      handleSnapshot(snapshot);
      renderVisibleMatches();
    };
    // Public reads use only statuses allowed by firestore.rules. Waiting and
    // forfeited records are private, so the signed-in participant receives
    // them through the participantIds query below.
    const publicStatuses = ['preview', 'scheduled', 'ongoing', 'live', 'completed', 'finished'];
    const publicListeners = linkFields.map(([field, value]) => db.collection('matches')
      .where(field, '==', value)
      .where('status', 'in', publicStatuses)
      .limit(200)
      .onSnapshot(handleVisibleSnapshot, error => console.warn('Progress public match listener failed:', error)));
    const uid = firebase.auth?.().currentUser?.uid || window.JwetproCurrentUserId || '';
    const privateListener = uid
      ? db.collection('matches').where('participantIds', 'array-contains', uid).limit(200)
        .onSnapshot(handleVisibleSnapshot, error => console.warn('Progress private match listener failed:', error))
      : null;
    matchUnsubscribes = [...publicListeners, ...(privateListener ? [privateListener] : [])];
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
  window.addEventListener('jwetpro-auth-ready', () => {
    const user = firebase.auth?.().currentUser;
    const championship = lastRenderedChampionship;
    if (!user?.uid || !championship) { if (championship) renderPage(championship,lastRenderedMatches); return; }
    const publicParticipants = [championship.participantIds, championship.participants, championship.registeredPlayers, championship.registrations]
      .flatMap(value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []);
    if (publicParticipants.some(value => String(typeof value === 'object' ? value?.uid || value?.userId || value?.playerUid || value?.authUid || '' : value) === user.uid)) registeredChampionshipIds.add(String(championship.id));
    firebase.firestore().collection('championshipTicketRegistrations').doc(`${championship.id}__${user.uid}`).get().then(snapshot => {
      const status = String(snapshot.data()?.status || '').toLowerCase();
      if (snapshot.exists && ['paid','credited'].includes(status)) registeredChampionshipIds.add(String(championship.id));
      renderPage(championship,lastRenderedMatches);
      watchMatches(championship);
    }).catch(() => { renderPage(championship,lastRenderedMatches); watchMatches(championship); });
  });
  window.addEventListener('shared-shell-ready', runProgressPage, {once:true});
  const sharedShellScript = document.createElement('script');
  sharedShellScript.src = './shared-shell.js?v=20260909-social-v3';
  document.head.append(sharedShellScript);
})();
