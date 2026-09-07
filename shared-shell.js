const sharedIconPaths = {
  house: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  'user-round': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  'message-circle': '<path d="M21 12a8.5 8.5 0 0 1-9 8.5 9.8 9.8 0 0 1-4-.9L3 21l1.4-4.2A8.5 8.5 0 1 1 21 12Z"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'
};
const sharedIconName = value => String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').replace(/\s+/g, '-').toLowerCase();
const sharedIcon = name => {
  const paths = sharedIconPaths[sharedIconName(name)];
  return paths
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
    : `<i data-lucide="${name}" aria-hidden="true"></i>`;
};
window.JwetproSharedIcon = sharedIcon;
if (!window.renderIcons) {
  window.renderIcons = () => {
    const icons = document.querySelectorAll('[data-lucide]');
    icons.forEach(element => {
      const name = sharedIconName(element.getAttribute('data-lucide'));
      if (name) element.setAttribute('data-lucide', name);
    });
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.7 } });
      return;
    }
    icons.forEach(element => {
      const name = element.getAttribute('data-lucide');
      const paths = sharedIconPaths[name];
      if (!paths) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.7');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = paths;
      element.replaceWith(svg);
    });
  };
}
const sharedHomeLabel = localStorage.getItem('jwetpro-language') === 'ht' ? 'AKÈY' : 'ACCUEIL';
const sharedHomeLink = `<a class="nav-home-link" href="./index.html#top">${sharedIcon('House')}<span data-home-label>${sharedHomeLabel}</span></a>`;
const sharedHeader = `<header class="site-header"><div class="container header-inner"><a class="brand header-brand text-brand" href="./index.html#top" aria-label="JWETPRO accueil"><span class="wordmark-jp serif">JP</span><span class="wordmark-jwet">JWET</span><span class="wordmark-pro">PRO</span></a><nav class="main-nav"><a href="./play.html">JOUER</a><a class="nav-live" href="./live.html">REGARDER <span class="live-dot"></span></a><a href="./ranking.html">CLASSEMENT</a><a href="./champions.html">CHAMPIONS</a><a href="./activity.html">RÉSULTATS</a><a href="./guide.html">COMMENT ÇA MARCHE</a></nav><a class="login-button" href="./index.html#login">${sharedIcon('UserRound')} CONNEXION</a><button class="menu-button" id="menu-button" aria-label="Ouvrir le menu" aria-expanded="false">${sharedIcon('Menu')}</button></div><nav class="mobile-nav" id="mobile-nav"><button class="mobile-nav-close" id="mobile-nav-close" type="button" aria-label="Fermer le menu">${sharedIcon('X')}</button><a href="./play.html">JOUER</a><a href="./live.html">REGARDER · LIVE</a><a href="./ranking.html">CLASSEMENT</a><a href="./champions.html">CHAMPIONS</a><a href="./activity.html">RÉSULTATS</a><a href="./guide.html">COMMENT ÇA MARCHE</a></nav></header>`;
const sharedFooter = `<footer><div class="container footer-grid"><div><a class="brand" href="./index.html#top"><span class="brand-mark serif">JP</span><span>JWET<span class="brand-pro">PRO</span></span></a><p class="footer-copy">Le hub des championnats<br>de jeux de table en Haïti.</p></div><div><div class="footer-title">LIENS RAPIDES</div><div class="footer-links"><a href="./calendar.html">Championnats</a><a href="./live.html">En direct</a><a href="./ranking.html">Classement</a><a href="./champions.html">Champions</a></div></div><div><div class="footer-title">SUPPORT</div><div class="footer-links"><a href="./faq.html">FAQ</a><a href="./index.html#rules">Règlement</a><a href="./privacy.html">Confidentialité</a></div></div><div><div class="footer-title">SUIVEZ-NOUS</div><div class="footer-links social-links"><a href="./social.html#facebook" aria-label="Facebook"><img src="./src/images/facebook.png" alt="Facebook" loading="lazy"></a><a href="./social.html#instagram" aria-label="Instagram"><img src="./src/images/instagrame.png" alt="Instagram" loading="lazy"></a><a href="./social.html#whatsapp" aria-label="WhatsApp"><img src="./src/images/whatsapp.png" alt="WhatsApp" loading="lazy"></a></div></div></div><div class="container footer-bottom"><span>© 2026 JWETPRO. Tous droits réservés.</span><span>Championnats de jeux de table en Haïti.</span></div></footer>`;
const mountSharedShell = () => { document.querySelectorAll('.public-head,.activity-page-header').forEach(element => element.remove()); document.querySelectorAll('.public-foot,.activity-page-footer').forEach(element => element.remove()); document.body.insertAdjacentHTML('afterbegin', sharedHeader); document.body.insertAdjacentHTML('beforeend', sharedFooter); const currentPage=location.pathname.split('/').pop()||'index.html'; document.querySelectorAll('.main-nav a,.mobile-nav a').forEach(link=>{const target=link.getAttribute('href')?.split('#')[0].replace('./','');if(target===currentPage)link.setAttribute('aria-current','page')}); const menu=document.querySelector('#mobile-nav'); const backdrop=document.createElement('div'); backdrop.className='mobile-nav-backdrop'; document.body.append(backdrop); const close=()=>{menu?.classList.remove('open');backdrop.classList.remove('open');document.body.classList.remove('mobile-menu-open');document.querySelector('#menu-button')?.setAttribute('aria-expanded','false')}; document.querySelector('#menu-button')?.addEventListener('click',()=>{const open=!menu.classList.contains('open');menu.classList.toggle('open',open);backdrop.classList.toggle('open',open);document.body.classList.toggle('mobile-menu-open',open);document.querySelector('#menu-button').setAttribute('aria-expanded',String(open))}); document.querySelector('#mobile-nav-close')?.addEventListener('click',close); backdrop.addEventListener('click',close); menu?.querySelectorAll('a').forEach(link=>link.addEventListener('click',close)); window.renderIcons(); };
mountSharedShell();

if (!window.JwetproI18n && !document.querySelector('script[data-jwetpro-i18n]')) {
  const i18nScript = document.createElement('script');
  i18nScript.src = './shared-i18n.js?v=20260904-official-championship-rules';
  i18nScript.dataset.jwetproI18n = 'true';
  document.head.append(i18nScript);
}

const sharedFirebaseConfig = {
  apiKey: 'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',
  authDomain: 'mopyonlakay.firebaseapp.com',
  projectId: 'mopyonlakay',
  storageBucket: 'mopyonlakay.firebasestorage.app',
  messagingSenderId: '307157893690',
  appId: '1:307157893690:web:4e5a033d13d54ce86feb03'
};

const renderSharedAccount = async user => {
  window.JwetproCurrentUserId = user && !user.isAnonymous ? user.uid : '';
  window.dispatchEvent(new CustomEvent('jwetpro-auth-ready', {detail:{uid:window.JwetproCurrentUserId}}));
  const account = document.querySelector('.login-button');
  if (!account) return;
  if (!user || user.isAnonymous) {
    account.classList.remove('is-authenticated');
    account.href = './index.html#login';
    account.setAttribute('aria-label', 'Connexion');
    account.removeAttribute('title');
    account.innerHTML = `${sharedIcon('UserRound')} CONNEXION`;
    window.renderIcons();
    return;
  }

  let imageName = '';
  let photoURL = '';
  let displayName = user.displayName || user.email || 'Utilisateur JWETPRO';
  try {
    const profile = await firebase.firestore().collection('users').doc(user.uid).get();
    if (profile.exists) {
      const data = profile.data();
      imageName = String(data.imageName || '').trim();
      photoURL = String(data.photoURL || '').trim();
      displayName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.username || displayName;
    }
  } catch (error) {
    console.warn('Profil utilisateur indisponible dans le header partagé :', error);
  }

  const safeImageName = /^[A-Za-z0-9._-]+$/.test(imageName) ? imageName : '';
  const avatarUrl = /^https:\/\//.test(photoURL) ? photoURL : (safeImageName ? `./src/profilimage/${encodeURIComponent(safeImageName)}` : '');
  const initials = displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'JW';
  account.classList.add('is-authenticated');
  account.href = './index.html#profile';
  account.setAttribute('aria-label', `Ouvrir le profil de ${displayName}`);
  account.title = displayName;
  account.innerHTML = '';
  if (avatarUrl) {
    const avatar = document.createElement('img');
    avatar.className = 'header-user-avatar';
    avatar.src = avatarUrl;
    avatar.alt = '';
    avatar.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'header-avatar-fallback';
      fallback.textContent = initials;
      avatar.replaceWith(fallback);
    }, { once: true });
    account.append(avatar);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'header-avatar-fallback';
    fallback.textContent = initials;
    account.append(fallback);
  }
};

const initSharedAuth = () => {
  if (!window.firebase?.auth) return;
  if (!firebase.apps.length) firebase.initializeApp(sharedFirebaseConfig);
  const auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  auth.onAuthStateChanged(renderSharedAccount);
};

if (window.firebase?.auth) {
  initSharedAuth();
} else if (window.firebase) {
  const authScript = document.createElement('script');
  authScript.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js';
  authScript.addEventListener('load', initSharedAuth, { once: true });
  authScript.addEventListener('error', () => console.warn('Firebase Auth indisponible sur cette page.'), { once: true });
  document.head.append(authScript);
}
const applyLiveNavIndicator = async () => {
  try {
    if (!firebase.apps.length) firebase.initializeApp(sharedFirebaseConfig);
    const snapshot = await firebase.firestore().collection('matches').where('status', 'in', ['ongoing', 'live']).limit(50).get();
    const hasLive = snapshot.docs.some(doc => {
      const data = doc.data();
      return /live|direct|en cours|ongoing/.test(String(data.status || data.state || data.liveStatus || '').toLowerCase());
    });
    document.body.classList.toggle('has-live-matches', hasLive);
  } catch (error) { console.warn('Vérification des matchs en direct impossible dans le header partagé :', error); }
};
if (window.firebase?.firestore) applyLiveNavIndicator();

if (!document.body.classList.contains('community-page-body') && !document.querySelector('script[data-jwetpro-community]')) {
  const communityScript = document.createElement('script');
  communityScript.src = './shared-community.js?v=20260904-assistant-actions';
  communityScript.dataset.jwetproCommunity = 'true';
  document.head.append(communityScript);
}
document.querySelector('.main-nav')?.prepend(document.createRange().createContextualFragment(sharedHomeLink));
document.querySelector('.mobile-nav')?.prepend(document.createRange().createContextualFragment(sharedHomeLink));
window.renderIcons();
window.dispatchEvent(new Event('shared-shell-ready'));
