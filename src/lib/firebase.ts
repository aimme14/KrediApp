import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Solo inicializamos Firebase cuando hay API key (evita auth/invalid-api-key en build de Vercel). */
const hasConfig =
  typeof process.env.NEXT_PUBLIC_FIREBASE_API_KEY === "string" &&
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY.length > 0;

function createDb(firebaseApp: FirebaseApp): Firestore {
  if (typeof window === "undefined") {
    return getFirestore(firebaseApp);
  }
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Firebase] Persistencia IndexedDB no disponible, usando memoria.", e);
    }
    try {
      return initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache(),
      });
    } catch {
      return getFirestore(firebaseApp);
    }
  }
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (hasConfig) {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = createDb(app);
    storage = getStorage(app);
  } else {
    app = getApps()[0] as FirebaseApp;
    auth = getAuth(app);
    db = createDb(app);
    storage = getStorage(app);
  }
}

export { app, auth, db, storage };
