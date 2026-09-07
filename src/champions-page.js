const championsFirebaseConfig = {apiKey:'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',authDomain:'mopyonlakay.firebaseapp.com',projectId:'mopyonlakay',storageBucket:'mopyonlakay.firebasestorage.app',messagingSenderId:'307157893690',appId:'1:307157893690:web:4e5a033d13d54ce86feb03'};
const championsEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const championsDate = value => { const date = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const normalizeChampionName = value => String(value || '').trim().toLocaleLowerCase('fr').replace(/\s+/g, ' ');
const CHAMPION_AVATAR_INDEX = {'ricardo p.':0,'jean m.':1,'michel d.':2,'david t.':3,'nadia l.':4,'alex r.':5,'ruth joseph':6,'mikaël louis':7,'sarah charles':8,'esther paul':9,'lovely michel':10,'wesley auguste':11};
const CHAMPION_DEMO_RANKING = [['Jean M.',18,1],['Ricardo P.',15,0],['Nadia L.',13,4],['Michel D.',11,2],['David T.',9,3],['Alex R.',8,5],['Ruth Joseph',7,6],['Mikaël Louis',6,7],['Sarah Charles',5,8],['Esther Paul',4,9],['Lovely Michel',3,10],['Wesley Auguste',2,11]].map(([displayName,points,avatarIndex]) => ({displayName,points,avatarIndex,imageName:'',isDemo:true}));
const validChampionImage = value => /^[A-Za-z0-9._-]+$/.test(String(value || '')) ? String(value) : '';
const championFallbackIndex = name => {
  const normalized = normalizeChampionName(name);
  if (CHAMPION_AVATAR_INDEX[normalized] !== undefined) return CHAMPION_AVATAR_INDEX[normalized];
  return Array.from(normalized).reduce((total, character) => total + character.codePointAt(0), 0) % 12;
};
const resolveLeaderboardAvatars = leaderboard => {
  const realRows = [...leaderboard].sort((a,b) => (Number(b.points) || 0) - (Number(a.points) || 0)).slice(0,12);
  const realNames = new Set(realRows.map(profile => normalizeChampionName(profile.displayName || profile.name)));
  const rows = [...realRows,...CHAMPION_DEMO_RANKING.filter(profile => !realNames.has(normalizeChampionName(profile.displayName))).slice(0,Math.max(0,12-realRows.length))].sort((a,b) => (Number(b.points) || 0) - (Number(a.points) || 0)).map(profile => ({...profile}));
  const usedSprites = new Set();
  const usedImages = new Set();
  rows.forEach(profile => {
    const fixedIndex = CHAMPION_AVATAR_INDEX[normalizeChampionName(profile.displayName || profile.name)];
    if (fixedIndex === undefined || usedSprites.has(fixedIndex)) return;
    profile.avatarIndex = fixedIndex;
    profile.imageName = '';
    usedSprites.add(fixedIndex);
  });
  rows.forEach(profile => {
    if (CHAMPION_AVATAR_INDEX[normalizeChampionName(profile.displayName || profile.name)] !== undefined) return;
    const imageName = validChampionImage(profile.imageName);
    if (imageName && !usedImages.has(imageName)) { profile.imageName = imageName; usedImages.add(imageName); return; }
    profile.imageName = '';
    const requestedIndex = Number(profile.avatarIndex);
    profile.avatarIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < 12 && !usedSprites.has(requestedIndex)
      ? requestedIndex
      : Array.from({length:12},(_,index) => index).find(index => !usedSprites.has(index)) ?? 0;
    usedSprites.add(profile.avatarIndex);
  });
  return rows;
};
const validChampionPhotoURL = value => { const url = String(value || '').trim(); return /^https:\/\//.test(url) ? url.replace(/'/g, '%27') : ''; };
const championInitials = value => String(value || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?';
const championAvatar = (champion, leaderboardById, leaderboardByName) => {
  const winner = champion.winner || champion.champion || {};
  const identifiers = [champion.winnerId,champion.championId,champion.winnerUid,champion.championUid,winner.uid,winner.id,winner.userId,winner.playerId].filter(Boolean).map(String);
  const rankingProfile = identifiers.map(identifier => leaderboardById.get(identifier)).find(Boolean) || leaderboardByName.get(normalizeChampionName(champion.name)) || {};
  const photoURL = validChampionPhotoURL(rankingProfile.photoURL || winner.photoURL || champion.winnerPhotoURL || champion.championPhotoURL);
  const imageName = validChampionImage(rankingProfile.imageName || winner.imageName || champion.winnerImageName || champion.championImageName);
  const requestedIndex = Number(rankingProfile.avatarIndex);
  const index = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < 12 ? requestedIndex : championFallbackIndex(rankingProfile.displayName || champion.name);
  const background = photoURL
    ? `center/cover no-repeat url('${photoURL}')`
    : imageName
      ? `center/cover no-repeat url('./src/profilimage/${encodeURIComponent(imageName)}')`
      : rankingProfile.isDemo
        ? `${index % 4 * 100 / 3}% ${Math.floor(index / 4) * 50}%/400% auto no-repeat url('./src/images/ranking-avatar-sprite.png')`
        : 'none';
  const style = `display:grid;place-items:center;width:68px;height:68px;border:3px solid #dce5eb;border-radius:50%;background:${background};box-shadow:0 5px 12px #10283d24${background === 'none' ? ';background-color:#e7edf2;color:#476174;font-size:20px;font-weight:800' : ''}`;
  return `<span class="champion-profile-avatar" style="${style}" role="img" aria-label="Photo de profil de ${championsEscape(champion.name)}">${background === 'none' ? championInitials(champion.name) : ''}</span>`;
};
const championsSearchText = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
const championsDateKey = date => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : 'date-inconnue';
const championsDateLabel = date => date ? date.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : 'Date non publiée';
const championsGame = value => String(value || 'Mopyon').toLowerCase() === 'domino' ? 'DOMINO' : 'MOPYON';
const championsIcon = name => {
  const paths = name === 'search'
    ? '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>'
    : '<path d="M18 6 6 18M6 6l12 12"></path>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
};
const championResultCard = (item, leaderboardById, leaderboardByName) => `<article class="info-card champion-result"><div class="champion-result-visual">${championAvatar(item,leaderboardById,leaderboardByName)}<span class="champion-medal" aria-hidden="true">★</span></div><div class="champion-result-copy"><p class="champion-label">CHAMPION VALIDÉ</p><h2>${championsEscape(item.name)}</h2><p>${championsGame(item.game)} · #${championsEscape(item.number || item.id)}</p></div><div class="champion-result-meta"><span><small>DATE DE VALIDATION</small>${item.completedAt ? item.completedAt.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}) : 'Date non publiée'}</span><strong><small>PRIX OFFICIEL</small>${Number(item.prize || 0).toLocaleString('fr-FR')} HTG</strong></div></article>`;
const championsArchiveMarkup = (champions, leaderboardById, leaderboardByName) => {
  const dateGroups = new Map();
  champions.forEach(item => {
    const key = championsDateKey(item.completedAt);
    if (!dateGroups.has(key)) dateGroups.set(key,{date:item.completedAt,items:[]});
    dateGroups.get(key).items.push(item);
  });
  const groups = [...dateGroups.values()].sort((a,b) => (b.date?.getTime() || -1) - (a.date?.getTime() || -1));
  let firstChampionship = true;
  const groupsMarkup = groups.map(group => {
    const items = group.items.sort((a,b) => String(a.number || a.id).localeCompare(String(b.number || b.id),'fr',{numeric:true}));
    const championshipsMarkup = items.map(item => {
      const open = firstChampionship;
      firstChampionship = false;
      const game = championsGame(item.game);
      const championshipLabel = String(item.title || item.championshipTitle || item.championshipName || `${game} · #${item.number || item.id}`);
      const search = championsSearchText([item.name,game,item.number,item.id,championshipLabel].filter(Boolean).join(' '));
      return `<details class="champions-championship" data-champion-entry data-search="${championsEscape(search)}"${open ? ' open' : ''}><summary><span class="champions-game-mark" aria-hidden="true">${game === 'DOMINO' ? 'D' : 'M'}</span><span class="champions-championship-copy"><small>CHAMPIONNAT</small><strong>${championsEscape(championshipLabel)}</strong></span><span class="champions-winner-preview">${championsEscape(item.name)}</span><span class="champions-chevron" aria-hidden="true"></span></summary><div class="champions-result-panel">${championResultCard(item,leaderboardById,leaderboardByName)}</div></details>`;
    }).join('');
    return `<section class="champions-date-group" data-champions-date><header class="champions-date-heading"><span></span><time datetime="${group.date ? group.date.toISOString() : ''}">${championsEscape(championsDateLabel(group.date))}</time><b data-visible-champion-count>${items.length} championnat${items.length === 1 ? '' : 's'}</b></header>${championshipsMarkup}</section>`;
  }).join('');
  const plural = champions.length === 1 ? '' : 's';
  return `<div class="champions-archive"><div class="champions-toolbar"><div class="champions-search">${championsIcon('search')}<label class="info-sr-only" for="champions-search-input">Rechercher un champion</label><input id="champions-search-input" type="search" data-champions-search placeholder="Rechercher un champion ou un championnat" autocomplete="off"><button type="button" data-champions-clear aria-label="Effacer la recherche" hidden>${championsIcon('close')}</button></div><p class="champions-result-count" role="status" aria-live="polite"><strong data-champions-result-count>${champions.length}</strong><span data-champions-result-label> champion${plural} publié${plural}</span></p></div><div class="champions-groups">${groupsMarkup}</div><div class="info-card champions-search-empty" data-champions-empty hidden><h2>Aucun champion trouvé</h2><p>Essayez le nom d’un joueur, un numéro ou le nom d’un championnat.</p></div></div>`;
};
const bindChampionsArchive = () => {
  const archive = document.querySelector('.champions-archive');
  if (!archive) return;
  const input = archive.querySelector('[data-champions-search]');
  const clear = archive.querySelector('[data-champions-clear]');
  const count = archive.querySelector('[data-champions-result-count]');
  const label = archive.querySelector('[data-champions-result-label]');
  const empty = archive.querySelector('[data-champions-empty]');
  const filter = () => {
    const query = championsSearchText(input.value);
    let visibleTotal = 0;
    archive.querySelectorAll('[data-champion-entry]').forEach(entry => {
      const visible = !query || entry.dataset.search.includes(query);
      entry.hidden = !visible;
      if (visible) {
        visibleTotal += 1;
        if (query) entry.open = true;
      }
    });
    archive.querySelectorAll('[data-champions-date]').forEach(group => {
      const visibleCount = group.querySelectorAll('[data-champion-entry]:not([hidden])').length;
      group.hidden = visibleCount === 0;
      const groupCount = group.querySelector('[data-visible-champion-count]');
      if (groupCount) groupCount.textContent = `${visibleCount} championnat${visibleCount === 1 ? '' : 's'}`;
    });
    const plural = visibleTotal === 1 ? '' : 's';
    count.textContent = visibleTotal;
    label.textContent = ` champion${plural} publié${plural}`;
    empty.hidden = visibleTotal !== 0;
    clear.hidden = !query;
  };
  input.addEventListener('input',filter);
  clear.addEventListener('click',() => { input.value=''; filter(); input.focus(); });
};
const renderChampionsPage = async () => {
  const list = document.querySelector('[data-champions-list]');
  if (!list) return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(championsFirebaseConfig);
    const db = firebase.firestore();
    const [championshipsSnapshot, leaderboardSnapshot] = await Promise.all([
      db.collection('championships').limit(100).get(),
      db.collection('leaderboard').limit(200).get()
    ]);
    const rawLeaderboard = leaderboardSnapshot.docs.map(document => ({id:document.id,...document.data()}));
    const resolvedLeaderboard = resolveLeaderboardAvatars(rawLeaderboard);
    const leaderboardById = new Map([...rawLeaderboard,...resolvedLeaderboard].filter(profile => profile.id).map(profile => [profile.id,profile]));
    const leaderboardByName = new Map([...rawLeaderboard,...resolvedLeaderboard].map(profile => [normalizeChampionName(profile.displayName || profile.name),profile]));
    const champions = championshipsSnapshot.docs.map(document => {
      const data = document.data();
      const winner = data.winner || data.champion || {};
      const name = data.winnerName || data.championName || winner.name || winner.displayName;
      const completedAt = championsDate(data.completedAt || data.endAt || data.startAt);
      return name ? {...data,id:document.id,name,completedAt} : null;
    }).filter(Boolean).sort((a,b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
    list.innerHTML = champions.length ? championsArchiveMarkup(champions,leaderboardById,leaderboardByName) : '<div class="info-card"><h2>Aucun champion publié</h2><p>Les vainqueurs apparaîtront ici après validation officielle.</p></div>';
    bindChampionsArchive();
  } catch (error) {
    console.error('Chargement des champions impossible :', error);
    list.innerHTML = '<div class="info-card"><h2>Palmarès indisponible</h2><p>Impossible de charger les champions pour le moment.</p></div>';
  }
};
window.addEventListener('shared-shell-ready', () => { document.querySelectorAll('a[href="./champions.html"]').forEach(link => link.setAttribute('aria-current','page')); renderChampionsPage(); }, {once:true});
const championsShell = document.createElement('script'); championsShell.src = './shared-shell.js?v=20260820-jean-estime'; document.head.append(championsShell);
