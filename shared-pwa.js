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
  const installHint = () => {
    if (isInstalled()) return 'Application détectée.';
    if (state.installPrompt) return 'Appuie sur Installer. La fenêtre du navigateur va s’ouvrir, puis confirme l’installation.';
    return 'Si aucun bouton d’installation ne s’ouvre, utilise le menu du navigateur : Ajouter à l’écran d’accueil ou Installer l’application.';
  };
  const notifyHint = () => {
    if (canNotify()) return 'Notifications activées.';
    if (needAuth()) return 'Connecte-toi d’abord : les alertes doivent être liées à ton compte joueur.';
    if (!VAPID_KEY) return 'Configuration Web Push en attente côté JWETPRO. Les alertes hors application seront activées dès que la clé de production est ajoutée.';
    return 'Autorise les notifications pour recevoir les championnats ouverts, rappels de match, coupons, messages et résultats.';
  };
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

  const paintGate = overlay => {
    if (!overlay) return;
    const installed = isInstalled();
    const notified = canNotify() && localStorage.getItem('jwetpro-pwa-ready') === 'true';
    const authenticated = !needAuth();
    const installStep = overlay.querySelector('[data-pwa-step="install"]');
    const notifyStep = overlay.querySelector('[data-pwa-step="notify"]');
    const authStep = overlay.querySelector('[data-pwa-step="auth"]');
    installStep?.classList.toggle('is-done', installed);
    notifyStep?.classList.toggle('is-done', notified);
    authStep?.classList.toggle('is-done', authenticated);
    const installText = overlay.querySelector('[data-pwa-install-text]');
    const notifyText = overlay.querySelector('[data-pwa-notify-text]');
    const authText = overlay.querySelector('[data-pwa-auth-text]');
    if (installText) installText.textContent = installHint();
    if (notifyText) notifyText.textContent = notifyHint();
    if (authText) authText.textContent = authenticated ? 'Compte joueur détecté.' : 'Connecte-toi pour que les alertes soient liées à tes matchs, coupons et messages privés.';
    const installButton = overlay.querySelector('[data-pwa-action="install"]');
    const notifyButton = overlay.querySelector('[data-pwa-action="notify"]');
    const loginButton = overlay.querySelector('[data-pwa-action="login"]');
    if (installButton) installButton.textContent = installed ? 'Application installée' : 'Installer l’application';
    if (notifyButton) notifyButton.textContent = notified ? 'Notifications activées' : 'Activer les notifications';
    if (loginButton) loginButton.textContent = authenticated ? 'Compte connecté' : 'Se connecter';
  };

  const renderGate = options => {
    const old = document.querySelector('[data-pwa-gate]');
    if (old) old.remove();
    document.body.classList.add('pwa-gate-open');
    const installed = isInstalled();
    const notified = canNotify();
    const authenticated = !needAuth();
    const reason = options?.reason || 'continuer';
    const overlay = document.createElement('div');
    overlay.className = 'pwa-gate-backdrop';
    overlay.dataset.pwaGate = '';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.innerHTML = `<section class="pwa-gate-card" aria-labelledby="pwa-gate-title">
      <div class="pwa-gate-hero"><div class="pwa-gate-mark">JP</div><div><p class="pwa-gate-kicker">Application JWETPRO</p><h2 id="pwa-gate-title">Installe l'application pour ${reason}</h2><p>Les matchs, replays et entraînements fonctionnent mieux dans l'application. Elle garde ton accès prêt, t'envoie les alertes importantes et évite de rater les cinq minutes pour rejoindre un championnat.</p></div></div>
      <div class="pwa-gate-body">
        <ol class="pwa-gate-steps">
          <li class="pwa-gate-step ${installed?'is-done':''}" data-pwa-step="install"><b>1</b><div><strong>Installer JWETPRO</strong><span data-pwa-install-text>${installHint()}</span></div></li>
          <li class="pwa-gate-step ${authenticated?'is-done':''}" data-pwa-step="auth"><b>2</b><div><strong>Rester connecté au compte joueur</strong><span data-pwa-auth-text>${authenticated?'Compte joueur détecté.':'Connecte-toi pour que les alertes soient liées à tes matchs, coupons et messages privés.'}</span></div></li>
          <li class="pwa-gate-step ${notified?'is-done':''}" data-pwa-step="notify"><b>3</b><div><strong>Activer les notifications</strong><span data-pwa-notify-text>${notifyHint()}</span></div></li>
        </ol>
        <div class="pwa-gate-actions">
          <button class="pwa-gate-primary" type="button" data-pwa-action="install">${installed?'Application installée':'Installer l’application'}</button>
          <button class="pwa-gate-secondary" type="button" data-pwa-action="login">${authenticated?'Compte connecté':'Se connecter'}</button>
          <button class="pwa-gate-primary" type="button" data-pwa-action="notify">${notified?'Notifications activées':'Activer les notifications'}</button>
          <button class="pwa-gate-secondary" type="button" data-pwa-action="check">J’ai terminé</button>
        </div>
        <div class="pwa-gate-note">Sur iPhone : touche Partager, puis Ajouter à l’écran d’accueil. Sur Android ou ordinateur : utilise le bouton Installer ou l’icône d’installation dans la barre d’adresse.</div>
        <div class="pwa-gate-error" data-pwa-error hidden></div>
      </div>
    </section>`;
    document.body.append(overlay);
    paintGate(overlay);
    return overlay;
  };

  const closeGate = overlay => {
    overlay?.remove();
    document.body.classList.remove('pwa-gate-open');
  };

  const humanError = error => {
    const code = String(error?.message || error || '');
    if (code === 'missing-vapid-key') return 'La clé Web Push JWETPRO n’est pas encore configurée. Ajoute la clé VAPID publique dans window.JWETPRO_PUSH_VAPID_KEY pour activer les notifications hors application.';
    if (code === 'auth-required') return 'Connecte-toi à ton compte joueur, puis réessaie. Les notifications doivent être attachées à ton compte.';
    if (code === 'notification-denied') return 'Les notifications sont bloquées dans le navigateur. Ouvre les paramètres du site, autorise les notifications, puis reviens ici.';
    if (code === 'push-unsupported') return 'Ce navigateur ne supporte pas les notifications web de JWETPRO. Ouvre JWETPRO dans Chrome, Edge, Safari récent ou installe l’application.';
    if (code === 'not-installed') return 'Installe d’abord JWETPRO avec le bouton Installer ou le menu du navigateur, puis reviens appuyer sur « J’ai terminé ».';
    if (code === 'incomplete-notifications') return 'Il reste l’étape notifications : connecte-toi si nécessaire, puis active les notifications JWETPRO.';
    return 'Impossible de terminer cette étape pour le moment. Vérifie ta connexion puis réessaie.';
  };

  const ready = () => isInstalled() && canNotify() && !needAuth() && localStorage.getItem('jwetpro-pwa-ready') === 'true';

  const requireGate = async options => {
    await waitForAuthReady();
    return new Promise(resolve => {
    if (ready()) return resolve(true);
    const overlay = renderGate(options);
    const errorBox = overlay.querySelector('[data-pwa-error]');
    const showError = error => { errorBox.hidden = false; errorBox.textContent = humanError(error); };
    window.addEventListener('jwetpro-pwa-install-ready', () => paintGate(overlay), {once:true});
    window.addEventListener('jwetpro-pwa-installed', () => paintGate(overlay), {once:true});
    overlay.addEventListener('click', async event => {
      const action = event.target.closest('[data-pwa-action]')?.dataset.pwaAction;
      if (!action) return;
      errorBox.hidden = true;
      try {
        if (action === 'install') { await installApp(); paintGate(overlay); }
        if (action === 'notify') { await requestNotifications(); paintGate(overlay); }
        if (action === 'login') {
          try { localStorage.setItem('jwetpro-pwa-return-url', location.href); } catch {}
          location.href = './index.html#login';
          return;
        }
        if (action === 'check') {
          if (ready()) { closeGate(overlay); resolve(true); return; }
          if ('Notification' in window && Notification.permission === 'granted' && !localStorage.getItem('jwetpro-pwa-ready')) await registerSubscription();
          if (ready()) { closeGate(overlay); resolve(true); return; }
          throw new Error(isInstalled() ? 'incomplete-notifications' : 'not-installed');
        }
      } catch (error) {
        showError(error);
      }
    });
    });
  };

  ensureServiceWorker().catch(error => console.warn('JWETPRO PWA service worker unavailable:', error));
  window.JwetproPwaGate = {require:requireGate, ready, installApp, requestNotifications, registerSubscription};
})();
