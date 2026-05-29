import { NextResponse } from "next/server";
import { ES_DIA_ACTUAL_COLOMBIA_SW_SOURCE } from "@/lib/colombia-day-bounds";

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

${ES_DIA_ACTUAL_COLOMBIA_SW_SOURCE}

function guardarNotificacionPendiente(payload) {
  try {
    const db = indexedDB.open('krediapp_fcm', 1);
    db.onupgradeneeded = function (e) {
      e.target.result.createObjectStore('pendientes', { keyPath: 'id' });
    };
    db.onsuccess = function (e) {
      const data = payload.data || {};
      const at = Date.now();
      if (!esDiaActualColombia(at)) return;
      const database = e.target.result;
      const tx = database.transaction('pendientes', 'readwrite');
      const store = tx.objectStore('pendientes');
      const getAll = store.getAll();
      getAll.onsuccess = function () {
        (getAll.result || []).forEach(function (n) {
          if (!esDiaActualColombia(n.at || 0)) store.delete(n.id);
        });
        store.put({
          id: data.gastoId || data.pagoId || data.clienteId || data.prestamoId || data.solicitudId || String(at),
          title: data.title || 'Notificación',
          body: data.body || '',
          type: data.type || '',
          kind: data.type === 'cuota_prestamo' || data.type === 'prestamo_empleado' || data.type === 'solicitud_prestamo' ? 'cuota' : 'gasto',
          at: at,
        });
      };
    };
  } catch (e) {
    console.warn('[SW] No se pudo guardar notificación pendiente:', e);
  }
}

messaging.onBackgroundMessage(function (payload) {
  guardarNotificacionPendiente(payload);
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'angry birds';
  const body = data.body || payload.notification?.body || '';

  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
    const hasVisibleClient = clients.some(function (c) {
      return c.visibilityState === 'visible';
    });

    if (hasVisibleClient) {
      clients.forEach(function (client) {
        if (client.visibilityState === 'visible') {
          if (data.type === 'gasto_empleado' || data.type === 'cuota_prestamo' || data.type === 'cliente_empleado' || data.type === 'solicitud_prestamo') {
            client.postMessage({
              type: 'KREDI_FCM_OPERATIVO',
              kind: data.type === 'cuota_prestamo' || data.type === 'solicitud_prestamo' ? 'cuota' : 'gasto',
              title: title,
              body: body,
              messageId: payload.messageId || data.gastoId || data.pagoId || data.clienteId || data.prestamoId || data.solicitudId || '',
              gastoId: data.gastoId || '',
              pagoId: data.pagoId || '',
              clienteId: data.clienteId || '',
              prestamoId: data.prestamoId || '',
              solicitudId: data.solicitudId || '',
            });
          } else if (data.type === 'prestamo_empleado') {
            client.postMessage({
              type: 'KREDI_FCM_PRESTAMO',
              title: title,
              body: body,
              messageId: payload.messageId || data.gastoId || data.pagoId || data.clienteId || data.prestamoId || '',
              gastoId: data.gastoId || '',
              pagoId: data.pagoId || '',
              clienteId: data.clienteId || '',
              prestamoId: data.prestamoId || '',
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
