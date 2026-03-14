"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile, Role } from "@/types/roles";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";

const USERS_COLLECTION = "users";

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
      const data = superSnap.data();
      return {
        uid: superSnap.id,
        email: data.email ?? "",
        displayName: data.displayName,
        role: "superAdmin" as Role,
        enabled: data.enabled !== false,
        createdBy: data.createdBy ?? "",
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        updatedAt: data.updatedAt?.toDate?.(),
      };
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
        const data = docSnap.data();
        return {
          uid, // Mantener el uid del usuario autenticado
          email: data.email ?? "",
          displayName: data.displayName,
          role: "superAdmin" as Role,
          enabled: data.enabled !== false,
          createdBy: data.createdBy ?? "",
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          updatedAt: data.updatedAt?.toDate?.(),
        };
      }
    }

    // Usuarios de empresas: índice en /users/{userId} (nueva estructura)
    // o datos completos (estructura antigua)
    const userRef = doc(db, USERS_COLLECTION, uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;
    const data = userSnap.data();
    const roleRaw = data.role as string;
    // Mapear "empleado" (Firestore) a "trabajador" (Role) para compatibilidad
    const role: Role = roleRaw === "empleado" ? "trabajador" : (roleRaw as Role);
    return {
      uid: userSnap.id,
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
  } catch (err) {
    if (typeof window !== "undefined") {
      console.error("[Auth] Error al obtener perfil:", err);
    }
    throw err;
  }
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
        const profile = await fetchUserProfile(user.uid, user.email ?? undefined);
        setState((s) => ({ ...s, user, profile, loading: false, error: null }));
      } catch {
        setState((s) => ({ ...s, user, profile: null, loading: false, error: null }));
      }
    });
    return () => unsub();
  }, []);

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
  const isEnabled = () => state.profile?.enabled !== false;

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
