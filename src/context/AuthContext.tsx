"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile, Role } from "@/types/roles";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";

const USERS_COLLECTION = "users";

/** Evita pantalla infinita si Firestore no responde al leer el perfil. */
const PROFILE_FETCH_TIMEOUT_MS = 15_000;
const PROFILE_TIMEOUT_MESSAGE =
  "La conexión tardó demasiado al cargar tu perfil. Comprueba tu internet, desactiva VPN o bloqueadores y recarga la página.";

function profileFetchTimeoutError(): Error {
  const e = new Error("AUTH_PROFILE_TIMEOUT");
  e.name = "AuthProfileTimeout";
  return e;
}

function isProfileTimeout(e: unknown): boolean {
  return e instanceof Error && e.message === "AUTH_PROFILE_TIMEOUT";
}

/** Convierte errores de Firebase Auth a mensajes en español genéricos (sin revelar si el email existe). */
function getAuthErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return "El correo no es válido.";
    case "auth/user-disabled":
      return "Esta cuenta está deshabilitada. Contacta al administrador.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Correo o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
    case "auth/network-request-failed":
      return "Error de conexión. Revisa tu internet e inténtalo de nuevo.";
    default:
      return err?.message && typeof err.message === "string" && err.message.length > 0
        ? err.message
        : "Error al iniciar sesión. Inténtalo de nuevo.";
  }
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reauthWithPassword: (password: string) => Promise<void>;
  clearError: () => void;
  hasRole: (role: Role) => boolean;
  isEnabled: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function superAdminDataToProfile(profileUid: string, data: DocumentData): UserProfile {
  return {
    uid: profileUid,
    email: data.email ?? "",
    displayName: data.displayName,
    role: "superAdmin",
    enabled: data.enabled !== false,
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.(),
  };
}

function usersDataToProfile(docUid: string, data: DocumentData): UserProfile {
  const roleRaw = data.role as string;
  const role: Role = roleRaw === "empleado" ? "trabajador" : (roleRaw as Role);
  return {
    uid: docUid,
    email: data.email ?? "",
    displayName: data.displayName,
    role,
    enabled: data.enabled !== false,
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.(),
    empresaId: data.empresaId,
    cedula: data.cedula,
    lugar: data.lugar,
    base: data.base,
    adminId: data.adminId,
    rutaId: data.rutaId ?? undefined,
  };
}

async function fetchUserProfile(
  uid: string,
  email?: string | null
): Promise<UserProfile | null> {
  if (!db) {
    if (typeof window !== "undefined") {
      console.error("[Auth] Firestore no está configurado. Verifica las variables NEXT_PUBLIC_FIREBASE_* en .env.local");
    }
    return null;
  }

  try {
    // Super Admin: datos en /superAdmin/{adminID}
    const superRef = doc(db, SUPER_ADMIN_COLLECTION, uid);
    const superSnap = await getDoc(superRef);
    if (superSnap.exists()) {
      return superAdminDataToProfile(superSnap.id, superSnap.data());
    }

    // Fallback: buscar Super Admin por email (por si el UID no coincide)
    if (email) {
      const q = query(
        collection(db, SUPER_ADMIN_COLLECTION),
        where("email", "==", email)
      );
      const emailSnap = await getDocs(q);
      if (!emailSnap.empty) {
        const docSnap = emailSnap.docs[0];
        return superAdminDataToProfile(uid, docSnap.data());
      }
    }

    // Usuarios de empresas: índice en /users/{userId} (nueva estructura)
    // o datos completos (estructura antigua)
    const userRef = doc(db, USERS_COLLECTION, uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;
    return usersDataToProfile(userSnap.id, userSnap.data());
  } catch (err) {
    if (typeof window !== "undefined") {
      console.error("[Auth] Error al obtener perfil:", err);
    }
    throw err;
  }
}

/** True si conviene volver a llamar a sync-claims por cambios que viajan en el token. */
function shouldResyncClaims(prev: UserProfile | null, next: UserProfile): boolean {
  if (!prev) return true;
  if (prev.role !== next.role) return true;
  if ((prev.enabled !== false) !== (next.enabled !== false)) return true;
  if (next.role === "superAdmin") return false;
  if ((prev.empresaId ?? "") !== (next.empresaId ?? "")) return true;
  if ((prev.rutaId ?? "") !== (next.rutaId ?? "")) return true;
  if ((prev.adminId ?? "") !== (next.adminId ?? "")) return true;
  return false;
}

/** Refresca claims en Auth cuando el perfil en Firestore cambia campos relevantes. */
function queueClaimsSync(user: User) {
  queueMicrotask(() => {
    user
      .getIdToken()
      .then((idToken) =>
        fetch("/api/users/me/sync-claims", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        })
      )
      .then(() => user.getIdToken(true))
      .catch(() => {});
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!auth) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, profile: null, loading: false, error: null });
        return;
      }
      try {
        const profile = await new Promise<UserProfile | null>((resolve, reject) => {
          let settled = false;
          const t = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(profileFetchTimeoutError());
          }, PROFILE_FETCH_TIMEOUT_MS);
          fetchUserProfile(user.uid, user.email ?? undefined)
            .then((p) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(t);
              resolve(p);
            })
            .catch((err) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(t);
              reject(err instanceof Error ? err : new Error(String(err)));
            });
        });
        setState((s) => ({ ...s, user, profile, loading: false, error: null }));
        try {
          const idToken = await user.getIdToken();
          await fetch("/api/users/me/sync-claims", {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
          });
          await user.getIdToken(true);
        } catch {
          /* claims opcionales si la API falla */
        }
      } catch (e: unknown) {
        const message = isProfileTimeout(e)
          ? PROFILE_TIMEOUT_MESSAGE
          : e instanceof Error && e.message
            ? e.message
            : "No se pudo cargar tu perfil. Inténtalo de nuevo.";
        setState((s) => ({
          ...s,
          user,
          profile: null,
          loading: false,
          error: message,
        }));
      }
    });
    return () => unsub();
  }, []);

  /** Escucha cambios en el documento del usuario (p. ej. enabled) sin polling. */
  useEffect(() => {
    if (!db || !state.user || !state.profile) return;

    const uid = state.user.uid;
    const role = state.profile.role;

    if (role === "superAdmin") {
      const ref = doc(db, SUPER_ADMIN_COLLECTION, uid);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) return;
          setState((s) => {
            if (!s.user || s.user.uid !== uid || s.profile?.role !== "superAdmin") return s;
            const nextProf = superAdminDataToProfile(uid, snap.data()!);
            if (shouldResyncClaims(s.profile, nextProf) && s.user) queueClaimsSync(s.user);
            return { ...s, profile: nextProf, error: null };
          });
        },
        (err) => {
          if (typeof window !== "undefined") {
            console.error("[Auth] Listener superAdmin:", err);
          }
        }
      );
      return unsub;
    }

    if (role === "jefe" || role === "admin" || role === "trabajador") {
      const ref = doc(db, USERS_COLLECTION, uid);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setState((s) =>
              s.user?.uid === uid
                ? {
                    ...s,
                    profile: null,
                    error: "Tu perfil ya no está disponible en el sistema.",
                  }
                : s
            );
            return;
          }
          setState((s) => {
            if (!s.user || s.user.uid !== uid) return s;
            const nextProf = usersDataToProfile(uid, snap.data()!);
            if (shouldResyncClaims(s.profile, nextProf) && s.user) queueClaimsSync(s.user);
            return { ...s, profile: nextProf, error: null };
          });
        },
        (err) => {
          if (typeof window !== "undefined") {
            console.error("[Auth] Listener users:", err);
          }
        }
      );
      return unsub;
    }

    return undefined;
  }, [state.user?.uid, state.profile?.role]);

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase no está configurado. Revisa las variables de entorno.");
    setState((s) => ({ ...s, error: null }));
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: unknown) {
      const message = getAuthErrorMessage(e);
      setState((s) => ({ ...s, error: message }));
      throw e;
    }
  };

  const signOut = async () => {
    if (auth) await firebaseSignOut(auth);
    setState({ user: null, profile: null, loading: false, error: null });
  };

  /** Re-autentica al usuario actual con su contraseña (p. ej. tras bloqueo por inactividad). */
  const reauthWithPassword = async (password: string) => {
    if (!auth || !state.user) throw new Error("No hay sesión activa.");
    const email = state.user.email ?? state.profile?.email;
    if (!email) throw new Error("No se puede re-autenticar: falta el correo del usuario.");
    const credential = EmailAuthProvider.credential(email, password);
    await reauthenticateWithCredential(state.user, credential);
  };

  const clearError = () => setState((s) => ({ ...s, error: null }));

  const hasRole = (role: Role) => state.profile?.role === role;
  const isEnabled = useCallback(
    () => state.profile?.enabled !== false,
    [state.profile]
  );

  const value: AuthContextValue = {
    ...state,
    signIn,
    signOut,
    reauthWithPassword,
    clearError,
    hasRole,
    isEnabled,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
