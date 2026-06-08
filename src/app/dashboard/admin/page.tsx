"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { AdminRutaStatsGrid } from "@/components/AdminRutaStatsGrid";

function formatMoneda(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatFechaCabecera(d: Date): string {
  const raw = d.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function AdminDashboardPage() {
  const { user, profile } = useAuth();
  const {
    rutas,
    cajaAdmin,
    capitalAdmin,
    gananciasTotales,
    gastosAdminPeriodo,
    totalClientes,
    totalMorosos,
    totalPrestamosActivos,
    loading,
    error,
  } = useAdminDashboard();

  const fechaTitulo = useMemo(() => formatFechaCabecera(new Date()), []);

  const nombreBienvenida = useMemo(() => {
    if (!profile) return "Administrador";
    const n = profile.displayName?.trim();
    if (n) return n;
    const em = (profile.email || user?.email || "").trim();
    if (em) {
      const local = em.split("@")[0] ?? "";
      if (local) return local.replace(/[._]+/g, " ").trim() || em;
    }
    return "Administrador";
  }, [profile, user?.email]);

  const stats = useMemo(
    () => ({
      rutasProgramadas: rutas.length,
      rutasActivas: rutas.length,
      clientes: totalClientes,
      prestamosActivos: totalPrestamosActivos,
      morosos: totalMorosos,
    }),
    [rutas.length, totalClientes, totalPrestamosActivos, totalMorosos]
  );

  const rutasOrdenadas = useMemo(
    () =>
      [...rutas].sort((a, b) =>
        (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" })
      ),
    [rutas]
  );

  const gananciasTotalesRegistradas = gananciasTotales;

  const panelLoading = loading;

  if (!profile || profile.role !== "admin") return null;

  if (panelLoading) {
    return (
      <div className="admin-inicio">
        <div className="card" style={{ margin: 0 }}>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Cargando panel…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-inicio admin-inicio--fill">
      <header className="admin-inicio-head">
        <div>
          <h1 className="admin-inicio-title">Bienvenido {nombreBienvenida}</h1>
          <p className="admin-inicio-date">{fechaTitulo}</p>
        </div>
      </header>

      {error ? (
        <p className="error-msg" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-inicio-body">
        <section className="admin-inicio-block" aria-labelledby="admin-op-dia">
          <h2 id="admin-op-dia" className="admin-inicio-section-label">
            Operación del día
          </h2>
          <div className="admin-inicio-grid-4">
            <div className="admin-inicio-metric">
              <div className="admin-inicio-metric-main">
                <span className="admin-inicio-metric-label">Rutas activas</span>
                <span className="admin-inicio-metric-value">{stats.rutasActivas}</span>
                <span className="admin-inicio-metric-sub">
                  de {stats.rutasProgramadas} programada{stats.rutasProgramadas === 1 ? "" : "s"}
                </span>
              </div>
              <span className="admin-inicio-metric-icon admin-inicio-metric-icon--purple" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
            </div>
            <div className="admin-inicio-metric">
              <div className="admin-inicio-metric-main">
                <span className="admin-inicio-metric-label">Préstamos activos</span>
                <span className="admin-inicio-metric-value">{stats.prestamosActivos}</span>
                <span className="admin-inicio-metric-sub">en cobro</span>
              </div>
              <span className="admin-inicio-metric-icon admin-inicio-metric-icon--orange" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </span>
            </div>
            <div className="admin-inicio-metric">
              <div className="admin-inicio-metric-main">
                <span className="admin-inicio-metric-label">Clientes</span>
                <span className="admin-inicio-metric-value">{stats.clientes}</span>
                <span className="admin-inicio-metric-sub">en cartera</span>
              </div>
              <span className="admin-inicio-metric-icon admin-inicio-metric-icon--violet" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
            </div>
            <div className="admin-inicio-metric">
              <div className="admin-inicio-metric-main">
                <span className="admin-inicio-metric-label">Morosos</span>
                <span className="admin-inicio-metric-value">{stats.morosos}</span>
                <span className="admin-inicio-metric-sub">
                  {stats.morosos === 0 ? "sin atrasos" : "requieren seguimiento"}
                </span>
              </div>
              <span className="admin-inicio-metric-icon admin-inicio-metric-icon--red" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
            </div>
          </div>
        </section>

        <section className="admin-inicio-block" aria-labelledby="admin-fin">
          <h2 id="admin-fin" className="admin-inicio-section-label">
            Posición financiera
          </h2>
          <div className="admin-inicio-grid-4-fin">
            <div className="admin-inicio-finance">
              <div className="admin-inicio-finance-label">Base de capital</div>
              <div className="admin-inicio-finance-value">{formatMoneda(cajaAdmin)}</div>
              <p className="admin-inicio-finance-sub"></p>
            </div>
            <div className="admin-inicio-finance">
              <div className="admin-inicio-finance-label">Capital actual</div>
              <div className="admin-inicio-finance-value">{formatMoneda(capitalAdmin)}</div>
            </div>
            <div className="admin-inicio-finance">
              <div className="admin-inicio-finance-head">
                <div className="admin-inicio-finance-main">
                  <div className="admin-inicio-finance-label">Ganancias</div>
                  <div
                    className={`admin-inicio-finance-value ${
                      gananciasTotalesRegistradas < 0
                        ? "admin-inicio-ruta-stat-value--neg"
                        : gananciasTotalesRegistradas > 0
                          ? "admin-inicio-ruta-stat-value--pos"
                          : ""
                    }`}
                  >
                    {formatMoneda(gananciasTotalesRegistradas)}
                  </div>
                  <p className="admin-inicio-finance-sub">periodo actual · rutas</p>
                </div>
                <span className="admin-inicio-metric-icon admin-inicio-metric-icon--green" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </span>
              </div>
            </div>
            <div className="admin-inicio-finance">
              <div className="admin-inicio-finance-head">
                <div className="admin-inicio-finance-main">
                  <div className="admin-inicio-finance-label">Gastos admin</div>
                  <div
                    className={`admin-inicio-finance-value ${
                      gastosAdminPeriodo > 0 ? "admin-inicio-ruta-stat-value--neg" : ""
                    }`}
                  >
                    {formatMoneda(gastosAdminPeriodo)}
                  </div>
                  <p className="admin-inicio-finance-sub">periodo actual</p>
                </div>
                <span className="admin-inicio-metric-icon admin-inicio-metric-icon--amber" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3h18v4H3z" />
                    <path d="M8 7v14" />
                    <path d="M16 7v14" />
                    <path d="M5 21h14" />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="admin-inicio-block" aria-labelledby="admin-rutas-fin">
          <div className="admin-inicio-rutas-head">
            <h2 id="admin-rutas-fin" className="admin-inicio-section-label">
              Rutas
            </h2>
            <Link href="/dashboard/admin/gestion-financiera" className="admin-inicio-rutas-link">
              Inversiones
            </Link>
          </div>
          {rutasOrdenadas.length === 0 ? (
            <p className="admin-inicio-rutas-empty">No hay rutas registradas.</p>
          ) : (
            <div className="admin-inicio-rutas">
              {rutasOrdenadas.map((r) => (
                  <article key={r.id} className="admin-inicio-ruta-card">
                    <header className="admin-inicio-ruta-card-head">
                      <h3 className="admin-inicio-ruta-title">{r.nombre || "Sin nombre"}</h3>
                      {r.ubicacion ? (
                        <p className="admin-inicio-ruta-meta">{r.ubicacion}</p>
                      ) : null}
                    </header>
                    <AdminRutaStatsGrid ruta={r} />
                  </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
