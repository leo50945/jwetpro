(() => {
  'use strict';

  const PUBLIC_KNOWLEDGE_IDS = Object.freeze([
    'championship-format',
    'championship-rewards',
    'championship-lifecycle',
    'match-series-and-replay',
    'social-sharing'
  ]);
  const MIN_CONTENT_VERSIONS = Object.freeze({ 'championship-rewards': 3, 'match-series-and-replay': 3 });

  const fieldText = (record, language, field) => {
    const suffix = language === 'ht' ? 'Ht' : 'Fr';
    return String(record?.[`${field}${suffix}`] || '').trim();
  };

  const renderKnowledge = (id, record, language) => {
    if (!record || record.enabled === false || Number(record.contentVersion || 0) < Math.max(2, Number(MIN_CONTENT_VERSIONS[id] || 0))) return;
    const title = fieldText(record, language, 'title');
    const content = fieldText(record, language, 'content');
    if (!title || !content) return;

    document.querySelectorAll(`[data-guide-knowledge="${id}"]`).forEach(card => {
      const titleElement = card.querySelector('h3');
      const contentElement = card.matches('section')
        ? card.querySelector(':scope > div')
        : card.querySelector(':scope > p');
      if (!titleElement || !contentElement) return;
      titleElement.textContent = title;
      contentElement.textContent = content;
      card.dataset.guideSource = 'firebase';
    });
  };

  const loadOfficialKnowledge = async () => {
    if (!window.firebase?.firestore) return;
    try {
      const database = firebase.firestore();
      const snapshots = await Promise.all(PUBLIC_KNOWLEDGE_IDS.map(id =>
        database.collection('assistantKnowledge').doc(id).get()
      ));
      const language = localStorage.getItem('jwetpro-language') === 'ht' ? 'ht' : 'fr';
      snapshots.forEach(snapshot => {
        if (snapshot.exists) renderKnowledge(snapshot.id, snapshot.data(), language);
      });
    } catch (error) {
      console.warn('Les informations officielles du guide sont temporairement indisponibles.', error);
    }
  };

  loadOfficialKnowledge();
})();
