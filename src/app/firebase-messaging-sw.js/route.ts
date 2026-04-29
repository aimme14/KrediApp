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

  const script = `importScripts(
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js'
);
firebase.initializeApp(${cfg});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(function (payload) {
  const n = payload.notification || {};
  const title = n.title || 'KrediApp';
  const body = n.body || '';
  const data = payload.data || {};
  if (data.type === 'gasto_empleado') {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      clients.forEach(function (client) {
        client.postMessage({
          type: 'KREDI_FCM_GASTO',
          title: title,
          body: body,
        });
      });
    });
  }
  return self.registration.showNotification(title, {
    body: body,
    data: data,
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
