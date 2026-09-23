const crypto = require('crypto');

const COMMUNITY_PERSONAS = [
  'Mika J.','Nadia L.','David T.','Ruth J.','Wesley A.','Sarah C.','Peterson F.','Gaëlle M.',
  'Frantz D.','Wideline P.','Junior C.','Vanessa R.','Samuel B.','Esther N.','Ricardo P.','Lovely S.',
  'Jameson L.','Stéphanie V.','Emmanuel J.','Roseline A.','Wood K.','Kervens T.','Natacha G.','Mackenson P.',
  'Darline C.','Jeff R.','Tamara L.','Claude M.','Melissa D.','Stanley F.','Judith E.','Andy N.'
];

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const boundedNumber = (value, fallback, min, max) => {
  const number = Number(value);
  return Math.max(min,Math.min(max,Number.isFinite(number) ? number : fallback));
};
const isRealDay = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

function normalizeCommunityProgram(input) {
  const conversations = Array.isArray(input?.conversations) ? input.conversations : null;
  if (!conversations?.length) throw new Error('Ajoutez au moins une discussion.');
  if (conversations.length > 500) throw new Error('Une programmation accepte au maximum 500 discussions.');
  const personaSet = new Set(COMMUNITY_PERSONAS);
  const conversationIds = new Set();
  const dailyMessageKeys = new Set();
  let totalMessages = 0;

  const normalized = conversations.map((conversation, conversationIndex) => {
    const id = clean(conversation?.id || `discussion-${conversationIndex + 1}`, 80);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error(`Identifiant invalide pour la discussion ${conversationIndex + 1}.`);
    if (conversationIds.has(id)) throw new Error(`La discussion « ${id} » est présente plusieurs fois.`);
    conversationIds.add(id);
    const title = clean(conversation?.title || `Discussion ${conversationIndex + 1}`, 120);
    const contexts = Array.isArray(conversation?.contexts)
      ? [...new Set(conversation.contexts.map(value => clean(value, 40).toLowerCase()).filter(Boolean))].slice(0, 8)
      : [];
    const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
    if (!messages.length || messages.length > 40) throw new Error(`La discussion « ${id} » doit contenir entre 1 et 40 messages.`);
    const localIds = new Set();
    const startOffsetSeconds = boundedNumber(conversation?.startOffsetSeconds,conversationIndex*3,0,180);
    let cumulativeSeconds = startOffsetSeconds;
    const normalizedMessages = messages.map((message, messageIndex) => {
      const messageId = clean(message?.id || `m${messageIndex + 1}`, 80);
      const author = clean(message?.author, 60);
      const text = clean(message?.text || message?.body, 600);
      const replyTo = clean(message?.replyTo, 80);
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(messageId) || localIds.has(messageId)) throw new Error(`Identifiant de message invalide ou dupliqué dans « ${id} ».`);
      if (!personaSet.has(author)) throw new Error(`« ${author || 'Auteur manquant'} » ne fait pas partie des 32 personnages autorisés.`);
      if (!text) throw new Error(`Un message de « ${id} » est vide.`);
      if (replyTo && !localIds.has(replyTo)) throw new Error(`Dans « ${id} », replyTo doit viser un message placé avant la réponse.`);
      const duplicateKey = `${author}|${text.toLocaleLowerCase('fr')}`;
      if (dailyMessageKeys.has(duplicateKey)) throw new Error(`Le même personnage ne peut pas répéter le même texte dans la journée : ${author}.`);
      dailyMessageKeys.add(duplicateKey);
      localIds.add(messageId);
      const delaySeconds = messageIndex === 0 ? 0 : boundedNumber(message?.delaySeconds,7,2,45);
      cumulativeSeconds += delaySeconds;
      if (cumulativeSeconds > 240) throw new Error(`La discussion « ${id} » dépasse la durée maximale de 4 minutes.`);
      return {id: messageId, author, text, replyTo: replyTo || '', delaySeconds};
    });
    totalMessages += normalizedMessages.length;
    return {
      id,
      title,
      contexts,
      startOffsetSeconds,
      messages: normalizedMessages
    };
  });
  if (totalMessages > 5000) throw new Error('Une programmation accepte au maximum 5 000 messages.');
  return {conversations: normalized, totalMessages};
}

function buildCommunityTimeline({actualDay, sourceDay, revision, conversations, usedConversationKeys = [], contextHint = '', maxConversations = 3}) {
  const used = new Set(usedConversationKeys);
  const normalizedContext = clean(contextHint, 40).toLowerCase();
  const contextual = normalizedContext
    ? conversations.filter(conversation => Array.isArray(conversation.contexts) && conversation.contexts.includes(normalizedContext))
    : [];
  const source = contextual.length ? contextual : conversations;
  const available = source
    .map(conversation => ({...conversation, key: `${sourceDay}|${revision}|${conversation.id}`}))
    .filter(conversation => !used.has(conversation.key))
    .sort((a, b) => hash(`${actualDay}|${a.key}`).localeCompare(hash(`${actualDay}|${b.key}`)));
  const selected = available.slice(0, maxConversations);
  const timeline = [];
  selected.forEach((conversation, conversationIndex) => {
    let offsetSeconds = boundedNumber(conversation.startOffsetSeconds,conversationIndex*3,0,180);
    const references = new Map();
    conversation.messages.forEach((message, messageIndex) => {
      if (messageIndex) offsetSeconds += boundedNumber(message.delaySeconds,7,2,45);
      const documentId = `program_${hash(`${actualDay}|${conversation.key}|${message.id}`).slice(0, 36)}`;
      const parent = message.replyTo ? references.get(message.replyTo) : null;
      timeline.push({
        documentId,
        threadId: `thread_${hash(`${actualDay}|${conversation.key}`).slice(0, 28)}`,
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        author: message.author,
        text: message.text,
        offsetSeconds,
        replyToMessageId: parent?.documentId || '',
        replyTo: parent ? {messageId: parent.documentId, authorName: parent.author, body: parent.text.slice(0, 180)} : null
      });
      references.set(message.id, {documentId, author: message.author, text: message.text});
    });
  });
  timeline.sort((a, b) => a.offsetSeconds - b.offsetSeconds || a.documentId.localeCompare(b.documentId));
  return {selectedKeys: selected.map(item => item.key), timeline, remainingCount: Math.max(0, available.length - selected.length)};
}

function pickCommunityProgramMetadata(dayKey, records) {
  const available = records.filter(record => record?.data?.enabled === true && record.data.activeRevision);
  return available.find(record => record.id === dayKey) || available.sort((a,b) => String(b.id).localeCompare(String(a.id)))[0] || null;
}

module.exports = {COMMUNITY_PERSONAS, isRealDay, normalizeCommunityProgram, buildCommunityTimeline, pickCommunityProgramMetadata};
