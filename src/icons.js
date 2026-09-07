const toLucideName = value => String(value || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
  .replace(/\s+/g, '-')
  .toLowerCase();

window.renderIcons = function renderIcons() {
  if (!window.lucide?.createIcons) return;
  document.querySelectorAll('[data-lucide]').forEach(element => {
    const name = element.getAttribute('data-lucide');
    if (name) element.setAttribute('data-lucide', toLucideName(name));
  });
  window.lucide.createIcons({ attrs: { 'stroke-width': 1.7 } });
};
