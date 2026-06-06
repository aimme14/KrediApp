import { NextResponse } from "next/server";

/**
 * Service Worker para FCM (web). Debe vivir en la raíz del sitio como `/firebase-messaging-sw.js`.
 * La configuración se inyecta desde las mismas variables públicas que el cliente.
 */
export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "";
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "";

  const cfg = JSON.stringify({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  });

  const script = `self.addEventListener('install', function (event) {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});
importScripts(
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js'
);
firebase.initializeApp(${cfg});
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  var data = payload.data || {};
  var title = data.title || payload.notification?.title || 'KrediApp';
  var body = data.body || payload.notification?.body || '';
  var clickPath = data.click_action || '/dashboard/admin';

  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
    var hasVisible = clients.some(function (c) {
      return c.visibilityState === 'visible';
    });
    if (hasVisible) return;

    var tag = data.gastoId || data.pagoId || data.clienteId || data.prestamoId || data.solicitudId || '';
    return self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || undefined,
      data: Object.assign({}, data, { click_action: clickPath }),
    });
  });
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var raw = (event.notification.data && event.notification.data.click_action) || '/dashboard/admin';
  var url = raw.indexOf('http') === 0 ? raw : (self.location.origin + (raw.charAt(0) === '/' ? raw : '/' + raw));
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          if ('navigate' in client && typeof client.navigate === 'function') {
            return client.navigate(url).then(function () { return client.focus(); });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
