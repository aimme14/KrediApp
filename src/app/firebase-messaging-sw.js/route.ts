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
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'KrediApp';
  const body = data.body || payload.notification?.body || '';

  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
    const hasVisibleClient = clients.some(function (c) {
      return c.visibilityState === 'visible';
    });

    if (hasVisibleClient) {
      clients.forEach(function (client) {
        if (client.visibilityState === 'visible') {
          if (data.type === 'gasto_empleado' || data.type === 'cuota_prestamo') {
            client.postMessage({
              type: 'KREDI_FCM_OPERATIVO',
              kind: data.type === 'cuota_prestamo' ? 'cuota' : 'gasto',
              title: title,
              body: body,
            });
          } else if (data.type === 'prestamo_empleado') {
            client.postMessage({
              type: 'KREDI_FCM_PRESTAMO',
              title: title,
              body: body,
            });
          }
        }
      });
      return;
    }

    return self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: data,
    });
  });
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
