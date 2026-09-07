(function initJwetproShare() {
  const REFERRAL_STORAGE_KEY = 'jwetpro-referral-share-id';
  const SHARE_ID_PATTERN = /^[a-f0-9]{28}$/;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const firebaseReady = () => window.firebase && typeof firebase.app === 'function' && firebase.apps?.length;
  const functions = () => firebase.app().functions('us-central1');
  const currentUser = () => firebase.auth?.().currentUser;
  const toast = message => {
    if (typeof window.showAppToast === 'function') { window.showAppToast(message); return; }
    const node = document.createElement('div');
    node.className = 'jwetpro-share-toast';
    node.textContent = message;
    document.body.append(node);
    requestAnimationFrame(() => node.classList.add('is-visible'));
    setTimeout(() => { node.classList.remove('is-visible'); setTimeout(() => node.remove(),250); },2800);
  };

  const style = document.createElement('style');
  style.textContent = `.jwetpro-share-trigger{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #d9a12d;border-radius:9px;padding:11px 15px;background:#dda42f;color:#071827;font:800 12px/1 inherit;cursor:pointer}.jwetpro-share-trigger svg{width:17px;height:17px}.jwetpro-share-modal{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:18px;background:#03111dcc}.jwetpro-share-modal[hidden]{display:none}.jwetpro-share-card{width:min(100%,480px);overflow:hidden;border:1px solid #315269;border-radius:18px;background:#081f31;color:#edf4f7;box-shadow:0 26px 80px #000a}.jwetpro-share-preview{padding:26px;background:linear-gradient(145deg,#12354c,#071b2b);text-align:center}.jwetpro-share-preview small{color:#dfa735;font-size:10px;font-weight:900;letter-spacing:.13em}.jwetpro-share-preview h2{margin:10px 0 7px;font-size:26px}.jwetpro-share-preview p{margin:0;color:#b9cad4;font-size:13px;line-height:1.55}.jwetpro-share-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:18px}.jwetpro-share-actions button,.jwetpro-share-actions a{display:flex;align-items:center;justify-content:center;min-height:43px;border:1px solid #315269;border-radius:9px;background:#0d2a3e;color:#eef5f8;font:800 12px/1 inherit;text-decoration:none;cursor:pointer}.jwetpro-share-actions .is-primary{grid-column:1/-1;border-color:#dda42f;background:#dda42f;color:#071827}.jwetpro-share-close{position:absolute;top:13px;right:13px;width:36px;height:36px;border:1px solid #47657a;border-radius:50%;background:#071a29;color:#fff;font-size:20px;cursor:pointer}.jwetpro-share-card-head{position:relative}.jwetpro-share-status{min-height:20px;margin:0;padding:0 18px 16px;color:#9fb4c1;font-size:11px;text-align:center}.jwetpro-share-toast{position:fixed;left:50%;bottom:28px;z-index:2100;transform:translate(-50%,20px);padding:11px 16px;border-radius:9px;background:#071a29;color:#fff;box-shadow:0 12px 35px #0008;opacity:0;transition:.2s}.jwetpro-share-toast.is-visible{transform:translate(-50%,0);opacity:1}@media(max-width:520px){.jwetpro-share-actions{grid-template-columns:1fr}.jwetpro-share-actions .is-primary{grid-column:auto}}`;
  document.head.append(style);

  const modal = document.createElement('div');
  modal.className = 'jwetpro-share-modal';
  modal.hidden = true;
  modal.innerHTML = `<section class="jwetpro-share-card" role="dialog" aria-modal="true" aria-labelledby="jwetpro-share-title"><div class="jwetpro-share-card-head"><button class="jwetpro-share-close" type="button" aria-label="Fermer">×</button><div class="jwetpro-share-preview"><small>PARTAGER SUR JWETPRO</small><h2 id="jwetpro-share-title">Préparation…</h2><p class="jwetpro-share-description">Création de votre lien sécurisé.</p></div></div><div class="jwetpro-share-actions"><button class="is-primary" type="button" data-share-native>Partager avec mes applications</button><a data-share-whatsapp target="_blank" rel="noopener">WhatsApp</a><a data-share-facebook target="_blank" rel="noopener">Facebook</a><button type="button" data-share-copy>Copier le lien</button><button type="button" data-share-close-action>Fermer</button></div><p class="jwetpro-share-status" role="status" aria-live="polite"></p></section>`;
  document.body.append(modal);
  let activeShare = null;
  const close = () => { modal.hidden = true; activeShare = null; };
  modal.addEventListener('click',event => { if (event.target === modal || event.target.closest('.jwetpro-share-close') || event.target.closest('[data-share-close-action]')) close(); });
  document.addEventListener('keydown',event => { if (event.key === 'Escape' && !modal.hidden) close(); });
  modal.querySelector('[data-share-native]').addEventListener('click',async () => {
    if (!activeShare) return;
    if (navigator.share) {
      try { await navigator.share({title:activeShare.title,text:activeShare.text,url:activeShare.url}); }
      catch (error) { if (error.name !== 'AbortError') toast('Partage indisponible. Copiez plutôt le lien.'); }
      return;
    }
    try { await navigator.clipboard.writeText(`${activeShare.text} ${activeShare.url}`); toast('Lien copié.'); }
    catch { toast('Utilisez le bouton Copier le lien.'); }
  });
  modal.querySelector('[data-share-copy]').addEventListener('click',async () => {
    if (!activeShare) return;
    try { await navigator.clipboard.writeText(activeShare.url); toast('Lien copié.'); }
    catch { modal.querySelector('.jwetpro-share-status').textContent = activeShare.url; }
  });

  const open = async options => {
    if (!firebaseReady()) { toast('Le partage est temporairement indisponible.'); return null; }
    const user = currentUser();
    if (!user || user.isAnonymous) { location.href = './index.html#login'; return null; }
    modal.hidden = false;
    modal.querySelector('#jwetpro-share-title').textContent = 'Préparation du partage…';
    modal.querySelector('.jwetpro-share-description').textContent = 'JWETPRO vérifie votre accomplissement.';
    modal.querySelector('.jwetpro-share-status').textContent = '';
    try {
      const result = await functions().httpsCallable('createShareEvent')(options || {});
      activeShare = result.data || null;
      if (!activeShare?.url) throw new Error('SHARE_URL_MISSING');
      modal.querySelector('#jwetpro-share-title').textContent = activeShare.title || 'Partager JWETPRO';
      modal.querySelector('.jwetpro-share-description').textContent = activeShare.text || 'Invitez vos amis à rejoindre JWETPRO.';
      modal.querySelector('[data-share-whatsapp]').href = `https://wa.me/?text=${encodeURIComponent(`${activeShare.text} ${activeShare.url}`)}`;
      modal.querySelector('[data-share-facebook]').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(activeShare.url)}`;
      return activeShare;
    } catch (error) {
      console.error('JWETPRO share creation failed:',error);
      modal.querySelector('#jwetpro-share-title').textContent = 'Partage indisponible';
      modal.querySelector('.jwetpro-share-description').textContent = error?.message?.replace(/^Firebase:\s*/,'') || 'Impossible de vérifier cet accomplissement.';
      modal.querySelector('.jwetpro-share-status').textContent = 'Réessayez dans quelques instants.';
      return null;
    }
  };

  const captureReferral = () => {
    const shareId = new URLSearchParams(location.search).get('ref');
    if (SHARE_ID_PATTERN.test(shareId || '')) localStorage.setItem(REFERRAL_STORAGE_KEY,shareId);
  };
  const recordReferral = async user => {
    if (!user || user.isAnonymous || !firebaseReady()) return;
    const shareId = localStorage.getItem(REFERRAL_STORAGE_KEY) || '';
    if (!SHARE_ID_PATTERN.test(shareId)) return;
    try {
      await functions().httpsCallable('recordShareReferral')({shareId});
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
    } catch (error) { console.warn('JWETPRO referral recording deferred:',error); }
  };
  captureReferral();
  if (firebaseReady() && firebase.auth) firebase.auth().onAuthStateChanged(recordReferral);
  window.JwetproShare = {open,close,recordReferral};
})();
