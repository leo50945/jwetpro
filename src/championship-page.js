(() => {
  'use strict';

  const PROJECT_ID = 'mopyonlakay';
  const API_KEY = 'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg';
  const DATABASE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const EXPECTED_PLAYERS = 32;
  const STAGES = [
    { key: '16e', label: '16èmes de finale', short: '1/16', slots: 16 },
    { key: '8e', label: '8èmes de finale', short: '1/8', slots: 8 },
    { key: 'quart', label: 'Quarts de finale', short: '1/4', slots: 4 },
    { key: 'demi', label: 'Demi-finales', short: '1/2', slots: 2 },
    { key: 'finale', label: 'Finale', short: 'FINALE', slots: 1 }
  ];

  const state = { matches: [], replayMatch: null, replayPosition: 0, replayTimer: null };
  const byId = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const firstValue = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
  const asArray = value => Array.isArray(value) ? value : [];
  const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const toDate = value => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value.seconds ? value.seconds * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const formatDate = value => {
    const date = toDate(value);
    return date ? date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date non publiée';
  };
  const formatMoney = value => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString('fr-FR')} HTG` : 'Non publiée';
  };
  const initials = name => String(name || 'Joueur').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const safeAvatar = value => /^[A-Za-z0-9._-]+$/.test(String(value || '')) ? `./src/profilimage/${encodeURIComponent(value)}` : '';
  const safePhotoURL = value => { const url = String(value || '').trim(); return /^https:\/\//.test(url) ? url.replace(/'/g, '%27') : ''; };
  const playerAvatarImage = player => safePhotoURL(player.photoURL) || safeAvatar(firstValue(player.imageName, player.avatar, player.photo));
  const avatarStyle = player => {
    const image = playerAvatarImage(player);
    return image ? ` style="background-image:url('${image}')"` : '';
  };

  const decodeValue = value => {
    if (!value || typeof value !== 'object') return value;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('timestampValue' in value) return value.timestampValue;
    if ('referenceValue' in value) return String(value.referenceValue).split('/').pop();
    if ('arrayValue' in value) return asArray(value.arrayValue.values).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    return value;
  };
  const decodeFields = fields => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
  const decodeDocument = documentValue => {
    if (!documentValue?.name) return null;
    return { id: documentValue.name.split('/').pop(), ...decodeFields(documentValue.fields || {}) };
  };

  const fetchDocument = async (collection, id, optional = false) => {
    if (!id) return null;
    const response = await fetch(`${DATABASE_ROOT}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?key=${encodeURIComponent(API_KEY)}`);
    if (response.status === 404 && optional) return null;
    if (!response.ok) throw new Error(response.status === 404 ? 'Championnat introuvable.' : 'Impossible de charger les données publiées.');
    return decodeDocument(await response.json());
  };

  const firestoreScalar = value => Number.isFinite(Number(value)) && String(value).trim() !== ''
    ? { integerValue: String(Number(value)) }
    : { stringValue: String(value) };
  const runMatchQuery = async (field, value, status) => {
    const response = await fetch(`${DATABASE_ROOT}:runQuery?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: 'matches' }],
        where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: firestoreScalar(value) } },
          { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: status } } }
        ] } },
        limit: 200
      } })
    });
    if (!response.ok) return [];
    return (await response.json()).map(row => decodeDocument(row.document)).filter(Boolean);
  };

  const participantId = player => String(firstValue(player?.id, player?.uid, player?.userId, player?.playerId, '') || '');
  const participantSocialId = player => String(firstValue(player?.socialPlayerId, player?.socialId, participantId(player), '') || '');
  const playerName = player => String(firstValue(player?.displayName, player?.name, player?.username, player?.label, 'Joueur'));
  const playerProfileLink = (player,markup) => /^[A-Za-z0-9_-]{1,150}$/.test(participantSocialId(player)) ? `<a class="player-social-link" href="./player.html?id=${encodeURIComponent(participantSocialId(player))}" aria-label="Voir le profil de ${escapeHTML(playerName(player))}">${markup}</a>` : markup;
  const normalizePlayer = (value, fallbackId = '') => {
    if (typeof value === 'string') return { id: value || fallbackId, displayName: '' };
    const player = asObject(value);
    return { ...player, id: participantId(player) || fallbackId };
  };
  const playerKey = player => participantId(player) || playerName(player).toLocaleLowerCase('fr');

  const championshipParticipants = championship => {
    const raw = [championship.participants, championship.registeredPlayers, championship.registrations, championship.players]
      .find(Array.isArray) || [];
    const idList = asArray(championship.participantIds);
    const merged = [...raw.map(normalizePlayer), ...idList.map(id => normalizePlayer(id, id))];
    const unique = new Map();
    merged.forEach(player => {
      const key = playerKey(player);
      if (key && !unique.has(key)) unique.set(key, player);
    });
    const socialIds=asObject(championship.participantSocialIds);
    return [...unique.values()].slice(0, EXPECTED_PLAYERS).map(player=>({...player,socialPlayerId:firstValue(player.socialPlayerId,socialIds[participantId(player)])}));
  };

  const enrichParticipants = async participants => {
    const enriched = await Promise.all(participants.map(async player => {
      const id = participantId(player);
      if (!id) return player;
      try {
        const publicProfile = await fetchDocument('leaderboard', id, true);
        return publicProfile ? { ...publicProfile, ...player, displayName: firstValue(player.displayName, player.name, publicProfile.displayName, publicProfile.name) } : player;
      } catch (_) { return player; }
    }));
    return enriched;
  };

  const matchPlayers = match => {
    const arrays = [match.participants, match.players].find(Array.isArray);
    const socialIds=asObject(match.participantSocialIds);
    if (arrays?.length) return arrays.slice(0, 2).map(normalizePlayer).map(player=>({...player,socialPlayerId:firstValue(player.socialPlayerId,socialIds[participantId(player)])}));
    const ids = asArray(match.participantIds).slice(0, 2);
    const names = asObject(match.participantNames);
    const values = [firstValue(match.player1, match.firstPlayer, names[ids[0]], names.p1, ids[0]), firstValue(match.player2, match.secondPlayer, names[ids[1]], names.p2, ids[1])];
    return values.filter(value => value !== undefined).map(normalizePlayer).map(player=>({...player,socialPlayerId:firstValue(player.socialPlayerId,socialIds[participantId(player)])}));
  };

  const stageKey = match => {
    const roundField = String(firstValue(match.round, '')).toLowerCase();
    if (STAGES.some(stage => stage.key === roundField)) return roundField;
    const source = String(firstValue(match.stage, match.phase, match.roundName, match.roundLabel, match.bracketStage, match.matchType, '')).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/16\s*eme|seizieme|round[-_ ]?of[-_ ]?16|1\s*\/\s*16/.test(source)) return '16e';
    if (/8\s*eme|huit|round[-_ ]?of[-_ ]?8|1\s*\/\s*8/.test(source)) return '8e';
    if (/quarter|quart/.test(source)) return 'quart';
    if (/semi|demi/.test(source)) return 'demi';
    if (/final/.test(source)) return 'finale';
    const round = Number(firstValue(match.round, match.roundNumber));
    return ({ 1: '16e', 2: '8e', 3: 'quart', 4: 'demi', 5: 'finale' })[round] || '';
  };
  const stageIndex = match => Math.max(0, STAGES.findIndex(stage => stage.key === stageKey(match)));
  const matchPosition = match => Number(firstValue(match.position, match.bracketPosition, match.bracketSlot, match.matchNumber, match.number, 0)) || 0;
  const matchMoves = match => match?.kind === 'series' && Array.isArray(match.games) ? match.games.flatMap(game => asArray(firstValue(game.moves, game.moveHistory, game.history, game.actions))) : asArray(firstValue(match.moves, match.moveHistory, match.history, match.actions));
  const seriesChildren = match => Array.isArray(match?.games) ? match.games.filter(Boolean) : [];
  const seriesReplayMoves = match => seriesChildren(match).flatMap(game => matchMoves(game));
  const seriesScore = match => {
    const stored = match?.seriesScore && typeof match.seriesScore === 'object' ? match.seriesScore : {};
    if (Number.isFinite(Number(stored.p1)) || Number.isFinite(Number(stored.p2))) return { p1: Number(stored.p1) || 0, p2: Number(stored.p2) || 0 };
    const score = { p1: 0, p2: 0 };
    seriesChildren(match).forEach(game => { const players = matchPlayers(game); const winner = winnerIdentity(game); const first = players[0] && ((winner.id && participantId(players[0]) === winner.id) || (winner.name && playerName(players[0]).toLocaleLowerCase('fr') === winner.name.toLocaleLowerCase('fr'))); const second = players[1] && ((winner.id && participantId(players[1]) === winner.id) || (winner.name && playerName(players[1]).toLocaleLowerCase('fr') === winner.name.toLocaleLowerCase('fr'))); if (first) score.p1 += 1; else if (second) score.p2 += 1; });
    return score;
  };
  const buildSeriesMatches = matches => {
    const series = matches.filter(match => match.kind === 'series').map(match => ({ ...match, games: [] }));
    const grouped = new Map(series.map(match => [match.id, match]));
    matches.filter(match => match.kind === 'game' || firstValue(match.seriesId, match.parentSeriesId, match.matchSeriesId, '')).forEach(game => { const id = String(firstValue(game.seriesId, game.parentSeriesId, game.matchSeriesId, '') || ''); if (!id) return; if (!grouped.has(id)) grouped.set(id, { id, kind: 'series', games: [] }); grouped.get(id).games.push(game); });
    grouped.forEach(match => { match.games.sort((a, b) => Number(firstValue(a.gameNumber, a.mancheNumber, a.position, 0)) - Number(firstValue(b.gameNumber, b.mancheNumber, b.position, 0))); const first = match.games[0]; if (first) { if (!match.participants) match.participants = first.participants; if (!match.participantIds) match.participantIds = first.participantIds; if (!match.participantNames) match.participantNames = first.participantNames; } });
    const legacy = matches.filter(match => match.kind !== 'game' && match.kind !== 'series' && !firstValue(match.seriesId, match.parentSeriesId, match.matchSeriesId, ''));
    return [...grouped.values(), ...legacy].filter(match => match.kind !== 'series' || seriesChildren(match).length);
  };
  const matchSocialAttributes = match => match.kind === 'game' || (match.kind !== 'series' && firstValue(match.seriesId,match.parentSeriesId,match.matchSeriesId,'')) ? ' data-social-disabled="true"' : ` data-social-kind="match" data-social-id="${escapeHTML(match.id)}"`;
  const winnerIdentity = match => {
    const winner = firstValue(match.winner, match.winnerPlayer, {});
    return {
      id: String(firstValue(match.winnerId, match.winnerUid, participantId(winner), '') || ''),
      name: String(firstValue(match.winnerName, playerName(winner) === 'Joueur' ? '' : playerName(winner), '') || '')
    };
  };
  const isWinner = (player, match) => {
    const winner = winnerIdentity(match);
    return Boolean((winner.id && participantId(player) === winner.id) || (winner.name && playerName(player).toLocaleLowerCase('fr') === winner.name.toLocaleLowerCase('fr')));
  };
  const scoreFor = (match, player, index) => {
    if (match?.kind === 'series') { const series = seriesScore(match); return index === 0 ? series.p1 : series.p2; }
    const scores = firstValue(match.scores, match.score, {});
    if (scores && typeof scores === 'object' && !Array.isArray(scores)) {
      const value = firstValue(scores[participantId(player)], scores[playerName(player)], scores[index], scores[String(index)]);
      if (value !== undefined) return value;
    }
    return firstValue(match[`score${index + 1}`], match[`player${index + 1}Score`], player?.score, '—');
  };

  const embeddedMatches = championship => {
    const candidates = [championship.matches, championship.bracketMatches, asObject(championship.bracket).matches];
    return candidates.find(value => Array.isArray(value) && value.some(item => item && typeof item === 'object')) || [];
  };
  const embeddedMatchIds = championship => {
    const candidates = [championship.matchIds, championship.linkedMatchIds, championship.matches];
    return (candidates.find(value => Array.isArray(value) && value.some(item => typeof item === 'string')) || []).filter(item => typeof item === 'string');
  };
  const loadMatches = async championship => {
    const all = embeddedMatches(championship).map((match, index) => ({ id: match.id || `embedded-${index}`, ...match }));
    const direct = await Promise.all(embeddedMatchIds(championship).map(id => fetchDocument('matches', id, true).catch(() => null)));
    all.push(...direct.filter(Boolean));
    const queryValues = [
      ['championshipId', championship.id],
      ['tournamentId', championship.id],
      ['competitionId', championship.id],
      ['championshipNumber', championship.number]
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    const queries = queryValues.flatMap(([field, value]) => ['completed', 'finished'].map(status => runMatchQuery(field, value, status)));
    const queried = await Promise.all(queries);
    queried.forEach(matches => all.push(...matches));
    const unique = new Map();
    all.forEach(match => { if (match?.id && !unique.has(match.id)) unique.set(match.id, match); });
    return [...unique.values()].sort((a, b) => stageIndex(a) - stageIndex(b) || matchPosition(a) - matchPosition(b));
  };

  const participantCard = player => {
    const name = playerName(player);
    return `<article class="recap-participant">${playerProfileLink(player,`<span class="recap-participant-avatar"${avatarStyle(player)}>${playerAvatarImage(player) ? '' : escapeHTML(initials(name))}</span>`)}<div>${playerProfileLink(player,`<strong>${escapeHTML(name)}</strong>`)}<small>${player.level ? `Niveau ${escapeHTML(player.level)}` : 'Participant'}</small></div></article>`;
  };
  const emptyState = (title, detail) => `<div class="recap-empty"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(detail)}</span></div>`;

  const bracketMatch = (match, isFinal) => {
    if (!match) return '<div class="bracket-match-empty">Résultat non publié</div>';
    const players = matchPlayers(match);
    while (players.length < 2) players.push({ displayName: 'À déterminer' });
    return `<article class="bracket-match${isFinal ? ' is-final' : ''}" data-social-kind="match" data-social-id="${escapeHTML(firstValue(match.seriesId,match.parentSeriesId,match.id,''))}">${players.map((player, index) => `<div class="bracket-player${isWinner(player, match) ? ' is-winner' : ''}">${playerProfileLink(player,`<strong>${escapeHTML(playerName(player))}</strong>`)}<b>${escapeHTML(scoreFor(match, player, index))}</b></div>`).join('')}</article>`;
  };
  const renderBracket = matches => {
    const seriesMatches = matches.some(match => match.kind === 'series') ? matches.filter(match => match.kind === 'series') : matches;
    byId('recap-bracket').innerHTML = STAGES.map(stage => {
      const stageMatches = seriesMatches.filter(match => stageKey(match) === stage.key).sort((a, b) => matchPosition(a) - matchPosition(b));
      const slots = Array.from({ length: stage.slots }, (_, index) => bracketMatch(stageMatches[index], stage.key === 'finale'));
      return `<section class="bracket-stage" aria-label="${escapeHTML(stage.label)}"><header class="bracket-stage-head"><h3>${escapeHTML(stage.label)}</h3><span>${stage.short}</span></header><div class="bracket-stage-matches">${slots.join('')}</div></section>`;
    }).join('');
  };

  const matchCard = match => {
    const stage = STAGES.find(item => item.key === stageKey(match));
    const players = matchPlayers(match);
    while (players.length < 2) players.push({ displayName: 'À déterminer' });
    const moves = matchMoves(match);
    const hasAttendanceForfeit = match.forfeitReason === 'attendance-timeout' || (match.forfeit === true && match.completionReason === 'attendance-timeout');
    return `<article class="recap-match"${matchSocialAttributes(match)}><div class="recap-match-phase"><span>${escapeHTML(stage?.label || 'Match')}</span><strong>${formatDate(firstValue(match.startedAt, match.completedAt, match.createdAt))}</strong></div><div class="recap-match-versus"><div class="recap-match-player">${playerProfileLink(players[0],`<strong>${escapeHTML(playerName(players[0]))}</strong>`)}<b>${escapeHTML(scoreFor(match, players[0], 0))}</b></div><span>VS</span><div class="recap-match-player"><b>${escapeHTML(scoreFor(match, players[1], 1))}</b>${playerProfileLink(players[1],`<strong>${escapeHTML(playerName(players[1]))}</strong>`)}</div></div>${moves.length || hasAttendanceForfeit ? `<button class="recap-replay-button" type="button" data-replay-id="${escapeHTML(match.id)}">${hasAttendanceForfeit ? 'VOIR LE RÉSULTAT' : 'REVOIR LE MATCH'}</button>` : '<span class="recap-replay-unavailable">Replay non publié</span>'}</article>`;
  };

  const renderReplay = () => {
    const match = state.replayMatch;
    if (!match) return;
    const moves = matchMoves(match);
    state.replayPosition = Math.max(0, Math.min(state.replayPosition, moves.length));
    const game = String(firstValue(match.game, match.type, '')).toLocaleLowerCase('fr');
    const isMopyon = game.includes('mopyon') || moves.some(move => Number.isInteger(Number(firstValue(move.index, move.cellIndex))));
    const hasAttendanceForfeit = match.forfeitReason === 'attendance-timeout' || (match.forfeit === true && match.completionReason === 'attendance-timeout');
    byId('replay-position').textContent = `${state.replayPosition} / ${moves.length}`;
    byId('replay-prev').disabled = state.replayPosition === 0;
    byId('replay-next').disabled = state.replayPosition === moves.length;
    if (hasAttendanceForfeit && !moves.length) {
      const players = matchPlayers(match);
      const absent = players.find(player => participantId(player) === match.forfeitedUid);
      byId('replay-stage').innerHTML = `<div class="replay-forfeit"><strong>Forfait de temps</strong><p>${escapeHTML(playerName(absent || {displayName:'Le joueur absent'}))} a perdu après cinq minutes d’absence.</p></div>`;
    } else if (isMopyon) {
      const cells = Array(400).fill('');
      moves.slice(0, state.replayPosition).forEach(move => {
        const index = Number(firstValue(move.index, move.cellIndex, move.position));
        if (Number.isInteger(index) && index >= 0 && index < cells.length) cells[index] = String(firstValue(move.symbol, move.value, move.mark, ''));
      });
      const current = state.replayPosition ? Number(firstValue(moves[state.replayPosition - 1]?.index, moves[state.replayPosition - 1]?.cellIndex, -1)) : -1;
      byId('replay-stage').innerHTML = `<div class="replay-board" role="img" aria-label="Plateau au coup ${state.replayPosition}">${cells.map((symbol, index) => `<span class="replay-cell${String(symbol).toUpperCase() === 'O' ? ' is-o' : ''}${index === current ? ' is-current' : ''}">${escapeHTML(symbol)}</span>`).join('')}</div>`;
    } else {
      const visible = moves.slice(0, state.replayPosition);
      byId('replay-stage').innerHTML = `<div class="replay-timeline">${visible.length ? visible.map((move, index) => `<article><b>#${index + 1}</b><span>${escapeHTML(firstValue(move.label, move.description, move.action, move.type, `Action ${index + 1}`))}</span></article>`).join('') : '<article><b>—</b><span>Début du match</span></article>'}</div>`;
    }
  };
  const stopReplay = () => {
    if (state.replayTimer) window.clearInterval(state.replayTimer);
    state.replayTimer = null;
    byId('replay-play').textContent = 'Lecture';
  };
  const openReplay = match => {
    state.replayMatch = match;
    state.replayPosition = 0;
    const players = matchPlayers(match);
    byId('replay-title').textContent = players.length > 1 ? `${playerName(players[0])} — ${playerName(players[1])}` : 'Revoir la rencontre';
    renderReplay();
    const hasMoves = matchMoves(match).length > 0;
    byId('replay-play').disabled = !hasMoves;
    byId('replay-prev').disabled = !hasMoves;
    byId('replay-next').disabled = !hasMoves;
    byId('replay-dialog').showModal();
  };

  const championFrom = (championship, matches, participants) => {
    const rawValue = firstValue(championship.champion, championship.winner, {});
    const raw = typeof rawValue === 'string' ? { displayName: rawValue } : rawValue;
    const id = String(firstValue(championship.championId, championship.winnerId, participantId(raw), '') || '');
    const name = String(firstValue(championship.championName, championship.winnerName, playerName(raw) === 'Joueur' ? '' : playerName(raw), '') || '');
    const finalMatch = matches.find(match => stageKey(match) === 'finale');
    const finalWinner = finalMatch ? winnerIdentity(finalMatch) : {};
    const resolvedId = id || finalWinner.id;
    const resolvedName = name || finalWinner.name;
    return participants.find(player => resolvedId && participantId(player) === resolvedId) || participants.find(player => resolvedName && playerName(player).toLocaleLowerCase('fr') === resolvedName.toLocaleLowerCase('fr')) || (resolvedName || resolvedId ? { id: resolvedId, displayName: resolvedName || 'Champion' } : null);
  };

  const renderResultSections = gameMatches => {
    const sections = STAGES.map(stage => {
      const stageMatches = gameMatches.filter(match => stageKey(match) === stage.key).sort((a, b) => matchPosition(a) - matchPosition(b));
      if (!stageMatches.length) return '';
      return `<details class="recap-result-stage"><summary><span><strong>${escapeHTML(stage.label)}</strong><small>${stageMatches.length} rencontre${stageMatches.length > 1 ? 's' : ''}</small></span><b>${stage.short}</b></summary><div class="recap-result-stage-list">${stageMatches.map(matchCard).join('')}</div></details>`;
    }).join('');
    return sections || emptyState('Resultats non publies', 'Les resultats detailles de ce championnat ne sont pas encore disponibles.');
  };

  const renderPage = (championship, participants, matches) => {
    const hero=document.querySelector('.recap-hero');
    if(hero){hero.dataset.socialKind='championship';hero.dataset.socialId=championship.id;window.JwetproSocial?.decorate?.(hero)}
    const game = String(firstValue(championship.game, championship.type, 'Mopyon'));
    const number = firstValue(championship.number, championship.code, championship.id);
    const title = `${game.charAt(0).toUpperCase()}${game.slice(1).toLowerCase()} #${number}`;
    document.title = `${title} — JWETPRO`;
    byId('recap-title').textContent = title;
    byId('recap-date').textContent = formatDate(firstValue(championship.startAt, championship.startDate, championship.date));
    byId('recap-participant-count').textContent = `${participants.length} / ${EXPECTED_PLAYERS}`;
    const gameMatches = buildSeriesMatches(matches);
    byId('recap-match-count').textContent = String(gameMatches.length);
    byId('recap-prize').textContent = formatMoney(firstValue(championship.prize, championship.reward, championship.prizeAmount));
    byId('participants-count-badge').textContent = `${participants.length} / ${EXPECTED_PLAYERS}`;
    const champion = championFrom(championship, matches, participants);
    byId('recap-champion').innerHTML = champion
      ? `${playerProfileLink(champion,`<span class="recap-champion-avatar"${avatarStyle(champion)}>${playerAvatarImage(champion) ? '' : escapeHTML(initials(playerName(champion)))}</span>`)}<div><span>CHAMPION</span>${playerProfileLink(champion,`<strong>${escapeHTML(playerName(champion))}</strong>`)}</div>`
      : '<span class="recap-champion-avatar">—</span><div><span>CHAMPION</span><strong>Non publié</strong></div>';
    byId('recap-participants').innerHTML = participants.length ? participants.map(participantCard).join('') : emptyState('Liste non publiée', 'Les participants de cet ancien championnat ne sont pas encore disponibles.');
    renderBracket(matches);
    const replayCount = gameMatches.filter(match => seriesReplayMoves(match).length || matchMoves(match).length).length;
    byId('replay-count').textContent = `${replayCount} REPLAY${replayCount > 1 ? 'S' : ''}`;
    byId('recap-matches').innerHTML = renderResultSections(gameMatches);
    window.JwetproSocial?.decorate?.(document.querySelector('#recap-content'));
    state.matches = gameMatches;
    byId('recap-loading').hidden = true;
    byId('recap-content').hidden = false;
  };

  const showError = message => {
    byId('recap-loading').hidden = true;
    byId('recap-content').hidden = true;
    byId('recap-error-message').textContent = message;
    byId('recap-error').hidden = false;
  };

  const bindReplayControls = () => {
    byId('recap-matches').addEventListener('click', event => {
      const button = event.target.closest('[data-replay-id]');
      if (!button) return;
      const match = state.matches.find(item => item.id === button.dataset.replayId);
      if (match) openReplay(match);
    });
    byId('replay-close').addEventListener('click', () => byId('replay-dialog').close());
    byId('replay-dialog').addEventListener('close', stopReplay);
    byId('replay-start').addEventListener('click', () => { stopReplay(); state.replayPosition = 0; renderReplay(); });
    byId('replay-prev').addEventListener('click', () => { stopReplay(); state.replayPosition -= 1; renderReplay(); });
    byId('replay-next').addEventListener('click', () => { stopReplay(); state.replayPosition += 1; renderReplay(); });
    byId('replay-play').addEventListener('click', () => {
      if (state.replayTimer) { stopReplay(); return; }
      if (state.replayPosition >= matchMoves(state.replayMatch).length) state.replayPosition = 0;
      byId('replay-play').textContent = 'Pause';
      state.replayTimer = window.setInterval(() => {
        state.replayPosition += 1;
        renderReplay();
        if (state.replayPosition >= matchMoves(state.replayMatch).length) stopReplay();
      }, 700);
    });
  };

  const init = async () => {
    bindReplayControls();
    const championshipId = new URLSearchParams(window.location.search).get('id');
    if (!championshipId) { showError('Le lien de ce championnat est incomplet.'); return; }
    try {
      const championship = await fetchDocument('championships', championshipId);
      const [participants, matches] = await Promise.all([
        enrichParticipants(championshipParticipants(championship)),
        loadMatches(championship)
      ]);
      renderPage(championship, participants, matches);
    } catch (error) {
      console.error('Championship recap load failed:', error);
      showError(error.message || 'Impossible de retrouver ce championnat.');
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
