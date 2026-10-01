(function initJwetproPwa(){
  'use strict';
  if (window.JwetproPwaGate) return;

  const VAPID_KEY = String(window.JWETPRO_PUSH_VAPID_KEY || localStorage.getItem('jwetpro-push-vapid-key') || '').trim();
  const state = {installPrompt:null, serviceWorker:null, ready:false};
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isInstalled = () => isStandalone() || localStorage.getItem('jwetpro-pwa-installed') === 'true';
  const canNotify = () => 'Notification' in window && Notification.permission === 'granted';
  const canUsePush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const currentUser = () => window.firebase?.auth?.().currentUser || null;
  const needAuth = () => !currentUser() || currentUser()?.isAnonymous;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const gateStep = () => !isInstalled() ? 1 : needAuth() ? 2 : 3;
  const waitForAuthReady = () => new Promise(resolve => {
    if (!window.firebase?.auth || !firebase.apps?.length) return resolve();
    let done = false;
    const timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      resolve();
    }, 1800);
    const unsubscribe = firebase.auth().onAuthStateChanged(() => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    }, () => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      resolve();
    });
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    window.dispatchEvent(new Event('jwetpro-pwa-install-ready'));
  });
  window.addEventListener('appinstalled', () => {
    localStorage.setItem('jwetpro-pwa-installed', 'true');
    window.dispatchEvent(new Event('jwetpro-pwa-installed'));
  });

  const ensureServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) throw new Error('service-worker-unavailable');
    if (state.serviceWorker) return state.serviceWorker;
    state.serviceWorker = await navigator.serviceWorker.register('./firebase-messaging-sw.js', {scope:'./'});
    return state.serviceWorker;
  };

  const applicationServerKey = value => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  };

  const registerSubscription = async () => {
    if (!VAPID_KEY) throw new Error('missing-vapid-key');
    if (needAuth()) throw new Error('auth-required');
    const registration = await ensureServiceWorker();
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:applicationServerKey(VAPID_KEY)});
    const callable = firebase.app().functions('us-central1').httpsCallable('registerWebPushSubscription');
    await callable({
      subscription:subscription.toJSON(),
      platform:navigator.platform || '',
      userAgent:navigator.userAgent.slice(0, 240),
      standalone:isStandalone()
    });
    localStorage.setItem('jwetpro-pwa-ready', 'true');
    return subscription;
  };

  const installApp = async () => {
    if (isInstalled()) return true;
    if (!state.installPrompt) return false;
    const prompt = state.installPrompt;
    state.installPrompt = null;
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result?.outcome === 'accepted') localStorage.setItem('jwetpro-pwa-installed', 'true');
    return result?.outcome === 'accepted' || isInstalled();
  };

  const requestNotifications = async () => {
    if (!canUsePush()) throw new Error('push-unsupported');
    if (!VAPID_KEY) throw new Error('missing-vapid-key');
    if (needAuth()) throw new Error('auth-required');
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') throw new Error(permission === 'denied' ? 'notification-denied' : 'notification-dismissed');
    return registerSubscription();
  };

  const paintGate = (overlay, error = '') => {
    if (!overlay) return;
    const step = gateStep();
    const iosHelp = isIos() && !state.installPrompt;
    const content = step === 1
      ? {title:'Installe JWETPRO', copy:iosHelp ? 'Safari : Partager, puis « Sur l’écran d’accueil ».' : state.installPrompt ? 'Installation rapide, sans téléchargement.' : 'Menu du navigateur → Installer JWETPRO.', action:state.installPrompt ? 'Installer JWETPRO' : 'Vérifier l’installation', actionName:state.installPrompt ? 'install' : 'check'}
      : step === 2
        ? {title:'Connecte-toi', copy:'Utilise ton compte joueur pour continuer.', action:'Se connecter', actionName:'login'}
        : {title:'Active les notifications', copy:'Reçois les alertes de match et de championnat.', action:canNotify() && localStorage.getItem('jwetpro-pwa-ready') === 'true' ? 'Continuer' : 'Activer les notifications', actionName:canNotify() && localStorage.getItem('jwetpro-pwa-ready') === 'true' ? 'check' : 'notify'};
    overlay.dataset.step = String(step);
    const progress = overlay.querySelector('[data-pwa-progress]');
    progress?.setAttribute('aria-label', `Étape ${step} sur 3`);
    progress?.setAttribute('aria-valuenow', String(step));
    overlay.querySelectorAll('[data-pwa-progress-step]').forEach((item, index) => {
      item.classList.toggle('is-current', index + 1 === step);
      item.classList.toggle('is-done', index + 1 < step);
    });
    overlay.querySelector('[data-pwa-kicker]').textContent = `ÉTAPE ${step} SUR 3`;
    overlay.querySelector('[data-pwa-title]').textContent = content.title;
    overlay.querySelector('[data-pwa-copy]').textContent = content.copy;
    const actionButton = overlay.querySelector('[data-pwa-action="primary"]');
    actionButton.textContent = content.action;
    actionButton.dataset.action = content.actionName;
    const errorBox = overlay.querySelector('[data-pwa-error]');
    errorBox.hidden = !error;
    errorBox.textContent = error;
  };

  const renderGate = () => {
    const old = document.querySelector('[data-pwa-gate]');
    if (old) old.remove();
    document.body.classList.add('pwa-gate-open');
    const overlay = document.createElement('div');
    overlay.className = 'pwa-gate-backdrop';
    overlay.dataset.pwaGate = '';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.innerHTML = `<section class="pwa-gate-card" aria-labelledby="pwa-gate-title" aria-describedby="pwa-gate-copy">
      <div class="pwa-gate-top"><span>JWETPRO</span><div class="pwa-gate-progress" data-pwa-progress role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1" aria-label="Étape 1 sur 3"><i data-pwa-progress-step></i><i data-pwa-progress-step></i><i data-pwa-progress-step></i></div></div>
      <div class="pwa-gate-body">
        <p class="pwa-gate-kicker" data-pwa-kicker></p>
        <h2 id="pwa-gate-title" data-pwa-title aria-live="polite"></h2>
        <p class="pwa-gate-copy" id="pwa-gate-copy" data-pwa-copy></p>
        <div class="pwa-gate-error" data-pwa-error role="status" aria-live="polite" hidden></div>
        <button class="pwa-gate-primary" type="button" data-pwa-action="primary" data-action=""></button>
      </div>
    </section>`;
    document.body.append(overlay);
    paintGate(overlay);
    overlay.querySelector('button')?.focus({preventScroll:true});
    overlay.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      overlay.querySelector('button')?.focus();
    });
    return overlay;
  };

  const closeGate = overlay => {
    overlay?.remove();
    document.body.classList.remove('pwa-gate-open');
  };

  const humanError = error => {
    const code = String(error?.message || error || '');
    if (code === 'missing-vapid-key') return 'Notifications momentanément indisponibles.';
    if (code === 'auth-required') return 'Connecte-toi à ton compte joueur.';
    if (code === 'notification-denied') return 'Autorise les notifications dans les réglages du navigateur.';
    if (code === 'push-unsupported') return 'Notifications non prises en charge par ce navigateur.';
    if (code === 'not-installed') return 'Installe JWETPRO, puis ouvre l’application.';
    if (code === 'incomplete-notifications') return 'Active les notifications pour continuer.';
    return 'Une erreur est survenue. Réessaie.';
  };

  const ready = () => isInstalled() && canNotify() && !needAuth() && localStorage.getItem('jwetpro-pwa-ready') === 'true';

  const requireGate = async options => {
    await waitForAuthReady();
    return new Promise(resolve => {
    if (ready()) return resolve(true);
    const overlay = renderGate();
    window.addEventListener('jwetpro-pwa-install-ready', () => paintGate(overlay), {once:true});
    window.addEventListener('jwetpro-pwa-installed', () => paintGate(overlay), {once:true});
    overlay.addEventListener('click', async event => {
      const action = event.target.closest('[data-pwa-action="primary"]')?.dataset.action;
      if (!action) return;
      try {
        if (action === 'install') { await installApp(); paintGate(overlay); }
        if (action === 'login') {
          try { localStorage.setItem('jwetpro-pwa-return-url', location.href); } catch {}
          location.href = './index.html#login';
          return;
        }
        if (action === 'notify') {
          await requestNotifications();
          if (ready()) { closeGate(overlay); resolve(true); return; }
          paintGate(overlay);
        }
        if (action === 'check') {
          if (ready()) { closeGate(overlay); resolve(true); return; }
          if ('Notification' in window && Notification.permission === 'granted' && !localStorage.getItem('jwetpro-pwa-ready')) await registerSubscription();
          if (ready()) { closeGate(overlay); resolve(true); return; }
          throw new Error(isInstalled() ? 'incomplete-notifications' : 'not-installed');
        }
      } catch (error) {
        paintGate(overlay, humanError(error));
      }
    });
    });
  };

  ensureServiceWorker().catch(error => console.warn('JWETPRO PWA service worker unavailable:', error));
  window.JwetproPwaGate = {require:requireGate, ready, installApp, requestNotifications, registerSubscription};
})();
