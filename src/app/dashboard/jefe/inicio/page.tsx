"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getCapital, type CapitalResponse } from "@/lib/capital";
import { getEmpresa } from "@/lib/empresa";
import type { EmpresaProfile } from "@/types/empresa";

function formatMoneda(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Separa el nombre para mostrar: primera palabra con gradiente, resto en blanco. */
function splitNombreParaGradiente(nombre: string): { conGradiente: string; resto: string } {
  const t = nombre.trim();
  if (!t) return { conGradiente: "", resto: "" };
  const partes = t.split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { conGradiente: t, resto: "" };
  return {
    conGradiente: partes[0],
    resto: " " + partes.slice(1).join(" "),
  };
}

function IconPerson() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconMapPin() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconImagePlaceholder() {
  return (
    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export default function InicioJefePage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState<EmpresaProfile | null>(null);
  const [capital, setCapital] = useState<CapitalResponse | null>(null);
  const [finanzasError, setFinanzasError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profile.role !== "jefe" || !user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setFinanzasError(null);
      try {
        const token = await user.getIdToken();
        const [empresaResult, capitalResult] = await Promise.allSettled([
          getEmpresa(profile.uid),
          getCapital(token),
        ]);
        if (cancelled) return;
        if (empresaResult.status === "fulfilled" && empresaResult.value) {
          setEmpresa(empresaResult.value);
        }
        if (capitalResult.status === "fulfilled") {
          setCapital(capitalResult.value);
        } else {
          const reason = capitalResult.reason;
          setCapital(null);
          setFinanzasError(
            reason instanceof Error ? reason.message : "No se pudo cargar base y capital"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, user]);

  if (loading) {
    return (
      <div className="jefe-inicio-card">
        <div className="jefe-inicio-hero jefe-inicio-hero-loading" aria-busy="true">
          <div className="jefe-inicio-hero-bg" aria-hidden />
          <div className="jefe-inicio-skeleton-logo" />
          <div className="jefe-inicio-skeleton-title" />
          <div className="jefe-inicio-skeleton-chips" />
        </div>
        <div className="jefe-inicio-finanzas jefe-inicio-finanzas-loading" aria-hidden>
          <div className="jefe-inicio-skeleton-monto" />
          <div className="jefe-inicio-skeleton-monto" />
        </div>
      </div>
    );
  }

  const nombre = empresa?.nombre?.trim() || "";
  const logo = empresa?.logo?.trim() || "";
  const dueño = empresa?.dueño?.trim() || profile?.displayName || "";
  const sede = empresa?.sedePrincipal?.trim() || "";
  const activa = empresa?.activa !== false;
  const { conGradiente, resto } = splitNombreParaGradiente(nombre || "Mi empresa");

  return (
    <div className="jefe-inicio-card">
      <section className="jefe-inicio-hero" aria-labelledby="jefe-inicio-nombre">
        <div className="jefe-inicio-hero-bg" aria-hidden />

        <div className="jefe-inicio-logo-wrap">
          {logo ? (
            <img src={logo} alt="" className="jefe-inicio-logo-img" />
          ) : (
            <div className="jefe-inicio-logo-placeholder">
              <IconImagePlaceholder />
              <span className="jefe-inicio-logo-placeholder-text">
                {nombre ? `${nombre.split(/\s+/)[0] || ""} Logo` : "Logo"}
              </span>
            </div>
          )}
        </div>

        <h1 id="jefe-inicio-nombre" className="jefe-inicio-nombre">
          {conGradiente && (
            <span className="jefe-inicio-nombre-gradient">{conGradiente}</span>
          )}
          {resto && <span className="jefe-inicio-nombre-resto">{resto}</span>}
          {!nombre && <span className="jefe-inicio-nombre-resto">Mi empresa</span>}
        </h1>

        <div className="jefe-inicio-chips">
          <span
            className={`jefe-inicio-chip jefe-inicio-chip-estado ${activa ? "jefe-inicio-chip-activa" : "jefe-inicio-chip-inactiva"}`}
            aria-label={activa ? "Empresa activa" : "Empresa inactiva"}
          >
            <span className="jefe-inicio-chip-dot" aria-hidden />
            Empresa {activa ? "activa" : "inactiva"}
          </span>
          {dueño && (
            <span className="jefe-inicio-chip jefe-inicio-chip-dueño">
              <IconPerson aria-hidden />
              {dueño}
            </span>
          )}
          {sede && (
            <span className="jefe-inicio-chip jefe-inicio-chip-sede">
              <IconMapPin aria-hidden />
              {sede}
            </span>
          )}
        </div>

        {!nombre && !logo && (
          <p className="jefe-inicio-hint">
            Configura el nombre y el logo en{" "}
            <Link href="/dashboard/jefe/empresa">Perfil de la empresa</Link>.
          </p>
        )}
      </section>

      <section className="jefe-inicio-finanzas" aria-labelledby="jefe-inicio-finanzas-heading">
        <h2 id="jefe-inicio-finanzas-heading" className="jefe-inicio-finanzas-title">
          Base y capital de la empresa
        </h2>
        {finanzasError && (
          <p className="jefe-inicio-finanzas-error" role="alert">
            {finanzasError}
          </p>
        )}
        {!finanzasError && capital && (
          <div className="jefe-inicio-finanzas-grid">
            <div className="jefe-inicio-monto-card">
              <span className="jefe-inicio-monto-label">Base empresa</span>
              <span className="jefe-inicio-monto-valor" aria-live="polite">
                {formatMoneda(capital.cajaEmpresa)}
              </span>
            </div>
            <div className="jefe-inicio-monto-card">
              <span className="jefe-inicio-monto-label">Capital empresa</span>
              <span className="jefe-inicio-monto-valor" aria-live="polite">
                {formatMoneda(capital.capitalEmpresa)}
              </span>
            </div>
          </div>
        )}
        <Link href="/dashboard/jefe/gestion-financiera" className="jefe-inicio-finanzas-link">
          Ver gestión financiera
        </Link>
      </section>
    </div>
  );
}
