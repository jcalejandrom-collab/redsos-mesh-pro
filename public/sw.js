// Service Worker para notificaciones push en background de RedSOS Mesh
// Permite recibir notificaciones aunque la app esté cerrada o en background

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    
    const options = {
      body: data.body || 'Alguien necesita ayuda cerca de ti',
      icon: '/redsos-icon.png',
      badge: '/redsos-icon.png',
      vibrate: [300, 100, 300, 100, 300, 500, 700, 100, 700, 100, 700, 500, 300, 100, 300, 100, 300],
      tag: data.alertId || 'redsos-alert',
      requireInteraction: true,
      actions: [
        { action: 'view', title: 'Ver en mapa' },
        { action: 'help', title: 'Voy a ayudar' }
      ],
      data: { 
        alertId: data.alertId || '', 
        lat: data.lat || 10.0735, 
        lng: data.lng || -69.3250 
      }
    };

    event.waitUntil(
      self.registration.showNotification(
        data.title || '⚠️ SOS Cercano - RedSOS',
        options
      )
    );
  } catch (err) {
    console.error('Error procesando push notification:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const alertId = event.notification.data?.alertId;
  let url = '/';
  
  if (event.action === 'help' && alertId) {
    url = `/?action=help&alertId=${alertId}`;
  } else if (alertId) {
    url = `/?action=view&alertId=${alertId}`;
  }
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una ventana abierta de la app, enfocarla y navegar
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((focusedClient) => focusedClient.navigate(url));
        }
      }
      // Si no, abrir una ventana nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
