"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listRutas,
  createRuta,
  listClientes,
  listPrestamos,
  formatClienteCodigoCorto,
  type RutaItem,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

type KpiVariant = "patrimonio" | "base" | "inversiones" | "ganancias";

function RutasKpiIcon({ variant }: { variant: KpiVariant }) {
  const cls = `rutas-admin-kpi-icon rutas-admin-kpi-icon--${variant}`;
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (variant) {
    case "patrimonio":
      return (
        <span className={cls} aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </span>
      );
    case "base":
      return (
        <span className={cls} aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        </span>
      );
    case "inversiones":
      return (
        <span className={cls} aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </span>
      );
    case "ganancias":
      return (
        <span className={cls} aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        </span>
      );
    default:
      return null;
  }
}

const RUTA_KPI_ITEMS: {
  key: string;
  label: string;
  field: "capitalTotal" | "cajaRuta" | "inversiones" | "ganancias";
  variant: KpiVariant;
  title: string;
}[] = [
  {
    key: "patrimonio",
    label: "Patrimonio total",
    field: "capitalTotal",
    variant: "patrimonio",
    title: "Patrimonio total (base ruta + bases empleados + inversiones − pérdidas)",
  },
  {
    key: "base",
    label: "Base",
    field: "cajaRuta",
    variant: "base",
    title: "Efectivo en la ruta disponible para prestar o mover",
  },
  {
    key: "inversiones",
    label: "Inversiones",
    field: "inversiones",
    variant: "inversiones",
    title: "Capital colocado en préstamos activos",
  },
  {
    key: "ganancias",
    label: "Ganancias",
    field: "ganancias",
    variant: "ganancias",
    title: "Intereses acumulados por cobros",
  },
];

export default function RutasPage() {
  const { user, profile } = useAuth();
  const [rutas, setRutas] = useState<RutaItem[]>([]);
  const [clientesByRuta, setClientesByRuta] = useState<Record<string, ClienteItem[]>>({});
  const [prestamosByRuta, setPrestamosByRuta] = useState<Record<string, PrestamoItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedRutaId, setExpandedRutaId] = useState<string | null>(null);

  const loadRutas = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    listRutas(token)
      .then(setRutas)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar rutas"))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    loadRutas();
  }, [loadRutas]);

  useEffect(() => {
    if (!user || expandedRutaId === null) return;
    const load = async () => {
      const token = await user.getIdToken();
      const [clientes, prestamos] = await Promise.all([
        listClientes(token, expandedRutaId),
        listPrestamos(token),
      ]);
      setClientesByRuta((prev) => ({ ...prev, [expandedRutaId]: clientes }));
      setPrestamosByRuta((prev) => ({
        ...prev,
        [expandedRutaId]: prestamos.filter((p) => p.rutaId === expandedRutaId && p.estado !== "pagado"),
      }));
    };
    load();
  }, [user, expandedRutaId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setCreating(true);
    try {
      const token = await user.getIdToken();
      await createRuta(token, {
        nombre: nombre.trim(),
        ubicacion: ubicacion.trim() || undefined,
      });
      setNombre("");
      setUbicacion("");
      setShowForm(false);
      await loadRutas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear ruta");
    } finally {
      setCreating(false);
    }
  };

  const getPrestamoForCliente = (rutaId: string, clienteId: string): PrestamoItem | undefined =>
    (prestamosByRuta[rutaId] ?? []).find((p) => p.clienteId === clienteId);

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card rutas-admin-page">
      <h2 className="rutas-admin-page-title">Rutas</h2>
      <p className="rutas-admin-intro">
        
      </p>
      <p className="rutas-admin-gloss">
        
      </p>

      <div className="rutas-admin-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "Nueva ruta"}
        </button>
      </div>

      {showForm && (
        <div className="card rutas-admin-form-card">
          <h3>Nueva ruta</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                placeholder="Nombre de la ruta"
              />
            </div>
            <div className="form-group">
              <label>Ubicación</label>
              <input
                type="text"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Zona o ciudad"
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creando..." : "Crear ruta"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p className="rutas-admin-loading">Cargando rutas…</p>
      ) : rutas.length === 0 ? (
        <p className="rutas-admin-muted">No hay rutas. Creá una con el botón «Nueva ruta».</p>
      ) : (
        <div className="rutas-admin-list">
          {rutas.map((ruta) => {
            const expanded = expandedRutaId === ruta.id;
            return (
              <div key={ruta.id} className="card rutas-admin-ruta-card">
                <button
                  type="button"
                  className="rutas-admin-ruta-head-btn"
                  onClick={() => setExpandedRutaId((id) => (id === ruta.id ? null : ruta.id))}
                >
                  <span className="rutas-admin-ruta-head-main">
                    {ruta.codigo && (
                      <code className="user-code ruta-code" title="RT = Ruta, primer número = Admin, segundo = N° Ruta">
                        {ruta.codigo}
                      </code>
                    )}
                    <span className="rutas-admin-ruta-nombre">{ruta.nombre}</span>
                  </span>
                  <span className="rutas-admin-ruta-head-meta">
                    {ruta.ubicacion ? <span className="rutas-admin-ruta-ubic">{ruta.ubicacion}</span> : null}
                    <span className={`rutas-admin-ruta-chevron${expanded ? " rutas-admin-ruta-chevron--open" : ""}`} aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  </span>
                </button>

                <div className="rutas-admin-kpi-grid" aria-label="Resumen financiero de la ruta">
                  {RUTA_KPI_ITEMS.map((item) => {
                    const raw = ruta[item.field];
                    const num = typeof raw === "number" ? raw : 0;
                    return (
                      <div key={item.key} className="rutas-admin-kpi" title={item.title}>
                        <div className="rutas-admin-kpi-body">
                          <span className="rutas-admin-kpi-label">{item.label}</span>
                          <span className="rutas-admin-kpi-value">{formatMonto(num)}</span>
                        </div>
                        <RutasKpiIcon variant={item.variant} />
                      </div>
                    );
                  })}
                </div>

                {expanded && (
                  <div className="rutas-admin-clientes-panel">
                    <h4 className="rutas-admin-clientes-title">Clientes de esta ruta</h4>
                    {!clientesByRuta[ruta.id] ? (
                      <p className="rutas-admin-muted">Cargando…</p>
                    ) : clientesByRuta[ruta.id].length === 0 ? (
                      <p className="rutas-admin-muted">No hay clientes en esta ruta.</p>
                    ) : (
                      <div className="table-wrap rutas-admin-clientes-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Nombre</th>
                              <th>Ubicación</th>
                              <th>Dirección</th>
                              <th>Teléfono</th>
                              <th>Cédula</th>
                              <th>Estado financiero</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clientesByRuta[ruta.id].map((c) => {
                              const prestamo = getPrestamoForCliente(ruta.id, c.id);
                              return (
                                <tr key={c.id}>
                                  <td title={c.codigo ?? undefined}>{formatClienteCodigoCorto(c.codigo)}</td>
                                  <td>{c.nombre}</td>
                                  <td>{c.ubicacion || "—"}</td>
                                  <td>{c.direccion || "—"}</td>
                                  <td>{c.telefono || "—"}</td>
                                  <td>{c.cedula || "—"}</td>
                                  <td>
                                    {prestamo ? (
                                      <span>
                                        Préstamo {prestamo.estado} · Saldo: {prestamo.saldoPendiente.toFixed(2)}
                                      </span>
                                    ) : c.prestamo_activo ? (
                                      <span>Préstamo activo</span>
                                    ) : (
                                      <span style={{ color: "var(--text-muted)" }}>Sin préstamo activo</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
