const runPublicPage = () => initPublicPage();
window.addEventListener('shared-shell-ready', runPublicPage, {once:true});
const sharedShellScript = document.createElement('script');
sharedShellScript.src = './shared-shell.js?v=20260909-social-v3';
document.head.append(sharedShellScript);

const FIREBASE_CONFIG = {apiKey:'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',authDomain:'mopyonlakay.firebaseapp.com',projectId:'mopyonlakay',storageBucket:'mopyonlakay.firebasestorage.app',messagingSenderId:'307157893690',appId:'1:307157893690:web:4e5a033d13d54ce86feb03'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dt = value => { const date = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const game = value => String(value || 'mopyon').toLowerCase() === 'domino' ? 'DOMINO' : 'MOPYON';
// Real game docs (kind:'game', e.g. the individual manches of a bracket series) carry the actual
// players only as participantIds + a participantNames/playerNames uid->name map — no players array
// and no player1/player2, so that schema must be checked too or every card falls back to "Joueur".
const players = data => {
  if (Array.isArray(data.players)) return data.players.map(player => typeof player === 'string' ? {name:player} : player);
  if (typeof data.players === 'string') return data.players.split('/').map(name => ({name:name.trim()}));
  if (data.player1 || data.player2 || data.firstPlayer || data.secondPlayer) return [data.player1 || data.firstPlayer, data.player2 || data.secondPlayer].filter(Boolean).map(player => typeof player === 'string' ? {name:player} : player);
  const ids = Array.isArray(data.participantIds) ? data.participantIds : [];
  const names = data.participantNames || data.playerNames || {};
  const socialIds = data.participantSocialIds || {};
  return ids.map(uid => ({uid, socialPlayerId:socialIds[uid] || uid, name: names[uid] || ''}));
};
const name = player => player?.name || player?.displayName || player?.username || 'Joueur';
const PLAYER_LEVELS = [
  {name:'Débutant',min:0,next:50},
  {name:'Intermédiaire',min:50,next:150},
  {name:'Confirmé',min:150,next:300},
  {name:'Expert',min:300,next:600},
  {name:'Élite',min:600,next:null}
];
const playerLevelFromPoints = value => {
  const points = Math.max(0, Number(value) || 0);
  return [...PLAYER_LEVELS].reverse().find(level => points >= level.min) || PLAYER_LEVELS[0];
};
const normalizedRankingName = value => String(value || '').trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
const PROFILE_AVATAR_INDEX = {'ricardo p.':0,'jean m.':1,'michel d.':2,'david t.':3,'nadia l.':4,'alex r.':5,'ruth joseph':6,'mikaël louis':7,'sarah charles':8,'esther paul':9,'lovely michel':10,'wesley auguste':11};
const championAvatar = value => PROFILE_AVATAR_INDEX[normalizedRankingName(value)];
const uniqueRankingAvatars = rows => {
  const usedSprites = new Set(), usedImages = new Set(), result = rows.map(row => ({...row}));
  result.forEach(row => { const fixed = championAvatar(row.displayName || row.name); if (fixed === undefined || usedSprites.has(fixed)) return; row.avatarIndex=fixed; row.imageName=''; usedSprites.add(fixed); });
  result.forEach(row => {
    if (championAvatar(row.displayName || row.name) !== undefined) return;
    const image = /^[A-Za-z0-9._-]+$/.test(String(row.imageName || '')) ? String(row.imageName) : '';
    if (image && !usedImages.has(image)) { usedImages.add(image); return; }
    row.imageName='';
    const requested=Number(row.avatarIndex);
    row.avatarIndex=Number.isInteger(requested)&&requested>=0&&requested<12&&!usedSprites.has(requested)?requested:Array.from({length:12},(_,index)=>index).find(index=>!usedSprites.has(index))??0;
    usedSprites.add(row.avatarIndex);
  });
  return result;
};
const avatarPhotoURL = player => { const value = String(player?.photoURL || '').trim(); return /^https:\/\//.test(value) ? value.replace(/'/g, '%27') : ''; };
const avatarImageName = player => { const value = String(player?.imageName || ''); return /^[A-Za-z0-9._-]+$/.test(value) ? value : ''; };
const initialsFrom = value => String(value || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?';
const socialPlayerId = player => String(player?.socialPlayerId || player?.uid || player?.userId || player?.playerId || player?.id || '').trim();
const socialAvatarLink = (player, markup) => /^[A-Za-z0-9_-]{1,150}$/.test(socialPlayerId(player)) ? `<a class="player-social-link" href="./player.html?id=${encodeURIComponent(socialPlayerId(player))}" aria-label="Voir le profil de ${esc(name(player))}">${markup}</a>` : markup;
const rankingAvatar = (player, fallbackIndex = 0) => {
  const label = name(player);
  const photoURL = avatarPhotoURL(player);
  const image = avatarImageName(player);
  if (photoURL || image) {
    const background = photoURL ? `center/cover no-repeat url('${photoURL}')` : `center/cover no-repeat url('./src/profilimage/${encodeURIComponent(image)}')`;
    return `<span class="ranking-avatar-public" style="display:inline-grid;place-items:center;width:32px;height:32px;margin-right:10px;vertical-align:middle;border:1px solid #d7e0e8;border-radius:50%;background:${background}" role="img" aria-label="Avatar de ${esc(label)}"></span>`;
  }
  if (player?.isDemo) {
    const index = Math.abs(Number(player?.avatarIndex ?? fallbackIndex) || 0) % 12;
    const spritePosition = `${index % 4 * 100 / 3}% ${Math.floor(index / 4) * 50}%`;
    return `<span class="ranking-avatar-public" style="display:inline-grid;place-items:center;width:32px;height:32px;margin-right:10px;vertical-align:middle;border:1px solid #d7e0e8;border-radius:50%;background:${spritePosition}/400% auto no-repeat url('./src/images/ranking-avatar-sprite.png')" role="img" aria-label="Avatar de ${esc(label)}"></span>`;
  }
  return `<span class="ranking-avatar-public" style="display:inline-grid;place-items:center;width:32px;height:32px;margin-right:10px;vertical-align:middle;border:1px solid #d7e0e8;border-radius:50%;background:#dfe7ed;color:#476174;font-size:11px;font-weight:800" role="img" aria-label="Avatar de ${esc(label)}">${initialsFrom(label)}</span>`;
};
const matchAvatar = player => {
  const label = name(player);
  const photoURL = avatarPhotoURL(player);
  const image = avatarImageName(player);
  if (photoURL || image) {
    const background = photoURL ? `center/cover no-repeat url('${photoURL}')` : `center/cover no-repeat url('./src/profilimage/${encodeURIComponent(image)}')`;
    return socialAvatarLink(player,`<span class="avatar" style="background:${background}" role="img" aria-label="Avatar de ${esc(label)}"></span>`);
  }
  return socialAvatarLink(player,`<span class="avatar" style="display:grid;place-items:center;background:#172738;color:#c9d6e2;font-size:14px;font-weight:800" role="img" aria-label="Avatar de ${esc(label)}">${initialsFrom(label)}</span>`);
};
const rankingIdentity = (value, profilesById, profilesByName) => {
  if (value === null || value === undefined) return null;
  const source = typeof value === 'object' ? value : {};
  const rawId = typeof value === 'object' ? source.uid || source.userId || source.playerId || source.participantId || source.id : String(value);
  const rawName = typeof value === 'object' ? source.displayName || source.name || source.username : String(value);
  const profile = (rawId && profilesById.get(String(rawId))) || (rawName && profilesByName.get(normalizedRankingName(rawName))) || {};
  const id = profile.id || (rawId && profilesById.has(String(rawId)) ? String(rawId) : '');
  const displayName = profile.displayName || profile.name || (typeof value === 'object' ? rawName : id ? '' : rawName);
  if (!displayName || (!id && /^\S{20,}$/.test(displayName))) return null;
  const key = id ? `id:${id}` : `name:${normalizedRankingName(displayName)}`;
  return {key,id,displayName,profile:{...profile,displayName}};
};
const rankingValues = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
const rankingStage = data => String(data.stage || data.phase || data.roundName || data.roundLabel || data.bracketStage || data.matchType || '').toLocaleLowerCase('fr');
const isSemifinalOrFinalStage = data => {
  const stage=rankingStage(data).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/16|seiz|8e|huit|quart|quarter/.test(stage)) return false;
  return /(^|\b)(demi|semi)(\b|-)|^(finale?|championship)$/.test(stage.trim());
};
const playedChampionship = data => /completed|complete|finished|ended|termine|terminé|ongoing|live|en cours/.test(String(data.status || data.state || '').toLocaleLowerCase('fr')) || Boolean(data.completedAt || data.endedAt || data.winner || data.winnerId || data.champion || data.championId);
const stableRankingAvatarIndex = value => PROFILE_AVATAR_INDEX[normalizedRankingName(value)] ?? Array.from(normalizedRankingName(value)).reduce((total,character) => total + character.codePointAt(0),0) % 12;
const buildPerformanceRankings = (matches, championships, leaderboardDocs) => {
  const profiles = leaderboardDocs.map(doc => ({id:doc.id,...doc.data(),isDemo:false}));
  const profilesById = new Map(profiles.map(profile => [profile.id,profile]));
  const profilesByName = new Map(profiles.map(profile => [normalizedRankingName(profile.displayName || profile.name),profile]));
  const stats = new Map();
  const getStat = value => {
    const identity = rankingIdentity(value,profilesById,profilesByName);
    if (!identity) return null;
    if (!stats.has(identity.key)) stats.set(identity.key,{...identity,participations:new Set(),semifinals:new Set()});
    return stats.get(identity.key);
  };
  const add = (value,competitionId,field) => { const stat = getStat(value); if (stat && competitionId) stat[field].add(String(competitionId)); };
  profiles.forEach(profile => getStat(profile));
  const participantFields = ['participantIds','participants','registeredPlayers','registrations','players'];
  const semifinalFields = ['semifinalistIds','semiFinalistIds','semifinalists','semiFinalists','qualifiedSemifinalists','topFour'];
  const finalistFields = ['finalistIds','finalists'];
  championships.filter(playedChampionship).forEach(championship => {
    const competitionId = championship.id;
    participantFields.flatMap(field => rankingValues(championship[field])).forEach(player => add(player,competitionId,'participations'));
    [...semifinalFields,...finalistFields].flatMap(field => rankingValues(championship[field])).forEach(player => { add(player,competitionId,'participations'); add(player,competitionId,'semifinals'); });
    [championship.winnerId,championship.championId,championship.winner,championship.champion].filter(Boolean).forEach(player => { add(player,competitionId,'participations'); add(player,competitionId,'semifinals'); });
  });
  matches.forEach(match => {
    const competitionId = match.championshipId || match.tournamentId || match.competitionId || match.championshipNumber;
    if (!competitionId) return;
    const matchParticipants = participantFields.flatMap(field => rankingValues(match[field]));
    matchParticipants.forEach(player => add(player,competitionId,'participations'));
    if (isSemifinalOrFinalStage(match)) matchParticipants.forEach(player => add(player,competitionId,'semifinals'));
  });
  return [...stats.values()]
    .map(stat => {
      const points = Math.max(0, Number(stat.profile?.points ?? stat.profile?.totalPoints ?? stat.profile?.score) || 0);
      const level = playerLevelFromPoints(points).name;
      return {...stat,participationCount:stat.participations.size,semifinalCount:stat.semifinals.size,points,level,avatarIndex:stableRankingAvatarIndex(stat.displayName)};
    })
    .sort((a,b) => b.points-a.points || b.participationCount-a.participationCount || b.semifinalCount-a.semifinalCount || a.displayName.localeCompare(b.displayName,'fr'));
};
const RANKING_SORT_VALUE = {
  displayName: row => row.displayName,
  participationCount: row => row.participationCount,
  semifinalCount: row => row.semifinalCount,
  points: row => row.points
};
const sortRankingRows = (rows, field, dir) => {
  const getValue = RANKING_SORT_VALUE[field] || RANKING_SORT_VALUE.points;
  const multiplier = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getValue(a), bv = getValue(b);
    if (typeof av === 'string') return multiplier * av.localeCompare(bv, 'fr');
    if (av !== bv) return multiplier * (av - bv);
    return b.points - a.points || a.displayName.localeCompare(b.displayName, 'fr');
  });
};
const RANKING_COLUMNS = [
  {field:'displayName', label:'JWÈ'},
  {field:'participationCount', label:'PARTICIPATION'},
  {field:'semifinalCount', label:'DEMI-FINAL'},
  {field:'points', label:'PTS'},
  {field:'points', label:'NIVEAU'}
];
const performanceRows = (rows, sortField, sortDir) => rows.length ? `<div class="performance-table-scroll"><table class="public-table performance-table"><thead><tr><th>#</th>${RANKING_COLUMNS.map(column => `<th class="ranking-sortable${column.field === sortField ? ' active' : ''}" data-field="${column.field}" role="button" tabindex="0" aria-sort="${column.field === sortField ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}">${column.label}${column.field === sortField ? `<i class="ranking-sort-arrow" aria-hidden="true">${sortDir === 'asc' ? '▲' : '▼'}</i>` : ''}</th>`).join('')}</tr></thead><tbody>${uniqueRankingAvatars(rows).map((row,index) => {const identity={...row.profile,socialPlayerId:row.id||row.profile?.socialPlayerId,displayName:row.displayName,avatarIndex:row.avatarIndex};return `<tr><td><span class="ranking-rank">${index+1}</span></td><td>${socialAvatarLink(identity,rankingAvatar(identity,row.avatarIndex))}${socialAvatarLink(identity,`<b>${esc(row.displayName)}</b>`)}</td><td><strong>${row.participationCount}</strong></td><td>${row.semifinalCount}</td><td>${row.points}</td><td><span class="level-badge">${esc(row.level)}</span></td></tr>`}).join('')}</tbody></table></div>` : '<div class="ranking-stat-empty"><strong>Aucune donnée officielle</strong><span>Ce classement apparaîtra dès que les participations, les points et les phases atteintes seront publiés.</span></div>';
const scoreChip = (label, value) => `<span class="score-chip"><span>${esc(label)}</span><b>+${esc(value)}</b></span>`;
const levelChip = (label, value) => `<span class="score-chip level-chip"><span>${esc(label)}</span><b>${esc(value)}</b></span>`;
const performanceRankingMarkup = (realRows, sortField, sortDir) => `<section class="ranking-table-card" aria-labelledby="performance-ranking-title"><div class="ranking-stat-head"><span class="ranking-stat-icon">#</span><div><p id="performance-ranking-title">CLASSEMENT</p></div></div><details class="ranking-guide-menu"><summary><span><i data-lucide="CircleHelp" aria-hidden="true"></i>Barème des points et niveaux</span><i class="ranking-guide-chevron" data-lucide="ChevronDown" aria-hidden="true"></i></summary><div class="ranking-score-guide"><div class="ranking-guide-row"><span class="ranking-guide-label">POINTS</span><div class="ranking-chip-list">${[['Participation',5],['16e',10],['8e',15],['Quart',25],['Demi',40],['Champion',75],['Sans abandon',5]].map(([label,value]) => scoreChip(label,value)).join('')}</div></div><div class="ranking-guide-row"><span class="ranking-guide-label">NIVEAUX</span><div class="ranking-chip-list">${[['Débutant','0'],['Intermédiaire','50'],['Confirmé','150'],['Expert','300'],['Élite','600+']].map(([label,value]) => levelChip(label,value)).join('')}</div></div><p class="ranking-guide-hint"><i data-lucide="MousePointerClick" aria-hidden="true"></i>Cliquez sur une colonne du tableau pour voir qui est premier dans ce domaine.</p></div></details>${performanceRows(realRows, sortField, sortDir)}</section>`;
const status = data => String(data.status || data.state || data.liveStatus || '').toLowerCase();
const LIVE_MATCH_DURATION_MS = 90 * 60 * 1000;
const LIVE_MATCH_STATUSES = new Set(['live','direct','en direct','en cours','ongoing','in-progress','active']);
const matchStartDate = data => dt(data.startedAt || data.startAt || data.scheduledAt || data.matchDate || data.date);
const matchActivityDate = data => dt(data.endedAt || data.completedAt || data.finishedAt || data.startedAt || data.updatedAt || data.createdAt || data.startAt);
const live = data => {
  if (!LIVE_MATCH_STATUSES.has(status(data).trim())) return false;
  if (data.winnerId || data.winner || data.draw === true || data.completedAt || data.endedAt || data.finishedAt) return false;
  const start = matchStartDate(data);
  if (!start) return true;
  const elapsed = Date.now() - start.getTime();
  return elapsed >= 0 && elapsed <= LIVE_MATCH_DURATION_MS;
};
const done = data => /complete|completed|finished|ended|termine|terminé|replay/.test(status(data));
const dateText = value => { const date = dt(value); return date ? date.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}) : 'Date non publiée'; };
const publicCurrentUserId = () => window.JwetproCurrentUserId || window.firebase?.auth?.().currentUser?.uid || '';
const publicIsParticipant = data => Boolean(publicCurrentUserId()) && Array.isArray(data.participantIds) && data.participantIds.includes(publicCurrentUserId());
const publicMatchSocialAttributes = data => data.kind === 'game' || (data.kind !== 'series' && (data.seriesId || data.parentSeriesId || data.matchSeriesId)) ? ' data-social-disabled="true"' : ` data-social-kind="match" data-social-id="${esc(data.id)}"`;
const matchCard = (data, isReplay = false) => {
  const matchPlayers = players(data);
  const number = data.number || data.championshipNumber || '';
  const participant = !isReplay && publicIsParticipant(data);
  const isSeries = data.kind === 'series';
  const watchId = isSeries ? String(data.currentGameId || data.activeGameId || '') : data.id;
  const destinationId = participant && isSeries ? data.id : watchId;
  const seriesScore = isSeries && data.seriesScore ? `${Number(data.seriesScore.p1) || 0}–${Number(data.seriesScore.p2) || 0}` : 'VS';
  const action = isReplay
    ? `<a href="./play.html?replay=${encodeURIComponent(data.id)}">VOIR LE REPLAY <i data-lucide="ArrowRight"></i></a>`
    : destinationId ? `<a href="./play.html?${participant ? 'join' : 'match'}=${encodeURIComponent(destinationId)}">${participant ? 'REJOINDRE LE MATCH' : 'REGARDER LE MATCH'} <i data-lucide="ArrowRight"></i></a>` : '';
  return `<article class="public-card match-card"${publicMatchSocialAttributes(data)}><div class="public-top"><b class="public-status ${isReplay ? 'replay' : 'live'}"><i></i>${isReplay ? 'REPLAY' : 'EN DIRECT'}</b><time>${esc(dateText(data.startedAt || data.createdAt || data.startAt))}</time></div><h2>${game(data.game || data.type)} ${number ? `<span>#${esc(number)}</span>` : ''}</h2><div class="match-players"><div>${matchAvatar(matchPlayers[0])}${socialAvatarLink(matchPlayers[0],`<b>${esc(name(matchPlayers[0]))}</b>`)}</div><strong>${esc(seriesScore)}</strong><div>${matchAvatar(matchPlayers[1])}${socialAvatarLink(matchPlayers[1],`<b>${esc(name(matchPlayers[1]))}</b>`)}</div></div><div class="public-bottom"><span>${isReplay ? `Match terminé${isSeries ? ' · 2 manches gagnantes' : ''}` : `${esc(data.viewers || 0)} spectateurs`}</span>${action}</div></article>`;
};
const normalizedReplaySearch = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
const replayChampionshipId = match => String(match.championshipId || match.tournamentId || match.competitionId || '').trim();
const replayChampionshipNumber = record => String(record.championshipNumber || record.number || '').trim();
const replayDate = (match, championship) => dt(championship?.startAt || championship?.startDate || championship?.date || match.endedAt || match.completedAt || match.finishedAt || match.startedAt || match.startAt || match.createdAt);
const replayDateKey = date => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : 'date-inconnue';
const replayDateLabel = date => date ? date.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) : 'Date non publiée';
const replayChampionshipLabel = (championship, match) => {
  const label = String(championship?.title || championship?.name || championship?.championshipName || match.championshipTitle || match.championshipName || '').trim();
  if (label) return label;
  const number = replayChampionshipNumber(championship || match) || replayChampionshipId(match);
  return `${game(championship?.game || match.game || match.type)}${number ? ` · #${number}` : ''}`;
};
const replayMatchSearchText = (match, championship, championshipLabel) => normalizedReplaySearch([
  match.id,
  match.number,
  match.matchNumber,
  match.championshipNumber,
  match.stage,
  match.phase,
  match.roundName,
  match.roundLabel,
  match.bracketStage,
  game(match.game || match.type),
  championshipLabel,
  championship?.id,
  ...players(match).map(name)
].filter(Boolean).join(' '));
const REPLAY_ROUNDS = Object.freeze([
  {key:'16e', label:'16ÈMES DE FINALE', shortLabel:'16èmes', order:1},
  {key:'8e', label:'8ÈMES DE FINALE', shortLabel:'8èmes', order:2},
  {key:'quart', label:'QUARTS DE FINALE', shortLabel:'Quarts', order:3},
  {key:'demi', label:'DEMI-FINALES', shortLabel:'Demies', order:4},
  {key:'finale', label:'GRANDE FINALE', shortLabel:'Finale', order:5},
  {key:'autre', label:'AUTRES MATCHS', shortLabel:'Autres', order:6}
]);
const replayRoundKey = match => {
  const value = normalizedReplaySearch([match.round,match.stage,match.phase,match.roundName,match.roundLabel,match.bracketStage,match.matchType].filter(Boolean).join(' '));
  if (/(^|\s|[-_])(16e|16eme|seizieme|round[\s_-]*(of[\s_-]*)?32|round32|1\/16)(\s|$|[-_])/.test(value)) return '16e';
  if (/(^|\s|[-_])(8e|8eme|huitieme|round[\s_-]*(of[\s_-]*)?16|round16|1\/8)(\s|$|[-_])/.test(value)) return '8e';
  if (/quart|quarter|round[\s_-]*(of[\s_-]*)?8|round8|1\/4/.test(value)) return 'quart';
  if (/demi|semi|round[\s_-]*(of[\s_-]*)?4|round4|1\/2/.test(value)) return 'demi';
  if (/grande?[\s_-]*finale?|(^|\s|[-_])finale?(\s|$|[-_])|championship/.test(value)) return 'finale';
  return 'autre';
};
const replayMatchPosition = match => {
  const slot = Math.max(0,Number(match.bracketSlot ?? match.slot ?? match.matchIndex) || 0);
  const gameNumber = Math.max(0,Number(match.gameNumber ?? match.roundGameNumber) || 0);
  return slot * 100 + gameNumber;
};
const replayRoundsMarkup = matches => {
  const rounds = new Map(REPLAY_ROUNDS.map(round => [round.key, {...round,matches:[]} ]));
  matches.forEach(match => rounds.get(replayRoundKey(match)).matches.push(match));
  return [...rounds.values()].filter(round => round.matches.length).map(round => {
    round.matches.sort((a,b) => replayMatchPosition(a) - replayMatchPosition(b) || (matchActivityDate(a)?.getTime() || 0) - (matchActivityDate(b)?.getTime() || 0));
    return `<section class="replay-round replay-round-${round.key}" data-replay-round><header class="replay-round-heading"><span class="replay-round-step">${String(round.order).padStart(2,'0')}</span><div><small>TOUR DU CHAMPIONNAT</small><h3>${round.label}</h3></div><span class="replay-round-line" aria-hidden="true"></span><b class="replay-round-count"><span data-visible-round-count>${round.matches.length}</span> <span data-visible-round-label>match${round.matches.length === 1 ? '' : 's'}</span></b></header><div class="replay-match-grid">${round.matches.map(match => `<div class="replay-match-item" data-replay-match data-search="${esc(match.replaySearchText)}">${matchCard(match, true)}</div>`).join('')}</div></section>`;
  }).join('');
};
const replayBrowserMarkup = (replayMatches, championships) => {
  const championshipsById = new Map(championships.map(record => [String(record.id), record]));
  const championshipsByNumber = new Map();
  championships.forEach(record => {
    const number = replayChampionshipNumber(record);
    if (number && !championshipsByNumber.has(number)) championshipsByNumber.set(number, record);
  });
  const groups = new Map();
  replayMatches.forEach(match => {
    const championshipId = replayChampionshipId(match);
    const championshipNumber = replayChampionshipNumber(match);
    const championship = championshipsById.get(championshipId) || championshipsByNumber.get(championshipNumber) || null;
    const date = replayDate(match, championship);
    const dateKey = replayDateKey(date);
    const championshipKey = championshipId || String(championship?.id || '') || (championshipNumber ? `number-${championshipNumber}` : `other-${dateKey}-${game(match.game || match.type)}`);
    const championshipLabel = replayChampionshipLabel(championship, match);
    if (!groups.has(dateKey)) groups.set(dateKey, {date, championships:new Map()});
    const dateGroup = groups.get(dateKey);
    if (!dateGroup.championships.has(championshipKey)) dateGroup.championships.set(championshipKey, {key:championshipKey, label:championshipLabel, date, championship, matches:[]});
    dateGroup.championships.get(championshipKey).matches.push({...match, replaySearchText:replayMatchSearchText(match, championship, championshipLabel)});
  });
  const dateGroups = [...groups.values()].sort((a, b) => (b.date?.getTime() || -1) - (a.date?.getTime() || -1));
  let firstChampionship = true;
  const groupsMarkup = dateGroups.map(dateGroup => {
    const championshipGroups = [...dateGroup.championships.values()].sort((a, b) => (b.date?.getTime() || -1) - (a.date?.getTime() || -1) || a.label.localeCompare(b.label, 'fr'));
    const championshipMarkup = championshipGroups.map(group => {
      const isOpen = firstChampionship;
      firstChampionship = false;
      const gameLabel = game(group.championship?.game || group.matches[0]?.game || group.matches[0]?.type);
      return `<details class="replay-championship" data-replay-championship${isOpen ? ' open' : ''}><summary><span class="replay-championship-icon">${gameLabel === 'DOMINO' ? '<i data-lucide="Dice5"></i>' : '<i data-lucide="Grid3X3"></i>'}</span><span class="replay-championship-copy"><small>CHAMPIONNAT</small><strong>${esc(group.label)}</strong></span><span class="replay-championship-count"><b data-visible-count>${group.matches.length}</b><span data-visible-match-label> match${group.matches.length === 1 ? '' : 's'}</span></span><i class="replay-championship-chevron" data-lucide="ChevronDown"></i></summary><div class="replay-rounds">${replayRoundsMarkup(group.matches)}</div></details>`;
    }).join('');
    return `<section class="replay-date-group" data-replay-date><header class="replay-date-heading"><span></span><time datetime="${dateGroup.date ? dateGroup.date.toISOString() : ''}">${esc(replayDateLabel(dateGroup.date))}</time><b data-visible-championships>${championshipGroups.length} championnat${championshipGroups.length === 1 ? '' : 's'}</b></header>${championshipMarkup}</section>`;
  }).join('');
  const plural = replayMatches.length === 1 ? '' : 's';
  return `<div class="replay-browser"><div class="replay-toolbar"><div class="replay-search"><i data-lucide="Search"></i><label class="sr-only" for="replay-search-input">Rechercher un match</label><input id="replay-search-input" type="search" data-replay-search placeholder="Rechercher un match, un joueur ou un championnat" autocomplete="off"><button type="button" data-replay-clear aria-label="Effacer la recherche" hidden><i data-lucide="X"></i></button></div><p class="replay-result-count" role="status" aria-live="polite"><strong data-replay-result-count>${replayMatches.length}</strong><span data-replay-result-label> match${plural} disponible${plural}</span></p></div><div class="replay-groups">${groupsMarkup}</div><div class="data-empty replay-search-empty" data-replay-empty hidden><i data-lucide="SearchX"></i><strong>Aucun match trouvé</strong><span>Essayez un numéro de match, le nom d’un joueur ou un championnat.</span></div></div>`;
};
const bindReplayBrowser = () => {
  const browser = document.querySelector('.replay-browser');
  if (!browser) return;
  const input = browser.querySelector('[data-replay-search]');
  const clear = browser.querySelector('[data-replay-clear]');
  const count = browser.querySelector('[data-replay-result-count]');
  const countLabel = browser.querySelector('[data-replay-result-label]');
  const emptyState = browser.querySelector('[data-replay-empty]');
  const filter = () => {
    const query = normalizedReplaySearch(input.value);
    let visibleTotal = 0;
    browser.querySelectorAll('[data-replay-championship]').forEach(championship => {
      let visibleInChampionship = 0;
      championship.querySelectorAll('[data-replay-match]').forEach(item => {
        const visible = !query || item.dataset.search.includes(query);
        item.hidden = !visible;
        if (visible) visibleInChampionship += 1;
      });
      championship.querySelectorAll('[data-replay-round]').forEach(round => {
        const visibleInRound = round.querySelectorAll('[data-replay-match]:not([hidden])').length;
        round.hidden = visibleInRound === 0;
        const roundCount = round.querySelector('[data-visible-round-count]');
        const roundLabel = round.querySelector('[data-visible-round-label]');
        if (roundCount) roundCount.textContent = visibleInRound;
        if (roundLabel) roundLabel.textContent = `match${visibleInRound === 1 ? '' : 's'}`;
      });
      championship.hidden = visibleInChampionship === 0;
      const visibleCount = championship.querySelector('[data-visible-count]');
      if (visibleCount) visibleCount.textContent = visibleInChampionship;
      const visibleMatchLabel = championship.querySelector('[data-visible-match-label]');
      if (visibleMatchLabel) visibleMatchLabel.textContent = ` match${visibleInChampionship === 1 ? '' : 's'}`;
      if (query && visibleInChampionship) championship.open = true;
      visibleTotal += visibleInChampionship;
    });
    browser.querySelectorAll('[data-replay-date]').forEach(group => {
      const visibleChampionships = group.querySelectorAll('[data-replay-championship]:not([hidden])').length;
      group.hidden = visibleChampionships === 0;
      const visibleChampionshipLabel = group.querySelector('[data-visible-championships]');
      if (visibleChampionshipLabel) visibleChampionshipLabel.textContent = `${visibleChampionships} championnat${visibleChampionships === 1 ? '' : 's'}`;
    });
    count.textContent = visibleTotal;
    const plural = visibleTotal === 1 ? '' : 's';
    countLabel.textContent = ` match${plural} disponible${plural}`;
    emptyState.hidden = visibleTotal !== 0;
    clear.hidden = !query;
  };
  input.addEventListener('input', filter);
  clear.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
};
const champCard = data => `<article class="public-card champ-card" data-social-kind="championship" data-social-id="${esc(data.id)}"><i data-lucide="${game(data.game) === 'DOMINO' ? 'Dice5' : 'Grid3X3'}"></i><div><b class="public-status ${data.status === 'registration-open' ? 'open' : 'soon'}">${data.status === 'registration-open' ? 'INSCRIPTIONS OUVERTES' : 'À VENIR'}</b><h2>${game(data.game)} <span>#${esc(data.number || data.id)}</span></h2><p>${esc(dateText(data.startAt || data.startDate))}${data.time ? ` · ${esc(data.time)}` : ''}</p></div><dl><div><dt>Participation</dt><dd>${Number(data.entryFee || 0).toLocaleString('fr-FR')} HTG</dd></div><div><dt>Gain</dt><dd>${Number(data.prize || 0).toLocaleString('fr-FR')} HTG</dd></div><div><dt>Tours</dt><dd>${Number(data.rounds || 5)}</dd></div></dl></article>`;
const empty = (title, text) => `<div class="data-empty"><i data-lucide="Inbox"></i><strong>${title}</strong><span>${text}</span></div>`;
const liveEmpty = nextChampionship => {
  const nextStart = matchStartDate(nextChampionship || {});
  const nextLabel = nextStart ? nextStart.toLocaleString('fr-FR',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}) : '';
  const nextMarkup = nextChampionship && nextStart
    ? `<div class="live-empty-next"><span>PROCHAIN RENDEZ-VOUS</span><strong>${game(nextChampionship.game)}${nextChampionship.number ? ` · #${esc(nextChampionship.number)}` : ''}</strong><time datetime="${nextStart.toISOString()}">${esc(nextLabel)}</time></div>`
    : '';
  return `<section class="live-empty" role="status"><div class="live-empty-visual" aria-hidden="true"><i data-lucide="Radio"></i><span></span></div><p class="live-empty-kicker">DIRECT JWETPRO</p><h2>Aucun match en direct pour le moment</h2><p class="live-empty-copy">La scène est calme actuellement. Dès qu’une rencontre officielle commencera, elle apparaîtra ici.</p>${nextMarkup}<div class="live-empty-actions"><a class="live-empty-primary" href="./calendar.html">VOIR LE CALENDRIER <i data-lucide="ArrowRight"></i></a><a class="live-empty-secondary" href="./activity.html">CONSULTER LES RÉSULTATS</a></div></section>`;
};
const set = (selector, html) => { const element = document.querySelector(selector); if (element) element.innerHTML = html; };
const loadPublicMatches = async db => {
  const queries = ['ongoing','live','completed','finished'].map(matchStatus => db.collection('matches').where('status','==',matchStatus).limit(100).get());
  queries.push(db.collection('matches').where('visibility','==','public').limit(100).get());
  const snapshots = await Promise.allSettled(queries);
  const unique = new Map();
  snapshots.forEach(result => {
    if (result.status !== 'fulfilled') {
      console.warn('Public matches query skipped:', result.reason?.code || result.reason?.message || result.reason);
      return;
    }
    result.value.docs.forEach(doc => unique.set(doc.id,{id:doc.id,...doc.data()}));
  });
  const missingSeriesIds = [...new Set([...unique.values()].map(match => String(match.seriesId || match.parentSeriesId || match.matchSeriesId || '')).filter(id => /^[A-Za-z0-9_-]{1,150}$/.test(id) && !unique.has(id)))].slice(0,50);
  if (missingSeriesIds.length) {
    const parents = await Promise.all(missingSeriesIds.map(id => db.collection('matches').doc(id).get().catch(() => null)));
    parents.filter(document => document?.exists).forEach(document => unique.set(document.id,{id:document.id,...document.data()}));
  }
  const matches = [...unique.values()];
  const seriesIds = new Set(matches.filter(match => match.kind === 'series').map(match => match.id));
  return matches.filter(match => match.kind === 'series' || !(match.seriesId || match.parentSeriesId || match.matchSeriesId) || !seriesIds.has(String(match.seriesId || match.parentSeriesId || match.matchSeriesId)));
};

async function initPublicPage() {
  window.renderIcons?.();
  const mode = document.body.dataset.page;
  if (mode === 'ranking' && !document.querySelector('link[href="./src/ranking-page.css"]')) {
    const rankingStyles = document.createElement('link');
    rankingStyles.rel = 'stylesheet';
    rankingStyles.href = './src/ranking-page.css';
    document.head.append(rankingStyles);
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.firestore();
    const [matches, championshipsSnapshot, leaderboardSnapshot] = await Promise.all([
      loadPublicMatches(db),
      db.collection('championships').limit(200).get(),
      db.collection('leaderboard').get()
    ]);
    const championships = championshipsSnapshot.docs.map(doc => ({id:doc.id,...doc.data()})).filter(record => record.status !== 'cancelled');
    if (mode === 'live') {
      const showReplays = new URLSearchParams(window.location.search).get('view') === 'replays';
      if (showReplays) {
        const replayMatches = matches.filter(done).sort((a,b) => (matchActivityDate(b) || new Date(0)) - (matchActivityDate(a) || new Date(0)));
        set('[data-list]', replayMatches.length ? replayBrowserMarkup(replayMatches, championships) : empty('Aucun replay publié','Les matchs terminés apparaîtront ici lorsqu’un replay sera disponible.'));
        document.querySelector('[data-page-title]').textContent = 'Matchs terminés et replays';
        document.title = 'Matchs terminés et replays — JWETPRO';
        const heroCopy = document.querySelector('.public-hero > p:last-child');
        if (heroCopy) heroCopy.textContent = 'Recherchez un match, puis explorez les replays classés par date, championnat et tour.';
        const footerLabel = document.querySelector('.public-foot span');
        if (footerLabel) footerLabel.textContent = 'JWETPRO · Replays';
        bindReplayBrowser();
      } else {
        const liveMatches = matches.filter(live).sort((a,b) => (matchStartDate(a) || new Date(0)) - (matchStartDate(b) || new Date(0)));
        const nextChampionship = championships
          .filter(record => { const start = matchStartDate(record); return start && start.getTime() > Date.now() && !done(record); })
          .sort((a,b) => matchStartDate(a) - matchStartDate(b))[0];
        set('[data-list]', liveMatches.length ? liveMatches.map(record => matchCard(record)).join('') : liveEmpty(nextChampionship));
        document.querySelector('[data-page-title]').textContent = 'Matchs en direct';
      }
    } else if (mode === 'ranking') {
      document.title = 'Classement des joueurs — JWETPRO';
      const rankingRows = buildPerformanceRankings(matches,championships,leaderboardSnapshot.docs);
      let rankingSortField = 'points';
      let rankingSortDir = 'desc';
      const renderRankingTable = () => {
        set('[data-list]', performanceRankingMarkup(sortRankingRows(rankingRows, rankingSortField, rankingSortDir), rankingSortField, rankingSortDir));
        window.renderIcons?.();
      };
      const sortByColumn = th => {
        const field = th.dataset.field;
        if (!field) return;
        rankingSortDir = rankingSortField === field ? (rankingSortDir === 'desc' ? 'asc' : 'desc') : (field === 'displayName' ? 'asc' : 'desc');
        rankingSortField = field;
        renderRankingTable();
      };
      renderRankingTable();
      const rankingList = document.querySelector('[data-list]');
      rankingList?.addEventListener('click', event => { const th = event.target.closest('th[data-field]'); if (th) sortByColumn(th); });
      rankingList?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const th = event.target.closest('th[data-field]');
        if (!th) return;
        event.preventDefault();
        sortByColumn(th);
      });
    } else {
      const sorted = championships.sort((a,b) => (dt(a.startAt) || new Date(9e15)) - (dt(b.startAt) || new Date(9e15)));
      set('[data-list]', sorted.map(champCard).join('') || empty('Aucun championnat publié','Les prochaines compétitions apparaîtront ici dès leur publication.'));
    }
  } catch (error) {
    console.error('Public page read failed:', error);
    set('[data-list]', empty('Données indisponibles','Impossible de charger les données pour le moment.'));
  }
  window.renderIcons?.();
}
window.addEventListener('jwetpro-auth-ready', () => { if (document.body.dataset.page === 'live') initPublicPage(); });
