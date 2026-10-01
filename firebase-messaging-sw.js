self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = {body:event.data?.text() || ''}; }
  const title = String(payload.title || 'JWETPRO').slice(0, 120);
  const options = {
    body:String(payload.body || 'Ou as yon nouvo notifikasyon JWETPRO.').slice(0, 240),
    icon:'/favicon.svg',
    badge:'/favicon.svg',
    tag:String(payload.tag || payload.notificationId || 'jwetpro-notification').slice(0, 180),
    data:{url:payload.url || '/', notificationId:payload.notificationId || ''}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/', self.location.origin);
  if (destination.origin !== self.location.origin) return;
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(clientList => {
    const existing = clientList.find(client => {
      try {
        const current = new URL(client.url);
        return current.origin === destination.origin && current.pathname === destination.pathname && current.search === destination.search;
      } catch { return false; }
    });
    if (existing) return existing.focus();
    return clients.openWindow(`${destination.pathname}${destination.search}${destination.hash}`);
  }));
});
