const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const crypto = require('crypto');
const admin = require('firebase-admin');
const {createAssistantService, callGroqChat, BUILT_IN_KNOWLEDGE, cleanText, detectLanguage, technicalWaitAnswer, countRecentTechnicalWaits} = require('./assistant-core');
const {BOARD_CELLS, isValidBoard, applyMove, chooseBotMove} = require('./mopyon-match-core');
const {createGameState: createDominoGameState, applyAction: applyDominoAction, applyTimeout: applyDominoTimeout, playBotAction: playSingleDominoBotAction, publicState: publicDominoState} = require('./domino-match-core');
const {roundKey:dominoRoundKey,victoryPoints:dominoVictoryPoints,playerLevelName,eliminationCoupon}=require('./domino-rewards-core');
const {starterUidForGame} = require('./match-start-rules');

admin.initializeApp();
const groqApiKey = defineSecret('GROQ_API_KEY');
const smartCutTicketSecret = defineSecret('SMARTCUT_TICKET_INTEGRATION_SECRET');
const rapfiServiceToken = defineSecret('RAPFI_SERVICE_TOKEN');
const RAPFI_SERVICE_URL = 'https://jwetpro-rapfi-307157893690.us-central1.run.app/move';
const db = admin.firestore();
const assistantService = createAssistantService({admin, db});
Object.assign(exports, require('./jwetpro-tickets')({ admin, db, integrationSecret: smartCutTicketSecret }));
Object.assign(exports, require('./jwetpro-sharing')({admin,db}));
Object.assign(exports, require('./social-system')({admin,db}));
const communityPrograms = require('./community-programs')({admin,db});
Object.assign(exports, communityPrograms.functions);

const chooseChampionshipBotMove = async (board, symbol) => {
  try {
    const response = await fetch(RAPFI_SERVICE_URL, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${rapfiServiceToken.value()}`},
      body: JSON.stringify({board, symbol}),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`rapfi-http-${response.status}`);
    const payload = await response.json();
    if (Number.isInteger(payload.move) && board[payload.move] === '') return payload.move;
    throw new Error('rapfi-invalid-move');
  } catch (error) {
    console.error('Rapfi service unavailable; using emergency fallback:', error?.message || error);
    return chooseBotMove(board, symbol);
  }
};
const isAdmin = async (context) => {
  if (!context.auth) return false;
  if (context.auth.token?.admin === true) return true;
  const profile = await admin.firestore().collection('users').doc(context.auth.uid).get();
  return profile.exists && profile.data().role === 'admin';
};

// Server-authoritative championship simulation: deterministic bracket closure,
// bot-vs-bot jobs, replay generation and automatic round progression.
Object.assign(exports, require('./simulation-orchestrator')({admin, db, isAdmin}));

exports.getAdminBootstrapStatus = onCall({region: 'us-central1', cors: true}, async () => {
  const snapshot = await admin.firestore().collection('users').where('role', '==', 'admin').limit(1).get();
  return {available: snapshot.empty};
});

exports.suggestCoordinatorReply = onCall({secrets: [groqApiKey], region: 'us-central1', cors: true}, async (request) => {
  if (!(await isAdmin(request))) throw new HttpsError('permission-denied', 'Administrator access is required.');
  const userId = String(request.data?.userId || '');
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(userId)) throw new HttpsError('invalid-argument', 'A valid user id is required.');

  const db = admin.firestore();
  const profile = await db.collection('users').doc(userId).get();
  if (!profile.exists) throw new HttpsError('not-found', 'User profile not found.');
  const messagesSnapshot = await db.collection('communityMessages').where('roomId', '==', `coordinator_${userId}`).limit(30).get();
  const messages = messagesSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {author: data.authorId === userId ? 'user' : 'coordinator', text: String(data.body || '').slice(0, 2000)};
  }).filter((message) => message.text).slice(-20);
  if (!messages.length) throw new HttpsError('failed-precondition', 'There are no messages to answer.');

  let reply;
  try {
    const {text} = await callGroqChat({
      userPrompt: `Tu t’appelles Jean Estime et tu es l’assistant officiel de JWETPRO, une plateforme haïtienne de championnats de Mopyon et Domino. Rédige une réponse courte, claire, chaleureuse et professionnelle au dernier message de l'utilisateur. Ne promets jamais une action que tu ne peux pas confirmer. Si la question concerne un paiement, un résultat, une sanction ou un litige, indique que le dossier doit être vérifié par l'équipe. Réponds en français, sauf si le dernier message est clairement en kreyòl haïtien. Retourne uniquement le texte de la réponse, sans titre ni guillemets.

Conversation:
${messages.map((message) => `${message.author}: ${message.text}`).join('\n')}`,
      maxTokens: 500
    });
    reply = text.trim();
  } catch (error) {
    console.error('Groq coordinator reply suggestion failed:', error);
    throw new HttpsError('internal', 'Groq request failed.');
  }
  if (!reply) throw new HttpsError('internal', 'Groq returned an empty response.');
  return {reply: reply.slice(0, 2000)};
});

exports.bootstrapAdmin = onCall({region: 'us-central1', cors: ['http://127.0.0.1:5501', 'http://localhost:5501']}, async (request) => {
  const data = request.data || {};
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '');
  const accountName = email.split('@')[0] || 'Administrateur';
  if (!email || !password || password.length < 8) throw new HttpsError('invalid-argument', 'Email and password are required.');
  const db = admin.firestore();
  const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  if (!admins.empty) throw new HttpsError('already-exists', 'An administrator already exists.');
  let user;
  try { user = await admin.auth().createUser({email, password, displayName: accountName}); }
  catch (error) { throw new HttpsError(error.code === 'auth/email-already-exists' ? 'already-exists' : 'invalid-argument', 'Unable to create the administrator account.'); }
  await db.collection('users').doc(user.uid).set({firstName: accountName, lastName: '', username: accountName, email, role:'admin', status:'active', authUid:user.uid, createdAt:admin.firestore.FieldValue.serverTimestamp(), updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  await admin.auth().setCustomUserClaims(user.uid, {admin:true});
  return {uid:user.uid};
});

exports.seedAssistantKnowledge = onCall({region: 'us-central1', cors: true}, async request => {
  if (!(await isAdmin(request))) throw new HttpsError('permission-denied', 'Administrator access is required.');
  const batch = db.batch();
  BUILT_IN_KNOWLEDGE.forEach(item => {
    batch.set(db.collection('assistantKnowledge').doc(item.id), {
      ...item,
      enabled: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid
    }, {merge: true});
  });
  await batch.commit();
  return {count: BUILT_IN_KNOWLEDGE.length};
});

exports.autoReplyToCoordinatorMessage = onDocumentCreated({document:'communityMessages/{messageId}',region:'us-central1',timeoutSeconds:60,retry:false,secrets:[groqApiKey]},async event=>{
  const message=event.data?.data();
  if(!message) return;
  const roomId=String(message.roomId||'');
  const match=roomId.match(/^coordinator_([A-Za-z0-9_-]{1,150})$/);
  if(!match||message.authorRole==='assistant'||message.automated===true) return;
  const userId=match[1];
  if(message.authorId!==userId) return;
  const messageId=event.params.messageId;
  const responseReference=db.collection('communityMessages').doc(`assistant_${messageId}`);
  if((await responseReference.get()).exists) return;
  try {
    const result=await assistantService.answerUserMessage({messageId,message:cleanText(message.body,2000),userId,preferredLanguage:message.language});
    await responseReference.create({roomId,authorId:'jwetpro-assistant',authorName:'Jean Estime',authorImageName:'',authorRole:'assistant',body:result.answer,language:result.language,sourceType:result.sourceType,needsCoordinator:result.needsCoordinator,suggestedActions:result.suggestedActions,knowledgeIds:result.knowledgeIds,isInScope:result.isInScope,conversationTopic:result.conversationTopic,category:result.category,inReplyTo:messageId,automated:true,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  } catch(error) {
    console.error('JWETPRO assistant reply failed:',{messageId,userId,code:error.code||'internal',reason:cleanText(error.message,160)});
    const language=detectLanguage(message.body,message.language);
    if(error.code==='resource-exhausted') {
      const body=language==='ht'?'Ou voye plizyè mesaj byen vit. Fè yon ti tann, tanpri, epi eseye ankò.':'Vous avez envoyé plusieurs messages très rapidement. Patientez un petit moment, puis réessayez.';
      try {await responseReference.create({roomId,authorId:'jwetpro-assistant',authorName:'Jean Estime',authorImageName:'',authorRole:'assistant',body,language,sourceType:'unavailable',needsCoordinator:false,suggestedActions:[],isInScope:true,conversationTopic:'technical',category:'rate-limit',inReplyTo:messageId,automated:true,createdAt:admin.firestore.FieldValue.serverTimestamp()});}
      catch(writeError){if(writeError.code!==6&&writeError.code!=='already-exists')console.error('Assistant unavailable status write failed:',writeError);}
      return;
    }
    try {
      const recentSnapshot=await db.collection('communityMessages').where('roomId','==',roomId).orderBy('createdAt','desc').limit(12).get();
      const previousWaitCount=countRecentTechnicalWaits(recentSnapshot.docs);
      const escalationReference=db.collection('assistantEscalations').doc(userId);
      if(previousWaitCount>=2) {
        await event.data.ref.set({assistantState:'human',assistantEscalatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        await escalationReference.set({userId,status:'open',reason:'assistant-unavailable',sourceMessageId:messageId,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        return;
      }
      const needsCoordinator=previousWaitCount>=1;
      const body=technicalWaitAnswer(language,previousWaitCount);
      await responseReference.create({roomId,authorId:'jwetpro-assistant',authorName:'Jean Estime',authorImageName:'',authorRole:'assistant',body,language,sourceType:'unavailable',needsCoordinator,suggestedActions:[],isInScope:true,conversationTopic:'technical',category:'technical',inReplyTo:messageId,automated:true,createdAt:admin.firestore.FieldValue.serverTimestamp()});
      if(needsCoordinator) await escalationReference.set({userId,assistantMessageId:responseReference.id,status:'open',reason:'assistant-unavailable',sourceMessageId:messageId,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    }
    catch(writeError){if(writeError.code!==6&&writeError.code!=='already-exists')console.error('Assistant unavailable status write failed:',writeError);}
  }
});

const COMMUNITY_ROOM_ID = 'general';
const SIMULATION_VIEWER_WINDOW_MS = 12 * 1000;
const SIMULATION_COOLDOWN_MS = 3 * 60 * 1000;
const SIMULATION_LOCK_TTL_MS = 6 * 60 * 1000;
const SIMULATION_PERSONAS = communityPrograms.personas;
const SIMULATION_SCENARIOS = [
  {id:'quick-hello',topic:'salutations rapides',lines:['Hello 👋','Bonjou!','Koman nou ye?','Nap boule 😊']},
  {id:'mopyon-who-joins',topic:'participants au prochain Mopyon',lines:['Kiyès k ap patisipe nan chanpyona Mopyon an?','Mwen enterese 👀','M ap pratike avan.','Bon chans tout moun!']},
  {id:'need-help',topic:'demande d’aide simple',lines:['Eske nou ka ede m svp?','Wi, kisa w bezwen?','Mwen pa fin konprann kijan match la kòmanse.','Gade gid la, li esplike sa byen 👍']},
  {id:'domino-practice',topic:'entraînement Domino',lines:['Gen moun k ap pratike Domino?','Mwen la 🁣','Ann fè yon ti pati.','Dakò, ban m yon minit.']},
  {id:'mopyon-center',topic:'contrôle du centre au Mopyon',lines:['Sant tablo a enpòtan anpil.','Wi, men pa bliye defans lan.','Se sa ki fè m pèdi souvan 😅','N ap amelyore piti piti.']},
  {id:'good-luck',topic:'encouragement avant les matchs',lines:['Bon chans pou tout moun jodi a 🍀','Mèsi, menm bagay pou ou!','Jwe byen, rete fair-play.','Toujou 🤝']},
  {id:'first-time',topic:'première participation',lines:['Se premye fwa m ap patisipe.','Byenvini nan kominote a!','Pa strese, pran tan w.','Mèsi anpil 🙏']},
  {id:'replay-learning',topic:'apprendre avec les replays',lines:['M sot gade yon replay enteresan.','Ou aprann yon bagay?','Wi, kijan pou bloke pi bonè.','Replay yo itil vre.']},
  {id:'favorite-game',topic:'jeu préféré',lines:['Nou prefere Mopyon oswa Domino?','Mopyon pou mwen.','Domino san diskisyon 😄','Tou de bon!']},
  {id:'short-checkin',topic:'courte prise de nouvelles',lines:['Sak pase ekip?','Tout bagay anfòm.','Nou pare? 🔥','Wi wi!']},
  {id:'defense-tip',topic:'petit conseil de défense',lines:['M toujou bliye bloke katriyèm pyès la.','Eseye gade de liy alafwa.','Bon konsèy sa.','M ap teste l pita.']},
  {id:'domino-double',topic:'discussion sur les doubles au Domino',lines:['Nou renmen kòmanse ak yon doub?','Sa depann de men an.','Mwen konn kenbe yo twò lontan 😅','Mwen menm tou.']},
  {id:'connection-check',topic:'vérification de connexion avant de jouer',lines:['Koneksyon nou anfòm?','Wi, pa gen pwoblèm bò kote m.','Mwen pral teste pa m nan.','Bon lide 👍']},
  {id:'morning-room',topic:'salutation du matin',lines:['Bon maten kominote a ☀️','Bon maten!','Kafe epi pratike 😄','Men wi ☕']},
  {id:'afternoon-room',topic:'courte discussion de l’après-midi',lines:['Bon aprèmidi tout moun.','Bon aprèmidi 👋','Gen match pita?','M ap verifye kalandriye a.']},
  {id:'evening-room',topic:'courte discussion du soir',lines:['Bonswa ekip la 🌙','Bonswa!','Kiyès ki toujou ap pratike?','Mwen la toujou.']},
  {id:'five-in-row',topic:'objectif de cinq symboles alignés',lines:['Senk an liy sanble fasil sèlman 😅','Jiskaske yo bloke w.','Egzakteman!','Se poutèt sa fòk nou prepare de menas.']},
  {id:'friendly-challenge',topic:'petit défi amical',lines:['Kiyès ki vle yon ti defi?','Mwen dispo 🙋','Mopyon?','Wi, ann ale.']},
  {id:'newcomer-welcome',topic:'accueil d’un nouveau membre',lines:['Bonjou, mwen nouvo isit la.','Byenvini! 🎉','Mèsi, kominote a sanble bèl.','Pa ezite poze kesyon.']},
  {id:'patient-play',topic:'importance de la patience',lines:['Mwen remake pasyans enpòtan anpil.','Wi, prese fè erè.','M ap eseye reflechi plis.','Sa ap ede w anpil.']},
  {id:'close-game',topic:'partie très serrée',lines:['M sot fè yon pati ki te sere anpil.','Ou genyen?','Wi, men se te jis jis 😅','Bèl bagay!']},
  {id:'comeback',topic:'retour dans une partie difficile',lines:['Nou janm remonte yon match ki te mal kòmanse?','Wi, fòk ou pa dekouraje.','Yon bon blokaj ka chanje tout bagay.','Se vre 💪']},
  {id:'rules-question',topic:'orientation vers les règles',lines:['Ki kote règ yo ye svp?','Gen yon gid sou sit la.','Mèsi, mwen jwenn li.','Ekselan 👍']},
  {id:'watch-live',topic:'regarder un direct',lines:['Mwen renmen suiv match yo an dirèk.','Sa bay bon lide pou pratike.','Epi gen anpil tansyon 😄','Wi vre!']},
  {id:'emoji-cheer',topic:'encouragement principalement en emoji',lines:['🔥🔥🔥','Ann ale ekip!','💪🏾🎮','Bon jwèt! 🙌']},
  {id:'quiet-room',topic:'relancer calmement un salon silencieux',lines:['Nou trankil anpil la 😄','Tout moun ap pratike petèt.','Mwen t ap gade replay.','Ah dakò 👀']},
  {id:'mobile-play',topic:'jouer depuis un téléphone',lines:['Nou jwe sou telefòn oswa òdinatè?','Telefòn pou mwen 📱','Menm bagay la.','Mwen pi alèz sou òdinatè.']},
  {id:'training-progress',topic:'progrès à l’entraînement',lines:['M santi m ap amelyore.','Sa bon anpil!','Mwen pèdi mwens vit kounye a 😅','Kontinye konsa.']},
  {id:'fair-play',topic:'esprit fair-play',lines:['Respè avan tout bagay 🤝','Wi, genyen oswa pèdi.','Se sa ki fè bon kominote.','Dakò nèt.']},
  {id:'calendar-check',topic:'consulter le calendrier',lines:['M pral gade kalandriye a.','Mwen tou, pou m ka prepare m.','Pa tann dènye moman 😄','Bon rapèl.']},
  {id:'domino-blocked',topic:'partie Domino bloquée',lines:['Lè Domino bloke, nou konte vit?','Mwen toujou pran kèk segond.','Menm bagay la 😅','Pratike ap ede.']},
  {id:'weekend-practice',topic:'entraînement de fin de semaine',lines:['Kiyès k ap pratike wikenn sa?','Mwen gen plan fè kèk pati.','M ap antre tou.','N a wè sou tablo a 👋']},
  {id:'simple-thanks',topic:'remerciement court',lines:['Mèsi pou konsèy la.','Pa gen pwoblèm 😊','Sa te ede m anpil.','Kontan tande sa!']},
  {id:'ready-check',topic:'vérifier si les joueurs sont prêts',lines:['Nou pare ekip?','Pare ✅','M ap vini la.','Nap tann ou 😄']},
  {id:'small-win',topic:'petite satisfaction après entraînement',lines:['Finalman mwen fè yon bèl liy!','Bravo 👏','Pratik la peye.','Sa ban m motivasyon.']},
  {id:'strategy-choice',topic:'attaque ou défense',lines:['Nou plis atak oswa defans?','Defans dabò pou mwen.','Mwen renmen mete presyon 😄','Fòk gen balans.']}
];
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const randomBetween = (min,max) => Math.floor(min + Math.random() * (max - min + 1));
const slugify = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'joueur';
const normalizeSimulationText = value => cleanText(value,300).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const simulationMessageKey = (author,text) => crypto.createHash('sha256').update(`${author}|${normalizeSimulationText(text)}`).digest('hex').slice(0,24);
const communityDayKey = date => {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Port-au-Prince',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const shuffleSimulationItems = items => [...items].sort(() => Math.random() - 0.5);
const pickSimulationPersonas = (usedToday = []) => {
  const count = randomBetween(4,6);
  const alreadyUsed = new Set(usedToday);
  const fresh = shuffleSimulationItems(SIMULATION_PERSONAS.filter(name => !alreadyUsed.has(name)));
  const selected = fresh.slice(0,count);
  if (selected.length < count) {
    selected.push(...shuffleSimulationItems(SIMULATION_PERSONAS.filter(name => !selected.includes(name))).slice(0,count-selected.length));
  }
  return selected;
};
const fallbackSimulationScript = (scenario,personas) => scenario.lines.map((text,index) => ({author:personas[index % personas.length],text}));
const buildSimulationPrompt = (personas,scenario,excludedTexts) => [
  'Génère une courte animation de conversation pour le salon communautaire JWETPRO consacré aux championnats de Mopyon et Domino.',
  'Les personnages sont fictifs. Ne leur attribue aucune identité réelle, expérience vérifiable ou information officielle.',
  `Personnages simulés autorisés: ${personas.join(', ')}. Le champ "author" doit reprendre exactement un de ces noms.`,
  `Sujet imposé pour cette animation: ${scenario.topic}.`,
  'Écris en français ou en kreyòl ayisyen naturel. Ton amical, respectueux et sobre entre passionnés de jeux de table.',
  'Mélange des messages très courts et des phrases brèves. Quelques réponses peuvent contenir surtout des emoji.',
  'Reste général: aucun montant, aucune date, aucun résultat, aucune promesse et aucune information officielle inventée.',
  'Ne réponds à aucun message utilisateur et ne mentionne aucun utilisateur réel. Il s’agit uniquement d’une courte conversation autonome.',
  'Produis entre 5 et 8 messages courts qui s’enchaînent naturellement. Fais intervenir au moins quatre personnages différents.',
  excludedTexts.length ? `N’utilise et ne paraphrase aucun de ces messages déjà employés aujourd’hui: ${excludedTexts.slice(-80).join(' | ')}` : '',
  'Retourne uniquement un objet JSON valide: {"messages":[{"author":"...","text":"..."}]}.'
].filter(Boolean).join('\n');
const hasActiveGroupViewer = async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - SIMULATION_VIEWER_WINDOW_MS);
  const snapshot = await db.collection('communityPresence').where('viewingGroup','==',true).where('lastSeen','>=',cutoff).limit(1).get();
  return !snapshot.empty;
};
const hasRealGroupMessageSince = async afterMillis => {
  const cutoff = admin.firestore.Timestamp.fromMillis(afterMillis);
  const snapshot = await db.collection('communityMessages').where('roomId','==',COMMUNITY_ROOM_ID).where('createdAt','>',cutoff).limit(20).get();
  return snapshot.docs.some(doc => {
    const message = doc.data();
    const isSimulatedMessage = /^simulated_/i.test(String(message.authorId || '')) || message.authorRole === 'simulated';
    return message.authorRole === 'user' && message.automated !== true && !isSimulatedMessage;
  });
};

exports.startCommunitySimulation = onCall({secrets:[groqApiKey],region:'us-central1',cors:true,invoker:'public',timeoutSeconds:300},async request => {
  if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated','Sign-in required.');
  if (!(await hasActiveGroupViewer())) return {started:false,reason:'no-active-viewer'};

  const now = Date.now();
  const requestedObservedSince = Number(request.data?.observedSince);
  const observedSince = Number.isFinite(requestedObservedSince) ? Math.max(now - 60 * 1000,Math.min(requestedObservedSince,now)) : now - 5000;
  const contextHint = cleanText(request.data?.contextHint,40).toLowerCase();
  if (await hasRealGroupMessageSince(observedSince)) return {started:false,reason:'human-conversation'};

  const stateRef = db.collection('communitySimulation').doc('state');
  const today = communityDayKey(new Date(now));
  const lease = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(stateRef);
    const state = snapshot.exists ? snapshot.data() : {};
    const startedAt = state.startedAt?.toMillis ? state.startedAt.toMillis() : 0;
    if (state.active === true && startedAt && now - startedAt < SIMULATION_LOCK_TTL_MS) {
      return {blocked:true,reason:'active',retryAfterMs:Math.max(15000,SIMULATION_LOCK_TTL_MS-(now-startedAt)+5000)};
    }
    const lastEndedAt = state.lastEndedAt?.toMillis ? state.lastEndedAt.toMillis() : 0;
    if (lastEndedAt && now - lastEndedAt < SIMULATION_COOLDOWN_MS) {
      return {blocked:true,reason:'cooldown',retryAfterMs:Math.max(15000,SIMULATION_COOLDOWN_MS-(now-lastEndedAt)+5000)};
    }
    const sameDay = state.dailyKey === today;
    const dailyScenarioIds = sameDay && Array.isArray(state.dailyScenarioIds) ? state.dailyScenarioIds : [];
    const previousDayScenarioIds = sameDay
      ? (Array.isArray(state.previousDayScenarioIds) ? state.previousDayScenarioIds : [])
      : (Array.isArray(state.dailyScenarioIds) ? state.dailyScenarioIds : []);
    const dailyMessageKeys = sameDay && Array.isArray(state.dailyMessageKeys) ? state.dailyMessageKeys : [];
    const dailyMessageTexts = sameDay && Array.isArray(state.dailyMessageTexts) ? state.dailyMessageTexts : [];
    const dailyPersonaNames = sameDay && Array.isArray(state.dailyPersonaNames) ? state.dailyPersonaNames : [];
    const dailyProgramConversationKeys = sameDay && Array.isArray(state.dailyProgramConversationKeys) ? state.dailyProgramConversationKeys : [];
    transaction.set(stateRef,{
      active:true,
      startedAt:admin.firestore.FieldValue.serverTimestamp(),
      startedBy:request.auth.uid,
      dailyKey:today,
      dailyScenarioIds,
      previousDayScenarioIds,
      dailyMessageKeys,
      dailyMessageTexts,
      dailyPersonaNames,
      dailyProgramConversationKeys
    },{merge:true});
    return {dailyScenarioIds,previousDayScenarioIds,dailyMessageKeys,dailyMessageTexts,dailyPersonaNames,dailyProgramConversationKeys};
  });
  if (lease.blocked) return {started:false,reason:lease.reason,retryAfterMs:lease.retryAfterMs};

  const scheduled = await communityPrograms.prepareProgramTimeline(today,lease.dailyProgramConversationKeys,contextHint);
  if (scheduled.programFound) {
    if (!scheduled.timeline.length) {
      await stateRef.set({active:false,lastEndedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      return {started:false,reason:'daily-program-exhausted',sourceDay:scheduled.sourceDay,retryAfterMs:SIMULATION_COOLDOWN_MS+5000};
    }
    await stateRef.set({dailyProgramConversationKeys:admin.firestore.FieldValue.arrayUnion(...scheduled.selectedKeys)},{merge:true});
    const simulationStartedAt = Date.now();
    let messagesPosted = 0;
    let previousOffsetSeconds = 0;
    try {
      for (const line of scheduled.timeline) {
        const waitMs = Math.max(0,(line.offsetSeconds-previousOffsetSeconds)*1000);
        if (waitMs) await sleep(waitMs);
        previousOffsetSeconds = line.offsetSeconds;
        if (!(await hasActiveGroupViewer()) || await hasRealGroupMessageSince(simulationStartedAt)) break;
        try {
          await db.collection('communityMessages').doc(line.documentId).create({
            roomId:COMMUNITY_ROOM_ID,
            authorId:`simulated_${slugify(line.author)}`,
            authorName:line.author,
            authorImageName:'',
            authorRole:'simulated',
            automated:true,
            simulation:true,
            simulationSource:'dashboard-program',
            simulationDay:today,
            programSourceDay:scheduled.sourceDay,
            programRevision:scheduled.revision,
            programConversationId:line.conversationId,
            conversationTitle:line.conversationTitle,
            threadId:line.threadId,
            replyToMessageId:line.replyToMessageId || '',
            ...(line.replyTo ? {replyTo:line.replyTo} : {}),
            body:line.text,
            language:detectLanguage(line.text),
            createdAt:admin.firestore.FieldValue.serverTimestamp()
          });
          messagesPosted += 1;
        } catch (error) {
          if (error.code !== 6 && error.code !== 'already-exists') throw error;
        }
      }
    } finally {
      await stateRef.set({active:false,lastEndedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    }
    return {started:messagesPosted>0,messagesPosted,sourceDay:scheduled.sourceDay,conversationCount:scheduled.selectedKeys.length,retryAfterMs:SIMULATION_COOLDOWN_MS+5000};
  }

  const usedToday = new Set(lease.dailyScenarioIds);
  const usedYesterday = new Set(lease.previousDayScenarioIds);
  const contextualScenarioIds = {
    'live-match': ['watch-live','good-luck','close-game'],
    'championship': ['mopyon-who-joins','calendar-check','good-luck'],
    'domino': ['domino-practice','domino-double','domino-blocked'],
    'mopyon': ['mopyon-who-joins','mopyon-center','defense-tip'],
    'replay': ['replay-learning','close-game','comeback'],
    'welcome': ['first-time','newcomer-welcome','quick-hello']
  };
  const contextualPool = contextualScenarioIds[contextHint];
  let scenarioCandidates = SIMULATION_SCENARIOS.filter(scenario => !usedToday.has(scenario.id) && !usedYesterday.has(scenario.id) && (!contextualPool || contextualPool.includes(scenario.id)));
  if (!scenarioCandidates.length && contextualPool) scenarioCandidates = SIMULATION_SCENARIOS.filter(scenario => !usedToday.has(scenario.id) && contextualPool.includes(scenario.id));
  if (!scenarioCandidates.length) scenarioCandidates = SIMULATION_SCENARIOS.filter(scenario => !usedToday.has(scenario.id));
  const scenario = scenarioCandidates[Math.floor(Math.random() * scenarioCandidates.length)];
  if (!scenario) {
    await stateRef.set({active:false,lastEndedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return {started:false,reason:'daily-scenarios-exhausted'};
  }
  await stateRef.set({dailyScenarioIds:admin.firestore.FieldValue.arrayUnion(scenario.id)},{merge:true});

  const simulationStartedAt = Date.now();
  let messagesPosted = 0;
  try {
    const personas = pickSimulationPersonas(lease.dailyPersonaNames);
    const usedMessageKeys = new Set(lease.dailyMessageKeys);
    const uniqueLines = lines => lines.filter(line => {
      const key = simulationMessageKey(line.author,line.text);
      if (!line.author || !line.text || !personas.includes(line.author) || usedMessageKeys.has(key)) return false;
      usedMessageKeys.add(key);
      return true;
    });
    let script = uniqueLines(fallbackSimulationScript(scenario,personas));
    try {
      const {text} = await callGroqChat({userPrompt:buildSimulationPrompt(personas,scenario,lease.dailyMessageTexts),jsonMode:true,maxTokens:900,temperature:0.85});
      const parsed = JSON.parse(text || '{}').messages;
      const cleaned = uniqueLines(Array.isArray(parsed) ? parsed
        .map(line => ({author:cleanText(line?.author,60),text:cleanText(line?.text,300)}))
        .filter(line => line.author && line.text && personas.includes(line.author))
        .slice(0,8) : []);
      if (cleaned.length >= 5 && new Set(cleaned.map(line => line.author)).size >= 4) script = cleaned;
    } catch (error) { console.error('Community animation generation failed:',error); }

    for (let index = 0; index < script.length; index += 1) {
      if (!(await hasActiveGroupViewer()) || await hasRealGroupMessageSince(simulationStartedAt)) break;
      const line = script[index];
      await db.collection('communityMessages').add({
        roomId:COMMUNITY_ROOM_ID,
        authorId:`simulated_${slugify(line.author)}`,
        authorName:line.author,
        authorImageName:'',
        authorRole:'simulated',
        automated:true,
        simulation:true,
        simulationScenarioId:scenario.id,
        simulationDay:today,
        body:line.text,
        language:detectLanguage(line.text),
        createdAt:admin.firestore.FieldValue.serverTimestamp()
      });
      await stateRef.set({
        dailyMessageKeys:admin.firestore.FieldValue.arrayUnion(simulationMessageKey(line.author,line.text)),
        dailyMessageTexts:admin.firestore.FieldValue.arrayUnion(normalizeSimulationText(line.text)),
        dailyPersonaNames:admin.firestore.FieldValue.arrayUnion(line.author)
      },{merge:true});
      messagesPosted += 1;
      if (index < script.length - 1) await sleep(randomBetween(6000,11000));
    }
  } finally {
    await stateRef.set({active:false,lastEndedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  }
  return {started:messagesPosted > 0,messagesPosted,scenarioId:scenario.id,retryAfterMs:SIMULATION_COOLDOWN_MS+5000};
});

// The official room opens only five minutes before the scheduled start.  The
// server remains authoritative; clients may display a countdown but cannot
// extend this window.
const MATCH_ACCESS_WINDOW_MS = 0;
const OPPONENT_GRACE_PERIOD_MS = 5 * 60 * 1000;
const MOPYON_TURN_MS = 30 * 1000;
const DISCONNECT_GRACE_PERIOD_MS = 60 * 1000;
const MATCH_DURATION_MS = 90 * 60 * 1000;
const DOMINO_OPENING_MS = 5000;
const DOMINO_BOT_MIN_DELAY_MS = 1200;
const DOMINO_BOT_MAX_DELAY_MS = 2200;
const DOMINO_BOT_DRAW_MIN_DELAY_MS = 800;
const DOMINO_BOT_DRAW_MAX_DELAY_MS = 1400;
const DOMINO_HUMAN_TURN_MS = 30000;
const MOPYON_LIVE_STATUSES = new Set(['ongoing', 'live', 'in-progress', 'active']);
const MOPYON_JOINABLE_STATUSES = new Set(['scheduled', 'upcoming', 'registration-closed', 'waiting-opponent', ...MOPYON_LIVE_STATUSES]);

const matchGameIsMopyon = data => /mopyon|morpion|gomoku/i.test(String(data.game || data.type || ''));
const matchGameIsDomino = data => /domino/i.test(String(data.game || data.type || ''));
const timestampMillis = value => value?.toMillis ? value.toMillis() : Number.NaN;
const randomDelay = (minimum, maximum) => Math.floor(minimum + Math.random() * (maximum - minimum + 1));
const dominoBotTiming = (delay, status = 'thinking') => ({
  botStatus:status,
  botReadyAt:admin.firestore.Timestamp.fromMillis(Date.now() + delay)
});
const clearDominoBotTiming = () => ({
  botStatus:admin.firestore.FieldValue.delete(),
  botReadyAt:admin.firestore.FieldValue.delete()
});
const dominoTurnTiming = (state, data, realUid = '') => {
  if(state.winnerId||state.draw||!state.currentTurnUid||isBotParticipant(data,state.currentTurnUid,realUid)) return {turnDeadlineAt:admin.firestore.FieldValue.delete()};
  const existing=timestampMillis(data.turnDeadlineAt);
  const sameTurn=data.currentTurnUid===state.currentTurnUid;
  if(sameTurn&&Number.isFinite(existing)) return {turnDeadlineAt:data.turnDeadlineAt};
  const openingDelay=(Number(state.actionNumber)||0)===0?DOMINO_OPENING_MS:0;
  return {turnDeadlineAt:admin.firestore.Timestamp.fromMillis(Date.now()+openingDelay+DOMINO_HUMAN_TURN_MS)};
};
const participantRecord = (data, uid) => {
  const records = [
    ...[data.participants, data.players].filter(Array.isArray).flat(),
    data.player1,
    data.player2
  ].filter(item => item && typeof item === 'object');
  return records.find(item => item && typeof item === 'object' && [item.uid, item.id, item.userId, item.playerId].includes(uid)) || null;
};
const isBotParticipant = (data, uid, realUid = '') => {
  if (!uid) return false;
  if ([data.botParticipantIds, data.simulatedParticipantIds].some(ids => Array.isArray(ids) && ids.includes(uid))) return true;
  if ([data.botParticipantId, data.simulatedParticipantId].includes(uid)) return true;
  if (['bot', 'simulated', 'simulation'].includes(String(data.participantTypes?.[uid] || '').toLowerCase())) return true;
  const record = participantRecord(data, uid);
  if (record?.real === false) return true;
  if (record?.real === true) return false;
  if (record && (record.isBot === true || record.bot === true || record.simulated === true || record.isSimulation === true || ['bot', 'simulated', 'simulation'].includes(String(record.type || record.role || '').toLowerCase()))) return true;
  return /^(?:bot|sim(?:ulated|ulation)?)[_-]/i.test(uid);
};
const timeoutForfeitUpdates = (winnerId, forfeitedUid) => ({
  status: 'completed',
  winnerId,
  draw: false,
  forfeit: true,
  forfeitReason: 'attendance-timeout',
  completionReason: 'attendance-timeout',
  forfeitedUid,
  currentTurnUid: null,
  completedAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
});
const turnTimeoutForfeitUpdates = (winnerId, forfeitedUid) => ({
  status: 'completed',
  winnerId,
  draw: false,
  forfeit: true,
  forfeitReason: 'turn-timeout',
  completionReason: 'turn-timeout',
  forfeitedUid,
  currentTurnUid: null,
  turnDeadlineAt: admin.firestore.FieldValue.delete(),
  completedAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
});
const doubleAttendanceUpdates = (nextMatchId = '', forfeitedUids = []) => ({
  status: 'completed',
  winnerId: null,
  draw: false,
  forfeit: true,
  forfeitReason: 'double-attendance-timeout',
  completionReason: 'double-attendance-timeout',
  bye: true,
  forfeitedUids: Array.isArray(forfeitedUids) ? forfeitedUids.filter(Boolean) : [],
  byeReason: 'Les deux joueurs étaient absents après cinq minutes; l’adversaire suivant avance par bye.',
  ...(nextMatchId ? {byeNextMatchId: nextMatchId} : {}),
  currentTurnUid: null,
  completedAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
});
const requireMatchParticipant = (data, uid) => {
  const participants = Array.isArray(data.participantIds) ? data.participantIds : [];
  if (participants.length !== 2 || !participants.every(id => typeof id === 'string') || !participants.includes(uid)) {
    throw new HttpsError('permission-denied', 'This match is not assigned to your account.');
  }
  return participants;
};

const participantDisplayName = (data, uid) => {
  const record = participantRecord(data, uid);
  const names = data.participantNames || data.playerNames || {};
  return String(record?.name || record?.displayName || record?.username || names[uid] || 'Joueur');
};

const childGameFields = (series, seriesId, participants, gameId, gameNumber, realUid = '') => {
  const copiedFields = ['participantNames', 'playerNames', 'participantSocialIds', 'participants', 'players', 'player1', 'player2', 'botParticipantIds', 'simulatedParticipantIds', 'botParticipantId', 'simulatedParticipantId', 'participantTypes', 'simulation', 'simulated', 'isSimulation', 'simulationId', 'simulationRunId', 'championshipId', 'tournamentId', 'competitionId', 'championshipName', 'championshipTitle', 'stage', 'round', 'roundLabel', 'phase', 'bracketSlot', 'visibility'];
  const inherited = Object.fromEntries(copiedFields.filter(key => series[key] !== undefined).map(key => [key, series[key]]));
  const firstParticipant = starterUidForGame(participants, gameNumber, seriesId) || (realUid && participants.includes(realUid) ? realUid : participants[0]);
  const secondParticipant = participants.find(uid => uid !== firstParticipant);
  const gameStartAt = admin.firestore.Timestamp.now();
  return {
    ...inherited,
    kind: 'game',
    seriesId,
    game: series.game || series.type || 'mopyon',
    gameNumber,
    number: series.number || '',
    participantIds: participants,
    startAt: gameStartAt,
    attendanceDeadlineAt: admin.firestore.Timestamp.fromMillis(gameStartAt.toMillis() + OPPONENT_GRACE_PERIOD_MS),
    status: 'scheduled',
    board: Array(BOARD_CELLS).fill(''),
    moves: [],
    playerSymbols: {[firstParticipant]: 'X', [secondParticipant]: 'O'},
    currentTurnUid: firstParticipant,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
};

exports.joinMopyonMatch = onCall({region: 'us-central1', cors: true, cpu: 0.5, maxInstances: 1, secrets: [rapfiServiceToken]}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const matchId = String(request.data?.matchId || '');
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(matchId)) throw new HttpsError('invalid-argument', 'A valid match id is required.');

  const requestedReference = db.collection('matches').doc(matchId);
  const preparedGameId = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(requestedReference);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Match not found.');
    const data = snapshot.data();
    const championshipSnapshot = data.championshipId ? await transaction.get(db.collection('championships').doc(String(data.championshipId))) : null;
    const championshipData = championshipSnapshot?.exists ? championshipSnapshot.data() : {};
    if (data.kind !== 'series') return matchId;
    if (!matchGameIsMopyon(data)) throw new HttpsError('failed-precondition', 'This is not a Mopyon match.');
    const participants = requireMatchParticipant(data, request.auth.uid);
    const opponentId = participants.find(id => id !== request.auth.uid);
    const scheduledStart = championshipData.startAt || championshipData.startDate || data.startAt || data.scheduledAt || data.date;
    const scheduledStartMillis = timestampMillis(scheduledStart);
    if (!Number.isFinite(scheduledStartMillis)) throw new HttpsError('failed-precondition', 'The match start time has not been published.');
    if (Date.now() < scheduledStartMillis) throw new HttpsError('failed-precondition', 'The match is not open yet.');
    if (data.winnerId || data.winnerUid || data.draw || String(data.status || '').toLowerCase() === 'completed') throw new HttpsError('failed-precondition', 'This confrontation is already over.');

    const existingGameId = String(data.currentGameId || data.activeGameId || data.gameId || '');
    // Do not create a fresh child manche after the official five-minute window.
    // The scheduler normally resolves this first; this transaction closes the
    // race where a late click arrives before the next scheduler tick.
    if (!existingGameId && Date.now() >= scheduledStartMillis + OPPONENT_GRACE_PERIOD_MS) {
      const botIds = participants.filter(uid => isBotParticipant(data, uid));
      if (botIds.length === 1) {
        const winnerId = botIds[0], forfeitedUid = participants.find(uid => uid !== winnerId);
        transaction.set(requestedReference, {...timeoutForfeitUpdates(winnerId, forfeitedUid), winnerUid: winnerId, winnerName: participantDisplayName(data, winnerId), forfeitedName: participantDisplayName(data, forfeitedUid)}, {merge: true});
      } else if (botIds.length !== 2) {
        transaction.set(requestedReference, doubleAttendanceUpdates('', participants), {merge: true});
      }
      return matchId;
    }

    if (existingGameId) {
      if (!/^[A-Za-z0-9_-]{1,150}$/.test(existingGameId)) throw new HttpsError('data-loss', 'The published game id is invalid.');
      return existingGameId;
    }

    const digest = crypto.createHash('sha256').update(matchId).digest('hex').slice(0, 12);
    const gameId = `${matchId.slice(0, 125)}-g-${digest}`;
    const gameStartAt = data.startAt || data.scheduledAt || data.date;
    if (!gameStartAt) throw new HttpsError('failed-precondition', 'The match start time has not been published.');
    const gameReference = db.collection('matches').doc(gameId);
    const gameSnapshot = await transaction.get(gameReference);
    if (!gameSnapshot.exists) {
      const initialGame = childGameFields(data, matchId, participants, gameId, 1, request.auth.uid);
      transaction.create(gameReference, {...initialGame, startAt: gameStartAt, attendanceDeadlineAt: admin.firestore.Timestamp.fromMillis(timestampMillis(gameStartAt) + OPPONENT_GRACE_PERIOD_MS)});
    }
    transaction.set(requestedReference, {
      currentGameId: gameId,
      activeGameId: gameId,
      status: 'live',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, {merge: true});
    return gameId;
  });

  if (preparedGameId !== matchId) return {matchId: preparedGameId, seriesId: matchId, prepared: true};

  const reference = requestedReference;
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Match not found.');
    const data = snapshot.data();
    if (!matchGameIsMopyon(data)) throw new HttpsError('failed-precondition', 'This is not a Mopyon match.');
    if (data.kind === 'series') throw new HttpsError('failed-precondition', 'This confrontation is not directly joinable yet.');
    const participants = requireMatchParticipant(data, request.auth.uid);
    const status = String(data.status || data.state || 'scheduled').toLowerCase();
    if (!MOPYON_JOINABLE_STATUSES.has(status)) throw new HttpsError('failed-precondition', 'This match is not available.');
    const startAt = data.startAt || data.scheduledAt || data.date;
    const startMillis = timestampMillis(startAt);
    if (!Number.isFinite(startMillis)) throw new HttpsError('failed-precondition', 'The match start time has not been published.');
    const now = Date.now();
    if (now < startMillis) throw new HttpsError('failed-precondition', 'The match is not open yet.');
    if (now > startMillis + MATCH_DURATION_MS && !MOPYON_LIVE_STATUSES.has(status)) throw new HttpsError('failed-precondition', 'The match access window has ended.');

    let board = isValidBoard(data.board) ? data.board : Array(BOARD_CELLS).fill('');
    const storedSymbols = data.playerSymbols && typeof data.playerSymbols === 'object' ? data.playerSymbols : {};
    const playerSymbols = {
      [participants[0]]: ['X', 'O'].includes(storedSymbols[participants[0]]) ? storedSymbols[participants[0]] : 'X',
      [participants[1]]: ['X', 'O'].includes(storedSymbols[participants[1]]) ? storedSymbols[participants[1]] : 'O'
    };
    const presence = data.presence && typeof data.presence === 'object' ? {...data.presence} : {};
    const joinedAt = admin.firestore.Timestamp.now();
    const opponentId = participants.find(id => id !== request.auth.uid);
    const opponentIsBot = isBotParticipant(data, opponentId, request.auth.uid) && !data.presence?.[opponentId];
    const opponentPresenceMillis = timestampMillis(presence[opponentId]);
    const waitingSinceMillis = timestampMillis(data.waitingForOpponentSince);
    const deadlineMillis = timestampMillis(data.attendanceDeadlineAt);
    const derivedDeadlineMillis = Number.isFinite(deadlineMillis)
      ? deadlineMillis
      : Number.isFinite(waitingSinceMillis) ? waitingSinceMillis + OPPONENT_GRACE_PERIOD_MS : Number.NaN;

    // A late second player cannot erase an attendance timeout by checking in after the deadline.
    if (!opponentIsBot && Number.isFinite(opponentPresenceMillis) && Number.isFinite(derivedDeadlineMillis) && now >= derivedDeadlineMillis) {
      transaction.set(reference, timeoutForfeitUpdates(opponentId, request.auth.uid), {merge: true});
      return {matchId, status: 'completed', winnerId: opponentId, forfeit: true, reason: 'attendance-timeout'};
    }

    presence[request.auth.uid] = joinedAt;
    let moves = Array.isArray(data.moves) ? data.moves.slice(-399) : [];
    let currentTurnUid = data.currentTurnUid || participants[0];
    const updates = {
      board,
      moves,
      playerSymbols,
      currentTurnUid,
      presence,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const alreadyPresent = Number.isFinite(timestampMillis(presence[request.auth.uid]));
    if (!alreadyPresent && Number.isFinite(derivedDeadlineMillis) && now >= derivedDeadlineMillis) {
      if (opponentIsBot) {
        transaction.set(reference, timeoutForfeitUpdates(opponentId, request.auth.uid), {merge: true});
        return {matchId, status: 'completed', winnerId: opponentId, forfeit: true, reason: 'attendance-timeout'};
      }
      if (Number.isFinite(opponentPresenceMillis)) {
        transaction.set(reference, timeoutForfeitUpdates(opponentId, request.auth.uid), {merge: true});
        return {matchId, status: 'completed', winnerId: opponentId, forfeit: true, reason: 'attendance-timeout'};
      }
      transaction.set(reference, doubleAttendanceUpdates('', participants), {merge: true});
      return {matchId, status: 'completed', winnerId: null, forfeit: true, reason: 'double-attendance-timeout'};
    }

    if (opponentIsBot) {
      updates.status = 'ongoing';
      updates.botMatch = true;
      updates.botParticipantId = opponentId;
      updates.waitingForOpponentSince = admin.firestore.FieldValue.delete();
      updates.attendanceDeadlineAt = admin.firestore.FieldValue.delete();
      updates.waitingForOpponentUid = admin.firestore.FieldValue.delete();
      if (!data.startedAt) updates.startedAt = admin.firestore.FieldValue.serverTimestamp();

      // If the simulated player has the opening turn, play it immediately so the real player
      // enters an active board instead of waiting for an account that can never authenticate.
      if (currentTurnUid === opponentId && !data.winnerId && !data.draw) {
        const botIndex = await chooseChampionshipBotMove(board, playerSymbols[opponentId]);
        if (botIndex >= 0) {
          const botResult = applyMove(board, botIndex, playerSymbols[opponentId]);
          board = botResult.board;
          moves.push({index: botIndex, symbol: playerSymbols[opponentId], playerId: opponentId, automated: true, createdAt: joinedAt});
          updates.board = board;
          updates.moves = moves;
          updates.winningLine = botResult.winningLine;
          updates.winnerId = botResult.won ? opponentId : null;
          updates.draw = botResult.draw;
          updates.currentTurnUid = botResult.won || botResult.draw ? null : request.auth.uid;
          if (botResult.won || botResult.draw) {
            updates.status = 'completed';
            updates.completedAt = admin.firestore.FieldValue.serverTimestamp();
          }
        }
      }
    } else if (Number.isFinite(opponentPresenceMillis)) {
      updates.status = 'ongoing';
      // A real opponent joining overrides stale bot metadata inherited from a simulation.
      updates.botMatch = false;
      updates.botParticipantId = admin.firestore.FieldValue.delete();
      updates.waitingForOpponentSince = admin.firestore.FieldValue.delete();
      updates.attendanceDeadlineAt = admin.firestore.FieldValue.delete();
      updates.waitingForOpponentUid = admin.firestore.FieldValue.delete();
      if (!data.startedAt) updates.startedAt = admin.firestore.FieldValue.serverTimestamp();
    } else {
      const waitingSince = Number.isFinite(waitingSinceMillis)
        ? data.waitingForOpponentSince
        : Number.isFinite(startMillis) ? admin.firestore.Timestamp.fromMillis(startMillis) : joinedAt;
      const attendanceDeadlineAt = Number.isFinite(deadlineMillis)
        ? data.attendanceDeadlineAt
        : admin.firestore.Timestamp.fromMillis(timestampMillis(waitingSince) + OPPONENT_GRACE_PERIOD_MS);
      updates.status = 'waiting-opponent';
      updates.waitingForOpponentSince = waitingSince;
      updates.attendanceDeadlineAt = attendanceDeadlineAt;
      updates.waitingForOpponentUid = opponentId;
    }

    if (updates.status === 'ongoing' && !updates.winnerId && !updates.draw) {
      const effectiveData = {...data, ...updates};
      const activeTurnUid = updates.currentTurnUid || currentTurnUid;
      if (activeTurnUid && !isBotParticipant(effectiveData, activeTurnUid, request.auth.uid)) {
        const existingTurnDeadline = timestampMillis(data.turnDeadlineAt);
        updates.turnDeadlineAt = data.currentTurnUid === activeTurnUid && Number.isFinite(existingTurnDeadline) && existingTurnDeadline > now
          ? data.turnDeadlineAt
          : admin.firestore.Timestamp.fromMillis(now + MOPYON_TURN_MS);
      } else {
        updates.turnDeadlineAt = admin.firestore.FieldValue.delete();
      }
    }
    transaction.set(reference, updates, {merge: true});
    const responseDeadline = timestampMillis(updates.attendanceDeadlineAt);
    return {matchId, status: updates.status, startsAt: startMillis, attendanceDeadlineAt: Number.isFinite(responseDeadline) ? responseDeadline : null, botMatch: opponentIsBot};
  });
});

exports.submitMopyonMove = onCall({region: 'us-central1', cors: true, secrets: [rapfiServiceToken]}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const matchId = String(request.data?.matchId || '');
  const index = request.data?.index;
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(matchId) || !Number.isInteger(index) || index < 0 || index >= BOARD_CELLS) {
    throw new HttpsError('invalid-argument', 'A valid match and board cell are required.');
  }

  const reference = db.collection('matches').doc(matchId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Match not found.');
    const data = snapshot.data();
    if (!matchGameIsMopyon(data)) throw new HttpsError('failed-precondition', 'This is not a Mopyon match.');
    if (data.kind === 'series') throw new HttpsError('failed-precondition', 'This confrontation is not directly playable.');
    const participants = requireMatchParticipant(data, request.auth.uid);
    const status = String(data.status || data.state || '').toLowerCase();
    if (!MOPYON_LIVE_STATUSES.has(status) || data.winnerId || data.draw) throw new HttpsError('failed-precondition', 'The match is not in progress.');
    if (data.currentTurnUid !== request.auth.uid) throw new HttpsError('failed-precondition', 'It is not your turn.');
    const turnDeadlineMillis = timestampMillis(data.turnDeadlineAt);
    if (Number.isFinite(turnDeadlineMillis) && Date.now() >= turnDeadlineMillis) {
      const timeoutWinnerId = participants.find(uid => uid !== request.auth.uid);
      transaction.set(reference, turnTimeoutForfeitUpdates(timeoutWinnerId, request.auth.uid), {merge: true});
      return {accepted: false, won: false, lost: true, draw: false, forfeit: true, reason: 'turn-timeout'};
    }
    if (!isValidBoard(data.board)) throw new HttpsError('data-loss', 'The official board is invalid.');
    const symbol = data.playerSymbols?.[request.auth.uid] || (participants[0] === request.auth.uid ? 'X' : 'O');

    let result;
    try { result = applyMove(data.board, index, symbol); }
    catch (error) {
      if (error.message === 'occupied-cell') throw new HttpsError('already-exists', 'This cell is already occupied.');
      throw new HttpsError('failed-precondition', 'The move is invalid.');
    }

    const opponentId = participants.find(id => id !== request.auth.uid);
    const opponentIsBot = isBotParticipant(data, opponentId, request.auth.uid) && !data.presence?.[opponentId];
    const moves = Array.isArray(data.moves) ? data.moves.slice(-399) : [];
    moves.push({index, symbol, playerId: request.auth.uid, createdAt: admin.firestore.Timestamp.now()});
    let nextBoard = result.board;
    let winningCells = result.winningLine;
    let winnerId = result.won ? request.auth.uid : null;
    let draw = result.draw;
    let nextTurnUid = result.won || result.draw ? null : opponentId;

    // A simulated opponent answers in the same authoritative transaction. The browser never
    // impersonates the bot and cannot select or alter its move.
    if (opponentIsBot && !winnerId && !draw) {
      const botSymbol = data.playerSymbols?.[opponentId] || (participants[0] === opponentId ? 'X' : 'O');
      const botIndex = await chooseChampionshipBotMove(nextBoard, botSymbol);
      if (botIndex >= 0) {
        const botResult = applyMove(nextBoard, botIndex, botSymbol);
        nextBoard = botResult.board;
        winningCells = botResult.winningLine;
        winnerId = botResult.won ? opponentId : null;
        draw = botResult.draw;
        nextTurnUid = botResult.won || botResult.draw ? null : request.auth.uid;
        moves.push({index: botIndex, symbol: botSymbol, playerId: opponentId, automated: true, createdAt: admin.firestore.Timestamp.now()});
      }
    }
    const updates = {
      board: nextBoard,
      moves,
      currentTurnUid: nextTurnUid,
      winningLine: winningCells,
      winnerId,
      draw,
      status: winnerId || draw ? 'completed' : 'ongoing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (winnerId || draw) {
      updates.completedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.turnDeadlineAt = admin.firestore.FieldValue.delete();
    } else {
      const effectiveData = {...data, ...updates};
      updates.turnDeadlineAt = nextTurnUid && !isBotParticipant(effectiveData, nextTurnUid, request.auth.uid)
        ? admin.firestore.Timestamp.fromMillis(Date.now() + MOPYON_TURN_MS)
        : admin.firestore.FieldValue.delete();
    }
    transaction.update(reference, updates);
    return {accepted: true, won: winnerId === request.auth.uid, lost: winnerId === opponentId, draw};
  });
});

exports.claimMopyonTurnTimeout = onCall({region: 'us-central1', cors: true}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const matchId = String(request.data?.matchId || '');
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(matchId)) throw new HttpsError('invalid-argument', 'A valid match id is required.');
  const reference = db.collection('matches').doc(matchId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Match not found.');
    const data = snapshot.data();
    if (!matchGameIsMopyon(data) || data.kind === 'series') throw new HttpsError('failed-precondition', 'This is not a Mopyon manche.');
    const participants = requireMatchParticipant(data, request.auth.uid);
    const status = String(data.status || data.state || '').toLowerCase();
    if (!MOPYON_LIVE_STATUSES.has(status) || data.winnerId || data.draw) throw new HttpsError('failed-precondition', 'The manche is not active.');
    const currentTurnUid = String(data.currentTurnUid || '');
    if (!currentTurnUid || isBotParticipant(data, currentTurnUid, request.auth.uid)) throw new HttpsError('failed-precondition', 'This turn is controlled by the simulated player.');
    const deadlineMillis = timestampMillis(data.turnDeadlineAt);
    if (!Number.isFinite(deadlineMillis) || Date.now() < deadlineMillis) throw new HttpsError('failed-precondition', 'The 30-second turn period has not elapsed yet.');
    const winnerId = participants.find(uid => uid !== currentTurnUid);
    transaction.set(reference, turnTimeoutForfeitUpdates(winnerId, currentTurnUid), {merge: true});
    return {matchId, winnerId, forfeitedUid: currentTurnUid, forfeit: true, reason: 'turn-timeout'};
  });
});

// A series is the official match; its child game documents are only its manches. Advancing is a
// separate, explicit action so players can read the result before opening the following manche.
// The game id is recorded on the parent in the same transaction, making repeated clicks harmless.
const advanceMopyonSeriesHandler = async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const gameId = String(request.data?.gameId || '');
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(gameId)) throw new HttpsError('invalid-argument', 'A valid game id is required.');

  const gameReference = db.collection('matches').doc(gameId);
  return db.runTransaction(async transaction => {
    const gameSnapshot = await transaction.get(gameReference);
    if (!gameSnapshot.exists) throw new HttpsError('not-found', 'Game not found.');
    const game = gameSnapshot.data();
    if (!matchGameIsMopyon(game) || game.kind === 'series') throw new HttpsError('failed-precondition', 'This is not a Mopyon manche.');
    const participants = requireMatchParticipant(game, request.auth.uid);
    if (!game.winnerId && game.draw !== true) throw new HttpsError('failed-precondition', 'This manche is not over.');
    const seriesId = String(game.seriesId || '');
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(seriesId)) throw new HttpsError('failed-precondition', 'This manche is not attached to a match series.');

    const seriesReference = db.collection('matches').doc(seriesId);
    const seriesSnapshot = await transaction.get(seriesReference);
    if (!seriesSnapshot.exists) throw new HttpsError('not-found', 'Series not found.');
    const series = seriesSnapshot.data();
    const seriesParticipants = requireMatchParticipant(series, request.auth.uid);
    if (!participants.every(uid => seriesParticipants.includes(uid))) throw new HttpsError('data-loss', 'The manche participants do not match the series.');

    const recordedGameIds = Array.isArray(series.gameIds) ? series.gameIds.filter(id => typeof id === 'string') : [];
    const alreadyRecorded = recordedGameIds.includes(gameId);
    const score = {
      p1: Math.max(0, Number(series.seriesScore?.p1) || 0),
      p2: Math.max(0, Number(series.seriesScore?.p2) || 0)
    };
    if (!alreadyRecorded && game.winnerId === seriesParticipants[0]) score.p1 += 1;
    if (!alreadyRecorded && game.winnerId === seriesParticipants[1]) score.p2 += 1;
    // Missing the opening manche forfeits the whole confrontation. After a
    // player has already entered the series, a five-minute miss only loses
    // that manche; the best-of-three score decides whether play continues.
    const openingAttendanceForfeit = (game.forfeitReason === 'attendance-timeout' || game.completionReason === 'attendance-timeout') && Number(game.gameNumber || 1) <= 1;
    if (openingAttendanceForfeit && game.winnerId === seriesParticipants[0]) score.p1 = Math.max(2, score.p1);
    if (openingAttendanceForfeit && game.winnerId === seriesParticipants[1]) score.p2 = Math.max(2, score.p2);
    const gameIds = alreadyRecorded ? recordedGameIds : [...recordedGameIds, gameId];
    const winnerUid = score.p1 >= 2 ? seriesParticipants[0] : score.p2 >= 2 ? seriesParticipants[1] : '';
    const seriesAlreadyComplete = Boolean(series.winnerUid || series.winnerId) || String(series.status || '').toLowerCase() === 'completed';

    if (winnerUid || seriesAlreadyComplete) {
      const officialWinnerUid = String(series.winnerUid || series.winnerId || winnerUid);
      const winnerName = participantDisplayName(series, officialWinnerUid);
      if (!seriesAlreadyComplete || !alreadyRecorded) {
        const attendanceForfeit = openingAttendanceForfeit;
        const forfeitedUid = attendanceForfeit ? String(game.forfeitedUid || seriesParticipants.find(uid => uid !== officialWinnerUid) || '') : '';
        transaction.set(seriesReference, {
          gameIds,
          seriesScore: score,
          status: 'completed',
          winnerUid: officialWinnerUid,
          winnerId: officialWinnerUid,
          winnerName,
          ...(attendanceForfeit ? {forfeit: true, forfeitReason: 'attendance-timeout', completionReason: 'attendance-timeout', forfeitedUid, forfeitedName: participantDisplayName(series, forfeitedUid)} : {}),
          currentGameId: null,
          activeGameId: null,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, {merge: true});
      }
      return {seriesId, seriesComplete: true, nextGameId: null, seriesScore: score, winnerUid: officialWinnerUid, winnerName};
    }

    const publishedCurrentGameId = String(series.currentGameId || series.activeGameId || '');
    if (alreadyRecorded && publishedCurrentGameId && publishedCurrentGameId !== gameId) {
      return {seriesId, seriesComplete: false, nextGameId: publishedCurrentGameId, seriesScore: score, winnerUid: null};
    }

    const nextGameNumber = gameIds.length + 1;
    const nextGameId = `${seriesId.slice(0, 142)}-g${nextGameNumber}`;
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(nextGameId)) throw new HttpsError('data-loss', 'The next game id is invalid.');
    const nextGameReference = db.collection('matches').doc(nextGameId);
    const nextGameSnapshot = await transaction.get(nextGameReference);
    if (!nextGameSnapshot.exists) {
      const botParticipants = seriesParticipants.filter(uid => isBotParticipant(series, uid, request.auth.uid));
      const soleRealParticipant = botParticipants.length === 1 ? seriesParticipants.find(uid => !botParticipants.includes(uid)) : '';
      transaction.create(nextGameReference, childGameFields(series, seriesId, seriesParticipants, nextGameId, nextGameNumber, soleRealParticipant));
    }
    transaction.set(seriesReference, {
      gameIds,
      seriesScore: score,
      status: 'live',
      currentGameId: nextGameId,
      activeGameId: nextGameId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, {merge: true});
    return {seriesId, seriesComplete: false, nextGameId, seriesScore: score, winnerUid: null};
  });
};
exports.advanceMopyonSeries = onCall({region: 'us-central1', cors: true}, advanceMopyonSeriesHandler);

exports.autoAdvanceCompletedMopyonGame = onDocumentWritten({
  document:'matches/{matchId}',
  region:'us-central1',
  retry:true
}, async event => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after || after.kind === 'series' || !matchGameIsMopyon(after) || !after.seriesId) return;
  const completed = Boolean(after.winnerId) || after.draw === true;
  const doubleForfeit = after.forfeitReason === 'double-attendance-timeout' || after.completionReason === 'double-attendance-timeout';
  const wasCompleted = Boolean(before?.winnerId) || before?.draw === true || before?.forfeitReason === 'double-attendance-timeout';
  if ((!completed && !doubleForfeit) || wasCompleted) return;
  if (doubleForfeit) {
    await db.collection('matches').doc(String(after.seriesId)).set({status:'completed',winnerId:null,winnerUid:null,forfeit:true,forfeitReason:'double-attendance-timeout',completionReason:'double-attendance-timeout',forfeitedUids:Array.isArray(after.participantIds) ? after.participantIds : [],bye:true,byeReason:'Les deux joueurs étaient absents après cinq minutes.',seriesScore:{p1:0,p2:0},gameIds:admin.firestore.FieldValue.arrayUnion(event.params.matchId),currentGameId:null,activeGameId:null,completedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return;
  }
  const participants = Array.isArray(after.participantIds) ? after.participantIds.filter(uid => typeof uid === 'string') : [];
  if (participants.length !== 2) return;
  const actorUid = participants.find(uid => !isBotParticipant(after, uid, participants.find(other => other !== uid) || '')) || participants[0];
  await advanceMopyonSeriesHandler({data:{gameId:event.params.matchId},auth:{uid:actorUid}});
});
const dominoStateReference = matchId => db.collection('dominoMatchStates').doc(matchId);
const publicDominoEvents = events => events.map(event => {
  const visible = {type:event.type, playerId:event.playerId, actionNumber:event.actionNumber, automated:event.automated === true};
  if (event.type === 'play') Object.assign(visible, {tile:event.tile, tileId:event.tileId, side:event.side, boardAfter:event.boardAfter});
  return visible;
});
const dominoMatchUpdates = state => ({
  ...publicDominoState(state),
  board:state.boardTiles,
  // Older dashboard simulations stored the full hands and draw pile on the public match.
  // Every authoritative write also removes those legacy fields so only the server-side
  // dominoMatchStates document can contain private information.
  hands:admin.firestore.FieldValue.delete(),
  drawPile:admin.firestore.FieldValue.delete(),
  passStreak:admin.firestore.FieldValue.delete(),
  status:state.winnerId || state.draw ? 'completed' : 'ongoing',
  updatedAt:admin.firestore.FieldValue.serverTimestamp()
});
const dominoChildGameFields = (series, seriesId, participants, gameNumber, state, startAt) => {
  const copiedFields = ['participantNames','playerNames','participantSocialIds','participants','players','player1','player2','botParticipantIds','simulatedParticipantIds','botParticipantId','simulatedParticipantId','participantTypes','simulation','simulated','isSimulation','simulationId','simulationRunId','championshipId','tournamentId','competitionId','championshipName','championshipTitle','stage','round','roundLabel','phase','bracketSlot','visibility'];
  const inherited = Object.fromEntries(copiedFields.filter(key => series[key] !== undefined).map(key => [key,series[key]]));
  return {
    ...inherited,
    kind:'game',seriesId,seriesFormat:'bo3',game:'domino',type:'domino',gameNumber,
    number:series.number || '',participantIds:participants,startAt,
    attendanceDeadlineAt: admin.firestore.Timestamp.fromMillis(timestampMillis(startAt) + OPPONENT_GRACE_PERIOD_MS),
    status:'scheduled',presence:{},moves:[],...publicDominoState(state),board:[],
    createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()
  };
};

const createDominoGameInTransaction = async (transaction, seriesReference, series, gameId, gameNumber, startAt) => {
  const participants = Array.isArray(series.participantIds) ? series.participantIds : [];
  if (participants.length !== 2) throw new HttpsError('data-loss','The Domino series participants are invalid.');
  const gameReference = db.collection('matches').doc(gameId);
  const stateReference = dominoStateReference(gameId);
  const [gameSnapshot,stateSnapshot] = await Promise.all([transaction.get(gameReference),transaction.get(stateReference)]);
  if (!gameSnapshot.exists || !stateSnapshot.exists) {
    const state = createDominoGameState(participants, Math.random, starterUidForGame(participants, gameNumber, seriesReference.id));
    if (!gameSnapshot.exists) {
      transaction.create(gameReference,dominoChildGameFields(series,seriesReference.id,participants,gameNumber,state,startAt));
    } else {
      // A legacy Domino game may already exist without a private state document. Restart
      // that unpublished/incomplete manche from a clean authoritative deal and remove the
      // hands that the former dashboard schema exposed on the public document.
      transaction.set(gameReference,{
        ...dominoMatchUpdates(state),
        status:'scheduled',moves:[],startedAt:admin.firestore.FieldValue.delete(),
        completedAt:admin.firestore.FieldValue.delete(),presence:{},startAt
      },{merge:true});
    }
    if (!stateSnapshot.exists) transaction.create(stateReference,{...state,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  } else {
    transaction.set(gameReference,{hands:admin.firestore.FieldValue.delete(),drawPile:admin.firestore.FieldValue.delete(),passStreak:admin.firestore.FieldValue.delete()},{merge:true});
  }
  transaction.set(seriesReference,{currentGameId:gameId,activeGameId:gameId,status:'live',updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  return gameId;
};

exports.prepareDominoSimulationGame = onCall({region:'us-central1',cors:true},async request => {
  if (!(await isAdmin(request))) throw new HttpsError('permission-denied','Administrator access is required.');
  const seriesId=String(request.data?.seriesId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(seriesId)) throw new HttpsError('invalid-argument','A valid series id is required.');
  const seriesReference=db.collection('matches').doc(seriesId);
  const gameId=await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(seriesReference);
    if(!snapshot.exists) throw new HttpsError('not-found','Series not found.');
    const series=snapshot.data();
    if(series.kind!=='series'||!matchGameIsDomino(series)) throw new HttpsError('failed-precondition','This is not a Domino series.');
    const existing=String(series.currentGameId||series.activeGameId||'');
    if(existing){
      const gameNumber=Math.max(1,(Array.isArray(series.gameIds)?series.gameIds.length:0)+1);
      await createDominoGameInTransaction(transaction,seriesReference,series,existing,gameNumber,admin.firestore.Timestamp.now());
      return existing;
    }
    const gameNumber=(Array.isArray(series.gameIds)?series.gameIds.length:0)+1;
    const gameId=`${seriesId.slice(0,142)}-g${gameNumber}`;
    const preparedId=await createDominoGameInTransaction(transaction,seriesReference,series,gameId,gameNumber,admin.firestore.Timestamp.now());
    const realCount=(Array.isArray(series.participantIds)?series.participantIds:[]).filter(uid=>participantRecord(series,uid)?.real===true).length;
    if(realCount===0) transaction.set(db.collection('matches').doc(preparedId),{status:'ongoing',startedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return preparedId;
  });
  return {matchId:gameId,seriesId};
});

exports.deleteDominoSimulationStates = onCall({region:'us-central1',cors:true},async request=>{
  if(!(await isAdmin(request))) throw new HttpsError('permission-denied','Administrator access is required.');
  const simulationRunId=String(request.data?.simulationRunId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(simulationRunId)) throw new HttpsError('invalid-argument','A valid simulation id is required.');
  const matches=await db.collection('matches').where('simulationRunId','==',simulationRunId).get();
  const dominoGames=matches.docs.filter(document=>document.data().kind!=='series'&&matchGameIsDomino(document.data()));
  for(let offset=0;offset<dominoGames.length;offset+=450){const batch=db.batch();dominoGames.slice(offset,offset+450).forEach(document=>batch.delete(dominoStateReference(document.id)));await batch.commit();}
  return {deleted:dominoGames.length};
});

exports.joinDominoMatch = onCall({region:'us-central1',cors:true},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Authentication is required.');
  const requestedId=String(request.data?.matchId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(requestedId)) throw new HttpsError('invalid-argument','A valid match id is required.');
  const requestedReference=db.collection('matches').doc(requestedId);
  const preparedId=await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(requestedReference);
    if(!snapshot.exists) throw new HttpsError('not-found','Match not found.');
    const series=snapshot.data();
    const championshipSnapshot=series.championshipId?await transaction.get(db.collection('championships').doc(String(series.championshipId))):null;
    const championshipData=championshipSnapshot?.exists?championshipSnapshot.data():{};
    if(series.kind!=='series') return requestedId;
    if(!matchGameIsDomino(series)) throw new HttpsError('failed-precondition','This is not a Domino match.');
    const participants=requireMatchParticipant(series,request.auth.uid);
    const scheduledStart=championshipData.startAt||championshipData.startDate||series.startAt||series.scheduledAt||series.date;
    const scheduledStartMillis=timestampMillis(scheduledStart);
    if(!Number.isFinite(scheduledStartMillis)) throw new HttpsError('failed-precondition','The match start time has not been published.');
    if(Date.now()<scheduledStartMillis) throw new HttpsError('failed-precondition','The match is not open yet.');
    if(series.winnerId||series.winnerUid||String(series.status||'').toLowerCase()==='completed') throw new HttpsError('failed-precondition','This confrontation is already over.');
    const existing=String(series.currentGameId||series.activeGameId||'');
    if(!existing&&Date.now()>=scheduledStartMillis+OPPONENT_GRACE_PERIOD_MS){
      const botIds=participants.filter(uid=>isBotParticipant(series,uid));
      if(botIds.length===1){const winnerId=botIds[0],forfeitedUid=participants.find(uid=>uid!==winnerId);transaction.set(requestedReference,{...timeoutForfeitUpdates(winnerId,forfeitedUid),winnerUid:winnerId,winnerName:participantDisplayName(series,winnerId),forfeitedName:participantDisplayName(series,forfeitedUid)},{merge:true});}
      else if(botIds.length!==2) transaction.set(requestedReference,doubleAttendanceUpdates('',participants),{merge:true});
      return requestedId;
    }
    if(existing){
      const gameNumber=Math.max(1,(Array.isArray(series.gameIds)?series.gameIds.length:0)+1);
      const startAt=series.startAt||series.scheduledAt||series.date||admin.firestore.Timestamp.now();
      await createDominoGameInTransaction(transaction,requestedReference,series,existing,gameNumber,startAt);
      return existing;
    }
    const gameNumber=(Array.isArray(series.gameIds)?series.gameIds.length:0)+1;
    const gameId=`${requestedId.slice(0,142)}-g${gameNumber}`;
    const startAt=series.startAt||series.scheduledAt||series.date;
    if(!startAt) throw new HttpsError('failed-precondition','The match start time has not been published.');
    await createDominoGameInTransaction(transaction,requestedReference,series,gameId,gameNumber,startAt);
    return gameId;
  });

  const gameReference=db.collection('matches').doc(preparedId);
  const stateReference=dominoStateReference(preparedId);
  const response=await db.runTransaction(async transaction=>{
    const [gameSnapshot,stateSnapshot]=await Promise.all([transaction.get(gameReference),transaction.get(stateReference)]);
    if(!gameSnapshot.exists) throw new HttpsError('not-found','Domino game not found.');
    const data=gameSnapshot.data();
    if(!matchGameIsDomino(data)||data.kind==='series') throw new HttpsError('failed-precondition','This is not a playable Domino game.');
    const participants=requireMatchParticipant(data,request.auth.uid);
    const status=String(data.status||'scheduled').toLowerCase();
    if(!MOPYON_JOINABLE_STATUSES.has(status)) throw new HttpsError('failed-precondition','This match is not available.');
    const startMillis=timestampMillis(data.startAt||data.scheduledAt||data.date);
    if(!Number.isFinite(startMillis)) throw new HttpsError('failed-precondition','The match start time has not been published.');
    const now=Date.now();
    if(now<startMillis) throw new HttpsError('failed-precondition','The match is not open yet.');
    if(now>startMillis+MATCH_DURATION_MS&&!MOPYON_LIVE_STATUSES.has(status)) throw new HttpsError('failed-precondition','The match access window has ended.');
    const stateWasCreated=!stateSnapshot.exists;
    let state=stateWasCreated?createDominoGameState(participants):stateSnapshot.data();
    const presence=data.presence&&typeof data.presence==='object'?{...data.presence}:{};
    const joinedAt=admin.firestore.Timestamp.now();
    const opponentId=participants.find(uid=>uid!==request.auth.uid);
    const opponentIsBot=isBotParticipant(data,opponentId,request.auth.uid) && !presence[opponentId];
    const opponentPresenceMillis=timestampMillis(presence[opponentId]);
    const waitingSinceMillis=timestampMillis(data.waitingForOpponentSince);
    const deadlineMillis=timestampMillis(data.attendanceDeadlineAt);
    const derivedDeadline=Number.isFinite(deadlineMillis)?deadlineMillis:Number.isFinite(waitingSinceMillis)?waitingSinceMillis+OPPONENT_GRACE_PERIOD_MS:Number.NaN;
    const alreadyPresent=Number.isFinite(timestampMillis(presence[request.auth.uid]));
    if(!alreadyPresent&&Number.isFinite(derivedDeadline)&&now>=derivedDeadline){
      if(opponentIsBot||Number.isFinite(opponentPresenceMillis)){
        transaction.set(gameReference,timeoutForfeitUpdates(opponentId,request.auth.uid),{merge:true});
        return {matchId:preparedId,seriesId:data.seriesId||'',status:'completed',winnerId:opponentId,forfeit:true};
      }
      transaction.set(gameReference,doubleAttendanceUpdates('',participants),{merge:true});
      return {matchId:preparedId,seriesId:data.seriesId||'',status:'completed',winnerId:null,forfeit:true,reason:'double-attendance-timeout'};
    }
    presence[request.auth.uid]=joinedAt;
    const updates={presence,updatedAt:admin.firestore.FieldValue.serverTimestamp(),hands:admin.firestore.FieldValue.delete(),drawPile:admin.firestore.FieldValue.delete(),passStreak:admin.firestore.FieldValue.delete()};
    if(opponentIsBot){
      updates.status='ongoing';updates.botMatch=true;updates.botParticipantId=opponentId;
      updates.waitingForOpponentSince=admin.firestore.FieldValue.delete();updates.attendanceDeadlineAt=admin.firestore.FieldValue.delete();updates.waitingForOpponentUid=admin.firestore.FieldValue.delete();
      if(!data.startedAt) updates.startedAt=admin.firestore.FieldValue.serverTimestamp();
      if(state.currentTurnUid===opponentId&&!state.winnerId&&!state.draw){
        const existingReadyAt=timestampMillis(data.botReadyAt);
        Object.assign(updates,Number.isFinite(existingReadyAt)
          ? {botStatus:data.botStatus||'opening',botReadyAt:data.botReadyAt}
          : dominoBotTiming((Number(state.actionNumber)||0)===0?DOMINO_OPENING_MS+randomDelay(DOMINO_BOT_MIN_DELAY_MS,DOMINO_BOT_MAX_DELAY_MS):randomDelay(DOMINO_BOT_MIN_DELAY_MS,DOMINO_BOT_MAX_DELAY_MS),(Number(state.actionNumber)||0)===0?'opening':'thinking'));
      }else Object.assign(updates,clearDominoBotTiming());
    }else if(Number.isFinite(opponentPresenceMillis)){
      updates.status='ongoing';updates.waitingForOpponentSince=admin.firestore.FieldValue.delete();updates.attendanceDeadlineAt=admin.firestore.FieldValue.delete();updates.waitingForOpponentUid=admin.firestore.FieldValue.delete();
      if(!data.startedAt) updates.startedAt=admin.firestore.FieldValue.serverTimestamp();
    }else{
      const waitingSince=Number.isFinite(waitingSinceMillis)?data.waitingForOpponentSince:Number.isFinite(startMillis)?admin.firestore.Timestamp.fromMillis(startMillis):joinedAt;
      updates.status='waiting-opponent';updates.waitingForOpponentSince=waitingSince;updates.attendanceDeadlineAt=Number.isFinite(deadlineMillis)?data.attendanceDeadlineAt:admin.firestore.Timestamp.fromMillis(timestampMillis(waitingSince)+OPPONENT_GRACE_PERIOD_MS);updates.waitingForOpponentUid=opponentId;
    }
    Object.assign(updates,publicDominoState(state),{board:state.boardTiles});
    Object.assign(updates,dominoTurnTiming(state,data,request.auth.uid));
    if(state.winnerId||state.draw){updates.status='completed';updates.completedAt=admin.firestore.FieldValue.serverTimestamp();}
    transaction.set(stateReference,{...state,...(stateWasCreated?{createdAt:admin.firestore.FieldValue.serverTimestamp()}:{}),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    transaction.set(gameReference,updates,{merge:true});
    return {matchId:preparedId,seriesId:data.seriesId||'',status:updates.status,attendanceDeadlineAt:timestampMillis(updates.attendanceDeadlineAt)||null,botMatch:opponentIsBot};
  });
  return {...response,prepared:preparedId!==requestedId};
});

exports.getDominoMatchState = onCall({region:'us-central1',cors:true},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Authentication is required.');
  const matchId=String(request.data?.matchId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(matchId)) throw new HttpsError('invalid-argument','A valid match id is required.');
  const [matchSnapshot,stateSnapshot,adminAccess]=await Promise.all([db.collection('matches').doc(matchId).get(),dominoStateReference(matchId).get(),isAdmin(request)]);
  if(!matchSnapshot.exists||!stateSnapshot.exists) throw new HttpsError('not-found','Domino game state not found.');
  const data=matchSnapshot.data();
  const participants=Array.isArray(data.participantIds)?data.participantIds:[];
  if(!adminAccess&&!participants.includes(request.auth.uid)) throw new HttpsError('permission-denied','This match is not assigned to your account.');
  const state=stateSnapshot.data();
  const includeAll=adminAccess&&request.data?.includeAllHands===true;
  return {matchId,hand:includeAll?null:(state.hands?.[request.auth.uid]||[]),hands:includeAll?state.hands:undefined,drawPile:includeAll?state.drawPile:undefined,passStreak:includeAll?state.passStreak:undefined,playable:true};
});

exports.submitDominoMove = onCall({region:'us-central1',cors:true},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Authentication is required.');
  const matchId=String(request.data?.matchId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(matchId)) throw new HttpsError('invalid-argument','A valid match id is required.');
  const adminAccess=await isAdmin(request);
  const gameReference=db.collection('matches').doc(matchId);
  const stateReference=dominoStateReference(matchId);
  return db.runTransaction(async transaction=>{
    const [gameSnapshot,stateSnapshot]=await Promise.all([transaction.get(gameReference),transaction.get(stateReference)]);
    if(!gameSnapshot.exists||!stateSnapshot.exists) throw new HttpsError('not-found','Domino game state not found.');
    const data=gameSnapshot.data();
    if(!matchGameIsDomino(data)||data.kind==='series') throw new HttpsError('failed-precondition','This is not a playable Domino game.');
    const participants=Array.isArray(data.participantIds)?data.participantIds:[];
    const actingUid=adminAccess?String(request.data?.playerId||stateSnapshot.data().currentTurnUid||''):request.auth.uid;
    if(!adminAccess&&!participants.includes(actingUid)) throw new HttpsError('permission-denied','This match is not assigned to your account.');
    if(!participants.includes(actingUid)) throw new HttpsError('invalid-argument','The active Domino player is invalid.');
    const status=String(data.status||'').toLowerCase();
    if(!MOPYON_LIVE_STATUSES.has(status)||data.winnerId||data.draw) throw new HttpsError('failed-precondition','The match is not in progress.');
    const currentActionNumber=Math.max(0,Number(stateSnapshot.data().actionNumber)||0);
    const expectedActionNumber=Number(request.data?.expectedActionNumber);
    if(!adminAccess&&(!Number.isInteger(expectedActionNumber)||expectedActionNumber!==currentActionNumber)) throw new HttpsError('aborted','The Domino board changed. Please retry from the latest state.');
    const actionType=String(request.data?.action||'');
    let result;
    try{
      if(actionType==='timeout'){
        const deadline=timestampMillis(data.turnDeadlineAt);
        if(!Number.isFinite(deadline)||Date.now()<deadline) throw new Error('timeout-not-reached');
        result=applyDominoTimeout(stateSnapshot.data(),actingUid);
      }else result=applyDominoAction(stateSnapshot.data(),actingUid,{type:actionType,tileId:String(request.data?.tileId||''),side:String(request.data?.side||''),drawIndex:Number(request.data?.drawIndex)});
    }
    catch(error){throw new HttpsError('failed-precondition',`Domino action refused: ${error.message}`);}
    const state=result.state;
    const events=[result.event];
    const opponentId=participants.find(uid=>uid!==actingUid);
    const updates={...dominoMatchUpdates(state),moves:admin.firestore.FieldValue.arrayUnion(...publicDominoEvents(events))};
    if(state.currentTurnUid===opponentId&&isBotParticipant(data,opponentId,actingUid)&&!state.winnerId&&!state.draw){
      Object.assign(updates,dominoBotTiming(randomDelay(DOMINO_BOT_MIN_DELAY_MS,DOMINO_BOT_MAX_DELAY_MS)));
    }else Object.assign(updates,clearDominoBotTiming());
    Object.assign(updates,dominoTurnTiming(state,data,actingUid));
    if(state.winnerId||state.draw) updates.completedAt=admin.firestore.FieldValue.serverTimestamp();
    transaction.set(stateReference,{...state,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    transaction.set(gameReference,updates,{merge:true});
    return {accepted:true,actionNumber:state.actionNumber,winnerId:state.winnerId||null,won:state.winnerId===actingUid,draw:state.draw,handCount:state.hands[actingUid].length,hand:state.hands[actingUid],state:publicDominoState(state)};
  });
});

exports.performDominoBotAction = onCall({region:'us-central1',cors:true},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Authentication is required.');
  const matchId=String(request.data?.matchId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(matchId)) throw new HttpsError('invalid-argument','A valid match id is required.');
  const expectedActionNumber=Number(request.data?.expectedActionNumber);
  if(!Number.isInteger(expectedActionNumber)||expectedActionNumber<0) throw new HttpsError('invalid-argument','The expected Domino action number is required.');
  const gameReference=db.collection('matches').doc(matchId);
  const stateReference=dominoStateReference(matchId);
  return db.runTransaction(async transaction=>{
    const [gameSnapshot,stateSnapshot]=await Promise.all([transaction.get(gameReference),transaction.get(stateReference)]);
    if(!gameSnapshot.exists||!stateSnapshot.exists) throw new HttpsError('not-found','Domino game state not found.');
    const data=gameSnapshot.data();
    const participants=requireMatchParticipant(data,request.auth.uid);
    if(!matchGameIsDomino(data)||data.kind==='series'||!MOPYON_LIVE_STATUSES.has(String(data.status||'').toLowerCase())) throw new HttpsError('failed-precondition','This Domino game is not active.');
    const botUid=participants.find(uid=>uid!==request.auth.uid);
    if(!isBotParticipant(data,botUid,request.auth.uid)) throw new HttpsError('failed-precondition','This match has no simulated opponent.');
    const state=stateSnapshot.data();
    if((Number(state.actionNumber)||0)!==expectedActionNumber) throw new HttpsError('aborted','The Domino board changed.');
    if(state.currentTurnUid!==botUid||state.winnerId||state.draw) throw new HttpsError('failed-precondition','It is not the simulated opponent turn.');
    const readyAt=timestampMillis(data.botReadyAt);
    if(!Number.isFinite(readyAt)||Date.now()<readyAt) throw new HttpsError('failed-precondition','The simulated opponent is still thinking.');
    let result;
    try{result=playSingleDominoBotAction(state,botUid);}
    catch(error){throw new HttpsError('failed-precondition',`Domino bot action refused: ${error.message}`);}
    const nextState=result.state;
    const updates={...dominoMatchUpdates(nextState),moves:admin.firestore.FieldValue.arrayUnion(...publicDominoEvents([result.event]))};
    if(nextState.currentTurnUid===botUid&&!nextState.winnerId&&!nextState.draw){
      Object.assign(updates,dominoBotTiming(randomDelay(DOMINO_BOT_DRAW_MIN_DELAY_MS,DOMINO_BOT_DRAW_MAX_DELAY_MS),'drawing'));
    }else Object.assign(updates,clearDominoBotTiming());
    Object.assign(updates,dominoTurnTiming(nextState,data,request.auth.uid));
    if(nextState.winnerId||nextState.draw) updates.completedAt=admin.firestore.FieldValue.serverTimestamp();
    transaction.set(stateReference,{...nextState,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    transaction.set(gameReference,updates,{merge:true});
    return {accepted:true,actionNumber:nextState.actionNumber,eventType:result.event.type,winnerId:nextState.winnerId||null,draw:nextState.draw};
  });
});

const advanceDominoSeriesForParticipant=async (gameIdValue,participantUid)=>{
  const gameId=String(gameIdValue||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(gameId)) throw new HttpsError('invalid-argument','A valid game id is required.');
  const gameReference=db.collection('matches').doc(gameId);
  return db.runTransaction(async transaction=>{
    const gameSnapshot=await transaction.get(gameReference);
    if(!gameSnapshot.exists) throw new HttpsError('not-found','Game not found.');
    const game=gameSnapshot.data();
    if(!matchGameIsDomino(game)||game.kind==='series') throw new HttpsError('failed-precondition','This is not a Domino manche.');
    const participants=requireMatchParticipant(game,participantUid);
    if(!game.winnerId&&game.draw!==true) throw new HttpsError('failed-precondition','This manche is not over.');
    const seriesId=String(game.seriesId||'');
    const seriesReference=db.collection('matches').doc(seriesId);
    const seriesSnapshot=await transaction.get(seriesReference);
    if(!seriesSnapshot.exists) throw new HttpsError('not-found','Series not found.');
    const series=seriesSnapshot.data();
    const seriesParticipants=requireMatchParticipant(series,participantUid);
    if(!participants.every(uid=>seriesParticipants.includes(uid))) throw new HttpsError('data-loss','The manche participants do not match the series.');
    const recorded=Array.isArray(series.gameIds)?series.gameIds.filter(id=>typeof id==='string'):[];
    const alreadyRecorded=recorded.includes(gameId);
    const score={p1:Math.max(0,Number(series.seriesScore?.p1)||0),p2:Math.max(0,Number(series.seriesScore?.p2)||0)};
    if(!alreadyRecorded&&game.winnerId===seriesParticipants[0]) score.p1+=1;
    if(!alreadyRecorded&&game.winnerId===seriesParticipants[1]) score.p2+=1;
    const openingAttendanceForfeit=(game.forfeitReason==='attendance-timeout'||game.completionReason==='attendance-timeout')&&Number(game.gameNumber||1)<=1;
    if(openingAttendanceForfeit&&game.winnerId===seriesParticipants[0]) score.p1=Math.max(2,score.p1);
    if(openingAttendanceForfeit&&game.winnerId===seriesParticipants[1]) score.p2=Math.max(2,score.p2);
    const gameIds=alreadyRecorded?recorded:[...recorded,gameId];
    const winnerUid=score.p1>=2?seriesParticipants[0]:score.p2>=2?seriesParticipants[1]:'';
    const alreadyComplete=Boolean(series.winnerUid||series.winnerId)||String(series.status||'').toLowerCase()==='completed';
    if(winnerUid||alreadyComplete){
      const officialWinner=String(series.winnerUid||series.winnerId||winnerUid);
      const loserUid=seriesParticipants.find(uid=>uid!==officialWinner)||'';
      const winnerIsReal=!isBotParticipant(series,officialWinner,participantUid);
      const loserIsReal=Boolean(loserUid)&&!isBotParticipant(series,loserUid,participantUid);
      const championshipId=String(series.championshipId||series.tournamentId||series.competitionId||'');
      const couponDefinition=eliminationCoupon(series);
      const roundKey=dominoRoundKey(series);
      const stagePoints=dominoVictoryPoints(series);
      const loserCompletionPoints=loserUid?5+(openingAttendanceForfeit&&game.forfeitedUid===loserUid?0:5):0;
      const winnerCompletionPoints=roundKey==='final'?10:0;
      const rewardReference=db.collection('playerRewardEvents').doc(`domino_series_${seriesId}`);
      const winnerProfileReference=winnerIsReal?db.collection('users').doc(officialWinner):null;
      const loserProfileReference=loserIsReal?db.collection('users').doc(loserUid):null;
      const winnerLeaderboardReference=db.collection('leaderboard').doc(officialWinner);
      const loserLeaderboardReference=loserUid?db.collection('leaderboard').doc(loserUid):null;
      const couponReference=loserIsReal&&championshipId?db.collection('jwetproCoupons').doc(`elimination_${championshipId}_${loserUid}`):null;
      const playerCouponsQuery=loserIsReal?db.collection('jwetproCoupons').where('playerUid','==',loserUid):null;
      const loserCompletionReference=loserUid&&championshipId?db.collection('playerRewardEvents').doc(`championship_completion_${championshipId}_${loserUid}`):null;
      const winnerCompletionReference=winnerCompletionPoints&&championshipId?db.collection('playerRewardEvents').doc(`championship_completion_${championshipId}_${officialWinner}`):null;
      const reads=await Promise.all([
        transaction.get(rewardReference),
        winnerProfileReference?transaction.get(winnerProfileReference):Promise.resolve(null),
        loserProfileReference?transaction.get(loserProfileReference):Promise.resolve(null),
        couponReference?transaction.get(couponReference):Promise.resolve(null),
        playerCouponsQuery?transaction.get(playerCouponsQuery):Promise.resolve(null),
        loserCompletionReference?transaction.get(loserCompletionReference):Promise.resolve(null),
        winnerCompletionReference?transaction.get(winnerCompletionReference):Promise.resolve(null),
        transaction.get(winnerLeaderboardReference),
        loserLeaderboardReference?transaction.get(loserLeaderboardReference):Promise.resolve(null)
      ]);
      const [rewardSnapshot,winnerProfileSnapshot,loserProfileSnapshot,couponSnapshot,playerCouponsSnapshot,loserCompletionSnapshot,winnerCompletionSnapshot,winnerLeaderboardSnapshot,loserLeaderboardSnapshot]=reads;
      let rewards=rewardSnapshot.exists?(rewardSnapshot.data()?.rewards||{}):{};
      if(!rewardSnapshot.exists){
        const winnerCurrentPoints=Math.max(0,Number(winnerProfileSnapshot?.data()?.points??winnerLeaderboardSnapshot.data()?.points)||0);
        const loserCurrentPoints=Math.max(0,Number(loserProfileSnapshot?.data()?.points??loserLeaderboardSnapshot?.data()?.points)||0);
        const winnerGlobalDelta=winnerCompletionReference&&!winnerCompletionSnapshot?.exists?winnerCompletionPoints:0;
        const loserGlobalDelta=loserCompletionReference&&!loserCompletionSnapshot?.exists?loserCompletionPoints:0;
        const winnerPointsDelta=stagePoints+winnerGlobalDelta;
        const winnerPointsTotal=winnerCurrentPoints+winnerPointsDelta;
        const loserPointsTotal=loserUid?loserCurrentPoints+loserGlobalDelta:null;
        const coupon=loserIsReal&&championshipId?{
          id:couponReference.id,
          type:couponDefinition.type,
          value:couponDefinition.value,
          label:couponDefinition.label,
          status:couponSnapshot?.exists?String(couponSnapshot.data()?.status||'pending'):'pending'
        }:null;
        rewards={
          [officialWinner]:{outcome:'win',pointsDelta:winnerPointsDelta,pointsTotal:winnerPointsTotal,coupon:null},
          ...(loserUid?{[loserUid]:{outcome:'loss',pointsDelta:loserGlobalDelta,pointsTotal:loserPointsTotal,coupon}}:{})
        };
        if(winnerProfileReference){
          transaction.set(winnerProfileReference,{points:winnerPointsTotal,matchesPlayed:admin.firestore.FieldValue.increment(1),wins:admin.firestore.FieldValue.increment(1),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        }
        transaction.set(winnerLeaderboardReference,{displayName:participantDisplayName(series,officialWinner),points:winnerPointsTotal,level:playerLevelName(winnerPointsTotal),simulated:!winnerIsReal,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        if(loserProfileReference){
          transaction.set(loserProfileReference,{points:loserPointsTotal,matchesPlayed:admin.firestore.FieldValue.increment(1),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        }
        if(loserLeaderboardReference) transaction.set(loserLeaderboardReference,{displayName:participantDisplayName(series,loserUid),points:loserPointsTotal,level:playerLevelName(loserPointsTotal),simulated:!loserIsReal,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        if(loserCompletionReference&&!loserCompletionSnapshot?.exists) transaction.create(loserCompletionReference,{type:'championship-completion',championshipId,playerUid:loserUid,participationPoints:5,noAbandonPoints:loserCompletionPoints-5,pointsDelta:loserCompletionPoints,pointsTotal:loserPointsTotal,settledAtElimination:true,createdAt:admin.firestore.FieldValue.serverTimestamp()});
        if(winnerCompletionReference&&!winnerCompletionSnapshot?.exists) transaction.create(winnerCompletionReference,{type:'championship-completion',championshipId,playerUid:officialWinner,participationPoints:5,noAbandonPoints:5,pointsDelta:winnerCompletionPoints,pointsTotal:winnerPointsTotal,settledAtFinal:true,createdAt:admin.firestore.FieldValue.serverTimestamp()});
        if(couponReference&&!couponSnapshot?.exists){
          playerCouponsSnapshot?.docs?.forEach(existingCoupon=>{
            if(existingCoupon.id!==couponReference.id) transaction.delete(existingCoupon.ref);
          });
          transaction.create(couponReference,{playerUid:loserUid,sourceChampionshipId:championshipId,sourceSeriesId:seriesId,type:couponDefinition.type,value:couponDefinition.value,currency:'HTG',targetChampionshipId:'',status:'pending',missedGames:{mopyon:false,domino:false},personal:true,transferable:false,stackable:false,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
        }
        transaction.create(rewardReference,{type:'domino-series',seriesId,championshipId,winnerUid:officialWinner,loserUid,round:roundKey,rewards,createdAt:admin.firestore.FieldValue.serverTimestamp()});
      }
      transaction.set(seriesReference,{gameIds,seriesScore:score,status:'completed',winnerUid:officialWinner,winnerId:officialWinner,winnerName:participantDisplayName(series,officialWinner),currentGameId:null,activeGameId:null,completedAt:series.completedAt||admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      const personalReward=rewards[participantUid]||{outcome:participantUid===officialWinner?'win':'loss',pointsDelta:0,pointsTotal:null,coupon:null};
      return {seriesId,seriesComplete:true,nextGameId:null,seriesScore:score,winnerUid:officialWinner,...personalReward};
    }
    const current=String(series.currentGameId||series.activeGameId||'');
    if(alreadyRecorded&&current&&current!==gameId) return {seriesId,seriesComplete:false,nextGameId:current,seriesScore:score,winnerUid:null};
    const nextNumber=gameIds.length+1;
    const nextGameId=`${seriesId.slice(0,142)}-g${nextNumber}`;
    await createDominoGameInTransaction(transaction,seriesReference,{...series,gameIds,seriesScore:score},nextGameId,nextNumber,admin.firestore.Timestamp.now());
    transaction.set(seriesReference,{gameIds,seriesScore:score,status:'live',currentGameId:nextGameId,activeGameId:nextGameId,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return {seriesId,seriesComplete:false,nextGameId,seriesScore:score,winnerUid:null};
  });
};

exports.advanceDominoSeries = onCall({region:'us-central1',cors:true},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Authentication is required.');
  return advanceDominoSeriesForParticipant(request.data?.gameId,request.auth.uid);
});

// Resolves the five-minute pause between two manches when the winner does not continue.
exports.claimSeriesAdvanceTimeout = onCall({region:'us-central1',cors:true},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Authentication is required.');
  const seriesId=String(request.data?.seriesId||''); if(!/^[A-Za-z0-9_-]{1,150}$/.test(seriesId)) throw new HttpsError('invalid-argument','A valid series id is required.');
  const ref=db.collection('matches').doc(seriesId);
  return db.runTransaction(async transaction=>{
    const snap=await transaction.get(ref); if(!snap.exists) throw new HttpsError('not-found','Series not found.');
    const series=snap.data()||{}, participants=requireMatchParticipant(series,request.auth.uid);
    if(series.winnerUid||series.winnerId||String(series.status||'').toLowerCase()==='completed') return {seriesId,seriesComplete:true,winnerUid:series.winnerUid||series.winnerId||null};
    const stamp=timestampMillis(series.updatedAt)||0; if(!stamp||Date.now()<stamp+OPPONENT_GRACE_PERIOD_MS) throw new HttpsError('failed-precondition','The five-minute transition period has not elapsed.');
    const ids=Array.isArray(series.gameIds)?series.gameIds:[], previousId=String(ids[ids.length-1]||'');
    const previous=previousId?await transaction.get(db.collection('matches').doc(previousId)):null; const forfeitedUid=String(previous?.data()?.winnerId||previous?.data()?.winnerUid||'');
    if(!participants.includes(forfeitedUid)) throw new HttpsError('failed-precondition','The next manche is not ready for timeout.');
    const winnerUid=participants.find(uid=>uid!==forfeitedUid)||'', winnerName=participantDisplayName(series,winnerUid), score={p1:forfeitedUid===participants[0]?0:2,p2:forfeitedUid===participants[1]?0:2};
    const currentId=String(series.currentGameId||series.activeGameId||''); if(currentId) transaction.set(db.collection('matches').doc(currentId),{status:'completed',winnerId:winnerUid,winnerUid,winnerName,forfeit:true,forfeitedUid,forfeitReason:'advance-timeout',completionReason:'advance-timeout',completedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    transaction.set(ref,{status:'completed',winnerId:winnerUid,winnerUid,winnerName,seriesScore:score,forfeit:true,forfeitedUid,forfeitReason:'advance-timeout',completionReason:'advance-timeout',currentGameId:null,activeGameId:null,completedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return {seriesId,seriesComplete:true,winnerUid,winnerName,forfeitedUid,forfeit:true,reason:'advance-timeout',seriesScore:score};
  });
});
// A completed official Domino manche validates itself. The transaction above is idempotent, so
// retries and a simultaneous client call cannot count the same manche or reward twice.
exports.autoAdvanceCompletedMopyonGame = onDocumentWritten({
  document:'matches/{matchId}',
  region:'us-central1',
  retry:true
}, async event => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after || after.kind === 'series' || !matchGameIsMopyon(after) || !after.seriesId) return;
  const completed = Boolean(after.winnerId) || after.draw === true;
  const wasCompleted = Boolean(before?.winnerId) || before?.draw === true;
  if (!completed || wasCompleted) return;
  const participants = Array.isArray(after.participantIds) ? after.participantIds.filter(uid => typeof uid === 'string') : [];
  if (participants.length !== 2) return;
  const realParticipant = participants.find(uid => !isBotParticipant(after, uid, participants.find(other => other !== uid) || ''));
  const participantUid = realParticipant || participants[0];
  await advanceMopyonSeriesHandler({data:{gameId:event.params.matchId},auth:{uid:participantUid}});
});
exports.autoAdvanceCompletedDominoGame = onDocumentWritten({
  document:'matches/{matchId}',
  region:'us-central1',
  retry:true
},async event=>{
  const before=event.data?.before?.exists?event.data.before.data():null;
  const after=event.data?.after?.exists?event.data.after.data():null;
  if(!after||after.kind==='series'||!matchGameIsDomino(after)||!after.seriesId)return;
  const completed=Boolean(after.winnerId)||after.draw===true;
  const wasCompleted=Boolean(before?.winnerId)||before?.draw===true;
  if(!completed||wasCompleted)return;
  const participants=Array.isArray(after.participantIds)?after.participantIds.filter(uid=>typeof uid==='string'):[];
  if(participants.length!==2)return;
  const realParticipant=participants.find(uid=>!isBotParticipant(after,uid,participants.find(other=>other!==uid)||''));
  const participantUid=realParticipant||participants[0];
  await advanceDominoSeriesForParticipant(event.params.matchId,participantUid);
});

exports.getDominoSeriesReward = onCall({region:'us-central1',cors:true},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Authentication is required.');
  const seriesId=String(request.data?.seriesId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(seriesId)) throw new HttpsError('invalid-argument','A valid series id is required.');
  const [seriesSnapshot,rewardSnapshot]=await Promise.all([
    db.collection('matches').doc(seriesId).get(),
    db.collection('playerRewardEvents').doc(`domino_series_${seriesId}`).get()
  ]);
  if(!seriesSnapshot.exists) throw new HttpsError('not-found','Series not found.');
  requireMatchParticipant(seriesSnapshot.data(),request.auth.uid);
  if(!rewardSnapshot.exists) return {seriesId,pending:true};
  const reward=rewardSnapshot.data()?.rewards?.[request.auth.uid];
  return {seriesId,pending:false,...(reward||{outcome:'none',pointsDelta:0,pointsTotal:null,coupon:null})};
});

exports.settleChampionshipCompletion = onCall({region:'us-central1',cors:true},async request=>{
  if(!(await isAdmin(request))) throw new HttpsError('permission-denied','Administrator access is required.');
  const championshipId=String(request.data?.championshipId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(championshipId)) throw new HttpsError('invalid-argument','A valid championship id is required.');
  const championshipReference=db.collection('championships').doc(championshipId);
  const [championshipSnapshot,matchesSnapshot]=await Promise.all([championshipReference.get(),db.collection('matches').where('championshipId','==',championshipId).get()]);
  if(!championshipSnapshot.exists) throw new HttpsError('not-found','Championship not found.');
  const championship=championshipSnapshot.data()||{};
  if(String(championship.status||'').toLowerCase()!=='completed') throw new HttpsError('failed-precondition','The championship must be completed first.');
  const participantIds=[...new Set((Array.isArray(championship.participants)?championship.participants:[]).map(item=>typeof item==='string'?item:item?.uid||item?.id||item?.userId||item?.playerId).filter(Boolean))]
    .filter(uid=>!isBotParticipant(championship,uid,''));
  const forfeited=new Set(matchesSnapshot.docs.map(document=>String(document.data()?.forfeitedUid||'')).filter(Boolean));
  const settled=await db.runTransaction(async transaction=>{
    const records=await Promise.all(participantIds.map(async uid=>{
      const ledgerRef=db.collection('playerRewardEvents').doc(`championship_completion_${championshipId}_${uid}`);
      const profileRef=db.collection('users').doc(uid);
      const [ledger,profile]=await Promise.all([transaction.get(ledgerRef),transaction.get(profileRef)]);
      return {uid,ledgerRef,profileRef,ledger,profile};
    }));
    let count=0;
    records.forEach(record=>{
      if(record.ledger.exists)return;
      const pointsDelta=5+(forfeited.has(record.uid)?0:5);
      const pointsTotal=Math.max(0,Number(record.profile.data()?.points)||0)+pointsDelta;
      transaction.set(record.profileRef,{points:pointsTotal,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      transaction.set(db.collection('leaderboard').doc(record.uid),{displayName:participantDisplayName(championship,record.uid),points:pointsTotal,level:playerLevelName(pointsTotal),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      transaction.create(record.ledgerRef,{type:'championship-completion',championshipId,playerUid:record.uid,participationPoints:5,noAbandonPoints:forfeited.has(record.uid)?0:5,pointsDelta,pointsTotal,createdAt:admin.firestore.FieldValue.serverTimestamp()});
      count+=1;
    });
    return count;
  });
  return {championshipId,settled};
});

exports.claimDominoForfeit = onCall({region:'us-central1',cors:true},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Authentication is required.');
  const matchId=String(request.data?.matchId||'');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(matchId)) throw new HttpsError('invalid-argument','A valid match id is required.');
  const reference=db.collection('matches').doc(matchId);
  return db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(reference);
    if(!snapshot.exists) throw new HttpsError('not-found','Match not found.');
    const data=snapshot.data();
    if(!matchGameIsDomino(data)||data.kind==='series') throw new HttpsError('failed-precondition','This is not a Domino game.');
    const participants=requireMatchParticipant(data,request.auth.uid);
    if(data.winnerId||data.draw) throw new HttpsError('failed-precondition','The match is already over.');
    const presence=data.presence&&typeof data.presence==='object'?data.presence:{};
    if(!presence[request.auth.uid]) throw new HttpsError('failed-precondition','Join the match room before claiming a forfeit.');
    const opponentId=participants.find(uid=>uid!==request.auth.uid);
    if(isBotParticipant(data,opponentId,request.auth.uid)||presence[opponentId]) throw new HttpsError('failed-precondition','Forfeit is not available.');
    const waitingSince=timestampMillis(data.waitingForOpponentSince);
    const deadline=timestampMillis(data.attendanceDeadlineAt)||waitingSince+OPPONENT_GRACE_PERIOD_MS;
    if(!Number.isFinite(waitingSince)||Date.now()<deadline) throw new HttpsError('failed-precondition','The five-minute attendance period has not elapsed yet.');
    transaction.set(reference,timeoutForfeitUpdates(request.auth.uid,opponentId),{merge:true});
    return {matchId,winnerId:request.auth.uid,forfeit:true,reason:'attendance-timeout'};
  });
});

// The first real player to join starts a five-minute attendance timer. The client calls this function
// automatically at the deadline; the transaction remains the authority and refuses bot matches.
exports.claimMopyonForfeit = onCall({region: 'us-central1', cors: true}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const matchId = String(request.data?.matchId || '');
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(matchId)) throw new HttpsError('invalid-argument', 'A valid match id is required.');

  const reference = db.collection('matches').doc(matchId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Match not found.');
    const data = snapshot.data();
    if (!matchGameIsMopyon(data)) throw new HttpsError('failed-precondition', 'This is not a Mopyon match.');
    if (data.kind === 'series') throw new HttpsError('failed-precondition', 'This confrontation is not directly playable.');
    const participants = requireMatchParticipant(data, request.auth.uid);
    if (data.winnerId || data.draw) throw new HttpsError('failed-precondition', 'The match is already over.');

    const presence = data.presence && typeof data.presence === 'object' ? data.presence : {};
    if (!presence[request.auth.uid]) throw new HttpsError('failed-precondition', 'Join the match room before claiming a forfeit.');
    const opponentId = participants.find(id => id !== request.auth.uid);
    if (isBotParticipant(data, opponentId, request.auth.uid)) throw new HttpsError('failed-precondition', 'Attendance forfeits do not apply to simulated opponents.');
    if (presence[opponentId]) throw new HttpsError('failed-precondition', 'Your opponent has already joined; forfeit is not available.');
    const waitingSinceMillis = timestampMillis(data.waitingForOpponentSince);
    const deadlineMillis = timestampMillis(data.attendanceDeadlineAt) || waitingSinceMillis + OPPONENT_GRACE_PERIOD_MS;
    if (!Number.isFinite(waitingSinceMillis) || Date.now() < deadlineMillis) throw new HttpsError('failed-precondition', 'The five-minute attendance period has not elapsed yet.');

    transaction.set(reference, timeoutForfeitUpdates(request.auth.uid, opponentId), {merge: true});
    return {matchId, winnerId: request.auth.uid, forfeit: true, reason: 'attendance-timeout'};
  });
});

// Browser timers provide the immediate UX, while this server sweep guarantees that an expired
// attendance deadline is still resolved if the present player closes or reloads the page.
exports.resolveMopyonAttendanceTimeouts = onSchedule({region: 'us-central1', schedule: 'every 1 minutes', timeoutSeconds: 60}, async () => {
  const now = admin.firestore.Timestamp.now();
// A player who never opens the match has no child game document yet. Resolve
  // those parent series directly once the official start plus five minutes has passed.
  const seriesSnapshot = await db.collection('matches').where('kind', '==', 'series').limit(200).get();
  await Promise.all(seriesSnapshot.docs.map(document => db.runTransaction(async transaction => {
    const snapshot = await transaction.get(document.ref);
    if (!snapshot.exists) return;
    const data = snapshot.data();
    const status = String(data.status || data.state || '').toLowerCase();
    const completedForfeit = status === 'completed' && (data.forfeitReason === 'attendance-timeout' || data.completionReason === 'attendance-timeout' || data.forfeitReason === 'double-attendance-timeout' || data.completionReason === 'double-attendance-timeout');
    if ((!['preview', 'scheduled', 'waiting-opponent', 'ongoing', 'live'].includes(status) && !completedForfeit) || (data.winnerId || data.winnerUid) && !completedForfeit || data.currentGameId) return;
    const participants = Array.isArray(data.participantIds) ? data.participantIds.filter(id => typeof id === 'string') : [];
    if (participants.length !== 2) return;
    const startMillis = timestampMillis(data.startAt || data.scheduledAt || data.date);
    if (!completedForfeit && (!Number.isFinite(startMillis) || Date.now() < startMillis + OPPONENT_GRACE_PERIOD_MS)) return;
    const botIds = participants.filter(uid => isBotParticipant(data, uid));
    if (botIds.length === 2) return;
    const participantNames = data.participantNames && typeof data.participantNames === 'object' ? data.participantNames : {};
    const replayRef = db.collection('matches').doc(`${document.id}-g1`);
    const replaySnapshot = await transaction.get(replayRef);
    const winnerId = botIds.length === 1 ? botIds[0] : null;
    const forfeitedUid = botIds.length === 1 ? participants.find(uid => uid !== winnerId) : null;
    const reason = botIds.length === 1 ? 'attendance-timeout' : 'double-attendance-timeout';
    const replayData = {
      kind:'game', seriesId:document.id, seriesFormat:'bo3', gameNumber:1,
      game:data.game || data.type || 'mopyon', type:data.type || data.game || 'mopyon',
      championshipId:data.championshipId || data.tournamentId || data.competitionId || '',
      number:data.number || data.matchNumber || '', participantIds:participants,
      participantNames, participantTypes:data.participantTypes || {},
      player1:data.player1 || {uid:participants[0],displayName:participantNames[participants[0]] || 'Joueur 1'},
      player2:data.player2 || {uid:participants[1],displayName:participantNames[participants[1]] || 'Joueur 2'},
      status:'completed', winnerId, winnerUid:winnerId,
      winnerName:winnerId ? String(participantNames[winnerId] || 'Joueur') : null,
      forfeitedUid, forfeitedName:forfeitedUid ? String(participantNames[forfeitedUid] || 'Joueur') : null,
      forfeit:true, forfeitReason:reason, completionReason:reason, moves:[],
      startAt:data.startAt || data.scheduledAt || data.date || admin.firestore.Timestamp.now(),
      scheduledAt:data.scheduledAt || data.startAt || data.date || admin.firestore.Timestamp.now(),
      completedAt:admin.firestore.FieldValue.serverTimestamp(),
      createdAt:admin.firestore.FieldValue.serverTimestamp(), updatedAt:admin.firestore.FieldValue.serverTimestamp(),
      simulation:data.simulation === true, isSimulation:data.simulation === true
    };
    if (!replaySnapshot.exists) transaction.create(replayRef, replayData);
    if (botIds.length === 1) {
      transaction.set(document.ref, {...timeoutForfeitUpdates(winnerId, forfeitedUid),winnerUid,winnerName:String(participantNames[winnerId] || 'Joueur'),forfeitedName:String(participantNames[forfeitedUid] || 'Joueur')}, {merge: true});
    } else {
      transaction.set(document.ref, {...doubleAttendanceUpdates(String(data.nextMatchId || data.followingMatchId || ''), participants),winnerUid:null,winnerName:null}, {merge: true});
    }
  })));
  const dueSnapshot = await db.collection('matches').where('attendanceDeadlineAt', '<=', now).limit(100).get();
  await Promise.all(dueSnapshot.docs.map(document => db.runTransaction(async transaction => {
    const snapshot = await transaction.get(document.ref);
    if (!snapshot.exists) return;
    const data = snapshot.data();
    const status = String(data.status || data.state || '').toLowerCase();
    if (!['scheduled', 'waiting-opponent', 'preview'].includes(status) || data.winnerId || data.draw || data.kind === 'series' || (!matchGameIsMopyon(data) && !matchGameIsDomino(data))) return;
    const deadlineMillis = timestampMillis(data.attendanceDeadlineAt);
    if (!Number.isFinite(deadlineMillis) || deadlineMillis > Date.now()) return;
    const participants = Array.isArray(data.participantIds) ? data.participantIds.filter(id => typeof id === 'string') : [];
    if (participants.length !== 2) return;
    const presence = data.presence && typeof data.presence === 'object' ? data.presence : {};
    const botIds = participants.filter(uid => isBotParticipant(data, uid));
    // A bot-only manche is owned by the simulation orchestrator. Never put it
    // through attendance resolution: bots are permanently present and must be
    // simulated automatically, without a five-minute gate.
    if (botIds.length === 2) return;
    // Simulated opponents are always considered present; only real players
    // must check in during the five-minute attendance window.
    const presentIds = [...new Set([...participants.filter(uid => Number.isFinite(timestampMillis(presence[uid]))), ...botIds])];
    if (presentIds.length === 2) {
      transaction.set(document.ref, {
        status: 'ongoing',
        waitingForOpponentSince: admin.firestore.FieldValue.delete(),
        attendanceDeadlineAt: admin.firestore.FieldValue.delete(),
        waitingForOpponentUid: admin.firestore.FieldValue.delete(),
        startedAt: data.startedAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, {merge: true});
      return;
    }
    if (presentIds.length === 0) {
      // If a real player faces a simulated opponent, the real player is the
      // one who forfeits when nobody joins. The simulated opponent advances.
      if (botIds.length === 1) {
        const winnerId = botIds[0];
        const forfeitedUid = participants.find(uid => uid !== winnerId);
        transaction.set(document.ref, timeoutForfeitUpdates(winnerId, forfeitedUid), {merge: true});
        return;
      }
      // Two real players absent: both are eliminated and the next bracket
      // opponent advances by bye.
      transaction.set(document.ref, doubleAttendanceUpdates(String(data.nextMatchId || data.followingMatchId || ''), participants), {merge: true});
      return;
    }
    if (presentIds.length !== 1) return;
    const winnerId = presentIds[0];
    const forfeitedUid = participants.find(uid => uid !== winnerId);
    // A simulated opponent does not need to check in. Once the real player is
    // present, the match may start normally.
    if (isBotParticipant(data, forfeitedUid, winnerId)) {
      transaction.set(document.ref, {
        status: 'ongoing',
        waitingForOpponentSince: admin.firestore.FieldValue.delete(),
        attendanceDeadlineAt: admin.firestore.FieldValue.delete(),
        waitingForOpponentUid: admin.firestore.FieldValue.delete(),
        startedAt: data.startedAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, {merge: true});
      return;
    }
    const championshipId = String(data.championshipId || data.tournamentId || data.competitionId || '');
    if (championshipId && forfeitedUid) {
      const couponRef = db.collection('jwetproCoupons').doc('elimination_' + championshipId + '_' + forfeitedUid);
      const existingCoupons = await transaction.get(db.collection('jwetproCoupons').where('playerUid','==',forfeitedUid));
      const couponSnapshot = await transaction.get(couponRef);
      existingCoupons.docs.forEach(existing => { if (existing.id !== couponRef.id) transaction.delete(existing.ref); });
      if (!couponSnapshot.exists) transaction.create(couponRef,{playerUid:forfeitedUid,sourceChampionshipId:championshipId,sourceSeriesId:String(data.seriesId || document.id),type:'next-championship-discount',value:25,currency:'HTG',targetChampionshipId:'',status:'pending',missedGames:{mopyon:false,domino:false},personal:true,transferable:false,stackable:false,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    }
    transaction.set(document.ref, timeoutForfeitUpdates(winnerId, forfeitedUid), {merge: true});
  })));
});


// The turn deadline is authoritative and must be enforced even when both
// browsers have left the match page. The client timer is only presentation.
exports.resolveOfficialTurnTimeouts = onSchedule({region: 'us-central1', schedule: 'every 1 minutes', timeoutSeconds: 60}, async () => {
  const now = admin.firestore.Timestamp.now();
  const due = await db.collection('matches').where('turnDeadlineAt', '<=', now).limit(200).get();
  await Promise.all(due.docs.map(document => db.runTransaction(async transaction => {
    const snapshot = await transaction.get(document.ref);
    if (!snapshot.exists) return;
    const data = snapshot.data();
    const status = String(data.status || data.state || '').toLowerCase();
    const deadline = timestampMillis(data.turnDeadlineAt);
    if (!Number.isFinite(deadline) || deadline > Date.now() || data.kind === 'series' ||
        !MOPYON_LIVE_STATUSES.has(status) || data.winnerId || data.draw) return;
    const participants = Array.isArray(data.participantIds) ? data.participantIds.filter(uid => typeof uid === 'string') : [];
    const currentTurnUid = String(data.currentTurnUid || '');
    if (participants.length !== 2 || !currentTurnUid || isBotParticipant(data, currentTurnUid)) return;
    const winnerId = participants.find(uid => uid !== currentTurnUid) || null;
    const names = data.participantNames && typeof data.participantNames === 'object' ? data.participantNames : {};
    transaction.set(document.ref, {
      ...turnTimeoutForfeitUpdates(winnerId, currentTurnUid),
      winnerUid: winnerId,
      winnerName: winnerId ? String(names[winnerId] || 'Joueur') : null,
      forfeitedName: String(names[currentTurnUid] || 'Joueur')
    }, {merge: true});
  })));
});

// Dashboard cleanup helper for simulated championship accounts.
exports.deleteSimulationAccounts = onCall({region: 'us-central1', cors: true, cpu: 0.5, maxInstances: 1}, async request => {
  if (!(await isAdmin(request))) throw new HttpsError('permission-denied', 'Administrator access is required.');
  const simulationRunId = String(request.data?.simulationRunId || '');
  if (!simulationRunId) throw new HttpsError('invalid-argument', 'simulationRunId is required.');
  const snapshot = await db.collection('users').where('simulationRunId', '==', simulationRunId).get();
  const uids = snapshot.docs.map(doc => doc.id).filter(Boolean);
  let deleted = 0;
  for (let offset = 0; offset < uids.length; offset += 1000) {
    const result = await admin.auth().deleteUsers(uids.slice(offset, offset + 1000));
    deleted += Number(result.successCount || 0);
  }
  return {count: deleted, requested: uids.length};
});
