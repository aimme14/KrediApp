"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoginForm from "@/components/LoginForm";
import ThemeToggle from "@/components/ThemeToggle";
import LoginShell, { LoginBackdrop } from "@/components/login/LoginShell";
import shellStyles from "@/components/login/loginShell.module.css";

function LoginFormSignOut() {
  const { signOut } = useAuth();
  return (
    <button type="button" className={shellStyles.outlineBtn} onClick={() => void signOut()}>
      Cerrar sesión
    </button>
  );
}

export default function HomePage() {
  const { user, profile, loading, isEnabled, error } = useAuth();
  const router = useRouter();
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(max-width: 840px)");
    const apply = () => {
      if (mq.matches) root.setAttribute("data-krediapp-login", "");
      else root.removeAttribute("data-krediapp-login");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      root.removeAttribute("data-krediapp-login");
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setShowSlowHint(false);
      return;
    }
    const id = window.setTimeout(() => setShowSlowHint(true), 8000);
    return () => {
      window.clearTimeout(id);
      setShowSlowHint(false);
    };
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      if (!isEnabled()) {
        router.replace("/deshabilitado");
        return;
      }
      router.replace("/dashboard");
    }
  }, [user, profile, loading, isEnabled, router]);

  if (loading) {
    return (
      <LoginBackdrop>
        <div className={shellStyles.themeCorner}>
          <ThemeToggle />
        </div>
        <div className={shellStyles.backdropInner}>
          <p>Cargando…</p>
          {showSlowHint ? (
            <p className={shellStyles.backdropHint}>
              Si esto tarda mucho, comprueba tu conexión, desactiva bloqueadores o recarga la página.
            </p>
          ) : null}
        </div>
      </LoginBackdrop>
    );
  }

  if (user && profile) {
    return (
      <LoginBackdrop>
        <div className={shellStyles.themeCorner}>
          <ThemeToggle />
        </div>
        <div className={shellStyles.backdropInner}>
          <p>Redirigiendo al panel…</p>
        </div>
      </LoginBackdrop>
    );
  }

  if (user && !profile) {
    return (
      <LoginShell>
        <h2 id="login-heading" className={shellStyles.panelTitle}>
          Perfil no disponible
        </h2>
        <p className={error?.trim() ? shellStyles.panelAlert : shellStyles.panelSub}>
          {error?.trim()
            ? error
            : "Tu cuenta no tiene un perfil asignado en la aplicación. Contacta al Super Administrador o al responsable para que te den de alta."}
        </p>
        <LoginFormSignOut />
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <LoginForm />
    </LoginShell>
  );
}
