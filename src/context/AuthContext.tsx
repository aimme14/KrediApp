"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile, Role } from "@/types/roles";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  hasRole: (role: Role) => boolean;
  isEnabled: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_COLLECTION = "users";

async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  const ref = doc(db, PROFILE_COLLECTION, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: snap.id,
    email: data.email ?? "",
    displayName: data.displayName,
    role: data.role as Role,
    enabled: data.enabled !== false,
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.(),
  };
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
        const profile = await fetchUserProfile(user.uid);
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
      const message = e instanceof Error ? e.message : "Error al iniciar sesión";
      setState((s) => ({ ...s, error: message }));
      throw e;
    }
  };

  const signOut = async () => {
    if (auth) await firebaseSignOut(auth);
    setState({ user: null, profile: null, loading: false, error: null });
  };

  const clearError = () => setState((s) => ({ ...s, error: null }));

  const hasRole = (role: Role) => state.profile?.role === role;
  const isEnabled = () => state.profile?.enabled !== false;

  const value: AuthContextValue = {
    ...state,
    signIn,
    signOut,
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
