const runCommunityPage = () => initCommunityPage();
window.addEventListener('shared-shell-ready', runCommunityPage, { once: true });
const sharedShellScript = document.createElement('script');
sharedShellScript.src = './shared-shell.js?v=20260820-jean-estime';
document.head.append(sharedShellScript);

const communityFirebaseConfig = {
  apiKey: 'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',
  authDomain: 'mopyonlakay.firebaseapp.com',
  projectId: 'mopyonlakay',
  storageBucket: 'mopyonlakay.firebasestorage.app',
  messagingSenderId: '307157893690',
  appId: '1:307157893690:web:4e5a033d13d54ce86feb03',
  measurementId: 'G-N32D8NS82V'
};

const communityIcon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const escapeCommunity = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
const communityTimestamp = value => value?.toDate ? value.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
const communityImage = value => { const name = String(value || '').trim(); return /^[A-Za-z0-9._-]+$/.test(name) ? `./src/profilimage/${encodeURIComponent(name)}` : ''; };
const communityAvatar = (imageName, displayName) => {
  const label = String(displayName || 'Utilisateur').trim() || 'Utilisateur';
  const image = communityImage(imageName);
  const initials = label.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'JW';
  return `<span class="community-avatar${image ? ' has-profile-image' : ' has-initials'}"${image ? ` style="background-image:url('${image}')"` : ''} role="img" aria-label="Photo de ${escapeCommunity(label)}">${image ? '' : escapeCommunity(initials)}</span>`;
};
const communityMessageSortValue = doc => {
  const timestamp = doc.data().createdAt;
  if (timestamp?.toMillis) return timestamp.toMillis();
  if (typeof timestamp?.seconds === 'number') return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000);
  return doc.metadata?.hasPendingWrites ? Number.MAX_SAFE_INTEGER : 0;
};
const communityMessageCompare = (a, b) => communityMessageSortValue(a) - communityMessageSortValue(b) || a.id.localeCompare(b.id);
const communityLanguage = () => localStorage.getItem('jwetpro-language') === 'ht' ? 'ht' : 'fr';
const communityRoom = { id: 'general', name: 'Communauté JWETPRO', description: 'Discussion générale entre tous les joueurs' };
let db = null;
let messagesUnsubscribe = null;
let isNearBottom = true;
let unreadMessageCount = 0;
let presenceInterval = null;
let simulationTimer = null;
let simulationRequested = false;
let humanActivityObserved = false;
const communityOpenedAt = Date.now();
const COMMUNITY_IDLE_DELAY_MS = 5000;

const messagesContainer = document.querySelector('.community-messages');
const newMessagesButton = document.createElement('button');
newMessagesButton.type = 'button';
newMessagesButton.className = 'community-new-messages';
newMessagesButton.hidden = true;
newMessagesButton.setAttribute('aria-live', 'polite');
newMessagesButton.textContent = 'Nouveaux messages';
messagesContainer?.after(newMessagesButton);
messagesContainer?.addEventListener('scroll', () => {
  isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight <= 48;
  if (isNearBottom) { unreadMessageCount = 0; newMessagesButton.hidden = true; }
});
newMessagesButton.addEventListener('click', () => {
  messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
  unreadMessageCount = 0;
  newMessagesButton.hidden = true;
});

const communityState = message => { if (messagesContainer) messagesContainer.innerHTML = `<p class="community-data-state">${escapeCommunity(message)}</p>`; };

const currentCommunityProfile = async user => {
  if (!user || !db) return null;
  try { const snapshot = await db.collection('users').doc(user.uid).get(); return snapshot.exists ? snapshot.data() : {}; }
  catch (error) { console.warn('Profil actuel indisponible dans la messagerie :', error); return {}; }
};

const writeGroupPresence = async viewing => {
  const user = window.firebase?.auth?.().currentUser;
  if (!user || user.isAnonymous || !db) return;
  try {
    const payload = {viewingGroup:viewing,lastSeen:firebase.firestore.FieldValue.serverTimestamp()};
    if (viewing) payload.since = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('communityPresence').doc(user.uid).set(payload,{merge:true});
  } catch (error) { console.warn('Community presence update failed:',error); }
};
const stopPresenceHeartbeat = () => {
  clearInterval(presenceInterval);
  presenceInterval = null;
  writeGroupPresence(false);
};
const startPresenceHeartbeat = () => {
  clearInterval(presenceInterval);
  writeGroupPresence(true);
  presenceInterval = setInterval(() => writeGroupPresence(true),5000);
};
const cancelSimulationTimer = () => {
  clearTimeout(simulationTimer);
  simulationTimer = null;
};
const stopSimulationForHumanActivity = () => {
  humanActivityObserved = true;
  cancelSimulationTimer();
};
const scheduleIdleSimulation = () => {
  cancelSimulationTimer();
  if (humanActivityObserved || simulationRequested || document.hidden) return;
  simulationTimer = setTimeout(async () => {
    simulationTimer = null;
    if (humanActivityObserved || simulationRequested || document.hidden) return;
    const user = window.firebase?.auth?.().currentUser;
    if (!user || user.isAnonymous) return;
    simulationRequested = true;
    try {
      await firebase.app().functions('us-central1').httpsCallable('startCommunitySimulation')({observedSince:communityOpenedAt});
    } catch (error) { console.warn('Community simulation trigger failed:',error); }
  },COMMUNITY_IDLE_DELAY_MS);
};
window.addEventListener('beforeunload',stopPresenceHeartbeat);
document.addEventListener('visibilitychange',() => {
  if (document.hidden) {
    cancelSimulationTimer();
    writeGroupPresence(false);
    return;
  }
  startPresenceHeartbeat();
  scheduleIdleSimulation();
});

const renderMessages = async snapshot => {
  const shouldStickToBottom = isNearBottom;
  const user = window.firebase?.auth?.().currentUser;
  const hasNewHumanMessage = snapshot.docChanges().some(change => {
    if (change.type !== 'added') return false;
    const data = change.doc.data();
    const isSimulatedMessage = /^simulated_/i.test(String(data.authorId || '')) || data.authorRole === 'simulated';
    if (data.authorRole !== 'user' || data.automated === true || isSimulatedMessage) return false;
    const createdAt = communityMessageSortValue(change.doc);
    return createdAt >= communityOpenedAt - 1000;
  });
  if (hasNewHumanMessage) stopSimulationForHumanActivity();
  const sortedDocs = [...snapshot.docs]
    .filter(doc => {
      const data = doc.data();
      const role = String(data.authorRole || '').toLowerCase();
      return role !== 'assistant' && (data.automated !== true || role === 'simulated');
    })
    .sort(communityMessageCompare);
  if (!sortedDocs.length) { communityState('Aucun message dans ce salon.'); return; }
  const hasOwnMessages = Boolean(user && sortedDocs.some(doc => doc.data().authorId === user.uid));
  const profile = hasOwnMessages ? await currentCommunityProfile(user) : null;
  const currentName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username || user?.displayName || user?.email : '';
  const renderedMessages = sortedDocs.map(doc => {
    const data = doc.data();
    const isCurrentUser = Boolean(user && data.authorId === user.uid);
    const isSimulated = /^simulated_/i.test(String(data.authorId || '')) || data.authorRole === 'simulated' || data.simulation === true;
    const tone = isCurrentUser ? 'is-own' : 'is-other';
    const authorName = isCurrentUser && currentName ? currentName : data.authorName || data.username || 'Utilisateur';
    const imageName = isCurrentUser ? profile?.imageName || '' : data.authorImageName || data.imageName;
    const reactionData = data.reactions || {};
    return `<article class="community-message ${tone}${isSimulated ? ' is-simulated' : ''}" data-message-id="${escapeCommunity(doc.id)}">${communityAvatar(imageName, authorName)}<div><div class="community-message-meta"><strong>${escapeCommunity(authorName)}</strong><small>${communityTimestamp(data.createdAt)}</small></div><p>${escapeCommunity(data.body || data.message || '')}</p><div class="community-reactions">${reactionData.like ? `<button type="button">👍 ${escapeCommunity(reactionData.like)}</button>` : ''}${reactionData.fire ? `<button type="button">🔥 ${escapeCommunity(reactionData.fire)}</button>` : ''}</div></div></article>`;
  }).join('');
  messagesContainer.innerHTML = renderedMessages;
  window.renderIcons?.();
  requestAnimationFrame(() => {
    if (shouldStickToBottom) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      unreadMessageCount = 0;
      newMessagesButton.hidden = true;
    } else {
      unreadMessageCount += 1;
      newMessagesButton.textContent = `${unreadMessageCount} nouveau${unreadMessageCount > 1 ? 'x' : ''} message${unreadMessageCount > 1 ? 's' : ''}`;
      newMessagesButton.hidden = false;
    }
  });
};

const loadCommunityMessages = () => {
  messagesUnsubscribe?.();
  communityState('Chargement des messages…');
  messagesUnsubscribe = db.collection('communityMessages').where('roomId', '==', communityRoom.id).orderBy('createdAt', 'asc').limitToLast(15).onSnapshot(
    snapshot => renderMessages(snapshot),
    error => { communityState('Impossible de charger les messages de ce salon.'); console.error('Community messages read failed:', error); }
  );
};

// The live "players online" figure needs a server-maintained counter (or a public projection of
// communityPresence, which is server-only): a signed-in player cannot list /users, and no code
// writes an `online` flag there. Until that source exists the indicator stays neutral.
const loadOnlineCount = async () => {
  const online = document.querySelector('.community-online span');
  if (online) online.textContent = '—';
};

document.querySelector('.community-composer')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('input');
  const submit = form.querySelector('button');
  const body = input?.value.trim();
  const user = window.firebase?.auth?.().currentUser;
  if (!body || submit?.disabled) return;
  if (!user || user.isAnonymous) { input.placeholder = 'Connectez-vous pour écrire un message'; return; }
  stopSimulationForHumanActivity();
  submit.disabled = true;
  input.setAttribute('aria-busy', 'true');
  try {
    const profile = await db.collection('users').doc(user.uid).get();
    const data = profile.exists ? profile.data() : {};
    const authorName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.username || user.email || 'Utilisateur JWETPRO';
    await db.collection('communityMessages').add({ roomId: communityRoom.id, authorId: user.uid, authorName, authorImageName: data.imageName || '', authorRole: 'user', language: communityLanguage(), body, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    input.value = '';
  } catch (error) {
    input.placeholder = 'Impossible d’envoyer le message';
    console.error('Community message write failed:', error);
  } finally {
    submit.disabled = false;
    input.removeAttribute('aria-busy');
    input.focus();
  }
});

document.querySelector('.community-welcome')?.remove();

function initCommunityPage() {
  if (!window.firebase || typeof firebase.firestore !== 'function') { communityState('Firebase est indisponible.'); return; }
  if (!firebase.apps.length) firebase.initializeApp(communityFirebaseConfig);
  const auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged(user => {
    if (!user || user.isAnonymous) { window.location.href = './index.html#login'; return; }
    loadCommunityMessages();
    loadOnlineCount();
    startPresenceHeartbeat();
    scheduleIdleSimulation();
  });
}
