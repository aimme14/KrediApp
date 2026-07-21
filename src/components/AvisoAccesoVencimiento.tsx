"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getEmpresa } from "@/lib/empresa";
import {
  debeMostrarAvisoAccesoHasta,
  esRolAvisoAcceso,
  puedeMostrarAvisoPorThrottle,
  registrarAvisoAccesoVisto,
  resolverEmpresaIdParaAcceso,
} from "@/lib/aviso-acceso-vencimiento";

function RocketIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function StarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5l2.9 6.1 6.7.8-5 4.6 1.3 6.6L12 17.4 6.1 20.6l1.3-6.6-5-4.6 6.7-.8L12 2.5z" />
    </svg>
  );
}

function DollarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * Modal de aviso cuando faltan 1–2 días para el corte de acceso.
 * No bloquea el uso: se puede cerrar y seguir en el dashboard.
 */
export default function AvisoAccesoVencimiento() {
  const { profile, loading } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !profile || !esRolAvisoAcceso(profile.role)) {
      setOpen(false);
      return;
    }

    const empresaId = resolverEmpresaIdParaAcceso(profile);
    if (!empresaId) {
      setOpen(false);
      return;
    }

    if (!puedeMostrarAvisoPorThrottle(profile.uid)) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    getEmpresa(empresaId)
      .then((empresa) => {
        if (cancelled) return;
        const hasta = empresa?.accesoHasta ?? null;
        setOpen(debeMostrarAvisoAccesoHasta(hasta));
      })
      .catch(() => {
        if (!cancelled) setOpen(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, profile]);

  const handleCerrar = useCallback(() => {
    if (profile?.uid) {
      registrarAvisoAccesoVisto(profile.uid);
    }
    setOpen(false);
  }, [profile?.uid]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, handleCerrar]);

  if (!open) return null;

  return (
    <div
      className="aviso-acceso-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aviso-acceso-titulo"
    >
      <div className="aviso-acceso-backdrop" onClick={handleCerrar} aria-hidden />
      <div className="card aviso-acceso-card" onClick={(e) => e.stopPropagation()}>
        <div className="aviso-acceso-deco" aria-hidden>
          <span className="aviso-acceso-deco-item aviso-acceso-deco-star">
            <StarIcon />
          </span>
          <span className="aviso-acceso-deco-item aviso-acceso-deco-rocket">
            <RocketIcon size={20} />
          </span>
          <span className="aviso-acceso-deco-item aviso-acceso-deco-dollar">
            <DollarIcon />
          </span>
          <span className="aviso-acceso-deco-item aviso-acceso-deco-bell">
            <BellIcon />
          </span>
        </div>

        <div className="aviso-acceso-icon" aria-hidden>
          <RocketIcon size={24} />
        </div>

        <p className="aviso-acceso-body">
          Gracias por hacer parte de nuestra plataforma. Recuerda mantener tu cuenta al día
          para disfrutar del servicio sin interrupciones.
        </p>

        <div className="aviso-acceso-actions">
          <button type="button" className="btn btn-secondary" onClick={handleCerrar}>
            Cerrar y continuar
          </button>
        </div>
      </div>
    </div>
  );
}
