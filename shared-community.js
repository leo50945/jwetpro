(() => {
  if (window.JwetproSharedCommunity) return;
  window.JwetproSharedCommunity = true;

  const icon = name => window.JwetproSharedIcon?.(name) || `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  const firebaseConfig = {
    apiKey: 'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',
    authDomain: 'mopyonlakay.firebaseapp.com',
    projectId: 'mopyonlakay',
    storageBucket: 'mopyonlakay.firebasestorage.app',
    messagingSenderId: '307157893690',
    appId: '1:307157893690:web:4e5a033d13d54ce86feb03'
  };
  let db = null;

  const loadScript = src => new Promise((resolve, reject) => {
    if ([...document.scripts].some(script => script.src.endsWith(src))) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.addEventListener('load', resolve, {once:true});
    script.addEventListener('error', reject, {once:true});
    document.head.append(script);
  });

  const ensureFirebase = async () => {
    if (!window.firebase?.initializeApp) await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
    if (!window.firebase?.auth) await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js');
    if (!window.firebase?.firestore) await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
    if (!window.firebase?.functions) await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = db || firebase.firestore();
    return {auth:firebase.auth(), db};
  };

  const ensureCoordinatorUser = async () => {
    const {auth} = await ensureFirebase();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    if (auth.currentUser) return auth.currentUser;
    const credential = await auth.signInAnonymously();
    return credential.user;
  };

  const chat = document.createElement('button');
  chat.id = 'chat-bubble';
  chat.className = 'chat-bubble';
  chat.type = 'button';
  chat.setAttribute('aria-label', 'Ouvrir les messages');
  chat.title = 'Messages';
  chat.innerHTML = icon('MessageCircle');
  document.body.append(chat);

  const assistance = document.createElement('button');
  assistance.id = 'assistance-bubble';
  assistance.className = 'assistance-bubble';
  assistance.type = 'button';
  assistance.setAttribute('aria-label', 'Contacter Jean Estime');
  assistance.title = 'Jean Estime';
  assistance.innerHTML = icon('Headphones');
  document.body.append(assistance);

  const assistModal = document.createElement('div');
  assistModal.id = 'assist-modal';
  assistModal.className = 'assist-modal';
  assistModal.hidden = true;
  assistModal.innerHTML = `<div class="assist-panel" role="dialog" aria-modal="true" aria-labelledby="assist-title"><header class="assist-header"><span class="assist-header-icon">${icon('Headphones')}</span><div><strong id="assist-title">Jean Estime</strong><small>Assistant officiel JWETPRO</small></div><button class="assist-close" type="button" aria-label="Fermer la conversation avec Jean Estime">${icon('X')}</button></header><div class="assist-messages" role="log" aria-live="polite"><p class="assist-empty">Connexion…</p></div><form class="assist-composer"><input type="text" maxlength="2000" placeholder="Écrire à Jean Estime…" aria-label="Écrire un message à Jean Estime"><button type="submit" aria-label="Envoyer le message">${icon('Send')}</button></form></div>`;
  document.body.append(assistModal);

  const language = () => localStorage.getItem('jwetpro-language') === 'ht' ? 'ht' : 'fr';
  const timestamp = value => value?.toDate ? value.toDate().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '';
  const avatar = name => `<span class="community-avatar has-initials" role="img" aria-label="Avatar">${escapeHTML(String(name || 'JW').split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase() || 'JW')}</span>`;
  const assistantActionMap = {
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
  const assistantActions = data => {
    if (data.authorRole !== 'assistant') return '';
    const selectedLanguage = data.language === 'ht' ? 'ht' : language();
    const helper = selectedLanguage === 'ht' ? 'AKSÈ RAPID · Peze yon bouton pou louvri paj la' : 'ACCÈS RAPIDE · Cliquez pour ouvrir la page';
    const links = (Array.isArray(data.suggestedActions) ? data.suggestedActions : [])
      .filter(action => assistantActionMap[action])
      .slice(0,3)
      .map(action => { const item = assistantActionMap[action]; const label=item[selectedLanguage]; return `<a class="assistant-quick-link" data-assistant-link href="${item.href}" aria-label="${escapeHTML(label)} — ouvre une page">${escapeHTML(label)}${icon('ArrowRight')}</a>`; })
      .join('');
    return links ? `<nav class="assistant-quick-links assist-message-actions" aria-label="${escapeHTML(helper)}"><span class="assistant-quick-links-label">${icon('ArrowRight')}${escapeHTML(helper)}</span><div>${links}</div></nav>` : '';
  };

  // --- Private assistance widget: separate UI from the group community modal, usable without an account. ---
  let assistUnsubscribe = null;
  let assistRoomId = null;

  const assistState = message => { assistModal.querySelector('.assist-messages').innerHTML = `<p class="assist-empty">${escapeHTML(message)}</p>`; };

  const renderAssistMessages = snapshot => {
    const user = firebase.auth().currentUser;
    const docs = [...snapshot.docs].sort((a,b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0));
    if (!docs.length) { assistState('Écrivez votre premier message à Jean Estime.'); return; }
    assistModal.querySelector('.assist-messages').innerHTML = docs.map(doc => {
      const data = doc.data();
      const own = user && data.authorId === user.uid;
      const assistant = data.authorRole === 'assistant';
      const tone = own ? 'is-own' : assistant ? 'is-assistant' : 'is-coordinator';
      const name = assistant ? 'Jean Estime' : (data.authorName || 'Coordonnateur');
      const mark = assistant ? '<span class="assist-assistant-mark" aria-label="Jean Estime, assistant officiel JWETPRO">JE</span>' : avatar(name);
      return `<article class="assist-message ${tone}">${mark}<div><div class="assist-message-meta"><strong>${escapeHTML(name)}</strong><small>${timestamp(data.createdAt)}</small></div><p>${escapeHTML(data.body || '')}</p>${assistantActions(data)}</div></article>`;
    }).join('');
    const messages = assistModal.querySelector('.assist-messages');
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  };

  const openAssistance = async () => {
    assistModal.hidden = false;
    document.body.classList.add('assist-open');
    assistState('Connexion avec Jean Estime…');
    try {
      const firebaseReady = await ensureFirebase();
      const user = await ensureCoordinatorUser();
      assistRoomId = `coordinator_${user.uid}`;
      assistUnsubscribe?.();
      assistUnsubscribe = firebaseReady.db.collection('communityMessages').where('roomId','==',assistRoomId).orderBy('createdAt','asc').limitToLast(100).onSnapshot(renderAssistMessages, error => {
        assistState('Impossible de charger l’assistance pour le moment.');
        console.error('Shared assistance read failed:', error);
      });
      assistModal.querySelector('.assist-close')?.focus();
    } catch (error) {
      assistState('Impossible d’ouvrir l’assistance pour le moment.');
      console.error('Shared assistance failed:', error);
    }
  };

  const closeAssistance = () => {
    assistUnsubscribe?.();
    assistUnsubscribe = null;
    assistModal.hidden = true;
    document.body.classList.remove('assist-open');
  };

  assistModal.addEventListener('click', event => { if (event.target === assistModal || event.target.closest('[data-assistant-link]') || event.target.closest('.assist-close')) closeAssistance(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !assistModal.hidden) closeAssistance(); });
  assistModal.querySelector('.assist-composer')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = assistModal.querySelector('.assist-composer input');
    const submit = assistModal.querySelector('.assist-composer button');
    const body = input.value.trim();
    if (!body || !assistRoomId || submit.disabled) return;
    submit.disabled = true;
    try {
      const {db: firestore} = await ensureFirebase();
      const user = await ensureCoordinatorUser();
      let profile = {};
      try {
        const profileSnapshot = await firestore.collection('users').doc(user.uid).get();
        profile = profileSnapshot.exists ? profileSnapshot.data() : {};
      } catch (_) {}
      const authorName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username || user.email || 'Visiteur JWETPRO';
      await firestore.collection('communityMessages').add({roomId:assistRoomId,authorId:user.uid,authorName,authorImageName:profile.imageName || '',authorRole:'user',language:language(),body,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      input.value = '';
    } catch (error) {
      input.placeholder = 'Impossible d’envoyer le message';
      console.error('Shared assistance write failed:', error);
    } finally {
      submit.disabled = false;
      input.focus();
    }
  });

  chat.addEventListener('click', () => { location.href = './community.html'; });
  assistance.addEventListener('click', openAssistance);

  window.renderIcons?.();
})();
