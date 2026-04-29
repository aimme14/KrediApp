"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listRutas,
  createRuta,
  listClientes,
  listPrestamos,
  patchRutaOperativa,
  formatClienteCodigoCorto,
  type RutaItem,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";
import { formatMontoEnteroInput, parseMontoEnteroFormatted } from "@/lib/monto-input-es";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

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
  const [capitalInicial, setCapitalInicial] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedRutaId, setExpandedRutaId] = useState<string | null>(null);
  const [operativaSavingId, setOperativaSavingId] = useState<string | null>(null);

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
      const capitalNum = capitalInicial.trim()
        ? parseMontoEnteroFormatted(capitalInicial)
        : undefined;
      await createRuta(token, {
        nombre: nombre.trim(),
        ubicacion: ubicacion.trim() || undefined,
        capitalInicial: typeof capitalNum === "number" && !Number.isNaN(capitalNum) && capitalNum >= 0 ? capitalNum : undefined,
      });
      setNombre("");
      setUbicacion("");
      setCapitalInicial("");
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

  const handleRutaOperativa = async (rutaId: string, siguiente: boolean) => {
    if (!user) return;
    setError(null);
    setOperativaSavingId(rutaId);
    try {
      const token = await user.getIdToken();
      await patchRutaOperativa(token, rutaId, siguiente);
      await loadRutas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar la ruta");
    } finally {
      setOperativaSavingId(null);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Rutas</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
        Crea rutas con nombre y ubicación. Al desplegar una ruta verás los clientes con su información y estado financiero.
      </p>
      <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1.25rem", lineHeight: 1.45 }}>
        <strong>Patrimonio total</strong> es todo el capital de la ruta. <strong>Base de la ruta</strong> es el efectivo disponible para operar.
        Los préstamos salen de la base y suman en <strong>Inversiones</strong>; al cobrar, el dinero vuelve a la base y el interés acumula en{" "}
        <strong>Ganancias</strong>.
      </p>

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancelar" : "Nueva ruta"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>Nueva ruta</h3>
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
            <div className="form-group">
              <label>Capital inicial (opcional)</label>
              <input
                type="text"
                inputMode="decimal"
                value={capitalInicial}
                onChange={(e) => setCapitalInicial(formatMontoEnteroInput(e.target.value))}
                placeholder="Ej: 2000000 (sale de tu base del administrador)"
              />
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                Si ingresas un monto, se descontará de tu base del administrador y quedará en la base de la ruta.
              </p>
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
        <p>Cargando rutas...</p>
      ) : rutas.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No hay rutas. Crea una con el botón &quot;Nueva ruta&quot;.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {rutas.map((ruta) => (
            <div key={ruta.id} className="card" style={{ padding: "1rem" }}>
              <button
                type="button"
                onClick={() => setExpandedRutaId((id) => (id === ruta.id ? null : ruta.id))}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: "1rem",
                  color: "var(--text)",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0 }}>
                  {ruta.codigo && (
                    <code
                      className="user-code ruta-code"
                      title="RT = Ruta, primer número = Admin, segundo = N° Ruta"
                    >
                      {ruta.codigo}
                    </code>
                  )}
                  <span style={{ fontWeight: 600 }}>{ruta.nombre}</span>
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  {ruta.ubicacion || "—"}
                </span>
                <span aria-hidden>{expandedRutaId === ruta.id ? "▼" : "▶"}</span>
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
                  gap: "0.65rem",
                  marginTop: "0.75rem",
                }}
                aria-label="Resumen financiero de la ruta"
              >
                {(
                  [
                    { label: "Patrimonio total", value: ruta.capitalTotal ?? 0, title: "Patrimonio total (base ruta + bases empleados + inversiones − pérdidas)" },
                    { label: "Base", value: ruta.cajaRuta ?? 0, title: "Efectivo en la ruta disponible para prestar o mover" },
                    { label: "Inversiones", value: ruta.inversiones ?? 0, title: "Capital colocado en préstamos activos" },
                    { label: "Ganancias", value: ruta.ganancias ?? 0, title: "Intereses acumulados por cobros" },
                  ] as const
                ).map((item) => (
                  <div
                    key={item.label}
                    className="card"
                    title={item.title}
                    style={{
                      padding: "0.65rem 0.85rem",
                      margin: 0,
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                        display: "block",
                        marginBottom: "0.25rem",
                        lineHeight: 1.2,
                      }}
                    >
                      {item.label}
                    </span>
                    <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}>
                      {formatMonto(typeof item.value === "number" ? item.value : 0)}
                    </span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: "0.85rem",
                  paddingTop: "0.85rem",
                  borderTop: "1px solid var(--card-border)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.65rem",
                }}
              >
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Operación del día (trabajadores):
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    padding: "0.2rem 0.55rem",
                    borderRadius: "6px",
                    background: ruta.rutaOperativa !== false ? "var(--success-bg, #f0fdf4)" : "rgba(248, 113, 113, 0.15)",
                    color: ruta.rutaOperativa !== false ? "var(--success-fg, #166534)" : "#b91c1c",
                  }}
                >
                  {ruta.rutaOperativa !== false ? "Abierta" : "Cerrada"}
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.875rem" }}
                  disabled={operativaSavingId === ruta.id || ruta.rutaOperativa !== false}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRutaOperativa(ruta.id, true);
                  }}
                >
                  {operativaSavingId === ruta.id ? "…" : "Abrir ruta"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.875rem" }}
                  disabled={operativaSavingId === ruta.id || ruta.rutaOperativa === false}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRutaOperativa(ruta.id, false);
                  }}
                >
                  {operativaSavingId === ruta.id ? "…" : "Cerrar ruta"}
                </button>
              </div>

              {expandedRutaId === ruta.id && (
                <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                  <h4 style={{ margin: "0 0 0.5rem 0" }}>Clientes de esta ruta</h4>
                  {!clientesByRuta[ruta.id] ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Cargando...</p>
                  ) : clientesByRuta[ruta.id].length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No hay clientes en esta ruta.</p>
                  ) : (
                    <div className="table-wrap" style={{ marginTop: "0.5rem" }}>
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
                                <td title={c.codigo ?? undefined}>
                                  {formatClienteCodigoCorto(c.codigo)}
                                </td>
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
          ))}
        </div>
      )}
    </div>
  );
}
