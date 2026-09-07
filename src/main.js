const I=(name)=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
const d=window.homeData;
const standard=d.standard;
const PROFILE_AVATAR_INDEX={'ricardo p.':0,'jean m.':1,'michel d.':2,'david t.':3,'nadia l.':4,'alex r.':5,'ruth joseph':6,'mikaël louis':7,'sarah charles':8,'esther paul':9,'lovely michel':10,'wesley auguste':11};
const initialsOf=(name)=>String(name||'').trim().split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join('').toUpperCase()||'?';
const playerAvatarMarkup=(player,name,className='avatar')=>{
  const photoURL=String(player?.photoURL||'').trim();
  const imageName=String(player?.imageName||'').trim();
  if(/^https:\/\//.test(photoURL))return `<span class="${className} has-image" style="background-image:url('${photoURL.replace(/'/g,'%27')}');background-size:cover;background-position:center;background-color:#172738" role="img" aria-label="Photo de ${publicEscape(name)}"></span>`;
  if(/^[A-Za-z0-9._-]+$/.test(imageName))return `<span class="${className} has-image" style="background-image:url('./src/profilimage/${encodeURIComponent(imageName)}');background-size:cover;background-position:center;background-color:#172738" role="img" aria-label="Photo de ${publicEscape(name)}"></span>`;
  return `<span class="${className} has-initials" style="background-image:none;background-color:#172738;display:grid;place-items:center;color:#c9d6e2;font-size:14px;font-weight:800;letter-spacing:.02em" role="img" aria-label="Avatar de ${publicEscape(name)}">${initialsOf(name)}</span>`;
};
Object.assign(d.next,{entry:`${standard.entryFee} HTG`,prize:`${standard.prize.toLocaleString('fr-FR')} HTG`,max:String(standard.maxPlayers),format:standard.format});
const activity=(x)=>{const isDomino=x.game==='DOMINO'; const activityImage=isDomino?'./src/images/iconedomino.png':'./src/images/logogomoku.png'; const activityAlt=isDomino?'Icône Domino':'Icône Mopyon'; const value=x.value || `${standard.entryFee} HTG`; const amount=x.amount || `${standard.maxPlayers} joueurs max`; const action=x.action || (x.tone==='open'?{label:'S’INSCRIRE',href:'./calendar.html'}:x.tone==='live'?{label:'SUIVRE LE CHAMPIONNAT',href:'./progress.html'}:x.tone==='done'?{label:'REVOIR LE CHAMPIONNAT',href:'./activity.html'}:{label:'VOIR LE CHAMPIONNAT',href:'./progress.html'}); return `<article class="activity-card" data-reveal><div class="activity-icon"><img src="${activityImage}" alt="${activityAlt}"></div><div class="activity-content"><div class="card-top"><b class="card-title">${x.game} ${x.id}</b><span class="status ${x.tone}">${x.status}</span></div><div class="card-date">${x.date}</div><div class="card-footer"><div class="card-detail">${x.detail}<strong>${value}</strong></div><div class="card-detail">${x.tone==='done'?'Gain':'Capacité'}<strong>${amount}</strong></div></div><a class="activity-action ${x.tone}" href="${action.href}">${action.label} ${I('ArrowRight')}</a></div></article>`};
const live=(x)=>{const players=x.players.split('/').map((player)=>player.trim()); return `<article class="live-card" data-reveal><div><span class="status ${x.tone}">${x.badge}</span><div class="live-game">${x.game}</div><div class="live-players"><span class="player">${playerAvatarMarkup({},players[0])}<b>${players[0]}</b></span><span class="versus">VS</span><span class="player">${playerAvatarMarkup({},players[1])}<b>${players[1]}</b></span></div></div><div><div class="viewer">${I('Eye')}${x.viewers} spectateurs</div><div class="live-cta"><span>${x.action}</span></div></div></article>`};
const publicEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const matchToDate = value => { if (!value) return null; const date = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
let homepageStartedMatches = [];
let homepageFeaturedChampionship = null;
let homepageChampionshipRecords = [];
let homepageMatchRecords = [];
let homepagePersonalMatches = [];
let homepagePersonalMatchesRequest = 0;
let homepageCurrentProfile = null;
let homepageHeroTimer = null;
const homepageLeaderboardByName = new Map();
const normalizedPublicId = value => String(value ?? '').trim().replace(/^#+/, '').toLowerCase();
const publicMatchStatus = data => String(data?.status || data?.state || data?.liveStatus || '').trim().toLowerCase();
const publicMatchHasStarted = data => /live|direct|en cours|ongoing|in-progress|active|playing|complete|completed|finished|ended|termine|terminé|replay/.test(publicMatchStatus(data));
const publicMatchBelongsToChampionship = (match, championship) => {
  if (!match || !championship) return false;
  const championshipId = normalizedPublicId(championship.id);
  const linkedIds = [match.championshipId,match.tournamentId,match.competitionId,match.championship?.id].map(normalizedPublicId).filter(Boolean);
  if (championshipId && linkedIds.includes(championshipId)) return true;
  const championshipNumber = normalizedPublicId(championship.number);
  const linkedNumbers = [match.championshipNumber,match.tournamentNumber,match.competitionNumber,match.championship?.number].map(normalizedPublicId).filter(Boolean);
  return Boolean(championshipNumber && linkedNumbers.includes(championshipNumber));
};
// Real game docs (the individual manches of a bracket series) carry the actual players only as
// participantIds + a participantNames/playerNames uid->name map, not a players array or player1/
// player2 — that schema must be checked too, or the card falls back to the generic "Joueur" label.
const matchPlayers = data => {
  if (Array.isArray(data.players)) return data.players.map(player => typeof player === 'string' ? {name:player} : player);
  if (typeof data.players === 'string') return data.players.split('/').map(name => ({name:name.trim()}));
  if (data.player1 || data.player2 || data.firstPlayer || data.secondPlayer) return [data.player1 || data.firstPlayer, data.player2 || data.secondPlayer].filter(Boolean).map(player => typeof player === 'string' ? {name:player} : player);
  const ids = Array.isArray(data.participantIds) ? data.participantIds : [];
  const names = data.participantNames || data.playerNames || {};
  return ids.map(uid => ({uid, name: names[uid] || ''}));
};
const renderMatchRecord = (data, kind = 'replay') => {
  const players = matchPlayers(data);
  const names = [players[0]?.name || players[0]?.displayName || 'Joueur', players[1]?.name || players[1]?.displayName || 'Joueur'];
  const game = String(data.game || data.type || 'Mopyon').toUpperCase();
  const number = data.number || data.championshipNumber || '';
  if (kind === 'upcoming') {
    const href = data.championshipId ? `./progress.html?id=${encodeURIComponent(data.championshipId)}` : './progress.html';
    return `<article class="live-card upcoming-card" data-reveal><div><span class="status soon">À VENIR</span><div class="live-game">${publicEscape(game)} ${number ? `#${publicEscape(number)}` : ''}</div><div class="live-players"><span class="player">${playerAvatarMarkup(players[0],names[0])}<b>${publicEscape(names[0])}</b></span><span class="versus">VS</span><span class="player">${playerAvatarMarkup(players[1],names[1])}<b>${publicEscape(names[1])}</b></span></div></div><div><div class="viewer">Match à venir</div><div class="live-cta"><a href="${href}">VOIR LE CHAMPIONNAT</a></div></div></article>`;
  }
  const isReplay = kind === 'replay';
  const isParticipant = !isReplay && Boolean(currentAuthUser?.uid) && heroMatchParticipantIds(data).includes(currentAuthUser.uid);
  const isSeries = data.kind === 'series';
  const watchId = isSeries ? String(data.currentGameId || data.activeGameId || '') : data.id;
  const destinationId = isParticipant && isSeries ? data.id : watchId;
  const href = data.id ? (isReplay ? `./play.html?replay=${encodeURIComponent(data.id)}` : destinationId ? `./play.html?${isParticipant ? 'join' : 'match'}=${encodeURIComponent(destinationId)}` : './live.html') : './live.html';
  const actionLabel = isReplay ? 'REGARDER LE REPLAY' : isParticipant ? 'REJOINDRE LE MATCH' : 'REGARDER LE MATCH';
  const seriesScore = isSeries && data.seriesScore ? `${Number(data.seriesScore.p1) || 0}–${Number(data.seriesScore.p2) || 0}` : 'VS';
  return `<article class="live-card${isReplay ? ' replay-card' : ''}" data-reveal><div><span class="status ${isReplay ? 'replay' : 'live'}">${isReplay ? 'REPLAY' : 'EN DIRECT'}</span><div class="live-game">${publicEscape(game)} ${number ? `#${publicEscape(number)}` : ''}</div><div class="live-players"><span class="player">${playerAvatarMarkup(players[0],names[0])}<b>${publicEscape(names[0])}</b></span><span class="versus">${publicEscape(seriesScore)}</span><span class="player">${playerAvatarMarkup(players[1],names[1])}<b>${publicEscape(names[1])}</b></span></div></div><div><div class="viewer">${isReplay ? `Match terminé${isSeries ? ' · 2 manches gagnantes' : ''}` : `${I('Eye')}${publicEscape(data.viewers || 0)} spectateurs`}</div><div class="live-cta"><a href="${href}">${actionLabel}</a></div></div></article>`;
};
const renderMatchesEmptyState = (
  title = 'Aucun match publié',
  detail = 'Les matchs JWETPRO apparaîtront ici dès qu’une rencontre sera disponible.'
) => {
  const grid = document.querySelector('#live .live-grid');
  if (grid) grid.innerHTML = `<div class="data-empty" role="status"><span class="data-empty-icon">${I('Radio')}</span><strong>${title}</strong><p>${detail}</p></div>`;
  renderIcons();
};
const game=(title,desc,id,art)=>`<article class="game-card" data-reveal data-game="${id}"><div class="game-copy"><h3 class="game-title serif">${title}</h3><div class="game-desc">${desc}</div><div class="game-meta">GAINS JUSQU’À ${standard.prize.toLocaleString('fr-FR')} HTG</div><div class="game-submeta">${standard.format} · ${standard.maxPlayers} JOUEURS MAX</div><a class="game-link" data-game-cta href="#${id}">S’INSCRIRE ${I('ArrowUpRight')}</a></div>${art}</article>`;
document.querySelector('#app').innerHTML=`
<header class="site-header"><div class="container header-inner"><a class="brand header-brand text-brand" href="#top" aria-label="JWETPRO accueil"><span class="wordmark-jp serif">JP</span><span class="wordmark-jwet">JWET</span><span class="wordmark-pro">PRO</span></a><nav class="main-nav"><a href="./play.html">JOUER</a><a class="nav-live" href="./live.html">REGARDER <span class="live-dot"></span></a><a href="./ranking.html">CLASSEMENT</a><a href="./champions.html">CHAMPIONS</a><a href="./activity.html">RÉSULTATS</a><a href="./guide.html">COMMENT ÇA MARCHE</a></nav><a class="login-button" href="#login">${I('UserRound')} CONNEXION</a><button class="menu-button" id="menu-button" aria-label="Ouvrir le menu">${I('Menu')}</button></div><nav class="mobile-nav" id="mobile-nav"><a href="./play.html">JOUER</a><a href="./live.html">REGARDER · LIVE</a><a href="./ranking.html">CLASSEMENT</a><a href="./champions.html">CHAMPIONS</a><a href="./activity.html">RÉSULTATS</a><a href="./guide.html">COMMENT ÇA MARCHE</a></nav></header>
<main id="top"><section class="hero" aria-label="À la une"><div class="container hero-carousel" data-hero-carousel aria-roledescription="carrousel"><div class="hero-track" data-hero-track aria-live="polite"><article class="hero-slide hero-slide-loading"><div class="hero-loading"><span class="state-spinner" aria-hidden="true"></span><strong>Chargement des événements…</strong></div></article></div><div class="hero-carousel-nav" data-hero-nav hidden><button type="button" data-hero-previous aria-label="Événement précédent">${I('ArrowLeft')}</button><div class="hero-dots" data-hero-dots aria-label="Choisir un événement"></div><button type="button" data-hero-next aria-label="Événement suivant">${I('ArrowRight')}</button></div></div></section>
<section class="section" id="activity"><div class="container"><div class="section-head"><h2 class="section-title">ACTIVITÉ JWETPRO</h2><a class="arrow-link" href="./activity.html">VOIR TOUTE L’ACTIVITÉ ${I('ChevronRight')}</a></div><div class="activity-grid">${d.activity.map(activity).join('')}</div></div></section>
<section class="section dark-section" id="live"><div class="container"><div class="section-head"><h2 class="section-title"><span class="live-title-live">MATCHS EN DIRECT</span><span class="live-title-replay">REVOIR LES MATCHS</span> <span class="status live">LIVE</span><span class="status replay">REPLAY</span></h2><a class="arrow-link" href="#live">VOIR TOUS LES MATCHS ${I('ChevronRight')}</a></div><div class="live-grid">${d.live.map(live).join('')}</div></div></section>
<section class="section" id="progress"><div class="container"><div class="section-head"><h2 class="section-title">PROGRESSION DU CHAMPIONNAT</h2><a class="arrow-link" href="#progress">VOIR LE CHAMPIONNAT EN DIRECT <i data-lucide="ChevronRight" aria-hidden="true"></i></a></div><div class="progress-panel" data-reveal aria-live="polite"><div class="progress-summary"><div><div class="progress-heading"><b class="progress-name">Chargement…</b><span class="status soon">À VENIR</span></div><p class="progress-date">Données du prochain championnat</p></div><div class="progress-main"><div><div class="metric-label">JOUEURS MAX</div><div class="metric-value">—</div></div><div><div class="metric-label">MATCHS JOUÉS</div><div class="metric-value">—</div></div><div><div class="metric-label">TOUR ACTUEL</div><div class="metric-value">—</div></div><div><div class="metric-label">MATCHS EN COURS</div><div class="metric-value">—</div></div><div><div class="metric-label">HEURE DE DÉBUT</div><div class="metric-value">—</div></div></div><div class="progress-label"><span>Progression globale</span><b>0%</b></div><div class="meter"><div class="meter-fill" style="width:0%"></div></div></div><div class="round-bracket"><div class="bracket-head"><span>HUITIÈMES</span><span>QUARTS</span><span>DEMI-FINALES</span><span>FINALE</span><span>CHAMPION</span></div><div class="bracket-flow"><div class="bracket-col"><i>●</i><i>●</i><i>●</i><i>●</i><i>●</i><i>●</i><i>●</i><i>●</i></div><div class="bracket-col"><i>●</i><i>●</i><i>●</i><i>●</i></div><div class="bracket-col"><i>●</i><i>●</i></div><div class="bracket-col"><i>●</i></div><div class="bracket-winner">♛</div></div></div></div></div></section>
<section class="section dark-section" id="games"><div class="container"><div class="section-head"><h2 class="section-title">CHOISIS TON JEU</h2></div><div class="game-grid">${game('Mopyon','Jeu de stratégie et de concentration','Mopyon','')} ${game('DOMINO','Rapidité, tactique et anticipation','domino','<div class="domino-art"><img src="./src/images/imagedomino.png" alt="Dominos prêts pour une partie"></div>')}</div></div></section>
<section class="section" id="champions"><div class="container split-grid"><div><div class="section-head"><h2 class="section-title">DERNIERS CHAMPIONS</h2></div><div class="champion-list">${d.champions.map(c=>`<article class="champion-card ${c.rank==='#1'?'first':''}" data-reveal><div class="champion-rank">${c.rank}</div>${I(c.rank==='#1'?'Crown':'Medal')}<div class="champion-name">${c.name}</div><div class="champion-game">${c.game}</div><div class="champion-prize">5 000 HTG</div><div class="champion-date">${c.date}</div></article>`).join('')}</div></div><div class="ranking-panel" id="ranking"><div class="ranking-header">${I('ChartNoAxesColumnIncreasing')}<h2 class="section-title">CLASSEMENT GÉNÉRAL</h2></div><table class="ranking-table"><thead><tr><th>#</th><th>JOUEUR</th><th>NIVEAU</th><th>POINTS</th></tr></thead><tbody></tbody></table><a class="ranking-all-link" id="ranking-all-link" href="./ranking.html">VOIR TOUT LE CLASSEMENT ${I('ArrowRight')}</a></div></div></section>
<section class="section dark-section" id="process"><div class="container"><div class="section-head"><h2 class="section-title">TOUT SE PASSE SUR JWETPRO</h2></div><div class="process-list">${[['Wallet','INSCRIPTION RAPIDE','Réservez le championnat et payez votre participation.'],['Gamepad2','JOUEZ SUR LA PLATEFORME','Tous les matchs se jouent directement sur JWETPRO.'],['Radio','REGARDEZ LES MATCHS','Suivez chaque partie en direct ou en replay.'],['','SUIVEZ LA PROGRESSION','Voyez l’avancement du championnat et les résultats.'],['Shield','RÉSULTATS TRANSPARENTS','Les parties et résultats sont enregistrés.']].map((p,i)=>`<article class="process-item process-item-${i+1}" data-reveal><div class="process-visual" aria-hidden="true"></div>${i===3?'<span class="process-progress-icon" aria-hidden="true">↗</span>':I(p[0])}<h3>${p[1]}</h3><p>${p[2]}</p></article>`).join('')}</div></div></section>
<section class="section" id="calendar"><div class="container"><div class="section-head"><h2 class="section-title">CALENDRIER DES CHAMPIONNATS</h2></div><div class="calendar-strip" data-reveal>${d.calendar.map(c=>`<article class="calendar-card"><div class="calendar-day">${c[0]}</div><div class="calendar-game">${c[1]}</div><div class="calendar-date">${c[2]}</div><span class="status ${c[4]}">${c[3]}</span></article>`).join('')}</div></div></section><section class="trust-bar"><div class="container trust-list"><div class="trust-item">${I('Lock')}<div><strong>PAIEMENTS SÉCURISÉS</strong><span>Vos transactions sont protégées</span></div></div><div class="trust-item">${I('CircleCheck')}<div><strong>RÉSULTATS VALIDÉS</strong><span>Résultats contrôlés par le système</span></div></div><div class="trust-item">${I('Wallet')}<div><strong>GAINS VERSÉS</strong><span>Paiement selon les règles du championnat</span></div></div><div class="trust-item">${I('Headphones')}<div><strong>SUPPORT RÉACTIF</strong><span>Aide disponible en cas de problème</span></div></div></div></section></main><footer><div class="container footer-grid"><div><a class="brand" href="#top"><span class="brand-mark serif">JP</span><span>JWET<span class="brand-pro">PRO</span></span></a><p class="footer-copy">Le hub des championnats<br>de jeux de table en Haïti.</p></div><div><div class="footer-title">LIENS RAPIDES</div><div class="footer-links"><a href="./calendar.html">Championnats</a><a href="./live.html">En direct</a><a href="./ranking.html">Classement</a><a href="./champions.html">Champions</a></div></div><div><div class="footer-title">SUPPORT</div><div class="footer-links"><a href="./faq.html">FAQ</a><a href="#rules">Règlement</a><a href="./privacy.html">Confidentialité</a></div></div><div><div class="footer-title">SUIVEZ-NOUS</div><div class="footer-links"><a href="./social.html#facebook">Facebook</a><a href="./social.html#instagram">Instagram</a><a href="./social.html#whatsapp">WhatsApp</a></div></div></div></footer>`;
document.querySelector('footer')?.insertAdjacentHTML('beforeend', '<div class="container footer-bottom"><span>© 2026 JWETPRO. Tous droits réservés.</span><span>Championnats de jeux de table en Haïti.</span></div>');
const homeLink = document.createElement('a');
homeLink.className = 'nav-home-link';
homeLink.href = '#top';
homeLink.innerHTML = `${I('House')}<span data-home-label>ACCUEIL</span>`;
document.querySelector('.main-nav')?.prepend(homeLink);
const mobileHomeLink = homeLink.cloneNode(true);
mobileHomeLink.href = '#top';
document.querySelector('.mobile-nav')?.prepend(mobileHomeLink);
let currentRulesGame = 'Mopyon';
const PLAYER_LEVELS = [
  {name: 'Débutant', min: 0, next: 50},
  {name: 'Intermédiaire', min: 50, next: 150},
  {name: 'Confirmé', min: 150, next: 300},
  {name: 'Expert', min: 300, next: 600},
  {name: 'Élite', min: 600, next: null}
];
const playerLevelFromPoints = value => {
  const points = Math.max(0, Number(value) || 0);
  const level = [...PLAYER_LEVELS].reverse().find(item => points >= item.min) || PLAYER_LEVELS[0];
  const next = level.next === null ? null : level.next;
  const progress = next === null ? 100 : Math.min(100, Math.max(0, (points - level.min) / (next - level.min) * 100));
  return {...level, points, progress, remaining: next === null ? 0 : Math.max(0, next - points)};
};
const rulesContent = {
  Mopyon: {
    title: 'CHAMPIONNAT MORPION',
    summary: '32 joueurs · 5 tours · 125 HTG · 2 000 HTG au champion',
    intro: 'Les parties se jouent directement sur JwetPro. Les matchs peuvent être suivis en direct par les spectateurs et les résultats sont enregistrés par la plateforme.',
    sections: [
      ['Format du championnat', ['32 joueurs participent au tableau final.', 'Le championnat comporte cinq tours : seizièmes de finale, huitièmes de finale, quarts de finale, demi-finales et finale.', 'Chaque confrontation constitue un seul match joué au meilleur de trois manches.', 'Le premier joueur qui gagne deux manches remporte le match.', 'Une manche fait toujours partie de son match et n’est jamais comptée comme un match indépendant.', 'Les adversaires sont attribués automatiquement par JwetPro.', 'Il est interdit de choisir ou d’échanger son adversaire.', 'Le gagnant de chaque match avance au tour suivant.']],
      ['Règles du Morpion', ['Deux joueurs s’affrontent : X contre O.', 'Les joueurs jouent chacun leur tour.', 'Le joueur qui commence est déterminé par JwetPro.', 'Un symbole ne peut être placé que sur une case libre.', 'Une fois un coup validé, il ne peut plus être déplacé ou annulé.', 'Le premier joueur qui aligne exactement 5 symboles consécutifs gagne la partie.', 'L’alignement peut être horizontal, vertical ou diagonal.', 'Si aucune victoire n’est obtenue et qu’aucun coup légal ne permet de poursuivre la partie, le match est déclaré nul.']],
      ['Qualification', ['Le gagnant est qualifié pour le tour suivant.', 'Lorsqu’un match ne produit pas de gagnant direct, le départage publié avant le championnat est appliqué.', 'Le champion ne sera jamais choisi au hasard.']],
      ['Temps, absence et déconnexion', ['Chaque joueur doit être présent à l’heure indiquée pour son match.', 'Dans un match entre deux joueurs réels, l’arrivée du premier joueur déclenche un délai de présence de 5 minutes pour son adversaire.', 'Si l’adversaire n’a pas rejoint la salle à la fin des 5 minutes, il perd automatiquement par forfait de temps et ce motif apparaît dans le résultat et le replay.', 'Cette règle de forfait ne s’applique pas à un adversaire simulé : la partie commence immédiatement contre le bot dès l’arrivée du joueur réel.', 'En cas de courte déconnexion après le début de la partie, JwetPro tente de permettre au joueur de reprendre la partie.', 'Une déconnexion ne permet pas d’annuler volontairement un mauvais coup ou de recommencer une partie.', 'Les abandons volontaires répétés peuvent entraîner des sanctions.']],
      ['Jeu équitable', ['Utiliser un bot ou un programme pour choisir ses coups est interdit.', 'Les multi-comptes et le partage de compte sont interdits.', 'Il est interdit de recevoir une aide extérieure pendant un match officiel.', 'Il est interdit d’organiser volontairement une victoire ou une défaite.', 'L’exploitation d’un bug ou d’une faille est interdite.', 'JwetPro peut examiner les parties suspectes et suspendre un résultat lorsqu’une vérification est nécessaire.']],
      ['Spectateurs et matchs en direct', ['Les matchs officiels peuvent être suivis directement sur JwetPro.', 'Les spectateurs peuvent voir le plateau, les coups joués, l’état du match, la progression du championnat et les résultats.', 'Un spectateur ne doit jamais pouvoir intervenir dans une partie ou transmettre une aide à un joueur pendant son match.']],
      ['Récompenses et coupons', ['Le champion remporte 2 000 HTG après validation définitive des résultats.', 'Le deuxième reçoit un coupon couvrant gratuitement une inscription.', 'Chacun des autres participants reçoit un coupon de réduction de 25 HTG.', 'Chaque coupon est personnel, non transférable, non cumulable et utilisable une seule fois uniquement pour le prochain championnat publié, qu’il soit Mopyon ou Domino. Il expire ensuite.']],
      ['Points et niveaux', ['Les points sont attribués uniquement après publication officielle d’un championnat.', 'Barème : participation confirmée +5 pts, victoire en 16e +10 pts, victoire en 8e +15 pts, victoire en quart +25 pts, victoire en demi-finale +40 pts, champion +75 pts, bonus sans abandon +5 pts.', 'L’entraînement libre ne donne aucun point officiel.', 'Chaque joueur est compté une seule fois par championnat.', 'Les niveaux sont automatiques : Débutant 0-49 pts, Intermédiaire 50-149 pts, Confirmé 150-299 pts, Expert 300-599 pts, Élite 600 pts et plus.']],
      ['Respect des règles', ['En participant au championnat, le joueur accepte le présent règlement, les décisions techniques automatiques de JwetPro et les contrôles nécessaires en cas de fraude ou de litige.', 'Toute tentative de fraude peut entraîner l’annulation du résultat et la suspension du compte.']]
    ]
  },
  Domino: {
    title: 'CHAMPIONNAT DOMINO',
    summary: '32 participants · 5 tours · 125 HTG · 2 000 HTG au champion',
    intro: 'Les parties se jouent directement sur JwetPro. La distribution des dominos, les tours de jeu et les résultats sont contrôlés par le système.',
    sections: [
      ['Format du championnat', ['32 participants prennent place dans le tableau final selon la configuration Domino publiée.', 'Le championnat comporte cinq tours : seizièmes de finale, huitièmes de finale, quarts de finale, demi-finales et finale.', 'Chaque confrontation constitue un seul match joué au meilleur de trois manches.', 'Le premier joueur ou la première équipe qui gagne deux manches remporte le match.', 'Une manche fait toujours partie de son match et n’est jamais comptée comme un match indépendant.', 'Les adversaires sont attribués automatiquement par JwetPro.', 'Les participants ne peuvent pas choisir leurs adversaires.']],
      ['Matériel de jeu', ['La partie utilise un jeu standard de 28 dominos, du double-blanc au double-six.', 'JwetPro effectue automatiquement le mélange, la distribution, la gestion des pièces, le contrôle des coups et le calcul du résultat.', 'Les joueurs ne peuvent pas modifier la distribution.']],
      ['Déroulement d’une partie', ['Les joueurs jouent chacun leur tour.', 'Un domino doit être placé sur une extrémité compatible de la chaîne.', 'Les valeurs en contact doivent correspondre.', 'Lorsqu’un joueur ne possède aucun coup autorisé, il passe son tour selon les règles appliquées par JwetPro.', 'Un domino joué et validé ne peut pas être repris.', 'L’ordre de départ est déterminé automatiquement par la plateforme.']],
      ['Victoire d’une manche', ['Une équipe remporte la manche lorsqu’elle atteint la condition de victoire définie par le système, notamment lorsqu’un joueur de l’équipe pose sa dernière pièce avant les adversaires.', 'Si la partie est bloquée, JwetPro calcule automatiquement les points restants dans les mains afin de déterminer le résultat.', 'Aucun joueur ne peut déclarer lui-même qu’il a gagné.']],
      ['Résultat d’une confrontation', ['Chaque match se joue au meilleur de trois manches.', 'La première équipe qui gagne deux manches remporte le match.', 'Le score est calculé automatiquement par JwetPro.']],
      ['Qualification', ['L’équipe gagnante est qualifiée pour le tour suivant.', 'Lorsqu’un match ne produit pas de gagnant direct, le départage publié avant le championnat est appliqué.', 'Le champion n’est jamais désigné par tirage au sort.']],
      ['Communication entre coéquipiers', ['Il est interdit de montrer volontairement ses dominos à une personne extérieure.', 'Il est interdit de recevoir des informations sur les dominos adverses.', 'Il est interdit de communiquer secrètement avec un adversaire.', 'L’utilisation d’un deuxième appareil ou compte pour observer une partie est interdite.', 'Toute collusion peut entraîner l’annulation immédiate du résultat.']],
      ['Déconnexion, absence et spectateurs', ['Tous les joueurs doivent être présents au début du match.', 'Une courte période peut être accordée pour rejoindre ou reprendre une partie après une déconnexion.', 'Une équipe absente après le délai prévu peut perdre par forfait.', 'Les spectateurs ne peuvent pas voir les pièces privées ni intervenir dans la partie.', 'JwetPro peut appliquer un léger délai au mode spectateur pour empêcher toute assistance extérieure.']],
      ['Points et niveaux', ['Les points sont attribués uniquement après publication officielle d’un championnat.', 'Barème par joueur : participation confirmée +5 pts, victoire en 16e +10 pts, victoire en 8e +15 pts, victoire en quart +25 pts, victoire en demi-finale +40 pts, champion +75 pts, bonus sans abandon +5 pts.', 'L’entraînement libre Domino ne donne aucun point officiel.', 'Chaque joueur est compté une seule fois par championnat.', 'Les niveaux sont automatiques : Débutant 0-49 pts, Intermédiaire 50-149 pts, Confirmé 150-299 pts, Expert 300-599 pts, Élite 600 pts et plus.']],
      ['Récompenses et jeu équitable', ['Le champion remporte 2 000 HTG après validation des résultats et vérification de l’absence d’irrégularité.', 'Le deuxième reçoit un coupon couvrant gratuitement une inscription; chacun des autres participants reçoit un coupon de réduction de 25 HTG.', 'Chaque coupon est personnel, non transférable, non cumulable et utilisable une seule fois uniquement pour le prochain championnat publié, Domino ou Mopyon. Il expire ensuite.', 'Les multi-comptes, le partage de compte, les bots, l’exploitation de bugs, la collusion et les arrangements de match sont interdits.', 'JwetPro peut suspendre un match, examiner son historique et annuler un résultat lorsqu’une fraude est constatée.']]
    ]
  }
};
const renderRulesPage = game => {
  const data = rulesContent[game] || rulesContent.Mopyon;
  const page = document.querySelector('#rules-page');
  if (!page) return;
  page.querySelector('.rules-kicker').textContent = 'RÈGLEMENT JWETPRO';
  page.querySelector('.rules-title').textContent = data.title;
  page.querySelector('.rules-summary').textContent = data.summary;
  page.querySelector('.rules-intro').textContent = data.intro;
  page.querySelectorAll('[data-rules-game]').forEach(button => button.classList.toggle('is-active', button.dataset.rulesGame === game));
  page.querySelector('.rules-sections').innerHTML = data.sections.map(([title, bullets], index) => `<section class="rules-section"><div class="rules-section-number">${String(index + 1).padStart(2, '0')}</div><div><h2>${title}</h2><ul>${bullets.map(item => `<li>${item}</li>`).join('')}</ul></div></section>`).join('');
};
const rulesPage = document.createElement('section');
rulesPage.id = 'rules-page';
rulesPage.className = 'rules-page';
rulesPage.hidden = true;
rulesPage.innerHTML = `<div class="rules-shell"><header class="rules-header"><a class="rules-back" href="#top" aria-label="Retour à l’accueil"><span class="rules-back-icon" aria-hidden="true">←</span><span>RETOUR À L’ACCUEIL</span></a><div class="rules-brand"><span class="rules-brand-mark serif">JP</span><span>JWET<span>PRO</span></span></div></header><main class="rules-content"><div class="rules-hero"><div><p class="rules-kicker">RÈGLEMENT JWETPRO</p><h1 class="rules-title"></h1><p class="rules-summary"></p></div><div class="rules-badge">${I('ShieldCheck')}<span>Jeu équitable<br>Résultats contrôlés</span></div></div><p class="rules-intro"></p><div class="rules-switcher" role="tablist" aria-label="Choisir le règlement"><button type="button" role="tab" data-rules-game="Mopyon">${I('Grid3X3')} RÈGLES MOPYON</button><button type="button" role="tab" data-rules-game="Domino">${I('Dice5')} RÈGLES DOMINO</button></div><div class="rules-sections"></div></main><footer class="rules-footer"><span>JWETPRO · Règlement officiel</span><a href="#top">Retour à l’accueil ${I('ArrowRight')}</a></footer></div>`;
document.body.append(rulesPage);
const showRulesPage = game => { currentRulesGame = game || currentRulesGame; renderRulesPage(currentRulesGame); rulesPage.hidden = false; document.body.classList.add('rules-open'); window.scrollTo({top:0, behavior:'instant'}); rulesPage.querySelector('.rules-back')?.focus(); };
const hideRulesPage = () => { rulesPage.hidden = true; document.body.classList.remove('rules-open'); };
rulesPage.addEventListener('click', event => { const tab = event.target.closest('[data-rules-game]'); if (tab) { currentRulesGame = tab.dataset.rulesGame; renderRulesPage(currentRulesGame); } });
document.addEventListener('click', event => { const link = event.target.closest('a[href="#rules"]'); if (link) { event.preventDefault(); showRulesPage(currentRulesGame); } });
if (window.location.hash === '#rules') setTimeout(() => showRulesPage(currentRulesGame), 0);
rulesPage.querySelector('.rules-back')?.addEventListener('click', event => { event.preventDefault(); hideRulesPage(); history.replaceState(null, '', '#top'); });
rulesPage.querySelector('.rules-footer a')?.addEventListener('click', event => { event.preventDefault(); hideRulesPage(); history.replaceState(null, '', '#top'); });
renderRulesPage(currentRulesGame);
const socialLinks = document.querySelector('footer .footer-grid > div:last-child .footer-links');
if (socialLinks) { socialLinks.className = 'footer-links social-links'; socialLinks.innerHTML = '<a href="./social.html#facebook" aria-label="Facebook"><img src="./src/images/facebook.png" alt="Facebook"></a><a href="./social.html#instagram" aria-label="Instagram"><img src="./src/images/instagrame.png" alt="Instagram"></a><a href="./social.html#whatsapp" aria-label="WhatsApp"><img src="./src/images/whatsapp.png" alt="WhatsApp"></a>'; }
const calendarSection = document.querySelector('#calendar');
if (calendarSection && Array.isArray(d.calendar) && d.calendar.length) {
  const [featured, ...allUpcoming] = d.calendar;
  const upcoming = allUpcoming.slice(0, 4);
  const calendarIcon = item => /domino/i.test(item[1]) ? './src/images/iconedomino.png' : './src/images/logogomoku.png';
  const calendarAlt = item => /domino/i.test(item[1]) ? 'Icône Domino' : 'Icône Mopyon';
  const statusClass = item => item[4] === 'open' ? 'open' : 'soon';
  calendarSection.querySelector('.container').innerHTML = `<div class="calendar-heading"><h2 class="section-title"><span class="calendar-heading-icon">${I('Trophy')}</span>CALENDRIER DES CHAMPIONNATS</h2><a class="arrow-link" href="#calendar">VOIR TOUS LES CHAMPIONNATS ${I('ChevronRight')}</a></div><div class="calendar-layout"><article class="calendar-feature"><div class="calendar-feature-label">${I('Star')} PROCHAIN CHAMPIONNAT</div><div class="calendar-feature-main"><div class="calendar-feature-date"><b>${featured[0].split(' ')[0]}</b><span>${featured[0].split(' ')[1] || 'MAI'}</span></div><div class="calendar-feature-copy"><div class="calendar-game-icon"><img src="${calendarIcon(featured)}" alt="${calendarAlt(featured)}"></div><div><h3>${featured[1]}</h3><p>${featured[2]}</p><span class="status ${statusClass(featured)}">${featured[3]}</span></div></div></div><div class="calendar-feature-footer"><div><span>${I('Coins')} ENTRÉE</span><b>${d.next.entry}</b></div><div><span>${I('Trophy')} GAIN</span><b>${d.next.prize}</b></div><a href="#games">VOIR LE CHAMPIONNAT ${I('ChevronRight')}</a></div></article><div class="calendar-timeline">${upcoming.map((item,index)=>`<article class="calendar-timeline-item"><span class="calendar-timeline-dot ${index?'':'active'}"></span><div class="calendar-timeline-date"><b>${item[0].split(' ')[0]}</b><span>${item[0].split(' ')[1] || 'MAI'}</span></div><div class="calendar-timeline-icon"><img src="${calendarIcon(item)}" alt="${calendarAlt(item)}"></div><div class="calendar-timeline-copy"><h3>${item[1]}</h3><p>${item[2]}</p></div><span class="status ${statusClass(item)}">${item[3]}</span>${I('ChevronRight')}</article>`).join('')}</div></div>`;
}
const processHead = document.querySelector('#process .section-head');
if (processHead && !processHead.querySelector('.process-intro')) processHead.insertAdjacentHTML('beforeend','<p class="process-intro">Une compétition pensée pour être simple à rejoindre, suivre et comprendre.</p>');
renderIcons();
const progressSummary = document.querySelector('#progress .progress-summary');
if (progressSummary && !progressSummary.querySelector('.progress-register')) {
  progressSummary.insertAdjacentHTML('beforeend', '<a class="progress-register" href="#games">S’INSCRIRE AU CHAMPIONNAT <i data-lucide="ArrowRight" aria-hidden="true"></i></a>');
  renderIcons();
}
document.querySelectorAll('.game-card').forEach(card => {
  const meta = card.querySelector('.game-meta');
  const submeta = card.querySelector('.game-submeta');
  if (meta) meta.textContent = `GAINS JUSQU’À ${standard.prize.toLocaleString('fr-FR')} HTG`;
  if (submeta) submeta.textContent = `${standard.format} · ${standard.maxPlayers} JOUEURS MAX`;
});
const calendarNote = document.querySelector('#calendar .calendar-note');
if (!calendarNote && calendarSection) calendarSection.querySelector('.container')?.insertAdjacentHTML('afterbegin', `<p class="calendar-note">${standard.cumulativeNote}</p>`);
const chatBubble = document.createElement('button');
chatBubble.id = 'chat-bubble';
chatBubble.className = 'chat-bubble';
chatBubble.type = 'button';
chatBubble.setAttribute('aria-label', 'Ouvrir les messages');
chatBubble.title = 'Messages';
chatBubble.innerHTML = I('MessageCircle');
document.body.append(chatBubble);
const assistanceBubble = document.createElement('button');
assistanceBubble.id = 'assistance-bubble';
assistanceBubble.className = 'assistance-bubble';
assistanceBubble.type = 'button';
assistanceBubble.setAttribute('aria-label', 'Contacter Jean Estime');
assistanceBubble.title = 'Jean Estime';
assistanceBubble.innerHTML = I('Headphones');
document.body.append(assistanceBubble);
renderIcons();
if (!chatBubble.querySelector('svg')) {
  chatBubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.8-4.2A8.3 8.3 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"></path><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"></path></svg>';
}
localStorage.removeItem('jwetpro-chat-position');

let communityDb = null;
const coordinatorRoom = userId => ({id:`coordinator_${userId}`,name:'Coordonnateur',description:'Assistance privée',isCoordinator:true});
const ensureCoordinatorUser = async () => {
  const auth = window.firebase?.auth?.();
  if (!auth) throw new Error('AUTH_UNAVAILABLE');
  if (auth.currentUser) return auth.currentUser;
  const credential = await auth.signInAnonymously();
  return credential.user;
};
const escapeCommunity = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
const communityTimestamp = value => value?.toDate ? value.toDate().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '';
const communityImage = value => { const name=String(value||'').trim(); return /^[A-Za-z0-9._-]+$/.test(name) ? `./src/profilimage/${encodeURIComponent(name)}` : ''; };
const communityAvatar = (imageName, displayName) => {
  const label=String(displayName||'Utilisateur').trim()||'Utilisateur';
  const image=communityImage(imageName);
  const initials=label.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'JW';
  return `<span class="community-avatar${image?' has-profile-image':' has-initials'}"${image?` style="background-image:url('${image}')"`:''} role="img" aria-label="Photo de ${escapeCommunity(label)}">${image?'':escapeCommunity(initials)}</span>`;
};
const currentCommunityProfile = async () => {
  const user=window.firebase?.auth?.().currentUser;
  if(!user||!communityDb) return null;
  try { const snapshot=await communityDb.collection('users').doc(user.uid).get(); return snapshot.exists?snapshot.data():{}; }
  catch(error) { console.warn('Profil actuel indisponible dans la messagerie :',error); return {}; }
};
const communityMessageSortValue = doc => {
  const timestamp = doc.data().createdAt;
  if (timestamp?.toMillis) return timestamp.toMillis();
  if (typeof timestamp?.seconds === 'number') return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000);
  return doc.metadata?.hasPendingWrites ? Number.MAX_SAFE_INTEGER : 0;
};
const communityMessageCompare = (a,b) => communityMessageSortValue(a)-communityMessageSortValue(b) || a.id.localeCompare(b.id);
const communityLanguage = () => localStorage.getItem('jwetpro-language') === 'ht' ? 'ht' : 'fr';
const communityAssistantActionMap = {
  open_mopyon_rules:{fr:'Voir les règles Mopyon',ht:'Gade règ Mopyon',href:'./index.html#rules'},
  open_domino_rules:{fr:'Voir les règles Domino',ht:'Gade règ Domino',href:'./index.html#rules'},
  open_calendar:{fr:'Voir le calendrier',ht:'Gade kalandriye a',href:'./calendar.html'},
  open_ranking:{fr:'Voir le classement',ht:'Gade klasman an',href:'./ranking.html'},
  open_matches:{fr:'Voir les matchs',ht:'Gade match yo',href:'./live.html'},
  open_replays:{fr:'Voir les replays',ht:'Gade replay yo',href:'./live.html?view=replays'},
  open_guide:{fr:'Comprendre JWETPRO',ht:'Konprann JWETPRO',href:'./guide.html'},
  open_signup:{fr:'Créer mon compte',ht:'Kreye kont mwen',href:'./index.html#signup'},
  open_training:{fr:'Accéder aux jeux',ht:'Ale nan jwèt yo',href:'./play.html'},
  open_mopyon_training:{fr:'Jouer au Mopyon',ht:'Jwe Mopyon',href:'./play.html?game=mopyon'},
  open_domino_training:{fr:'Jouer au Domino',ht:'Jwe Domino',href:'./play.html?game=domino'},
  open_my_matches:{fr:'Ouvrir Mes matchs',ht:'Louvri Match mwen yo',href:'./play.html?view=matches'},
  register_championship:{fr:'S’inscrire à un championnat',ht:'Enskri nan yon chanpyona',href:'./calendar.html'}
};
const communityAssistantControls = (documentId,data) => {
  if (data.authorRole !== 'assistant') return '';
  const language = data.language === 'ht' ? 'ht' : communityLanguage();
  const labels = language === 'ht'
    ? {helpful:'Itil',notHelpful:'Pa itil',quick:'AKSÈ RAPID · Peze yon bouton pou louvri paj la'}
    : {helpful:'Utile',notHelpful:'Pas utile',quick:'ACCÈS RAPIDE · Cliquez pour ouvrir la page'};
  const links = (Array.isArray(data.suggestedActions) ? data.suggestedActions : [])
    .filter(action => communityAssistantActionMap[action])
    .slice(0,3)
    .map(action => { const item=communityAssistantActionMap[action]; const label=item[language]; return `<a class="assistant-quick-link" data-assistant-link href="${item.href}" aria-label="${escapeCommunity(label)} — ouvre une page">${escapeCommunity(label)}${I('ArrowRight')}</a>`; })
    .join('');
  const quickLinks=links?`<nav class="assistant-quick-links" aria-label="${escapeCommunity(labels.quick)}"><span class="assistant-quick-links-label">${I('MousePointerClick')}${escapeCommunity(labels.quick)}</span><div>${links}</div></nav>`:'';
  return `${quickLinks}<div class="community-assistant-actions assistant-feedback-actions" aria-label="Évaluer la réponse de l’assistant"><button type="button" data-assistant-feedback="helpful" data-assistant-message-id="${escapeCommunity(documentId)}">${I('ThumbsUp')}${labels.helpful}</button><button type="button" data-assistant-feedback="not-helpful" data-assistant-message-id="${escapeCommunity(documentId)}">${I('ThumbsDown')}${labels.notHelpful}</button></div>`;
};
const bindAssistantFeedback = container => container?.addEventListener('click', async event => {
  const control=event.target.closest('[data-assistant-feedback]');
  if(!control||!communityDb) return;
  const user=window.firebase?.auth?.().currentUser;
  if(!user) return;
  const action=control.dataset.assistantFeedback;
  const assistantMessageId=control.dataset.assistantMessageId;
  if(!assistantMessageId||!['helpful','not-helpful','coordinator'].includes(action)) return;
  control.disabled=true;
  const now=firebase.firestore.FieldValue.serverTimestamp();
  try {
    if(action==='coordinator') {
      await communityDb.collection('assistantEscalations').doc(user.uid).set({userId:user.uid,assistantMessageId,status:'open',createdAt:now,updatedAt:now});
      control.textContent=communityLanguage()==='ht'?'Demann voye':'Demande transmise';
    } else {
      await communityDb.collection('assistantFeedback').doc(`${user.uid}_${assistantMessageId}`).set({userId:user.uid,assistantMessageId,rating:action,createdAt:now,updatedAt:now});
      control.textContent=communityLanguage()==='ht'?'Mèsi':'Merci';
    }
  } catch(error) {
    control.disabled=false;
    control.textContent=communityLanguage()==='ht'?'Eseye ankò':'Réessayer';
    console.error('Assistant feedback write failed:',error);
  }
});
chatBubble.addEventListener('click', () => { window.location.href = './community.html'; });

// --- Private assistance widget: a small anchored panel, separate from the group community modal, usable while signed out. ---
const assistModal = document.createElement('div');
assistModal.id = 'assist-modal';
assistModal.className = 'assist-modal';
assistModal.hidden = true;
assistModal.innerHTML = `<div class="assist-panel" role="dialog" aria-modal="true" aria-labelledby="assist-title"><header class="assist-header"><span class="assist-header-icon">${I('Headphones')}</span><div><strong id="assist-title">Jean Estime</strong><small>Assistant officiel JWETPRO</small></div><button class="assist-close" type="button" aria-label="Fermer la conversation avec Jean Estime">${I('X')}</button></header><div class="assist-messages" role="log" aria-live="polite"><p class="assist-empty">Connexion…</p></div><form class="assist-composer"><input type="text" maxlength="2000" placeholder="Écrire à Jean Estime…" aria-label="Écrire un message à Jean Estime"><button type="submit" aria-label="Envoyer le message">${I('Send')}</button></form></div>`;
document.body.append(assistModal);
const assistMessageContainer = assistModal.querySelector('.assist-messages');
assistModal.hidden = true;
document.body.classList.remove('assist-open');
window.addEventListener('pageshow', () => { assistModal.hidden = true; document.body.classList.remove('assist-open'); });
renderIcons();
bindAssistantFeedback(assistMessageContainer);

let activeAssistRoom = null;
let assistLoadToken = 0;
let assistMessagesUnsubscribe = null;
const assistState = message => { assistMessageContainer.innerHTML = `<p class="assist-empty">${escapeCommunity(message)}</p>`; };
const renderAssistMessages = async snapshot => {
  const user = window.firebase?.auth?.().currentUser;
  const sortedDocs = [...snapshot.docs].sort(communityMessageCompare);
  if (!snapshot.size) { assistMessageContainer.innerHTML = '<p class="assist-empty">Écrivez votre premier message à Jean Estime.</p>'; return; }
  const hasOwnMessages = Boolean(user && sortedDocs.some(doc => doc.data().authorId === user.uid));
  const profile = hasOwnMessages ? await currentCommunityProfile() : null;
  const currentName = profile ? `${profile.firstName||''} ${profile.lastName||''}`.trim()||profile.username||user?.displayName||user?.email : '';
  const renderedMessages = sortedDocs.map(doc => {
    const data = doc.data();
    const isCurrentUser = Boolean(user && data.authorId === user.uid);
    const isAssistant = data.authorRole === 'assistant';
    const tone = isCurrentUser ? 'is-own' : isAssistant ? 'is-assistant' : 'is-coordinator';
    const authorName = isAssistant ? 'Jean Estime' : (isCurrentUser && currentName ? currentName : data.authorName || data.username || 'Coordonnateur');
    const imageName = isCurrentUser ? profile?.imageName || '' : data.authorImageName || data.imageName;
    const mark = isAssistant ? '<span class="community-assistant-mark" aria-label="Jean Estime, assistant officiel JWETPRO">JE</span>' : communityAvatar(imageName, authorName);
    return `<article class="community-message ${tone}" data-message-id="${escapeCommunity(doc.id)}">${mark}<div><div class="community-message-meta"><strong>${escapeCommunity(authorName)}</strong><small>${communityTimestamp(data.createdAt)}</small></div><p>${escapeCommunity(data.body||data.message||'')}</p>${communityAssistantControls(doc.id,data)}</div></article>`;
  }).join('');
  const lastMessage = sortedDocs.at(-1)?.data();
  const assistantIsGenerating = Boolean(user && lastMessage?.authorId === user.uid && lastMessage?.authorRole !== 'assistant' && lastMessage?.assistantState !== 'human');
  const typingLabel = communityLanguage()==='ht' ? 'Jean Estime ap prepare yon repons' : 'Jean Estime prépare une réponse';
  const typing = assistantIsGenerating ? `<div class="community-assistant-typing" role="status" aria-live="polite" aria-label="${escapeCommunity(typingLabel)}"><span class="community-assistant-mark" aria-hidden="true">JE</span><i></i><i></i><i></i></div>` : '';
  assistMessageContainer.innerHTML = renderedMessages + typing;
  renderIcons();
  requestAnimationFrame(() => { assistMessageContainer.scrollTop = assistMessageContainer.scrollHeight; });
};
const loadAssistRoom = room => {
  assistMessagesUnsubscribe?.();
  assistMessagesUnsubscribe = null;
  const token = ++assistLoadToken;
  assistState('Chargement des messages…');
  assistMessagesUnsubscribe = communityDb.collection('communityMessages').where('roomId','==',room.id).orderBy('createdAt','asc').limitToLast(100).onSnapshot(async snapshot => { if (token===assistLoadToken) await renderAssistMessages(snapshot); }, error => { if (token===assistLoadToken) assistState('Impossible de charger l’assistance pour le moment.'); console.error('Assistance messages read failed:', error); });
};
const openAssistance = async () => {
  assistModal.hidden = false;
  document.body.classList.add('assist-open');
  assistModal.querySelector('.assist-close')?.focus();
  assistState('Connexion avec Jean Estime…');
  try {
    if (!window.firebase || typeof firebase.firestore !== 'function') { assistState('Le service est temporairement indisponible.'); return; }
    communityDb = communityDb || firebase.firestore();
    const user = await ensureCoordinatorUser();
    activeAssistRoom = coordinatorRoom(user.uid);
    loadAssistRoom(activeAssistRoom);
  } catch (error) {
    assistState('Impossible d’ouvrir l’assistance pour le moment.');
    console.error('Coordinator assistance failed:', error);
  }
};
const closeAssistance = () => { assistMessagesUnsubscribe?.(); assistMessagesUnsubscribe = null; assistModal.hidden = true; document.body.classList.remove('assist-open'); assistanceBubble.focus(); };
assistanceBubble.addEventListener('click', openAssistance);
assistModal.addEventListener('click', event => { if (event.target.closest('[data-assistant-link]') || event.target.closest('.assist-close') || event.target === assistModal) closeAssistance(); });
document.addEventListener('keydown', event => { if (event.key==='Escape' && !assistModal.hidden) closeAssistance(); });
assistModal.querySelector('.assist-composer')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('input');
  const submit = form.querySelector('button');
  const body = input?.value.trim();
  if (!body || !activeAssistRoom || submit?.disabled) return;
  submit.disabled = true;
  input.setAttribute('aria-busy','true');
  try {
    const user = await ensureCoordinatorUser();
    const profile = await communityDb.collection('users').doc(user.uid).get();
    const data = profile.exists ? profile.data() : {};
    const authorName = `${data.firstName||''} ${data.lastName||''}`.trim()||data.username||user.email||'Visiteur JWETPRO';
    await communityDb.collection('communityMessages').add({roomId:activeAssistRoom.id,authorId:user.uid,authorName,authorImageName:data.imageName||'',authorRole:'user',language:communityLanguage(),body,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    input.value = '';
  } catch (error) {
    input.placeholder = 'Impossible d’envoyer le message';
    console.error('Assistance message write failed:', error);
  } finally {
    submit.disabled = false;
    input.removeAttribute('aria-busy');
    input.focus();
  }
});

const mobileNav = document.querySelector('#mobile-nav');
mobileNav.insertAdjacentHTML('afterbegin', `<button class="mobile-nav-close" id="mobile-nav-close" type="button" aria-label="Fermer le menu">${I('X')}</button>`);
const mobileBackdrop = document.createElement('button');
mobileBackdrop.className = 'mobile-nav-backdrop';
mobileBackdrop.type = 'button';
mobileBackdrop.setAttribute('aria-label', 'Fermer le menu');
document.body.append(mobileBackdrop);
const closeMobileNav = () => { mobileNav.classList.remove('open'); mobileBackdrop.classList.remove('open'); document.body.classList.remove('mobile-menu-open'); document.querySelector('#menu-button').setAttribute('aria-expanded', 'false'); };
document.querySelector('#menu-button').addEventListener('click', () => { const open = !mobileNav.classList.contains('open'); mobileNav.classList.toggle('open', open); mobileBackdrop.classList.toggle('open', open); document.body.classList.toggle('mobile-menu-open', open); document.querySelector('#menu-button').setAttribute('aria-expanded', String(open)); });
document.querySelector('#mobile-nav-close').addEventListener('click', closeMobileNav);
mobileBackdrop.addEventListener('click', closeMobileNav);
document.querySelectorAll('.mobile-nav a').forEach((a) => a.addEventListener('click', closeMobileNav));
initAnimations();

const LANGUAGE_KEY = 'jwetpro-language';
const creoleTranslations = {
  'ACCUEIL':'AKÈY',
  'JOUER':'JWE', 'REGARDER':'GADE', 'REGARDER · LIVE':'GADE · AN DIRÈK', 'CLASSEMENT':'KLASMAN', 'CHAMPIONS':'CHANPYON', 'RÉSULTATS':'REZILTA', 'COMMENT ÇA MARCHE':'KIJAN SA MACHE',
  'CONNEXION':'KONEKSYON', 'Ouvrir le menu':'Louvri meni an', 'JWETPRO accueil':'Akèy JWETPRO',
  'PROCHAIN CHAMPIONNAT':'PWOCHEN CHANPYONA', 'Mercredi 21 Mai 2025':'Mèkredi 21 Me 2025', 'GAIN PRINCIPAL':'GWO PRI', 'ENTRÉE':'ANTRE', 'JOUEURS MAX':'PLIS JWE YO', 'FORMAT':'FÒMA', 'ÉLIMINATION DIRECTE':'ELIMINASYON DIRÈK', 'INSCRIPTIONS OUVERTES':'ENSKRIPSYON OUVÈ', 'STATUT DES INSCRIPTIONS':'ETA ENSKRIPSYON YO', 'INSCRIPTIONS COMPLÈTES':'ENSKRIPSYON YO KONPLÈ', 'CHAMPIONNAT DÉJÀ COMMENCÉ':'CHANPYONA A DEJA KÒMANSE', 'EN COURS':'AN KOU', 'PARTICIPER — 125 HTG':'PATISIPE — 125 HTG', 'VOIR LES RÈGLES':'GADE RÈG YO',
  'ACTIVITÉ JWETPRO':'AKTIVITE JWETPRO', 'VOIR TOUTE L’ACTIVITÉ':'GADE TOUT AKTIVITE YO', 'MATCHS EN DIRECT':'MATCH AN DIRÈK', 'LIVE':'AN DIRÈK', 'VOIR TOUS LES MATCHS':'GADE TOUT MATCH YO', 'EN DIRECT':'AN DIRÈK', 'COMMENCE DANS 12 MIN':'KÒMANSE NAN 12 MIN', 'REPLAY':'REJWE', 'REGARDER LE MATCH':'GADE MATCH LA', 'REJOINDRE LE MATCH':'ANTRE NAN MATCH LA', 'VOIR LE LOBBY':'GADE LOBI A', 'REGARDER LE REPLAY':'GADE REJWE A', 'spectateurs':'espektatè', 'VS':'KONT',
  'PROGRESSION DU CHAMPIONNAT':'PWOGRÈ CHANPYONA A', 'VOIR LE CHAMPIONNAT EN DIRECT':'GADE CHANPYONA A AN DIRÈK', 'JOUEURS INSCRITS':'JWE YO ENSKRI', 'MATCHS JOUÉS':'MATCH KI JWE', 'ROUND ACTUEL':'TOU AKTYÈL', 'MATCHS EN COURS':'MATCH AN KOU', 'TEMPS RESTANT':'TAN KI RETE', 'Progression globale':'Pwogrè jeneral', 'HUITIÈMES':'WITYÈM', 'QUARTS':'KADEFINAL', 'DEMI-FINALES':'DEMI-FINAL', 'FINALE':'FINAL', 'CHAMPION':'CHANPYON',
  'CHOISIS TON JEU':'CHWAZI JWÈT OU', 'Choisis ton jeu et réserve ta place dans le prochain championnat.':'Chwazi jwèt ou epi rezève plas ou nan pwochen chanpyona a.', 'Jeu de stratégie et de concentration':'Jwèt estrateji ak konsantrasyon', 'Rapidité, tactique et anticipation':'Vitès, taktik ak antisipasyon', 'GAINS JUSQU’À 2 000 HTG':'PRI JISKA 2 000 HTG', '32 JOUEURS MAX':'32 JWÈ MAKSIMÒM', 'S’INSCRIRE AU CHAMPIONNAT':'ENSKRI NAN CHANPYONA A', 'S’INSCRIRE':'ENSKRI',
  'DERNIERS CHAMPIONS':'DÈNYE CHANPYON YO', 'CLASSEMENT GÉNÉRAL':'KLASMAN JENERAL', 'JOUEUR':'JWE', 'NIVEAU':'NIVO', 'POINTS':'PWEN', 'Gold I':'Lò I', 'Silver II':'Ajan II', 'Bronze I':'Bwonz I', 'Silver I':'Ajan I',
  'TOUT SE PASSE SUR JWETPRO':'TOUT SA PASE SOU JWETPRO', 'INSCRIPTION RAPIDE':'ENSKRIPSYON RAPID', 'Réservez le championnat et payez votre participation.':'Rezève chanpyona a epi peye patisipasyon ou.', 'JOUEZ SUR LA PLATEFORME':'JWE SOU PLATFÒM NAN', 'Tous les matchs se jouent directement sur JWETPRO.':'Tout match yo jwe dirèkteman sou JWETPRO.', 'REGARDEZ LES MATCHS':'GADE MATCH YO', 'Suivez chaque partie en direct ou en replay.':'Swiv chak pati an dirèk oswa anrejistre.', 'SUIVEZ LA PROGRESSION':'SWIV PWOGRÈ A', 'Voyez l’avancement du championnat et les résultats.':'Gade avansman chanpyona a ak rezilta yo.', 'RÉSULTATS TRANSPARENTS':'REZILTA TRANSPARAN', 'Les parties et résultats sont enregistrés.':'Pati yo ak rezilta yo anrejistre.',
  'CALENDRIER DES CHAMPIONNATS':'KALANDRIYE CHANPYONA YO', 'PAIEMENTS SÉCURISÉS':'PEMAN SEKIRIZE', 'Vos transactions sont protégées':'Tranzaksyon ou yo pwoteje', 'RÉSULTATS VALIDÉS':'REZILTA VALIDE', 'Résultats contrôlés par le système':'Sistèm nan verifye rezilta yo', 'GAINS VERSÉS':'PRI YO PEYE', 'Paiement selon les règles du championnat':'Peman selon règ chanpyona a', 'SUPPORT RÉACTIF':'SIPÒ RAPID', 'Aide disponible en cas de problème':'Èd disponib si gen pwoblèm',
  'LIENS RAPIDES':'LIEN RAPID', 'Championnats':'Chanpyona yo', 'En direct':'An dirèk', 'Classement':'Klasman', 'Champions':'Chanpyon yo', 'SUPPORT':'SIPÒ', 'FAQ':'FAQ', 'Nous contacter':'Kontakte nou', 'Règlement':'Règleman', 'Confidentialité':'Konfidansyalite', 'SUIVEZ-NOUS':'SWIV NOU', 'Facebook':'Facebook', 'Instagram':'Instagram', 'WhatsApp':'WhatsApp', 'Le hub des championnats':'Sant chanpyona yo', 'de jeux de table en Haïti.':'pou jwèt tab ann Ayiti.', 'RETOUR À L’ACCUEIL':'RETOUNEN NAN AKÈY', 'ESPACE JOUEUR':'ESPAS JWE A', 'Content de vous revoir':'Kontan wè ou ankò', 'Créez votre compte':'Kreye kont ou', 'Rejoignez JWETPRO et participez aux prochains championnats.':'Antre sou JWETPRO epi patisipe nan pwochen chanpyona yo.', 'Votre prochaine partie commence ici.':'Pwochen pati ou kòmanse isit la.', 'Retrouvez vos championnats, vos résultats et votre progression depuis un seul espace.':'Jwenn chanpyona, rezilta ak pwogrè ou nan yon sèl espas.', 'Championnats JWETPRO':'Chanpyona JWETPRO', 'Compte sécurisé par Firebase':'Kont Firebase pwoteje', 'Adresse e-mail':'Adrès imèl', 'Nom d’utilisateur':'Non itilizatè', 'Mot de passe':'Modpas', 'SE CONNECTER':'KONEKTE', 'CRÉER MON COMPTE':'KREYE KONT MWEN', 'Mot de passe oublié ?':'Ou bliye modpas ou?', 'OU':'OSWA', 'Continuer avec Google':'Kontinye ak Google', 'Pas encore de compte ?':'Ou poko gen kont?', 'Vous avez déjà un compte ?':'Ou deja gen kont?', 'Créer un compte':'Kreye yon kont', 'Se connecter':'Konekte', 'Création du compte…':'Kreyasyon kont lan ap fèt…', 'Votre compte a été créé.':'Kont ou kreye.',
  'Champion':'Chanpyon', 'Gain':'Pri', 'Entrée':'Antre', 'Capacité':'Kapasite', '40 joueurs max':'40 jwe maksimòm', '32 joueurs max':'32 jwè maksimòm', '125 HTG':'125 HTG', '2 000 HTG':'2 000 HTG', '2 000 HTG au champion. Le deuxième reçoit une inscription gratuite et les autres participants un coupon de réduction de 25 HTG pour le prochain championnat Domino ou Mopyon.':'2 000 HTG pou chanpyon an. Dezyèm nan resevwa yon enskripsyon gratis epi lòt patisipan yo yon koupon rabè 25 HTG pou pwochen chanpyona Domino oswa Mopyon.', 'À VENIR':'AP VINI', 'TERMINÉ':'FINI', '20 Mai 2025 • 19H00':'20 Me 2025 • 19H00', '18 Mai 2025':'18 Me 2025', '15 Mai 2025':'15 Me 2025', 'Mercredi 21 Mai • 19H00':'Mèkredi 21 Me • 19H00', 'Vendredi 23 Mai • 19H00':'Vandredi 23 Me • 19H00', 'Dimanche 25 Mai • 19H00':'Dimanch 25 Me • 19H00', 'Mercredi 28 Mai • 19H00':'Mèkredi 28 Me • 19H00', 'Vendredi 30 Mai • 19H00':'Vandredi 30 Me • 19H00', 'Mercredi 23 Mai 2025 • 19H00':'Mèkredi 23 Me 2025 • 19H00', '21 MAI':'21 ME', '23 MAI':'23 ME', '25 MAI':'25 ME', '28 MAI':'28 ME', '30 MAI':'30 ME'
};

const translatePage = (language) => {
  document.documentElement.lang = language === 'ht' ? 'ht' : 'fr';
  document.querySelectorAll('[data-home-label]').forEach((element) => { element.textContent = language === 'ht' ? 'AKÈY' : 'ACCUEIL'; });
  if (window.JwetproI18n) {
    window.JwetproI18n.apply(language);
    return;
  }
  if (language !== 'ht') return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    const original = node.nodeValue;
    const trimmed = original.trim();
    if (creoleTranslations[trimmed]) node.nodeValue = original.replace(trimmed, creoleTranslations[trimmed]);
    else if (trimmed.includes('spectateurs')) node.nodeValue = original.replace('spectateurs', 'espektatè');
  });
  document.querySelectorAll('[aria-label]').forEach((element) => {
    const label = element.getAttribute('aria-label');
    if (creoleTranslations[label]) element.setAttribute('aria-label', creoleTranslations[label]);
  });
};

const showLanguageModal = () => {
  const modal = document.createElement('div');
  modal.className = 'language-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'language-title');
  modal.innerHTML = `<div class="language-dialog"><div class="language-mark serif">JP</div><p class="language-kicker">JWETPRO</p><h2 id="language-title">Choisissez votre langue</h2><p class="language-subtitle">Chwazi lang ou</p><p class="language-copy">Voulez-vous continuer le site en français ou en kreyòl ayisyen ?<br><span>Èske ou vle kontinye sou sit la an franse oswa an kreyòl ayisyen?</span></p><div class="language-actions"><button type="button" class="language-option" data-language="fr"><strong>Français</strong><span>Continuer en français</span></button><button type="button" class="language-option" data-language="ht"><strong>Kreyòl ayisyen</strong><span>Kontinye an kreyòl ayisyen</span></button></div></div>`;
  document.body.append(modal);
  document.body.classList.add('language-lock');
  modal.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => {
    const language = button.dataset.language;
    localStorage.setItem(LANGUAGE_KEY, language);
    translatePage(language);
    modal.remove();
    document.body.classList.remove('language-lock');
  }));
};

const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
if (savedLanguage === 'ht') translatePage('ht');
if (savedLanguage !== 'fr' && savedLanguage !== 'ht') showLanguageModal();

const siteHeader = document.querySelector('.site-header');
let previousScrollY = window.scrollY;
window.addEventListener('scroll', () => {
  const currentScrollY = window.scrollY;
  if (currentScrollY <= 12) {
    siteHeader.classList.remove('header-hidden');
  } else if (currentScrollY > previousScrollY + 2) {
    siteHeader.classList.add('header-hidden');
    document.querySelector('#mobile-nav')?.classList.remove('open');
  } else if (currentScrollY < previousScrollY - 2) {
    siteHeader.classList.remove('header-hidden');
  }
  previousScrollY = currentScrollY;
}, { passive: true });


let robustPreviousScroll = document.scrollingElement?.scrollTop || window.pageYOffset || 0;
let robustScrollTicking = false;
const updateDirectionalHeader = () => {
  const header = document.querySelector('.site-header');
  const scrollRoot = document.scrollingElement || document.documentElement;
  const current = scrollRoot.scrollTop || window.pageYOffset || 0;
  if (!header) return;
  if (current <= 16 || current < robustPreviousScroll - 3) {
    header.classList.remove('header-hidden');
  } else if (current > robustPreviousScroll + 3) {
    header.classList.add('header-hidden');
  }
  robustPreviousScroll = current;
  robustScrollTicking = false;
};
const requestHeaderUpdate = () => {
  if (robustScrollTicking) return;
  robustScrollTicking = true;
  window.requestAnimationFrame(updateDirectionalHeader);
};
window.addEventListener('scroll', requestHeaderUpdate, { passive: true });
document.addEventListener('scroll', requestHeaderUpdate, { passive: true });

const firebaseConfig = {
  apiKey: 'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',
  authDomain: 'mopyonlakay.firebaseapp.com',
  projectId: 'mopyonlakay',
  storageBucket: 'mopyonlakay.firebasestorage.app',
  messagingSenderId: '307157893690',
  appId: '1:307157893690:web:4e5a033d13d54ce86feb03',
  measurementId: 'G-N32D8NS82V'
};

const loginPage = document.createElement('section');
loginPage.id = 'login-page';
loginPage.className = 'login-page';
loginPage.setAttribute('aria-labelledby', 'login-title');
loginPage.hidden = true;
loginPage.innerHTML = `<div class="login-shell"><a class="login-back" href="#top">${I('ArrowLeft')} <span>RETOUR À L’ACCUEIL</span></a><div class="login-layout"><div class="login-intro"><div class="language-mark serif">JP</div><p class="login-kicker">JWETPRO</p><h1 class="serif">Votre prochaine partie commence ici.</h1><p>Retrouvez vos championnats, vos résultats et votre progression depuis un seul espace.</p><div class="login-points"><span>${I('Trophy')} Championnats JWETPRO</span><span>${I('ShieldCheck')} Compte sécurisé par Firebase</span></div></div><div class="auth-card"><div class="auth-mark serif">JP</div><div class="auth-heading"><p class="auth-eyebrow">Espace joueur</p><h2 id="login-title">Content de vous revoir</h2><p id="auth-description">Connectez-vous pour accéder à votre compte JWETPRO.</p></div><div id="auth-message" class="auth-message" role="status" aria-live="polite"></div><form id="auth-form"><div id="auth-username-field" class="auth-username-field" hidden><label for="auth-username">Nom d’utilisateur</label><input id="auth-username" name="username" type="text" autocomplete="username" placeholder="exemple509" minlength="3" maxlength="24" pattern="[A-Za-z0-9._-]{3,24}" disabled></div><label for="auth-email">Adresse e-mail</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="vous@exemple.com" required><label for="auth-password">Mot de passe</label><input id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="Votre mot de passe" minlength="6" required><div id="auth-confirm-field" class="auth-username-field" hidden><label for="auth-confirm-password">Confirmer le mot de passe</label><input id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" placeholder="Confirmez votre mot de passe" minlength="6" disabled></div><button class="auth-submit" type="submit"><span id="auth-submit-label">Se connecter</span>${I('ArrowRight')}</button></form><button id="forgot-password" class="auth-text-button" type="button">Mot de passe oublié ?</button><div class="auth-divider"><span>ou</span></div><button id="google-login" class="google-button" type="button">${I('Chrome')} Continuer avec Google</button><p class="auth-switch"><span id="auth-switch-copy">Pas encore de compte ?</span> <button id="auth-mode-toggle" class="auth-mode-toggle" type="button">Créer un compte</button></p></div></div></div>`;
document.querySelector('#app').append(loginPage);
if (localStorage.getItem(LANGUAGE_KEY) === 'ht') translatePage('ht');
loginPage.querySelector('.login-intro')?.remove();
loginPage.querySelector('#forgot-password')?.setAttribute('hidden', '');
loginPage.querySelector('.auth-divider')?.setAttribute('hidden', '');
loginPage.querySelector('#google-login')?.setAttribute('hidden', '');
loginPage.querySelectorAll('#auth-password, #auth-confirm-password').forEach(passwordInput => { const passwordField = document.createElement('div'); passwordField.className = 'password-field'; passwordInput.replaceWith(passwordField); passwordField.append(passwordInput); passwordField.insertAdjacentHTML('beforeend', `<button class="password-toggle" type="button" aria-label="Afficher le mot de passe" aria-pressed="false">${I('Eye')}</button>`); });
renderIcons();

const appToast = document.createElement('div');
appToast.className = 'app-toast';
appToast.setAttribute('role', 'status');
appToast.setAttribute('aria-live', 'polite');
document.body.append(appToast);
let appToastTimer = null;
const showAppToast = (message, tone = 'success') => {
  clearTimeout(appToastTimer);
  appToast.innerHTML = `<span class="app-toast-icon">${I(tone === 'success' ? 'CheckCircle2' : 'ShieldCheck')}</span><span>${message}</span>`;
  appToast.className = `app-toast is-visible ${tone}`;
  renderIcons();
  appToastTimer = setTimeout(() => appToast.classList.remove('is-visible'), 3400);
};

const authElements = {
  form: loginPage.querySelector('#auth-form'), email: loginPage.querySelector('#auth-email'), username: loginPage.querySelector('#auth-username'), usernameField: loginPage.querySelector('#auth-username-field'), password: loginPage.querySelector('#auth-password'), confirmField: loginPage.querySelector('#auth-confirm-field'), confirmPassword: loginPage.querySelector('#auth-confirm-password'), message: loginPage.querySelector('#auth-message'), submitLabel: loginPage.querySelector('#auth-submit-label'), forgot: loginPage.querySelector('#forgot-password'), google: loginPage.querySelector('#google-login'), toggle: loginPage.querySelector('#auth-mode-toggle'), description: loginPage.querySelector('#auth-description'), title: loginPage.querySelector('#login-title'), switchCopy: loginPage.querySelector('#auth-switch-copy')
};
let currentAuthUser = null;
loginPage.querySelectorAll('.password-toggle').forEach(passwordToggle => { const input = passwordToggle.previousElementSibling; passwordToggle.addEventListener('click', () => { const visible = input.type === 'text'; input.type = visible ? 'password' : 'text'; passwordToggle.setAttribute('aria-pressed', String(!visible)); passwordToggle.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe'); passwordToggle.innerHTML = I(visible ? 'Eye' : 'EyeOff'); renderIcons(); }); });
let authMode = 'login';

const showLoginPage = (requestedMode = null) => {
  const nextMode = requestedMode === 'signup' ? 'signup' : requestedMode === 'login' ? 'login' : authMode;
  if (nextMode !== authMode) { authMode = nextMode; updateAuthMode(); }
  loginPage.hidden = false;
  document.body.classList.add('login-open');
  window.scrollTo({ top: 0, behavior: 'instant' });
  (authMode === 'signup' ? authElements.username : authElements.email).focus();
};
const hideLoginPage = () => { loginPage.hidden = true; document.body.classList.remove('login-open'); };
document.querySelector('.login-button').addEventListener('click', (event) => { if (currentAuthUser) { event.preventDefault(); openProfilePage(); return; } event.preventDefault(); showLoginPage('login'); });
loginPage.querySelector('.login-back').addEventListener('click', (event) => { event.preventDefault(); hideLoginPage(); history.replaceState(null, '', '#top'); });

const showAuthMessage = (message, type = 'error') => { authElements.message.textContent = message; authElements.message.className = `auth-message ${type}`; };
const firebaseError = (error) => ({ 'auth/invalid-credential': 'Adresse e-mail ou mot de passe incorrect.', 'auth/wrong-password': 'Adresse e-mail ou mot de passe incorrect.', 'auth/user-not-found': 'Aucun compte ne correspond à cette adresse e-mail.', 'auth/email-already-in-use': 'Cette adresse e-mail est déjà utilisée.', 'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.', 'auth/invalid-email': 'Veuillez saisir une adresse e-mail valide.', 'auth/operation-not-allowed': 'La connexion par e-mail/mot de passe est désactivée dans Firebase.', 'auth/popup-closed-by-user': 'La fenêtre Google a été fermée.', 'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.', 'auth/username-invalid': 'Le nom d’utilisateur doit contenir 3 à 24 caractères : lettres, chiffres, point, tiret ou underscore.', 'auth/password-mismatch': 'Les mots de passe ne correspondent pas.', 'auth/profile-create-failed': 'Le compte a été créé, mais le profil joueur n’a pas pu être initialisé.' }[error.code] || 'Une erreur est survenue. Veuillez réessayer.');

const updateAuthMode = () => {
  const isSignup = authMode === 'signup';
  authElements.title.textContent = isSignup ? 'Créez votre compte' : 'Content de vous revoir';
  authElements.description.textContent = isSignup ? 'Rejoignez JWETPRO et participez aux prochains championnats.' : 'Connectez-vous pour accéder à votre compte JWETPRO.';
  authElements.submitLabel.textContent = isSignup ? 'Créer mon compte' : 'Se connecter';
  authElements.switchCopy.textContent = isSignup ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?';
  authElements.toggle.textContent = isSignup ? 'Se connecter' : 'Créer un compte';
  authElements.password.autocomplete = isSignup ? 'new-password' : 'current-password';
  authElements.usernameField.hidden = !isSignup;
  authElements.username.disabled = !isSignup;
  authElements.username.required = isSignup;
  authElements.confirmField.hidden = !isSignup;
  authElements.confirmPassword.disabled = !isSignup;
  authElements.confirmPassword.required = isSignup;
  if (!isSignup) authElements.confirmPassword.value = '';
  authElements.forgot.hidden = isSignup;
  showAuthMessage('');
};
authElements.toggle.addEventListener('click', () => { authMode = authMode === 'login' ? 'signup' : 'login'; updateAuthMode(); });
window.addEventListener('hashchange', () => {
  if (currentAuthUser || !['#login','#signup'].includes(window.location.hash)) return;
  showLoginPage(window.location.hash === '#signup' ? 'signup' : 'login');
});

const profilePage = document.createElement('section');
profilePage.id = 'profile-page';
profilePage.className = 'profile-page';
profilePage.hidden = true;
profilePage.setAttribute('aria-labelledby', 'profile-title');
profilePage.innerHTML = `<div class="profile-shell"><header class="profile-header"><button class="profile-back" type="button" aria-label="Fermer le profil et retourner à l’accueil">${I('X')}</button><h1 id="profile-title">Mon Profil</h1></header><div class="profile-identity"><div class="profile-picture-wrap"><span class="profile-picture"></span><i class="profile-online" aria-label="Statut en ligne"></i><label class="profile-picture-edit" for="profile-picture-input" aria-label="Changer la photo de profil">${I('Camera')}</label><input type="file" id="profile-picture-input" class="profile-picture-input" accept="image/png,image/jpeg,image/webp" hidden><p class="profile-picture-status" role="status" aria-live="polite" hidden></p></div><div class="profile-identity-copy"><h2 class="profile-name">Utilisateur</h2><span class="profile-role">${I('ShieldCheck')} Joueur JWETPRO</span><p class="profile-id">ID JWETPRO : <b class="profile-user-id">—</b><button class="profile-copy-id" type="button" aria-label="Copier l’identifiant">${I('Copy')}</button></p></div></div><section class="profile-level"><div class="profile-level-icon">${I('Star')}</div><div><h3>Niveau <b class="profile-level-value">—</b></h3><strong class="profile-level-name">Niveau non renseigné</strong></div><div class="profile-xp"><b class="profile-xp-value">—</b><div class="profile-xp-track"><span></span></div></div></section><section class="profile-stats" aria-label="Statistiques du joueur"><div>${I('Trophy')}<b data-profile-stat="matches">—</b><span>Matchs joués</span></div><div>${I('Medal')}<b data-profile-stat="wins">—</b><span>Victoires</span></div><div>${I('ChartNoAxesColumnIncreasing')}<b data-profile-stat="winRate">—</b><span>Taux de victoire</span></div><div>${I('Star')}<b data-profile-stat="points">—</b><span>Points</span></div></section><section class="profile-share-actions" aria-label="Partager mon parcours"><button class="jwetpro-share-trigger" type="button" data-profile-share="profile">${I('Share2')} Partager mon profil</button><button class="jwetpro-share-trigger" type="button" data-profile-share="level">${I('Star')} Partager mon niveau</button><button class="jwetpro-share-trigger" type="button" data-profile-share="invite">${I('UserPlus')} Inviter mes amis</button></section><p class="profile-share-note">Votre avatar et votre nom sont partagés uniquement si votre profil est public.</p><section class="profile-activities"><div class="profile-section-heading"><h2>Activités récentes</h2><button type="button" class="profile-see-all">Voir tout</button></div><div class="profile-activity-list"><p class="profile-empty-state">Aucune activité enregistrée.</p></div></section><nav class="profile-options" aria-label="Options du profil"><button type="button" data-profile-section="personal">${I('User')}<span>Informations personnelles</span>${I('ChevronRight')}</button><button type="button" data-profile-section="security">${I('Shield')}<span>Sécurité &amp; Confidentialité</span>${I('ChevronRight')}</button><button type="button" data-profile-section="notifications">${I('Bell')}<span>Notifications</span>${I('ChevronRight')}</button><button type="button" data-profile-section="favorites">${I('Star')}<span>Mes favoris</span>${I('ChevronRight')}</button></nav><section class="profile-detail" aria-live="polite" hidden></section><button class="profile-logout-action" type="button">${I('LogOut')}<span>Déconnexion</span></button></div>`;
document.body.append(profilePage);
const passwordProfileOption = profilePage.querySelector('[data-profile-section="security"]');
passwordProfileOption?.querySelector('span')?.replaceChildren('Changer le mot de passe');
passwordProfileOption?.insertAdjacentHTML('afterend', `<a href="./privacy.html" class="profile-privacy-link">${I('ShieldCheck')}<span>Sécurité et confidentialité</span>${I('ChevronRight')}</a>`);
const profilePicture = profilePage.querySelector('.profile-picture');
const profileImageUrl = (name) => { const safe = String(name || '').trim(); return /^[A-Za-z0-9._-]+$/.test(safe) ? `./src/profilimage/${encodeURIComponent(safe)}` : ''; };
const profileAvatarUrl = (data) => { const photoURL = String(data.photoURL || '').trim(); return /^https:\/\//.test(photoURL) ? photoURL : profileImageUrl(data.imageName); };
const profileText = (value) => value === undefined || value === null || value === '' ? '—' : String(value);
const profilePictureInput = profilePage.querySelector('.profile-picture-input');
const profilePictureStatus = profilePage.querySelector('.profile-picture-status');
const PROFILE_PICTURE_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_PICTURE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
let profilePictureStatusTimer = null;
const showProfilePictureStatus = (text, tone = '') => {
  clearTimeout(profilePictureStatusTimer);
  profilePictureStatus.textContent = text;
  profilePictureStatus.className = `profile-picture-status ${tone ? `is-${tone}` : ''}`;
  profilePictureStatus.hidden = !text;
  if (text && tone !== 'loading') profilePictureStatusTimer = setTimeout(() => { profilePictureStatus.hidden = true; }, 4000);
};
profilePictureInput?.addEventListener('change', async () => {
  const file = profilePictureInput.files?.[0];
  profilePictureInput.value = '';
  if (!file || !currentAuthUser) return;
  const extension = PROFILE_PICTURE_EXTENSIONS[file.type];
  if (!extension) { showProfilePictureStatus('Formats acceptés : JPG, PNG ou WEBP.', 'error'); return; }
  if (file.size > PROFILE_PICTURE_MAX_BYTES) { showProfilePictureStatus('L’image ne doit pas dépasser 5 Mo.', 'error'); return; }
  const storageInstance = window.firebase?.storage?.();
  if (!storageInstance) { showProfilePictureStatus('Le stockage des photos est indisponible pour le moment.', 'error'); return; }
  showProfilePictureStatus('Envoi de la photo…', 'loading');
  try {
    const storageRef = storageInstance.ref(`avatars/${currentAuthUser.uid}/profile.${extension}`);
    await storageRef.put(file, { contentType: file.type });
    const downloadUrl = await storageRef.getDownloadURL();
    await updateOwnProfile({ photoURL: downloadUrl });
    showProfilePictureStatus('Photo de profil mise à jour.', 'success');
  } catch (error) {
    console.error('Téléversement de la photo de profil impossible:', error);
    showProfilePictureStatus('Impossible d’envoyer la photo. Réessayez.', 'error');
  }
});
const profileDetail = profilePage.querySelector('.profile-detail');
const profileEscape = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
let currentProfileData = {};
let currentProfileSection = '';
const profileList = value => Array.isArray(value) ? value : [];
const profileItemLabel = item => typeof item === 'string' ? item : item?.name || item?.title || item?.label || item?.displayName || '';
const profileMessage = (text, tone = '') => `<p class="profile-detail-message ${tone ? `is-${tone}` : ''}" role="status">${profileEscape(text)}</p>`;
const updateOwnProfile = async patch => {
  const firestoreInstance = window.firebase?.firestore?.();
  if (!currentAuthUser || !firestoreInstance) throw new Error('PROFILE_UNAVAILABLE');
  await firestoreInstance.collection('users').doc(currentAuthUser.uid).update({...patch,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  currentProfileData = {...currentProfileData,...patch};
  renderProfile(currentProfileData,currentAuthUser);
};
const closeProfileDetail = () => {
  currentProfileSection = '';
  profilePage.classList.remove('profile-detail-open');
  profileDetail.hidden = true;
  profileDetail.replaceChildren();
  profilePage.querySelector('[data-profile-section]')?.focus();
};
const profileDetailHeader = (title, description) => `<header class="profile-detail-header"><button type="button" data-profile-detail-back aria-label="Retour aux options du profil">${I('ArrowLeft')}</button><div><h2>${profileEscape(title)}</h2><p>${profileEscape(description)}</p></div></header>`;
const renderProfileDetail = section => {
  const data = currentProfileData;
  const notifications = data.notificationPreferences || {};
  const favorites = profileList(Object.prototype.hasOwnProperty.call(data,'favoriteGames') ? data.favoriteGames : data.favorites);
  const sections = {
    personal: () => `${profileDetailHeader('Informations personnelles','Consultez et mettez à jour les informations non sensibles de votre compte.')}<form class="profile-detail-form" data-profile-form="personal"><label>Prénom<input name="firstName" maxlength="60" autocomplete="given-name" value="${profileEscape(data.firstName)}"></label><label>Nom<input name="lastName" maxlength="60" autocomplete="family-name" value="${profileEscape(data.lastName)}"></label><label>Nom d’utilisateur<input value="${profileEscape(data.username)}" readonly aria-describedby="profile-username-help"></label><small id="profile-username-help">Le nom d’utilisateur est géré par JWETPRO pour protéger votre connexion.</small><label>Téléphone<input name="phone" maxlength="30" inputmode="tel" autocomplete="tel" value="${profileEscape(data.phone)}"></label><label>Adresse e-mail<input value="${profileEscape(currentAuthUser?.email || data.email)}" readonly></label><div class="profile-public-setting"><div><strong>Profil public</strong><span>Autoriser le partage de votre nom, avatar, niveau et points sur une carte publique. Votre téléphone et votre adresse e-mail restent toujours privés.</span></div><label class="profile-switch" aria-label="Rendre mon profil public"><input name="profilePublic" type="checkbox" ${data.profilePublic === false ? '' : 'checked'}><span></span></label></div><button class="profile-detail-submit" type="submit">${I('Save')} Enregistrer les modifications</button></form>`,
    security: () => `${profileDetailHeader('Changer le mot de passe','Modifiez le mot de passe de votre compte.')}<form class="profile-detail-form" data-profile-form="password"><label>Mot de passe actuel<input name="currentPassword" type="password" minlength="6" autocomplete="current-password" required></label><label>Nouveau mot de passe<input name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmer le nouveau mot de passe<input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label><button class="profile-detail-submit" type="submit">${I('KeyRound')} Modifier le mot de passe</button></form>`,
    notifications: () => `${profileDetailHeader('Notifications','Choisissez les alertes que vous souhaitez recevoir.')}<div class="profile-preferences"><div class="profile-preference-card"><div><strong>Rappels de matchs</strong><span>Recevoir une alerte avant le début de vos matchs.</span></div><label class="profile-switch"><input type="checkbox" data-notification="matchReminders" ${notifications.matchReminders === false ? '' : 'checked'}><span></span></label></div><div class="profile-preference-card"><div><strong>Résultats et classement</strong><span>Être informé après la validation d’un résultat.</span></div><label class="profile-switch"><input type="checkbox" data-notification="results" ${notifications.results === false ? '' : 'checked'}><span></span></label></div><div class="profile-preference-card"><div><strong>Nouveaux championnats</strong><span>Recevoir les annonces des prochaines compétitions.</span></div><label class="profile-switch"><input type="checkbox" data-notification="championships" ${notifications.championships === false ? '' : 'checked'}><span></span></label></div></div>`,
    favorites: () => `${profileDetailHeader('Mes favoris','Gérez les jeux et éléments que vous avez enregistrés.')}<div class="profile-detail-list">${favorites.length ? favorites.map((item,index) => `<article>${I('Star')}<div><strong>${profileEscape(profileItemLabel(item) || 'Favori')}</strong><span>${profileEscape(typeof item === 'object' ? item.type || 'JWETPRO' : 'JWETPRO')}</span></div><button type="button" data-remove-favorite="${index}" aria-label="Retirer des favoris">${I('Trash2')}</button></article>`).join('') : '<div class="profile-detail-empty">'+I('Star')+'<strong>Aucun favori enregistré</strong><p>Les éléments ajoutés à vos favoris apparaîtront ici.</p></div>'}</div>`
  };
  if (!sections[section]) return;
  currentProfileSection = section;
  profileDetail.innerHTML = sections[section]();
  profileDetail.hidden = false;
  profilePage.classList.add('profile-detail-open');
  profilePage.scrollTo({top:0,behavior:'smooth'});
  renderIcons();
  window.JwetproI18n?.apply?.(window.JwetproI18n.language());
};
const renderProfile = (data = {}, user = currentAuthUser) => {
  currentProfileData = {...data};
  const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.username || user?.email || 'Utilisateur JWETPRO';
  const officialPoints = Math.max(0, Number(data.points ?? data.totalPoints ?? data.score) || 0);
  const level = playerLevelFromPoints(officialPoints);
  profilePage.querySelector('.profile-name').textContent = fullName;
  profilePage.querySelector('.profile-user-id').textContent = profileText(data.jwetproId || data.playerId || data.id || user?.uid).slice(0, 18);
  profilePage.querySelector('.profile-level-value').textContent = level.name;
  profilePage.querySelector('.profile-level-name').textContent = level.next === null ? 'Niveau maximum atteint' : `${level.remaining} pts avant ${PLAYER_LEVELS.find(item => item.min === level.next)?.name || 'le prochain niveau'}`;
  profilePage.querySelector('.profile-xp-value').textContent = level.next === null ? `${officialPoints.toLocaleString('fr-FR')} pts officiels` : `${officialPoints.toLocaleString('fr-FR')} / ${level.next.toLocaleString('fr-FR')} pts`;
  profilePage.querySelector('.profile-xp-track span').style.width = `${level.progress}%`;
  const statValues = {matches:data.matchesPlayed ?? data.matches, wins:data.wins ?? data.victories, winRate:data.winRate !== undefined ? `${data.winRate}%` : undefined, points:officialPoints.toLocaleString('fr-FR')};
  Object.entries(statValues).forEach(([key,value]) => profilePage.querySelector(`[data-profile-stat="${key}"]`).textContent = profileText(value));
  const image = profileAvatarUrl(data);
  profilePicture.style.backgroundImage = image ? `url("${image}")` : '';
  profilePicture.textContent = image ? '' : fullName.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase();
  profilePicture.classList.toggle('has-image', Boolean(image));
  const activities = Array.isArray(data.recentActivities) ? data.recentActivities : [];
  profilePage.querySelector('.profile-activity-list').innerHTML = activities.length ? activities.map(item => `<article><span>${item.icon || '•'}</span><div><strong>${item.title || 'Activité'}</strong><small>${item.detail || ''}</small></div><time>${item.date || ''}</time></article>`).join('') : '<p class="profile-empty-state">Aucune activité enregistrée.</p>';
  renderIcons();
};
const showProfileDetailMessage = (text,tone) => {
  profileDetail.querySelector('.profile-detail-message')?.remove();
  profileDetail.insertAdjacentHTML('beforeend',profileMessage(text,tone));
};
profilePage.querySelector('.profile-options')?.addEventListener('click',event => {
  const button = event.target.closest('[data-profile-section]');
  if (button) renderProfileDetail(button.dataset.profileSection);
});
profileDetail.addEventListener('click',async event => {
  if (event.target.closest('[data-profile-detail-back]')) { closeProfileDetail(); return; }
  const removeButton = event.target.closest('[data-remove-favorite]');
  if (!removeButton) return;
  const favorites = profileList(Object.prototype.hasOwnProperty.call(currentProfileData,'favoriteGames') ? currentProfileData.favoriteGames : currentProfileData.favorites);
  const nextFavorites = favorites.filter((_,index) => index !== Number(removeButton.dataset.removeFavorite));
  removeButton.disabled = true;
  try { await updateOwnProfile({favoriteGames:nextFavorites}); renderProfileDetail('favorites'); }
  catch (error) { removeButton.disabled = false; showProfileDetailMessage('Impossible de modifier les favoris pour le moment.','error'); }
});
profileDetail.addEventListener('change',async event => {
  const preference = event.target.dataset.profilePreference;
  const notification = event.target.dataset.notification;
  if (!preference && !notification) return;
  event.target.disabled = true;
  try {
    if (preference) await updateOwnProfile({[preference]:event.target.checked});
    if (notification) await updateOwnProfile({notificationPreferences:{...(currentProfileData.notificationPreferences || {}),[notification]:event.target.checked}});
    showProfileDetailMessage('Préférence enregistrée.','success');
  } catch (error) {
    event.target.checked = !event.target.checked;
    showProfileDetailMessage('Impossible d’enregistrer cette préférence.','error');
  } finally { event.target.disabled = false; }
});
profileDetail.addEventListener('submit',async event => {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    if (form.dataset.profileForm === 'personal') {
      const values = new FormData(form);
      await updateOwnProfile({firstName:String(values.get('firstName') || '').trim(),lastName:String(values.get('lastName') || '').trim(),phone:String(values.get('phone') || '').trim(),profilePublic:values.get('profilePublic') === 'on'});
      showProfileDetailMessage('Informations personnelles enregistrées.','success');
    }
    if (form.dataset.profileForm === 'password') {
      const values = new FormData(form);
      const currentPassword = String(values.get('currentPassword') || '');
      const newPassword = String(values.get('newPassword') || '');
      if (newPassword !== String(values.get('confirmPassword') || '')) throw new Error('PASSWORD_MISMATCH');
      if (newPassword.length < 8) throw new Error('PASSWORD_LENGTH');
      if (!currentAuthUser?.email) throw new Error('PASSWORD_PROVIDER');
      const credential = firebase.auth.EmailAuthProvider.credential(currentAuthUser.email,currentPassword);
      await currentAuthUser.reauthenticateWithCredential(credential);
      await currentAuthUser.updatePassword(newPassword);
      form.reset();
      showProfileDetailMessage('Mot de passe modifié avec succès.','success');
    }
  } catch (error) {
    const messages = {PASSWORD_MISMATCH:'Les nouveaux mots de passe ne correspondent pas.',PASSWORD_LENGTH:'Le nouveau mot de passe doit contenir au moins 8 caractères.',PASSWORD_PROVIDER:'Ce compte utilise une méthode de connexion externe.',PROFILE_UNAVAILABLE:'Le profil est temporairement indisponible.','auth/wrong-password':'Le mot de passe actuel est incorrect.','auth/invalid-credential':'Le mot de passe actuel est incorrect.','auth/requires-recent-login':'Reconnectez-vous avant de modifier le mot de passe.'};
    showProfileDetailMessage(messages[error.code || error.message] || 'Impossible d’enregistrer les modifications.','error');
  } finally { submit.disabled = false; }
});
const openProfilePage = async () => { if (!currentAuthUser) { showLoginPage(); return; } profilePage.hidden = false; document.body.classList.add('profile-open'); window.scrollTo({top:0,behavior:'instant'}); renderProfile({}, currentAuthUser); const firestoreInstance = window.firebase?.firestore?.(); if (!firestoreInstance) return; try { const snapshot = await firestoreInstance.collection('users').doc(currentAuthUser.uid).get(); if (snapshot.exists) renderProfile(snapshot.data(), currentAuthUser); } catch (error) { console.warn('Profil indisponible:', error); } };
const closeProfilePage = () => { closeProfileDetail(); profilePage.hidden = true; document.body.classList.remove('profile-open'); history.replaceState(null, '', '#top'); };
profilePage.querySelector('.profile-logout-action')?.addEventListener('click', async () => { try { if (window.firebase?.auth) await window.firebase.auth().signOut(); closeProfilePage(); showAppToast('Vous avez été déconnecté en toute sécurité.'); } catch (error) { console.error('Déconnexion Firebase impossible:', error); } });
profilePage.querySelector('.profile-back').addEventListener('click', closeProfilePage);
profilePage.querySelector('.profile-copy-id').addEventListener('click', async () => { const value = profilePage.querySelector('.profile-user-id').textContent; if (value !== '—') { try { await navigator.clipboard.writeText(value); } catch {} } });
profilePage.querySelector('.profile-share-actions')?.addEventListener('click',event => {
  const button = event.target.closest('[data-profile-share]');
  if (button) window.JwetproShare?.open({type:button.dataset.profileShare});
});
profilePage.addEventListener('click', event => { if (event.target === profilePage) closeProfilePage(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !profilePage.hidden) currentProfileSection ? closeProfileDetail() : closeProfilePage(); });
if (window.firebase) {
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const firestore = firebase.firestore();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  const cleanUsername = value => String(value || '').trim().replace(/^@+/, '').slice(0, 24);
  const assertUsername = value => {
    const username = cleanUsername(value);
    if (!/^[A-Za-z0-9._-]{3,24}$/.test(username)) { const error = new Error('USERNAME_INVALID'); error.code = 'auth/username-invalid'; throw error; }
    return username;
  };
  const createPlayerProfile = async (user, username) => {
    try {
      await user.updateProfile({displayName:username});
      await firestore.collection('users').doc(user.uid).set({
        firstName: username,
        lastName: '',
        username,
        email: user.email || '',
        role: 'user',
        status: 'active',
        authUid: user.uid,
        profilePublic: true,
        notificationPreferences: {matchReminders:true,results:true,championships:true},
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await firestore.collection('leaderboard').doc(user.uid).set({displayName:username,level:'Débutant',points:0,imageName:'',photoURL:''});
    } catch (error) {
      error.code = error.code || 'auth/profile-create-failed';
      throw error;
    }
  };
  const headerAccount = document.querySelector('.login-button');
  const defaultHeaderAccount = headerAccount?.innerHTML || '';
  const leaderboardProjection = data => {
    const displayName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.username || data.displayName || '';
    if (!displayName) return null;
    const imageName = String(data.imageName || '').trim();
    const photoURL = String(data.photoURL || '').trim();
    const points = Math.max(0, Number(data.points ?? data.totalPoints ?? data.score) || 0);
    return {
      displayName: String(displayName).slice(0, 120),
      level: playerLevelFromPoints(points).name,
      points,
      imageName: /^[A-Za-z0-9._-]+$/.test(imageName) ? imageName : '',
      photoURL: /^https:\/\//.test(photoURL) ? photoURL : ''
    };
  };
  const setHeaderAccount = async (user) => {
    currentAuthUser = user && !user.isAnonymous ? user : null;
    homepageCurrentProfile = null;
    if (!headerAccount) return;
    if (!user || user.isAnonymous) {
      homepagePersonalMatchesRequest += 1;
      homepagePersonalMatches = [];
      headerAccount.classList.remove('is-authenticated');
      headerAccount.href = '#login';
      headerAccount.innerHTML = defaultHeaderAccount;
      headerAccount.setAttribute('aria-label', 'Connexion');
      renderHomepageHeroCarousel();
      loadPublicMatches();
      if (['#login','#profile','#signup'].includes(window.location.hash)) showLoginPage(window.location.hash === '#signup' ? 'signup' : 'login');
      return;
    }
    let avatarUrl = '';
    let profileImageName = '';
    let displayName = user.email || 'Utilisateur JWETPRO';
    let publicProfile = null;
    let profileRole = '';
    try {
      const profile = await firestore.collection('users').doc(user.uid).get();
      if (profile.exists) {
        const data = profile.data();
        avatarUrl = profileAvatarUrl(data);
        profileImageName = String(data.imageName || '').trim();
        displayName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.username || data.displayName || displayName;
        publicProfile = leaderboardProjection(data);
        profileRole = String(data.role || '').toLowerCase();
      }
    } catch (error) { console.warn('Profil utilisateur indisponible:', error); }
    homepageCurrentProfile = {uid:user.uid,name:displayName,photoURL:/^https:\/\//.test(avatarUrl) ? avatarUrl : '',imageName:/^[A-Za-z0-9._-]+$/.test(profileImageName) ? profileImageName : ''};
    renderHomepageHeroCarousel();
    loadHomepagePersonalMatches(user);
    loadPublicMatches();
    if (publicProfile) {
      try {
        await firestore.collection('leaderboard').doc(user.uid).set(publicProfile);
      } catch (error) { console.warn('Publication du profil dans le classement impossible:', error); }
    }
    if (profileRole === 'admin') {
      try {
        const users = await firestore.collection('users').limit(500).get();
        const batch = firestore.batch();
        let projectedUsers = 0;
        users.docs.forEach(doc => {
          const projection = leaderboardProjection(doc.data());
          if (!projection) return;
          batch.set(firestore.collection('leaderboard').doc(doc.id), projection);
          projectedUsers += 1;
        });
        if (projectedUsers) await batch.commit();
      } catch (error) { console.warn('Synchronisation administrateur du classement impossible:', error); }
    }
    setTimeout(() => loadPublicRanking(), 0);
    const initials = displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'JW';
    headerAccount.classList.add('is-authenticated');
    headerAccount.href = '#profile';
    headerAccount.setAttribute('aria-label', displayName);
    headerAccount.title = displayName;
    headerAccount.innerHTML = '';
    if (avatarUrl) {
      const avatar = document.createElement('img');
      avatar.className = 'header-user-avatar';
      avatar.src = avatarUrl;
      avatar.alt = displayName;
      avatar.addEventListener('error', () => { const fallback = document.createElement('span'); fallback.className = 'header-avatar-fallback'; fallback.textContent = initials; avatar.replaceWith(fallback); }, {once:true});
      headerAccount.append(avatar);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'header-avatar-fallback';
      fallback.textContent = initials;
      headerAccount.append(fallback);
    }
    if (window.location.hash === '#profile' || window.location.hash === '#login') {
      hideLoginPage();
      openProfilePage();
    }
  };
  auth.onAuthStateChanged(setHeaderAccount);
  authElements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = authElements.email.value.trim();
    const password = authElements.password.value;
    authElements.form.classList.add('is-loading');
    showAuthMessage(authMode === 'signup' ? 'Création du compte…' : 'Connexion en cours…', 'loading');
    try {
      if (authMode === 'signup') {
        const username = assertUsername(authElements.username.value);
        if (password !== authElements.confirmPassword.value) { const error = new Error('PASSWORD_MISMATCH'); error.code = 'auth/password-mismatch'; throw error; }
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        await createPlayerProfile(credential.user, username);
        await setHeaderAccount(credential.user);
      }
      else await auth.signInWithEmailAndPassword(email, password);
      const isNewAccount = authMode === 'signup';
      showAuthMessage(isNewAccount ? 'Votre compte a été créé.' : 'Connexion réussie.', 'success');
      setTimeout(() => {
        hideLoginPage();
        showAppToast(isNewAccount ? 'Bienvenue sur JWETPRO. Votre compte a été créé avec succès.' : 'Vous êtes connecté. Ravis de vous revoir.');
        if (isNewAccount) setTimeout(() => window.JwetproShare?.open({type:'welcome'}),350);
      }, 650);
    } catch (error) { console.error('JWETPRO authentication failed:', error.code, error.message, error); showAuthMessage(firebaseError(error)); }
    finally { authElements.form.classList.remove('is-loading'); }
  });
  authElements.google.addEventListener('click', async () => {
    showAuthMessage('Ouverture de Google…', 'loading');
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); showAuthMessage('Connexion réussie.', 'success'); setTimeout(() => { hideLoginPage(); showAppToast('Vous êtes connecté. Ravis de vous revoir.'); }, 650); }
    catch (error) { showAuthMessage(firebaseError(error)); }
  });
  authElements.forgot.addEventListener('click', async () => {
    try {
      const identifier = authElements.email.value.trim();
      if (!identifier) { showAuthMessage('Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.'); authElements.email.focus(); return; }
      await auth.sendPasswordResetEmail(identifier);
      showAuthMessage('Un lien de réinitialisation a été envoyé à l’adresse du compte.', 'success');
    }
    catch (error) { showAuthMessage(firebaseError(error)); }
  });
} else showAuthMessage('Le service de connexion est temporairement indisponible.');

const moneyLabel = value => `${Number(value || 0).toLocaleString('fr-FR')} HTG`;
const championshipDate = value => {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const CHAMPIONSHIP_DURATION_MS = 90 * 60 * 1000;
const championshipStatus = value => ({'registration-open':'INSCRIPTIONS OUVERTES',open:'INSCRIPTIONS OUVERTES','registration-closed':'INSCRIPTIONS TERMINÉES',closed:'INSCRIPTIONS TERMINÉES',ongoing:'CHAMPIONNAT EN COURS',live:'CHAMPIONNAT EN COURS',completed:'CHAMPIONNAT TERMINÉ',finished:'CHAMPIONNAT TERMINÉ',upcoming:'À VENIR',scheduled:'À VENIR'}[value] || String(value || 'À VENIR').toUpperCase());
const championshipTone = value => ['registration-open','open'].includes(value) ? 'open' : ['ongoing','live'].includes(value) ? 'live' : ['completed','finished'].includes(value) ? 'done' : 'soon';
const progressHref = championshipId => championshipId ? `./progress.html?id=${encodeURIComponent(championshipId)}` : './progress.html';
const registrationHref = championshipId => championshipId ? `./registration-checkout.html?id=${encodeURIComponent(championshipId)}` : './calendar.html';
const championshipAction = (status, championshipId = '') => status === 'registration-open'
  ? {label:'S’INSCRIRE',href:registrationHref(championshipId)}
  : status === 'ongoing'
    ? {label:'SUIVRE LE CHAMPIONNAT',href:progressHref(championshipId)}
    : status === 'completed'
      ? {label:'REVOIR LE CHAMPIONNAT',href:championshipId ? `./championship.html?id=${encodeURIComponent(championshipId)}` : './activity.html'}
      : {label:'VOIR LE CHAMPIONNAT',href:progressHref(championshipId)};
const championshipIsInProgress = record => {
  const status = String(record?.status || '').toLowerCase();
  if (['completed','finished','cancelled'].includes(status)) return false;
  return ['ongoing','live'].includes(status)
    || Number(record?.matchesInProgress) > 0
    || Number(record?.matchesPlayed) > 0
    || homepageStartedMatches.some(match => publicMatchBelongsToChampionship(match, record));
};
const championshipParticipantCount = data => {
  const numericCount = [data.registeredCount,data.registrationCount,data.registrationsCount,data.participantCount,data.participantsCount,data.playersCount].map(Number).find(Number.isFinite);
  if (Number.isFinite(numericCount)) return numericCount;
  const participants = data.participants || data.registeredPlayers || data.registrations || data.players;
  return Array.isArray(participants) ? participants.length : 0;
};
const effectiveChampionshipStatus = (data, start, registrationEnd, participantCount, now = Date.now()) => {
  const storedStatus = String(data.status || 'upcoming').toLowerCase();
  if (storedStatus === 'cancelled') return 'cancelled';
  if (['completed','finished','ended','termine','terminé'].includes(storedStatus)) return 'completed';
  if (start) {
    const startsAt = start.getTime();
    if (now >= startsAt + CHAMPIONSHIP_DURATION_MS) return 'completed';
    if (now >= startsAt) return 'ongoing';
  }
  const maximum = Number(data.maxPlayers) || standard.maxPlayers;
  if ((registrationEnd && now >= registrationEnd.getTime()) || (maximum > 0 && participantCount >= maximum) || ['registration-closed','closed'].includes(storedStatus)) return 'registration-closed';
  return ['registration-open','open'].includes(storedStatus) ? 'registration-open' : storedStatus;
};
const championshipRecord = doc => {
  const data = doc.data();
  const start = championshipDate(data.startAt || data.startDate);
  const registrationEnd = championshipDate(data.registrationEndAt || data.registrationDeadline || data.registrationClosesAt || data.registrationCloseAt || data.endRegistrationAt) || start;
  const participantCount = championshipParticipantCount(data);
  const numeric = (...values) => values.map(Number).find(Number.isFinite);
  const status = effectiveChampionshipStatus(data,start,registrationEnd,participantCount);
  const createdAt = championshipDate(data.createdAt);
  const updatedAt = championshipDate(data.updatedAt);
  const activityAt = status === 'completed' && start ? new Date(start.getTime() + CHAMPIONSHIP_DURATION_MS) : status === 'ongoing' ? start : status === 'registration-closed' ? (registrationEnd || updatedAt || createdAt || start) : (createdAt || updatedAt || start);
  return {id:doc.id,game:data.game === 'domino' ? 'DOMINO' : 'Mopyon',number:data.number || data.championshipNumber || doc.id,date:start,dateLabel:start ? start.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : data.date || 'Date à confirmer',time:start ? start.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : data.time || 'Heure à confirmer',entryFee:Number(data.entryFee),prize:Number(data.prize),maxPlayers:Number(data.maxPlayers) || standard.maxPlayers,rounds:Number(data.rounds) > 0 ? Number(data.rounds) : 4,status,activityAt,participantCount,matchesPlayed:numeric(data.matchesPlayed,data.completedMatches),totalMatches:numeric(data.totalMatches,data.matchesTotal),currentRound:numeric(data.currentRound,data.round),matchesInProgress:numeric(data.matchesInProgress,data.activeMatches),completion:numeric(data.completion,data.progressPercent,data.progress)};
};
const championshipDisplayName = record => `${record.game} #${String(record.number).replace(/^#+/, '')}`;
const heroMatchDate = data => matchToDate(data.startedAt || data.startAt || data.scheduledAt || data.matchDate || data.date);
const heroMatchIsActive = data => /ongoing|live|in-progress|active|playing|en cours|direct/.test(publicMatchStatus(data));
const heroMatchIsFinished = data => /complete|completed|finished|ended|termine|terminé|cancelled|replay/.test(publicMatchStatus(data)) || Boolean(data.winnerId || data.winner || data.draw || data.completedAt || data.endedAt || data.finishedAt);
const heroMatchParticipantIds = data => Array.isArray(data.participantIds) ? data.participantIds.filter(id => typeof id === 'string') : [];
const heroPlayer = (match, uid, fallback) => {
  const players = matchPlayers(match);
  const player = players.find(candidate => [candidate?.uid,candidate?.id,candidate?.userId,candidate?.playerId].includes(uid)) || {};
  const names = match.participantNames || match.playerNames || {};
  const currentPlayer = uid && uid === currentAuthUser?.uid ? homepageCurrentProfile : null;
  const displayName = currentPlayer?.name || player.name || player.displayName || player.username || names[uid] || fallback;
  const photoURL = currentPlayer?.photoURL || player.photoURL || homepageLeaderboardByName.get(normalizedRankingName(displayName)) || '';
  return {...player,uid,name:displayName,photoURL,imageName:currentPlayer?.imageName || player.imageName || ''};
};
const heroDuration = milliseconds => {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total % 86400 / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  if (days) return `${days}j ${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}m`;
  return `${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}m`;
};
const heroMatchSlide = (match, position, total) => {
  const ids = heroMatchParticipantIds(match);
  const selfId = currentAuthUser?.uid;
  const opponentId = ids.find(id => id !== selfId);
  const self = heroPlayer(match,selfId,'Vous');
  const opponent = heroPlayer(match,opponentId,'Adversaire à confirmer');
  const start = heroMatchDate(match);
  const active = heroMatchIsActive(match);
  const gameName = /domino/i.test(String(match.game || match.type || '')) ? 'DOMINO' : 'Mopyon';
  const number = match.number || match.matchNumber || match.championshipNumber || '';
  const championshipId = match.championshipId || match.tournamentId || match.competitionId || '';
  const secondaryHref = championshipId ? progressHref(championshipId) : './calendar.html';
  const isSeries = match.kind === 'series';
  const primaryHref = `./play.html?join=${encodeURIComponent(match.id)}`;
  const primaryLabel = 'ANTRE NAN MATCH LA';
  return `<article class="hero-slide hero-match-slide" role="group" aria-roledescription="diapositive" aria-label="${position} sur ${total} — ${active ? 'Votre match en cours' : 'Votre prochain match'}"><div class="hero-grid"><div class="hero-copy"><div class="eyebrow">${active ? 'VOTRE MATCH EN COURS' : 'VOTRE PROCHAIN MATCH'}</div><h1 class="hero-title">${publicEscape(gameName)}</h1>${number ? `<span class="hero-id">#${publicEscape(number)}</span>` : ''}<div class="hero-date">${I('CalendarDays')}<span>${publicEscape(start ? start.toLocaleString('fr-FR',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}) : 'Horaire à confirmer')}</span></div><div class="hero-match-status ${active ? 'is-live' : ''}"><span>${active ? 'MATCH EN COURS' : 'MATCH PLANIFIÉ'}</span><strong ${start && !active ? `data-hero-target="${start.getTime()}" data-hero-label="Début dans"` : ''}>${active ? 'Le plateau est ouvert' : start ? `Début dans ${heroDuration(start.getTime()-Date.now())}` : 'Horaire à confirmer'}</strong></div><div class="hero-actions"><a class="primary-button" href="${primaryHref}">${primaryLabel} ${I(isSeries ? 'ArrowUpRight' : 'LogIn')}</a><a class="subtle-link" href="${secondaryHref}">VOIR LE CHAMPIONNAT ${I('ArrowRight')}</a></div></div><div class="hero-matchup" aria-label="${publicEscape(self.name)} contre ${publicEscape(opponent.name)}"><div class="hero-player">${playerAvatarMarkup(self,self.name,'hero-player-avatar')}<span>VOUS</span><strong>${publicEscape(self.name)}</strong></div><div class="hero-versus"><span>VS</span><i></i></div><div class="hero-player">${playerAvatarMarkup(opponent,opponent.name,'hero-player-avatar')}<span>ADVERSAIRE</span><strong>${publicEscape(opponent.name)}</strong></div></div></div></article>`;
};
const heroChampionshipSlide = (record, position, total) => {
  const isOpen = record.status === 'registration-open';
  const inProgress = championshipIsInProgress(record);
  const action = championshipAction(inProgress ? 'ongoing' : record.status,record.id);
  const image = record.game === 'DOMINO' ? './src/images/imagedomino.png' : './src/images/imagehero.png';
  const imageAlt = record.game === 'DOMINO' ? 'Dominos du championnat' : 'Plateau de Mopyon avec pierres noires et blanches';
  const kicker = isOpen ? 'INSCRIPTIONS OUVERTES' : inProgress ? 'CHAMPIONNAT EN COURS' : 'ÉVÉNEMENT PLANIFIÉ';
  const countdown = isOpen && record.date ? `<div class="hero-countdown"><span>COMPTE À REBOURS</span><strong data-hero-target="${record.date.getTime()}" data-hero-label="">${heroDuration(record.date.getTime()-Date.now())}</strong></div>` : inProgress ? '<div class="hero-countdown is-live"><span>CHAMPIONNAT DÉJÀ COMMENCÉ</span><strong>EN COURS</strong></div>' : record.status === 'registration-closed' ? '<div class="hero-countdown is-complete"><span>STATUT DES INSCRIPTIONS</span><strong>INSCRIPTIONS COMPLÈTES</strong></div>' : '';
  return `<article class="hero-slide hero-championship-slide" role="group" aria-roledescription="diapositive" aria-label="${position} sur ${total} — ${publicEscape(championshipDisplayName(record))}"><div class="hero-grid"><div class="hero-copy"><div class="eyebrow">${kicker}</div><h1 class="hero-title">${publicEscape(record.game)}</h1><span class="hero-id">#${publicEscape(record.number)}</span><div class="hero-date">${I('CalendarDays')}<span>${publicEscape(record.dateLabel)} • ${publicEscape(record.time)}</span></div>${countdown}<div class="prize-label">GAIN PRINCIPAL</div><p class="prize">${publicEscape(moneyLabel(record.prize))}</p><div class="hero-stats"><div class="stat">${I('Coins')}<div><span class="stat-label">ENTRÉE</span><span class="stat-value">${publicEscape(moneyLabel(record.entryFee))}</span></div></div><div class="stat">${I('UsersRound')}<div><span class="stat-label">JOUEURS MAX</span><span class="stat-value">${publicEscape(record.maxPlayers)}</span></div></div><div class="stat">${I('Swords')}<div><span class="stat-label">FORMAT</span><span class="stat-value">ÉLIMINATION DIRECTE</span></div></div></div><div class="hero-actions"><a class="primary-button" href="${action.href}">${isOpen ? `PARTICIPER — ${publicEscape(moneyLabel(record.entryFee))}` : action.label} ${I('ArrowUpRight')}</a><a class="subtle-link rules-link" href="#rules">VOIR LES RÈGLES ${I('ArrowRight')}</a></div></div><div class="hero-board"><img class="hero-image" src="${image}" alt="${imageAlt}"></div></div></article>`;
};
const updateHeroTimes = () => {
  document.querySelectorAll('[data-hero-target]').forEach(element => {
    const target = Number(element.dataset.heroTarget);
    if (!Number.isFinite(target)) return;
    const prefix = element.dataset.heroLabel || '';
    element.textContent = target > Date.now() ? `${prefix}${prefix ? ' ' : ''}${heroDuration(target-Date.now())}` : 'DÉBUT IMMINENT';
  });
};
const renderHomepageHeroCarousel = () => {
  const carousel = document.querySelector('[data-hero-carousel]');
  const track = carousel?.querySelector('[data-hero-track]');
  const nav = carousel?.querySelector('[data-hero-nav]');
  const dots = carousel?.querySelector('[data-hero-dots]');
  if (!carousel || !track || !nav || !dots) return;
  const now = Date.now();
  const personalSource = new Map([...homepageMatchRecords,...homepagePersonalMatches].map(match => [match.id,match]));
  const personalMatches = currentAuthUser ? [...personalSource.values()]
    .filter(match => heroMatchParticipantIds(match).includes(currentAuthUser.uid) && !heroMatchIsFinished(match))
    .filter(match => { const start = heroMatchDate(match); return heroMatchIsActive(match) || !start || start.getTime() + CHAMPIONSHIP_DURATION_MS > now; })
    .sort((a,b) => Number(heroMatchIsActive(b))-Number(heroMatchIsActive(a)) || (heroMatchDate(a)?.getTime() || Number.MAX_SAFE_INTEGER)-(heroMatchDate(b)?.getTime() || Number.MAX_SAFE_INTEGER)) : [];
  const championships = [...homepageChampionshipRecords]
    .filter(record => !['cancelled','completed'].includes(record.status))
    .sort((a,b) => {
      const priority = record => record.status === 'registration-open' ? 0 : championshipIsInProgress(record) ? 1 : 2;
      return priority(a)-priority(b) || a.date.getTime()-b.date.getTime();
    });
  const slides = [...personalMatches.map(data => ({type:'match',data})),...championships.map(data => ({type:'championship',data}))];
  document.body.classList.add('database-ready');
  clearInterval(homepageHeroTimer);
  if (!slides.length) {
    track.innerHTML = `<article class="hero-slide hero-empty-slide"><div class="hero-empty"><span>${I('CalendarX')}</span><p>PROGRAMME JWETPRO</p><h1>Aucun événement planifié</h1><strong>Les prochains matchs et championnats apparaîtront ici dès leur publication.</strong><a href="./calendar.html">CONSULTER LE CALENDRIER ${I('ArrowRight')}</a></div></article>`;
    nav.hidden = true;
    renderIcons();
    return;
  }
  track.innerHTML = slides.map((slide,index) => slide.type === 'match' ? heroMatchSlide(slide.data,index+1,slides.length) : heroChampionshipSlide(slide.data,index+1,slides.length)).join('');
  dots.innerHTML = slides.map((_,index) => `<button type="button" data-hero-dot="${index}" aria-label="Afficher l’événement ${index+1}"${index ? '' : ' aria-current="true"'}></button>`).join('');
  nav.hidden = slides.length < 2;
  let activeIndex = 0;
  const setActive = index => {
    activeIndex = Math.max(0,Math.min(slides.length-1,index));
    dots.querySelectorAll('[data-hero-dot]').forEach((dot,dotIndex) => dot.toggleAttribute('aria-current',dotIndex === activeIndex));
  };
  const goTo = index => { setActive(index); track.scrollTo({left:activeIndex*track.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); };
  carousel.querySelector('[data-hero-previous]')?.addEventListener('click',() => goTo(activeIndex-1));
  carousel.querySelector('[data-hero-next]')?.addEventListener('click',() => goTo(activeIndex+1));
  dots.querySelectorAll('[data-hero-dot]').forEach(dot => dot.addEventListener('click',() => goTo(Number(dot.dataset.heroDot))));
  let scrollFrame = 0;
  track.addEventListener('scroll',() => { cancelAnimationFrame(scrollFrame); scrollFrame=requestAnimationFrame(() => setActive(Math.round(track.scrollLeft/Math.max(1,track.clientWidth)))); },{passive:true});
  updateHeroTimes();
  homepageHeroTimer = setInterval(updateHeroTimes,30000);
  renderIcons();
};
const renderChampionshipProgress = record => {
  const panel = document.querySelector('#progress .progress-panel');
  if (!panel) return;
  const name = panel.querySelector('.progress-name');
  const status = panel.querySelector('.progress-heading .status');
  const date = panel.querySelector('.progress-date');
  const values = panel.querySelectorAll('.metric-value');
  const REGISTRATION_SHARE = 15;
  const registrationFraction = record && record.maxPlayers > 0 ? Math.min(1, Math.max(0, record.participantCount / record.maxPlayers)) : 0;
  const tournamentFraction = record
    ? Number.isFinite(record.matchesPlayed) && Number.isFinite(record.totalMatches) && record.totalMatches > 0
      ? Math.min(1, Math.max(0, record.matchesPlayed / record.totalMatches))
      : Number.isFinite(record.currentRound) && record.rounds > 0
        ? Math.min(1, Math.max(0, record.currentRound / record.rounds))
        : 0
    : 0;
  const percent = Number.isFinite(record?.completion)
    ? Math.min(100, Math.max(0, record.completion))
    : !record
      ? 0
      : record.status === 'completed'
        ? 100
        : record.status === 'ongoing'
          ? Math.round(REGISTRATION_SHARE + tournamentFraction * (100 - REGISTRATION_SHARE))
          : Math.round(registrationFraction * REGISTRATION_SHARE);
  if (!record) {
    if (name) name.textContent = 'Aucun championnat planifié';
    if (status) { status.textContent = 'À VENIR'; status.className = 'status soon'; }
    if (date) date.textContent = 'Les prochaines données seront publiées ici.';
    values.forEach(value => { value.textContent = '—'; });
    panel.querySelector('.progress-register')?.setAttribute('hidden', '');
  } else {
    const isOpen = record.status === 'registration-open';
    const registerCta = isOpen ? {label:'S’INSCRIRE AU CHAMPIONNAT',href:registrationHref(record.id)} : championshipAction(record.status, record.id);
    if (name) name.textContent = championshipDisplayName(record);
    if (status) { status.textContent = championshipStatus(record.status); status.className = `status ${championshipTone(record.status)}`; }
    if (date) date.textContent = `${record.dateLabel} · ${record.time}`;
    const metrics = [
      `${record.maxPlayers} joueurs max`,
      Number.isFinite(record.matchesPlayed) ? (Number.isFinite(record.totalMatches) ? `${record.matchesPlayed} / ${record.totalMatches}` : String(record.matchesPlayed)) : 'À venir',
      Number.isFinite(record.currentRound) ? `${record.currentRound} / ${record.rounds}` : 'À venir',
      Number.isFinite(record.matchesInProgress) ? String(record.matchesInProgress) : '0',
      record.time
    ];
    metrics.forEach((value, index) => { if (values[index]) values[index].textContent = value; });
    const register = panel.querySelector('.progress-register');
    if (register) { register.hidden = false; register.href = registerCta.href; register.innerHTML = `${registerCta.label} ${I('ArrowRight')}`; }
  }
  const progressValue = panel.querySelector('.progress-label b');
  const meter = panel.querySelector('.meter-fill');
  if (progressValue) progressValue.textContent = `${percent}%`;
  if (meter) meter.style.width = `${percent}%`;
};
const heroEmptyState = () => {
  homepageChampionshipRecords = [];
  homepageFeaturedChampionship = null;
  renderHomepageHeroCarousel();
};
const renderEmptyPublicSections = () => {
  const states = [
    ['#activity .activity-grid', 'Aucune activité publiée', 'Les activités JWETPRO apparaîtront ici dès qu’elles seront disponibles.'],
  ];
  states.forEach(([selector, title, detail]) => {
    const element = document.querySelector(selector);
    if (element && !element.children.length) element.innerHTML = `<div class="data-empty"><span class="data-empty-icon">${I('Activity')}</span><strong>${title}</strong><p>${detail}</p></div>`;
  });
  renderRanking([]);
  renderChampions([]);
  renderMatchesEmptyState();
  renderIcons();
};
const championMarkup = champion => `<article class="champion-card ${champion.rank === '#1' ? 'first' : ''}" data-reveal><div class="champion-rank">${publicEscape(champion.rank)}</div>${I(champion.rank === '#1' ? 'Crown' : 'Medal')}<div class="champion-name">${publicEscape(champion.name)}</div><div class="champion-game">${publicEscape(champion.game)}</div><div class="champion-prize">${publicEscape(champion.prize)}</div></article>`;
const renderChampions = records => {
  const list = document.querySelector('#champions .champion-list');
  if (!list) return;
  if (!records.length) {
    list.innerHTML = `<div class="data-empty"><span class="data-empty-icon">${I('Trophy')}</span><strong>Aucun champion publié</strong><p>Les champions apparaîtront ici dès la fin d’un championnat officiel.</p></div>`;
    renderIcons();
    return;
  }
  list.innerHTML = records.slice(0, 3).map(championMarkup).join('');
  renderIcons();
};
const loadPublicChampions = async () => {
  if (!window.firebase || typeof firebase.firestore !== 'function') return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const snapshot = await firebase.firestore().collection('championships').limit(100).get();
    const records = snapshot.docs.map(doc => {
      const data = doc.data();
      const winner = data.winner || data.champion || {};
      const name = data.winnerName || data.championName || winner.name || winner.displayName;
      const date = championshipDate(data.completedAt || data.endAt || data.startAt);
      return name && date ? {rank:data.rank || '#1',name,game:`${data.game === 'domino' ? 'DOMINO' : 'Mopyon'} #${data.number || doc.id}`,prize:moneyLabel(data.prize),date:date.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})} : null;
    }).filter(Boolean).sort((a,b) => new Date(b.date) - new Date(a.date));
    renderChampions(records);
  } catch (error) { console.error('Public champions read failed:', error); renderChampions([]); }
};
const normalizedRankingName = value => String(value || '').trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
const referenceChampionAvatar = value => PROFILE_AVATAR_INDEX[normalizedRankingName(value)];
const uniqueRankingAvatars = rows => {
  const usedSpriteIndexes = new Set();
  const usedImageNames = new Set();
  const result = rows.map(row => ({...row}));
  result.forEach(row => {
    const fixedIndex = referenceChampionAvatar(row.name);
    if (fixedIndex === undefined || usedSpriteIndexes.has(fixedIndex)) return;
    row.avatarIndex = fixedIndex;
    row.imageName = '';
    usedSpriteIndexes.add(fixedIndex);
  });
  result.forEach(row => {
    if (referenceChampionAvatar(row.name) !== undefined) return;
    const imageName = /^[A-Za-z0-9._-]+$/.test(String(row.imageName || '')) ? String(row.imageName) : '';
    if (imageName && !usedImageNames.has(imageName)) { usedImageNames.add(imageName); return; }
    row.imageName = '';
    const requestedIndex = Number(row.avatarIndex);
    const avatarIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < 12 && !usedSpriteIndexes.has(requestedIndex)
      ? requestedIndex
      : Array.from({length:12},(_,index) => index).find(index => !usedSpriteIndexes.has(index));
    row.avatarIndex = avatarIndex ?? 0;
    usedSpriteIndexes.add(row.avatarIndex);
  });
  return result;
};
const rankingRows = users => {
  const realUsers = users.map(user => {
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.displayName || 'Joueur';
    const points = Math.max(0, Number(user.points ?? user.totalPoints ?? user.score) || 0);
    return {name, level:playerLevelFromPoints(points).name, points:points.toLocaleString('fr-FR'), imageName:user.imageName || '', photoURL:user.photoURL || '',isDemo:false};
  });
  const sortedRows = realUsers.sort((a,b) => (Number(String(b.points).replace(/\s/g,'')) || 0) - (Number(String(a.points).replace(/\s/g,'')) || 0)).slice(0, 12);
  return uniqueRankingAvatars(sortedRows);
};
const rankingSpriteStyle = avatarIndex => {
  const index = Math.abs(Number(avatarIndex) || 0) % 12;
  const column = index % 4;
  const row = Math.floor(index / 4);
  return `background-image:url('./src/images/ranking-avatar-sprite.png');background-size:400% auto;background-position:${column * 100 / 3}% ${row * 50}%`;
};
const rankingRowMarkup = (row, index) => {
  const photoURL = String(row.photoURL || '').trim();
  const avatar = /^https:\/\//.test(photoURL)
    ? `<span class="ranking-avatar" style="background-image:url('${photoURL.replace(/'/g, '%27')}')" role="img" aria-label="Photo de ${publicEscape(row.name)}"></span>`
    : row.imageName && /^[A-Za-z0-9._-]+$/.test(row.imageName)
      ? `<span class="ranking-avatar" style="background-image:url('./src/profilimage/${encodeURIComponent(row.imageName)}')" role="img" aria-label="Photo de ${publicEscape(row.name)}"></span>`
      : row.isDemo
        ? `<span class="ranking-avatar" style="${rankingSpriteStyle(row.avatarIndex ?? index)}" role="img" aria-label="Avatar illustré de ${publicEscape(row.name)}"></span>`
        : `<span class="ranking-avatar" style="background-image:none" role="img" aria-label="Avatar de ${publicEscape(row.name)}">${initialsOf(row.name)}</span>`;
  const numericPoints = Math.max(0, Number(String(row.points).replace(/\s/g,'')) || 0);
  const level = playerLevelFromPoints(numericPoints).name;
  return `<tr class="${row.isDemo ? 'ranking-demo-row' : ''}"><td>${index + 1}</td><td>${avatar}<b>${publicEscape(row.name)}</b></td><td><span class="level-badge">${publicEscape(level)}</span></td><td>${publicEscape(row.points)}${row.points !== '—' ? ' PTS' : ''}</td></tr>`;
};
const renderRanking = users => {
  const rows = rankingRows(users);
  const panel = document.querySelector('#ranking');
  const table = panel?.querySelector('.ranking-table');
  panel?.querySelector('.data-empty')?.remove();
  if (!rows.length) {
    if (table) table.hidden = true;
    table?.insertAdjacentHTML('afterend', `<div class="data-empty"><span class="data-empty-icon">${I('Trophy')}</span><strong>Aucun classement publié</strong><p>Le classement apparaîtra après les premiers résultats validés.</p></div>`);
    renderIcons();
    return;
  }
  if (table) table.hidden = false;
  const body = table?.querySelector('tbody');
  if (body) body.innerHTML = rows.slice(0, 5).map(rankingRowMarkup).join('');
};
const loadPublicRanking = async () => {
  if (!window.firebase || typeof firebase.firestore !== 'function') return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const snapshot = await firebase.firestore().collection('leaderboard').limit(200).get();
    renderRanking(snapshot.docs.map(doc => doc.data()));
  } catch (error) { console.error('Public ranking read failed:', error); renderRanking([]); }
};
const loadHomepagePersonalMatches = async user => {
  const requestId = ++homepagePersonalMatchesRequest;
  if (!user || user.isAnonymous || !window.firebase || typeof firebase.firestore !== 'function') {
    homepagePersonalMatches = [];
    renderHomepageHeroCarousel();
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const snapshot = await firebase.firestore().collection('matches').where('participantIds','array-contains',user.uid).limit(50).get();
    if (requestId !== homepagePersonalMatchesRequest || currentAuthUser?.uid !== user.uid) return;
    homepagePersonalMatches = snapshot.docs.map(doc => ({id:doc.id,...doc.data()}));
    renderHomepageHeroCarousel();
  } catch (error) {
    if (requestId !== homepagePersonalMatchesRequest) return;
    homepagePersonalMatches = [];
    console.error('Homepage personal matches read failed:',error);
    renderHomepageHeroCarousel();
  }
};
const loadPublicMatches = async () => {
  const grid = document.querySelector('#live .live-grid');
  if (!grid || !window.firebase || typeof firebase.firestore !== 'function') return;
  try {
    const db = firebase.firestore();
    const queries = ['preview', 'scheduled', 'ongoing', 'live', 'in-progress', 'active', 'completed', 'finished'].map(status => db.collection('matches').where('status', '==', status).limit(60).get());
    queries.push(db.collection('matches').where('visibility', '==', 'public').limit(60).get());
    const [snapshots, leaderboardSnapshot] = await Promise.all([
      Promise.allSettled(queries),
      db.collection('leaderboard').limit(200).get().catch(() => null)
    ]);
    homepageLeaderboardByName.clear();
    leaderboardSnapshot?.docs.forEach(doc => {
      const data = doc.data();
      const photoURL = String(data.photoURL || '').trim();
      if (photoURL) homepageLeaderboardByName.set(normalizedRankingName(data.displayName), photoURL);
    });
    const attachPlayerPhoto = player => {
      if (!player) return player;
      const enriched = typeof player === 'string' ? {name: player} : {...player};
      if (!enriched.photoURL) {
        const photoURL = homepageLeaderboardByName.get(normalizedRankingName(enriched.name || enriched.displayName || enriched.username || ''));
        if (photoURL) enriched.photoURL = photoURL;
      }
      return enriched;
    };
    const unique = new Map();
    snapshots.forEach(result => {
      if (result.status !== 'fulfilled') {
        console.warn('Homepage matches query skipped:', result.reason?.code || result.reason?.message || result.reason);
        return;
      }
      result.value.docs.forEach(doc => unique.set(doc.id, {id: doc.id, ...doc.data()}));
    });
    const records = [...unique.values()].map(data => ({
      ...data,
      players: Array.isArray(data.players) ? data.players.map(attachPlayerPhoto) : data.players,
      player1: attachPlayerPhoto(data.player1 || data.firstPlayer),
      player2: attachPlayerPhoto(data.player2 || data.secondPlayer)
    }));
    homepageMatchRecords = records;
    homepageStartedMatches = records.filter(data => data.kind !== 'series' && publicMatchHasStarted(data));
    const statusOf = data => String(data.status || data.state || data.liveStatus || '').toLowerCase();
    const activityTime = data => matchToDate(data.completedAt || data.endedAt || data.startedAt || data.updatedAt || data.createdAt || data.startAt)?.getTime() || 0;
    const scheduledTime = data => matchToDate(data.scheduledAt || data.startAt || data.date || data.createdAt)?.getTime() ?? Infinity;
    // Series docs (kind:'series') are bracket pairings, not playable games: only real game docs go in the
    // live/replay buckets, while a still-unstarted series itself represents the "match à venir" card.
    const seriesIds = new Set(records.filter(data => data.kind === 'series').map(data => data.id));
    const liveRecords = records
      .filter(data => /live|direct|en cours|ongoing|in-progress|active|playing/.test(statusOf(data)) && (data.kind === 'series' ? Boolean(data.currentGameId || data.activeGameId) : !data.seriesId || !seriesIds.has(data.seriesId)))
      .sort((a, b) => activityTime(b) - activityTime(a));
    const upcomingRecords = records
      .filter(data => data.kind === 'series' && ['preview', 'scheduled'].includes(statusOf(data)))
      .sort((a, b) => scheduledTime(a) - scheduledTime(b));
    const replayRecords = records
      .filter(data => /complete|completed|finished|ended|termine|terminé|replay/.test(statusOf(data)) && (data.kind === 'series' || !data.seriesId || !seriesIds.has(data.seriesId)))
      .sort((a, b) => activityTime(b) - activityTime(a));
    // Home activity is a priority-fill of 3 slots: live first, then upcoming matches, then replays —
    // never "only live" or "only replay", and never empty just because one bucket ran out.
    const selected = [
      ...liveRecords.map(data => ({data, kind: 'live'})),
      ...upcomingRecords.map(data => ({data, kind: 'upcoming'})),
      ...replayRecords.map(data => ({data, kind: 'replay'}))
    ].slice(0, 3);
    if (selected.length) grid.innerHTML = selected.map(item => renderMatchRecord(item.data, item.kind)).join('');
    else renderMatchesEmptyState();
    document.body.classList.toggle('has-live-matches', liveRecords.length > 0);
    document.querySelector('#live .arrow-link')?.setAttribute('href', liveRecords.length > 0 ? './live.html' : './live.html?view=replays');
    renderHomepageHeroCarousel();
    renderIcons();
  } catch (error) { console.error('Public matches read failed:', error); homepageMatchRecords=[]; renderHomepageHeroCarousel(); renderMatchesEmptyState('Données indisponibles', 'Impossible de charger les données pour le moment.'); document.body.classList.remove('has-live-matches'); document.querySelector('#live .arrow-link')?.setAttribute('href', './live.html?view=replays'); }
};
const renderChampionshipActivity = records => {
  const activityGrid = document.querySelector('#activity .activity-grid');
  if (!activityGrid) return;
  const now = Date.now();
  const activityScore = record => { const time = record.activityAt?.getTime() || 0; return time > now ? now - (time - now) : time; };
  const recent = records
    .filter(record => record.status !== 'cancelled')
    .sort((a,b) => activityScore(b) - activityScore(a))
    .slice(0, 3)
    .sort((a,b) => Number(a.status === 'completed') - Number(b.status === 'completed'));
  activityGrid.innerHTML = recent.length ? recent.map(record => activity({
    game: record.game,
    id: `#${record.number}`,
    tone: championshipTone(record.status),
    status: championshipStatus(record.status),
    date: `${record.dateLabel} · ${record.time}`,
    detail: record.status === 'completed' ? 'Participation' : 'Entrée',
    value: moneyLabel(record.entryFee),
    amount: record.status === 'completed' ? moneyLabel(record.prize) : `${record.maxPlayers} joueurs max`,
    action: championshipAction(record.status, record.id)
  })).join('') : `<div class="data-empty"><span class="data-empty-icon">${I('Activity')}</span><strong>Aucune activité publiée</strong><p>Les activités JWETPRO apparaîtront ici dès qu’elles seront disponibles.</p></div>`;
  renderIcons();
};
const renderDatabaseChampionships = (records, selectedId = null) => {
  const calendar = document.querySelector('#calendar .container');
  if (!calendar || !records.length) {
    heroEmptyState();
    renderChampionshipProgress(null);
    if (calendar) calendar.innerHTML = `<div class="calendar-heading"><h2 class="section-title"><span class="calendar-heading-icon">${I('Trophy')}</span>CALENDRIER DES CHAMPIONNATS</h2><a class="arrow-link" href="./calendar.html">VOIR TOUS LES CHAMPIONNATS ${I('ChevronRight')}</a></div><section class="calendar-empty-state" aria-labelledby="calendar-empty-title"><div class="calendar-empty-icon" aria-hidden="true">${I('CalendarDays')}</div><div class="calendar-empty-copy"><p class="calendar-empty-kicker">PROGRAMME À VENIR</p><h3 id="calendar-empty-title">Aucun championnat planifié</h3><p>Les prochaines compétitions apparaîtront ici dès leur publication.</p></div><a class="calendar-empty-action" href="./calendar.html">CONSULTER LE CALENDRIER ${I('ArrowRight')}</a></section>`;
    renderIcons();
    return;
  }
  const featured = records.find(record => record.id === selectedId) || records.reduce((closest, record) => !closest || record.date.getTime() < closest.date.getTime() ? record : closest, null);
  homepageFeaturedChampionship = featured;
  homepageChampionshipRecords = records;
  renderHomepageHeroCarousel();
  renderChampionshipProgress(featured);
  currentRulesGame = featured.game === 'DOMINO' ? 'Domino' : 'Mopyon';
  const upcoming = records
    .filter(record => record.id !== featured.id)
    .sort((a,b) => a.date.getTime() - b.date.getTime())
    .slice(0, 4);
  const icon = record => record.game === 'DOMINO' ? './src/images/iconedomino.png' : './src/images/logogomoku.png';
  const day = record => record.date ? record.date.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}).replace('.','').toUpperCase() : '—';
  const tone = record => championshipTone(record.status);
  const isOpen = tone(featured) === 'open';
  const featuredCta = championshipAction(featured.status, featured.id);
  const featuredAction = featuredCta.label;
  const featuredHref = featuredCta.href;
  calendar.innerHTML = `<div class="calendar-heading"><h2 class="section-title"><span class="calendar-heading-icon">${I('Trophy')}</span>CALENDRIER DES CHAMPIONNATS</h2><a class="arrow-link" href="./calendar.html">GADE TOUT KALANDRIYE A ${I('ChevronRight')}</a></div><p class="calendar-note">2 000 HTG au champion. Le deuxième reçoit une inscription gratuite et les autres participants un coupon de réduction de 25 HTG pour le prochain championnat Domino ou Mopyon.</p><div class="calendar-layout"><article class="calendar-feature"><div class="calendar-feature-label">${I('Star')} ${selectedId ? 'CHAMPIONNAT SÉLECTIONNÉ' : 'PROCHAIN CHAMPIONNAT'}</div><div class="calendar-feature-main"><div class="calendar-feature-date"><b>${day(featured).split(' ')[0]}</b><span>${day(featured).split(' ')[1] || ''}</span></div><div class="calendar-feature-copy"><div class="calendar-game-icon"><img src="${icon(featured)}" alt="Icône ${featured.game}"></div><div><h3>${championshipDisplayName(featured)}</h3><p>${featured.dateLabel} · ${featured.time}</p><span class="status ${tone(featured)}">${championshipStatus(featured.status)}</span></div></div></div><div class="calendar-feature-footer"><div><span>${I('Coins')} ENTRÉE</span><b>${moneyLabel(featured.entryFee)}</b></div><div><span>${I('Trophy')} GAIN</span><b>${moneyLabel(featured.prize)}</b></div><a class="calendar-feature-cta${isOpen ? ' is-register' : ''}" href="${featuredHref}">${featuredAction} ${I('ChevronRight')}</a></div></article><div class="calendar-timeline">${upcoming.map((record,index)=>`<article class="calendar-timeline-item" data-calendar-id="${record.id}" tabindex="0" role="button" aria-label="Afficher ${championshipDisplayName(record)}"><span class="calendar-timeline-dot ${index?'':'active'}"></span><div class="calendar-timeline-date"><b>${day(record).split(' ')[0]}</b><span>${day(record).split(' ')[1] || ''}</span></div><div class="calendar-timeline-icon"><img src="${icon(record)}" alt="Icône ${record.game}"></div><div class="calendar-timeline-copy"><h3>${championshipDisplayName(record)}</h3><p>${record.dateLabel} · ${record.time}</p></div><span class="status ${tone(record)}">${championshipStatus(record.status)}</span>${I('ChevronRight')}</article>`).join('')}</div></div>`;
  calendar.querySelectorAll('[data-calendar-id]').forEach(item => {
    const select = () => renderDatabaseChampionships(records, item.dataset.calendarId);
    item.addEventListener('click', select);
    item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
  });
  renderIcons();
};
const GAME_CARD_TONE_PRIORITY = {open:0,live:1,soon:2,done:3};
const updateGameCards = allRecords => {
  document.querySelectorAll('.game-card[data-game]').forEach(card => {
    const gameKey = String(card.dataset.game || '').toLowerCase();
    const cta = card.querySelector('[data-game-cta]');
    const meta = card.querySelector('.game-meta');
    const submeta = card.querySelector('.game-submeta');
    if (!cta) return;
    const gameRecords = allRecords.filter(record => record.game.toLowerCase() === gameKey && record.status !== 'cancelled');
    const featured = gameRecords.sort((a,b) => (GAME_CARD_TONE_PRIORITY[championshipTone(a.status)] ?? 4) - (GAME_CARD_TONE_PRIORITY[championshipTone(b.status)] ?? 4) || a.date.getTime() - b.date.getTime())[0];
    if (featured) {
      if (meta) meta.textContent = `GAINS JUSQU’À ${moneyLabel(featured.prize)}`;
      if (submeta) submeta.textContent = `${featured.participantCount || 0} / ${featured.maxPlayers} JOUEURS INSCRITS`;
      const action = championshipAction(featured.status, featured.id);
      cta.href = action.href;
      cta.innerHTML = `${action.label} ${I('ArrowUpRight')}`;
      cta.classList.toggle('is-closed', action.label !== 'S’INSCRIRE');
    } else {
      if (meta) meta.textContent = `GAINS JUSQU’À ${standard.prize.toLocaleString('fr-FR')} HTG`;
      if (submeta) submeta.textContent = `${standard.format} · ${standard.maxPlayers} JOUEURS MAX`;
      cta.href = './activity.html';
      cta.innerHTML = `REVOIR LE CHAMPIONNAT ${I('ArrowUpRight')}`;
      cta.classList.add('is-closed');
    }
  });
  renderIcons();
};
let championshipStatusTimer;
const loadDatabaseChampionships = async () => {
  if (!window.firebase || typeof firebase.firestore !== 'function') { heroEmptyState(); renderEmptyPublicSections(); return; }
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const snapshot = await firebase.firestore().collection('championships').limit(100).get();
    const refreshChampionships = () => {
      const allRecords = snapshot.docs.map(championshipRecord).filter(record => record.date instanceof Date);
      renderChampionshipActivity(allRecords);
      updateGameCards(allRecords);
      const activeAndUpcoming = allRecords.filter(record => !['cancelled','completed'].includes(record.status) && record.date.getTime() + CHAMPIONSHIP_DURATION_MS > Date.now() && record.entryFee > 0 && record.prize > 0 && record.maxPlayers > 0).sort((a,b) => a.date.getTime() - b.date.getTime());
      renderDatabaseChampionships(activeAndUpcoming);
    };
    refreshChampionships();
    clearInterval(championshipStatusTimer);
    championshipStatusTimer = setInterval(refreshChampionships, 30000);
  } catch (error) { console.error('Public championships read failed:',error); heroEmptyState(); renderEmptyPublicSections(); }
};
renderEmptyPublicSections();
document.querySelector('#live .arrow-link')?.setAttribute('href','./live.html?view=replays');
document.querySelector('#progress .arrow-link')?.setAttribute('href','./progress.html');
document.querySelector('#ranking-all-link')?.setAttribute('href','./ranking.html');
document.querySelector('#calendar .section-head .arrow-link')?.setAttribute('href','./calendar.html');
loadPublicRanking();
loadPublicChampions();
loadDatabaseChampionships();
loadPublicMatches();
