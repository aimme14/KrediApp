import { cert, getApps, initializeApp } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Auth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import type { Messaging } from "firebase-admin/messaging";

const projectId = (process.env.FIREBASE_PROJECT_ID ?? "").trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL ?? "").trim();
const rawKey = (process.env.FIREBASE_PRIVATE_KEY ?? "").trim();
const privateKey = rawKey.replace(/\\n/g, "\n");

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0] as App;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Faltan variables de entorno de Firebase Admin (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)");
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminMessaging(): Messaging {
  return getMessaging(getAdminApp());
}
