const runCommunityPage = () => initCommunityPage();
window.addEventListener('shared-shell-ready', runCommunityPage, { once: true });
const sharedShellScript = document.createElement('script');
sharedShellScript.src = './shared-shell.js?v=20260909-social-v3';
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
const communityText = (fr, ht) => localStorage.getItem('jwetpro-language') === 'ht' ? ht : fr;
const communityTimestamp = value => value?.toDate ? value.toDate().toLocaleTimeString(communityText('fr-FR','ht-HT'), { hour: '2-digit', minute: '2-digit' }) : '';
const communityImage = value => { const name = String(value || '').trim(); return /^[A-Za-z0-9._-]+$/.test(name) ? `./src/profilimage/${encodeURIComponent(name)}` : ''; };
const communityAvatar = (imageName, displayName) => {
  const label = String(displayName || 'Utilisateur').trim() || 'Utilisateur';
  const image = communityImage(imageName);
  const initials = label.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'JW';
  return `<span class="community-avatar${image ? ' has-profile-image' : ' has-initials'}"${image ? ` style="background-image:url('${image}')"` : ''} role="img" aria-label="${escapeCommunity(communityText(`Photo de ${label}`,`Foto ${label}`))}">${image ? '' : escapeCommunity(initials)}</span>`;
};
const communityProfileLink = (socialId, markup, label = '') => /^[A-Za-z0-9_-]{1,150}$/.test(String(socialId || '')) ? `<a class="community-player-link" href="./player.html?id=${encodeURIComponent(socialId)}"${label ? ` aria-label="${escapeCommunity(label)}"` : ''}>${markup}</a>` : markup;
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
let communityReplyTarget = null;
let renderedCommunityMessages = new Map();
let conversationsUnsubscribe = null;
let directMessagesUnsubscribe = null;
let conversationMetaUnsubscribe = null;
let activeCommunityView = 'group';
let activeConversationId = '';
let activeConversation = null;
let activePrivateSocialId = '';
let privateProfiles = new Map();
const communityOpenedAt = Date.now();
const COMMUNITY_IDLE_DELAY_MS = 5000;
const COMMUNITY_SIMULATION_RETRY_MIN_MS = 15000;
const COMMUNITY_SIMULATION_RETRY_MAX_MS = 15 * 60 * 1000;

const messagesContainer = document.querySelector('.community-messages');
const communityMain = document.querySelector('.community-main');
const privatePanel = document.querySelector('[data-private-conversations]');
const privateList = document.querySelector('[data-private-list]');
const newMessagesButton = document.createElement('button');
newMessagesButton.type = 'button';
newMessagesButton.className = 'community-new-messages';
newMessagesButton.hidden = true;
newMessagesButton.setAttribute('aria-live', 'polite');
newMessagesButton.textContent = communityText('Nouveaux messages','Nouvo mesaj');
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
const replyPreview = document.querySelector('.community-reply-preview');
const setCommunityReplyTarget = target => {
  communityReplyTarget = target;
  if (!replyPreview) return;
  replyPreview.hidden = !target;
  replyPreview.querySelector('strong').textContent = target ? `Réponse à ${target.authorName}` : '';
  replyPreview.querySelector('span').textContent = target?.body || '';
  document.querySelector('.community-composer input')?.focus();
};
replyPreview?.querySelector('button')?.addEventListener('click',() => setCommunityReplyTarget(null));
messagesContainer?.addEventListener('click',event => {
  const button = event.target.closest('[data-community-reply]');
  if (!button) return;
  const message = renderedCommunityMessages.get(button.dataset.communityReply);
  if (message) setCommunityReplyTarget({messageId:button.dataset.communityReply,authorName:message.authorName,body:message.body});
});

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
const scheduleIdleSimulation = (delay = COMMUNITY_IDLE_DELAY_MS) => {
  cancelSimulationTimer();
  if (humanActivityObserved || simulationRequested || document.hidden) return;
  simulationTimer = setTimeout(async () => {
    simulationTimer = null;
    if (humanActivityObserved || simulationRequested || document.hidden) return;
    const user = window.firebase?.auth?.().currentUser;
    if (!user || user.isAnonymous) return;
    simulationRequested = true;
    try {
      const response = await firebase.app().functions('us-central1').httpsCallable('startCommunitySimulation')({observedSince:communityOpenedAt});
      const requestedDelay = Number(response.data?.retryAfterMs);
      const retryDelay = Number.isFinite(requestedDelay)
        ? Math.min(COMMUNITY_SIMULATION_RETRY_MAX_MS,Math.max(COMMUNITY_SIMULATION_RETRY_MIN_MS,requestedDelay))
        : 60 * 1000;
      simulationRequested = false;
      scheduleIdleSimulation(retryDelay);
    } catch (error) { console.warn('Community simulation trigger failed:',error); }
    finally {
      if (simulationRequested) {
        simulationRequested = false;
        scheduleIdleSimulation(60 * 1000);
      }
    }
  },delay);
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
  if (!sortedDocs.length) { communityState(communityText('Aucun message dans ce salon.','Pa gen mesaj nan salon sa a.')); return; }
  const hasOwnMessages = Boolean(user && sortedDocs.some(doc => doc.data().authorId === user.uid));
  const profile = hasOwnMessages ? await currentCommunityProfile(user) : null;
  const currentName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username || user?.displayName || user?.email : '';
  renderedCommunityMessages = new Map();
  const renderedMessages = sortedDocs.map(doc => {
    const data = doc.data();
    const isCurrentUser = Boolean(user && data.authorId === user.uid);
    const isSimulated = /^simulated_/i.test(String(data.authorId || '')) || data.authorRole === 'simulated' || data.simulation === true;
    const tone = isCurrentUser ? 'is-own' : 'is-other';
    const authorName = isCurrentUser && currentName ? currentName : data.authorName || data.username || 'Utilisateur';
    const imageName = isCurrentUser ? profile?.imageName || '' : data.authorImageName || data.imageName;
    const reactionData = data.reactions || {};
    const body = data.body || data.message || '';
    renderedCommunityMessages.set(doc.id,{authorName,body});
    const reply = data.replyTo && typeof data.replyTo === 'object' ? data.replyTo : null;
    return `<article class="community-message ${tone}${isSimulated ? ' is-simulated' : ''}" data-message-id="${escapeCommunity(doc.id)}">${communityAvatar(imageName, authorName)}<div><div class="community-message-meta"><strong>${escapeCommunity(authorName)}</strong><small>${communityTimestamp(data.createdAt)}</small></div>${reply ? `<div class="community-message-quote"><strong>${escapeCommunity(reply.authorName || 'Utilisateur')}</strong><span>${escapeCommunity(reply.body || '')}</span></div>` : ''}<p>${escapeCommunity(body)}</p><div class="community-message-actions"><button type="button" data-community-reply="${escapeCommunity(doc.id)}">${communityIcon('Reply')} Répondre</button>${reactionData.like ? `<span>👍 ${escapeCommunity(reactionData.like)}</span>` : ''}${reactionData.fire ? `<span>🔥 ${escapeCommunity(reactionData.fire)}</span>` : ''}</div></div></article>`;
  }).join('');
  messagesContainer.innerHTML = renderedMessages;
  [...messagesContainer.querySelectorAll('.community-message')].forEach((article,index)=>{const messageDocument=sortedDocs[index];const messageData=messageDocument?.data?.()||{};const socialId=String(messageData.socialPlayerId||messageData.authorId||'');if(!/^[A-Za-z0-9_-]{1,150}$/.test(socialId)||socialId===user?.uid)return;const href=`./player.html?id=${encodeURIComponent(socialId)}`;const name=article.querySelector('.community-message-meta strong');if(name){const link=document.createElement('a');link.className='community-player-link';link.href=href;name.replaceWith(link);link.append(name)}const avatar=article.querySelector('.community-avatar');if(avatar&&!avatar.closest('a')){const avatarLink=document.createElement('a');avatarLink.className='community-player-link community-avatar-link';avatarLink.href=href;avatar.parentNode.insertBefore(avatarLink,avatar);avatarLink.append(avatar)}});
  window.renderIcons?.();
  requestAnimationFrame(() => {
    if (shouldStickToBottom) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      unreadMessageCount = 0;
      newMessagesButton.hidden = true;
    } else {
      unreadMessageCount += 1;
      newMessagesButton.textContent = communityText(`${unreadMessageCount} nouveau${unreadMessageCount > 1 ? 'x' : ''} message${unreadMessageCount > 1 ? 's' : ''}`,`${unreadMessageCount} nouvo mesaj`);
      newMessagesButton.hidden = false;
    }
  });
};

const loadCommunityMessages = () => {
  directMessagesUnsubscribe?.(); directMessagesUnsubscribe = null;
  messagesUnsubscribe?.();
  communityState(communityText('Chargement des messages…','Mesaj yo ap chaje…'));
  messagesUnsubscribe = db.collection('communityMessages').where('roomId', '==', communityRoom.id).orderBy('createdAt', 'asc').limitToLast(15).onSnapshot(
    snapshot => renderMessages(snapshot),
    error => { communityState(communityText('Impossible de charger les messages de ce salon.','Nou pa ka chaje mesaj salon sa a.')); console.error('Community messages read failed:', error); }
  );
};

const privateProfile = async socialId => {
  if(privateProfiles.has(socialId)) return privateProfiles.get(socialId);
  try { const snapshot=await db.collection('socialProfiles').doc(socialId).get(); const profile=snapshot.exists?snapshot.data():null; privateProfiles.set(socialId,profile); return profile; }
  catch { return null; }
};
const privateInitials = value => String(value||'JW').split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase();
const privateAvatar = profile => `<span class="private-conversation-avatar">${escapeCommunity(privateInitials(profile?.displayName))}</span>`;
const updatePrivateBadges = count => document.querySelectorAll('[data-private-unread]').forEach(badge=>{badge.textContent=count>99?'99+':String(count);badge.hidden=!count});
const renderConversationState = data => {
  activeConversation={id:activeConversationId,...data};
  const readOnly=data.sendEnabled===false||data.blocked===true;
  document.querySelector('.community-mobile-brand small').textContent=readOnly?communityText('Lecture seule','Lekti sèlman'):communityText('Conversation privée','Konvèsasyon prive');
  communityMain.classList.toggle('is-read-only',readOnly);
  const blockButton=document.querySelector('[data-private-block]');
  if(blockButton){const blocked=data.blockedByUid===firebase.auth().currentUser?.uid;blockButton.classList.toggle('is-danger',!blocked);blockButton.querySelector('span').textContent=blocked?communityText('Débloquer','Debloke'):communityText('Bloquer','Bloke');blockButton.dataset.blocked=String(blocked)}
};
const selectConversation = async id => {
  activeConversationId=id; privatePanel.hidden=innerWidth<768;
  document.querySelectorAll('[data-conversation-id]').forEach(button=>button.classList.toggle('is-active',button.dataset.conversationId===id));
  messagesUnsubscribe?.(); directMessagesUnsubscribe?.(); conversationMetaUnsubscribe?.(); communityState(communityText('Chargement de la conversation…','Konvèsasyon an ap chaje…'));
  try {
    const snapshot=await db.collection('directConversations').doc(id).get();
    if(!snapshot.exists) throw new Error('CONVERSATION_NOT_FOUND');
    activeConversation={id,...snapshot.data()};
    const user=firebase.auth().currentUser;const ids=activeConversation.participantSocialIds||[];const ownSocialId=user?.uid||'';const otherSocialId=ids.find(value=>value!==ownSocialId)||'';activePrivateSocialId=otherSocialId;const other=await privateProfile(otherSocialId);
    document.querySelector('#community-title').textContent=other?.displayName||communityText('Message privé','Mesaj prive');
    const actions=document.querySelector('[data-private-actions]');if(actions)actions.hidden=false;
    const profileLink=document.querySelector('[data-private-profile]');if(profileLink)profileLink.href=`./player.html?id=${encodeURIComponent(otherSocialId)}`;
    renderConversationState(activeConversation);
    conversationMetaUnsubscribe=db.collection('directConversations').doc(id).onSnapshot(meta=>{if(meta.exists)renderConversationState(meta.data()||{})});
    directMessagesUnsubscribe=db.collection('directConversations').doc(id).collection('messages').orderBy('createdAt','asc').limitToLast(100).onSnapshot(async messageSnapshot=>{
      if(!messageSnapshot.docs.length){messagesContainer.innerHTML=`<div class="private-empty"><div>${communityIcon('MessagesSquare')}<h2>${communityText('Commencez la conversation','Kòmanse konvèsasyon an')}</h2><p>${communityText('Vos messages sont privés et accessibles uniquement aux deux participants.','Mesaj nou yo prive epi se sèlman nou de a ki ka wè yo.')}</p></div></div>`;return}
      const ownProfile=await currentCommunityProfile(user);const ownName=`${ownProfile?.firstName||''} ${ownProfile?.lastName||''}`.trim()||ownProfile?.username||communityText('Vous','Ou');
      messagesContainer.innerHTML=messageSnapshot.docs.map(document=>{const item=document.data()||{};const own=item.authorUid===user.uid;const name=own?ownName:other?.displayName||communityText('Joueur JWETPRO','Jwè JWETPRO');return `<article class="community-message ${own?'is-own':'is-other'}">${communityProfileLink(own?user.uid:otherSocialId,communityAvatar(own?ownProfile?.imageName:other?.imageName,name),communityText(`Voir le profil de ${name}`,`Gade pwofil ${name}`))}<div><div class="community-message-meta">${communityProfileLink(own?user.uid:otherSocialId,`<strong>${escapeCommunity(name)}</strong>`)}<small>${communityTimestamp(item.createdAt)}</small></div><p>${escapeCommunity(item.body||'')}</p></div></article>`}).join('');messagesContainer.scrollTop=messagesContainer.scrollHeight;window.renderIcons?.();
    },error=>{communityState(communityText('Impossible de charger cette conversation.','Nou pa ka chaje konvèsasyon sa a.'));console.error('Direct messages read failed:',error)});
    await firebase.app().functions('us-central1').httpsCallable('markConversationRead')({conversationId:id}).catch(()=>null);
    history.replaceState(null,'',`./community.html?conversation=${encodeURIComponent(id)}`);
  } catch(error){communityState(communityText('Cette conversation est inaccessible.','Konvèsasyon sa a pa aksesib.'));console.error('Conversation read failed:',error)}
};
const renderConversations = async snapshot => {
  const user=firebase.auth().currentUser;if(!user||!privateList)return;
  const rows=await Promise.all(snapshot.docs.map(async document=>{const data=document.data()||{};const ownSocialId=user.uid;const socialId=(data.participantSocialIds||[]).find(value=>value!==ownSocialId)||'';return {id:document.id,data,profile:await privateProfile(socialId)}}));
  const unread=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.data.unreadCounts?.[user.uid])||0),0);updatePrivateBadges(unread);
  privateList.innerHTML=rows.length?rows.map(row=>`<button class="private-conversation${row.id===activeConversationId?' is-active':''}" type="button" data-conversation-id="${escapeCommunity(row.id)}" data-search="${escapeCommunity(String(row.profile?.displayName||'').toLowerCase())}">${privateAvatar(row.profile)}<span class="private-conversation-copy"><strong>${escapeCommunity(row.profile?.displayName||communityText('Joueur JWETPRO','Jwè JWETPRO'))}</strong><small>${escapeCommunity(row.data.lastMessage||communityText('Nouvelle conversation','Nouvo konvèsasyon'))}</small></span>${Number(row.data.unreadCounts?.[user.uid])>0?`<i aria-label="${communityText('Message non lu','Mesaj ki poko li')}"></i>`:''}</button>`).join(''):`<p>${communityText('Aucune conversation privée.<br>Suivez-vous mutuellement pour pouvoir écrire.','Pa gen konvèsasyon prive.<br>Nou dwe swiv youn lòt pou nou ka ekri.')}</p>`;
  const requested=new URLSearchParams(location.search).get('conversation');
  if(activeCommunityView==='private'&&!activeConversationId&&(requested&&rows.some(row=>row.id===requested)?requested:rows[0]?.id)) selectConversation(requested&&rows.some(row=>row.id===requested)?requested:rows[0].id);
};
const loadPrivateConversations = user => {
  conversationsUnsubscribe?.();
  conversationsUnsubscribe=db.collection('directConversations').where('participantIds','array-contains',user.uid).orderBy('lastMessageAt','desc').limit(50).onSnapshot(renderConversations,error=>{if(privateList)privateList.innerHTML=`<p>${communityText('Conversations indisponibles.','Konvèsasyon yo pa disponib.')}</p>`;console.error('Conversation list failed:',error)});
};
const switchCommunityView = mode => {
  activeCommunityView=mode==='private'?'private':'group';
  document.querySelectorAll('[data-community-view]').forEach(button=>button.classList.toggle('is-active',button.dataset.communityView===activeCommunityView));
  communityMain.classList.toggle('is-private',activeCommunityView==='private');
  privatePanel.hidden=activeCommunityView!=='private';
  if(activeCommunityView==='group'){
    activeConversationId='';activeConversation=null;activePrivateSocialId='';conversationMetaUnsubscribe?.();document.querySelector('[data-private-actions]')?.setAttribute('hidden','');communityMain.classList.remove('is-read-only');document.querySelector('#community-title').textContent=communityText('Communauté JwetPro','Kominote JwetPro');document.querySelector('.community-mobile-brand small').textContent=communityText('Espace d’échange des joueurs','Espas pou jwè yo pale');startPresenceHeartbeat();loadCommunityMessages();history.replaceState(null,'','./community.html');
  }else{
    stopPresenceHeartbeat();cancelSimulationTimer();messagesUnsubscribe?.();const requested=new URLSearchParams(location.search).get('conversation');if(requested)selectConversation(requested);else messagesContainer.innerHTML=`<div class="private-empty"><div>${communityIcon('MessagesSquare')}<h2>${communityText('Messages privés','Mesaj prive')}</h2><p>${communityText('Sélectionnez une conversation. Vous pouvez écrire uniquement aux vrais joueurs qui vous suivent également.','Chwazi yon konvèsasyon. Ou ka ekri sèlman vrè jwè ki swiv ou tou.')}</p></div></div>`;
  }
};
document.addEventListener('click',event=>{const view=event.target.closest('[data-community-view]');if(view)switchCommunityView(view.dataset.communityView);const conversation=event.target.closest('[data-conversation-id]');if(conversation)selectConversation(conversation.dataset.conversationId)});
document.querySelector('[data-private-search]')?.addEventListener('input',event=>{const query=event.target.value.trim().toLowerCase();document.querySelectorAll('[data-conversation-id]').forEach(button=>button.hidden=query&&!button.dataset.search.includes(query))});
document.querySelector('[data-private-block]')?.addEventListener('click',async event=>{
  if(!activePrivateSocialId)return;const blocked=event.currentTarget.dataset.blocked!=='true';
  if(blocked&&!confirm(communityText('Bloquer ce joueur ? Vos abonnements réciproques seront supprimés et la conversation passera en lecture seule.','Bloke jwè sa a? Abonnman resipwòk nou yo ap efase epi konvèsasyon an ap pase an lekti sèlman.')))return;
  try{await firebase.app().functions('us-central1').httpsCallable('setSocialBlock')({targetSocialId:activePrivateSocialId,blocked});event.currentTarget.dataset.blocked=String(blocked);renderConversationState({...activeConversation,blocked,blockedByUid:blocked?firebase.auth().currentUser?.uid:'',sendEnabled:false})}catch(error){console.error('Social block failed:',error);alert(communityText('Cette action est momentanément indisponible.','Aksyon sa a pa disponib pou kounye a.'));}
});
document.querySelector('[data-private-report]')?.addEventListener('click',async()=>{
  if(!activePrivateSocialId)return;const details=prompt(communityText('Décrivez brièvement le problème. Ce signalement sera transmis à l’équipe JWETPRO.','Dekri pwoblèm nan an kout. Rapò sa a ap voye bay ekip JWETPRO la.'));if(!details?.trim())return;
  try{await firebase.app().functions('us-central1').httpsCallable('createSocialReport')({targetSocialId:activePrivateSocialId,conversationId:activeConversationId,reason:'other',details:details.trim()});alert(communityText('Signalement transmis à l’équipe JWETPRO.','Rapò a voye bay ekip JWETPRO la.'));}catch(error){console.error('Social report failed:',error);alert(communityText('Le signalement n’a pas pu être transmis.','Nou pa t ka voye rapò a.'));}
});

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
    if(activeCommunityView==='private'&&activeConversationId){
      await firebase.app().functions('us-central1').httpsCallable('sendDirectMessage')({conversationId:activeConversationId,body});
    } else if (communityReplyTarget) {
      await firebase.app().functions('us-central1').httpsCallable('sendCommunityReply')({parentMessageId:communityReplyTarget.messageId,body,language:communityLanguage()});
      setCommunityReplyTarget(null);
    } else {
      const profile = await db.collection('users').doc(user.uid).get();
      const data = profile.exists ? profile.data() : {};
      const authorName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.username || user.email || 'Utilisateur JWETPRO';
      await db.collection('communityMessages').add({ roomId: communityRoom.id, authorId: user.uid, authorName, authorImageName: data.imageName || '', authorRole: 'user', language: communityLanguage(), body, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
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
  if (!window.firebase || typeof firebase.firestore !== 'function') { communityState(communityText('Le service de messages est indisponible.','Sèvis mesaj la pa disponib.')); return; }
  if (!firebase.apps.length) firebase.initializeApp(communityFirebaseConfig);
  const auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged(user => {
    if (!user || user.isAnonymous) { window.location.href = './index.html#login'; return; }
    loadCommunityMessages();
    loadPrivateConversations(user);
    loadOnlineCount();
    startPresenceHeartbeat();
    scheduleIdleSimulation();
    if(new URLSearchParams(location.search).get('conversation')) switchCommunityView('private');
  });
}
