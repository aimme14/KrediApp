"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";
import {
  createPrestamo,
  clienteNumFromCodigo,
  formatClienteCodigoCorto,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";
import { formatInteresResumenPct, parseInteresPct } from "@/lib/interes-pct";
import {
  sanitizeMontoDecimalCOP,
  formatMontoDecimalCOPDisplay,
  interiorDecimalCOPToNumber,
} from "@/lib/monto-input-es";

const MODALIDADES = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
] as const;

/** Límites de validación para creación de préstamos */
const MONTO_MIN = 1;
const MONTO_MAX = 999_999.99;
const CUOTAS_MAX = 999;
const INTERES_MAX = 50;
const MONTO_CONFIRMAR_ALTO = 10_000;

/** Formato moneda: miles con punto; decimales con coma solo si son distintos de cero (ej: 1.234 o 1.234,56) */
function formatMoneda(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "";
  const [entero, dec = ""] = n.toFixed(2).split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decTrim = dec.replace(/0+$/, "");
  return decTrim ? `${conPuntos},${decTrim}` : conPuntos;
}

const ESTADO_ORDEN: Record<string, number> = { activo: 0, mora: 1, pagado: 2 };

function ordenarPrestamosParaPrincipal(prestamos: PrestamoItem[]): PrestamoItem[] {
  return [...prestamos].sort((a, b) => {
    const oa = ESTADO_ORDEN[a.estado] ?? 2;
    const ob = ESTADO_ORDEN[b.estado] ?? 2;
    if (oa !== ob) return oa - ob;
    const ta = new Date(a.fechaInicio || 0).getTime();
    const tb = new Date(b.fechaInicio || 0).getTime();
    return tb - ta;
  });
}

export default function PrestamoTrabajadorPage() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const {
    clientes,
    prestamos,
    loading,
    error: listaError,
    refresh,
  } = useTrabajadorLista();
  const { refresh: refreshCajaDia } = useTrabajadorCajaDia();
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [modalidad, setModalidad] = useState<"diario" | "semanal" | "mensual">("mensual");
  const [numeroCuotas, setNumeroCuotas] = useState("");
  const [interes, setInteres] = useState("");
  const [monto, setMonto] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmarMontoAlto, setConfirmarMontoAlto] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activo" | "mora" | "pagado">("todos");
  const [busquedaNombre, setBusquedaNombre] = useState("");

  useEffect(() => {
    const id = searchParams.get("clienteId")?.trim();
    if (!id || loading) return;
    if (!clientes.some((c) => c.id === id)) return;
    setClienteId(id);
    setShowCreateForm(true);
  }, [searchParams, clientes, loading]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const syncFiltro = () => {
      if (mq.matches) setFiltroEstado("todos");
    };
    syncFiltro();
    mq.addEventListener("change", syncFiltro);
    return () => mq.removeEventListener("change", syncFiltro);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const montoNum = interiorDecimalCOPToNumber(monto);
    const nCuotas = Math.max(1, parseInt(numeroCuotas, 10) || 1);
    const iVal = parseInteresPct(interes);

    if (isNaN(montoNum) || montoNum < MONTO_MIN) {
      setError(`El monto debe ser al menos ${formatMoneda(MONTO_MIN)}`);
      return;
    }
    if (montoNum > MONTO_MAX) {
      setError(`El monto no puede superar ${formatMoneda(MONTO_MAX)}`);
      return;
    }
    if (nCuotas > CUOTAS_MAX) {
      setError(`El número de cuotas no puede superar ${CUOTAS_MAX}`);
      return;
    }
    if (iVal < 0 || iVal > INTERES_MAX) {
      setError(`El interés debe estar entre 0 y ${INTERES_MAX}%`);
      return;
    }
    if (montoNum >= MONTO_CONFIRMAR_ALTO && !confirmarMontoAlto) {
      setError(`Confirma que deseas crear un préstamo de ${formatMoneda(montoNum)} marcando la casilla`);
      return;
    }
    if (!clienteId.trim()) {
      setError("Selecciona un cliente");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const token = await user.getIdToken();
      await createPrestamo(token, {
        clienteId: clienteId.trim(),
        monto: montoNum,
        interes: iVal,
        modalidad,
        numeroCuotas: nCuotas,
        fechaInicio: new Date().toISOString().slice(0, 10),
      });
      setClienteId("");
      setMonto("");
      setNumeroCuotas("");
      setInteres("");
      setModalidad("mensual");
      setConfirmarMontoAlto(false);
      setShowCreateForm(false);
      await refresh();
      void refreshCajaDia();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear préstamo");
    } finally {
      setCreating(false);
    }
  };

  const clientesSinPrestamo = clientes.filter((c) => !c.prestamo_activo && !c.moroso);
  const clientePorId = useMemo(() => {
    const m: Record<string, ClienteItem> = {};
    clientes.forEach((c) => { m[c.id] = c; });
    return m;
  }, [clientes]);
  const clienteSeleccionado = clienteId ? clientePorId[clienteId] : null;
  const montoNum = interiorDecimalCOPToNumber(monto);
  const nCuotasVal = parseInt(numeroCuotas, 10) || 0;
  const iVal = parseInteresPct(interes);
  const totalAPagar = !isNaN(montoNum) && montoNum > 0 && nCuotasVal >= 1
    ? montoNum * (1 + iVal / 100)
    : 0;
  const cuotaPorPago = totalAPagar > 0 && nCuotasVal >= 1 ? totalAPagar / nCuotasVal : 0;
  const requiereConfirmarMonto = !isNaN(montoNum) && montoNum >= MONTO_CONFIRMAR_ALTO;

  const busquedaTrim = busquedaNombre.trim();
  const busquedaLower = busquedaTrim.toLowerCase();

  const prestamosFiltrados = useMemo(() => {
    let lista = prestamos;
    if (filtroEstado !== "todos") {
      lista = lista.filter((p) => p.estado === filtroEstado);
    }
    if (busquedaLower) {
      lista = lista.filter((p) => {
        const cl = clientePorId[p.clienteId];
        if (!cl) return false;
        const nombre = (cl.nombre ?? "").toLowerCase();
        const codigo = cl.codigo
          ? formatClienteCodigoCorto(cl.codigo).toLowerCase()
          : "";
        const numCodigo = clienteNumFromCodigo(cl.codigo);
        const numStr = numCodigo ? `#${numCodigo}` : "";
        const cedula = (cl.cedula ?? "").toLowerCase();
        return (
          nombre.includes(busquedaLower) ||
          codigo.includes(busquedaLower) ||
          numStr.includes(busquedaLower) ||
          cedula.includes(busquedaLower)
        );
      });
    }
    return lista;
  }, [prestamos, filtroEstado, busquedaLower, clientePorId]);

  const prestamosHistorialOrdenados = useMemo(
    () => ordenarPrestamosParaPrincipal([...prestamosFiltrados]),
    [prestamosFiltrados]
  );

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      {showCreateForm && (
      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Nuevo préstamo</h3>
          <button
            type="button"
            onClick={() => setShowCreateForm(false)}
            aria-label="Cerrar formulario y volver al listado"
            title="Cerrar"
            style={{ padding: "0.35rem 0.6rem", minWidth: "auto", lineHeight: 1, flexShrink: 0 }}
            className="btn btn-primary"
          >
            ×
          </button>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "nowrap",
            gap: "1rem",
            alignItems: "flex-start",
            marginBottom: "1rem",
          }}
        >
          <div className="form-group" style={{ flex: "2 1 0", minWidth: 0, marginBottom: 0 }}>
            <label>Cliente</label>
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              required
              style={{ width: "100%", padding: "0.5rem" }}
              aria-label="Seleccionar cliente"
            >
              <option value="">Seleccionar cliente</option>
            {clientesSinPrestamo.map((c) => {
              const num = clienteNumFromCodigo(c.codigo);
              const codigoPart = num ? `#${num} · ` : "";
              return (
                <option key={c.id} value={c.id}>
                  {codigoPart}{c.nombre}
                </option>
              );
            })}
              {clientesSinPrestamo.length === 0 && clientes.length > 0 && (
                <option value="" disabled>Todos los clientes tienen préstamo activo o son morosos</option>
              )}
            </select>
          </div>
          <div className="form-group" style={{ flex: "0 0 11rem", minWidth: 0, marginBottom: 0 }}>
            <label>Frecuencia de pago</label>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as "diario" | "semanal" | "mensual")}
              style={{ width: "100%", padding: "0.5rem" }}
              aria-label="Frecuencia de pago"
            >
              {MODALIDADES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {clienteSeleccionado && (
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              marginTop: "0.5rem",
              marginBottom: "1rem",
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              alignItems: "center",
              gap: "0.35rem",
              minWidth: 0,
              lineHeight: 1.35,
            }}
          >
            <span style={{ flexShrink: 0 }}>Cliente:</span>
            {clienteNumFromCodigo(clienteSeleccionado.codigo) && (
              <span className="cliente-code" style={{ flexShrink: 0 }}>
                #{clienteNumFromCodigo(clienteSeleccionado.codigo)}
              </span>
            )}
            {clienteNumFromCodigo(clienteSeleccionado.codigo) && (
              <span style={{ flexShrink: 0 }} aria-hidden>
                ·
              </span>
            )}
            <strong
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={clienteSeleccionado.nombre}
            >
              {clienteSeleccionado.nombre}
            </strong>
          </p>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "nowrap",
            gap: "1rem",
            alignItems: "flex-start",
            marginBottom: "1rem",
          }}
        >
          <div className="form-group" style={{ flex: "1 1 0", minWidth: 0, marginBottom: 0 }}>
            <label>Número de cuotas</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={CUOTAS_MAX}
              value={numeroCuotas}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (v === "" || /^\d+$/.test(v)) setNumeroCuotas(v);
              }}
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "e" || k === "E" || k === "+" || k === "-" || k === "." || k === ",") e.preventDefault();
              }}
              placeholder="Ej: 12"
              required
              aria-label="Número de cuotas"
              style={{ width: "100%" }}
            />
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem", marginBottom: 0 }}>
            </p>
          </div>
          <div className="form-group" style={{ flex: "1 1 0", minWidth: 0, marginBottom: 0 }}>
            <label>Interés (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={interes}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (v === "" || /^\d*\.?\d*$/.test(v)) setInteres(v);
              }}
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "e" || k === "E" || k === "+" || k === "-") e.preventDefault();
              }}
              placeholder="Ej: 10"
              aria-label="Interés en porcentaje"
              style={{ width: "100%" }}
            />
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem", marginBottom: 0 }}>

            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "nowrap",
            gap: "1rem",
            alignItems: "flex-start",
            marginBottom: "1rem",
          }}
        >
          <div className="form-group" style={{ flex: "1 1 0", minWidth: 0, marginBottom: 0 }}>
            <label>Cantidad a prestar</label>
            <input
              type="text"
              inputMode="decimal"
              value={monto ? formatMontoDecimalCOPDisplay(monto) : ""}
              onChange={(e) => setMonto(sanitizeMontoDecimalCOP(e.target.value))}
              required
              placeholder="0,00"
              style={{ width: "100%" }}
            />
          </div>
          <div className="form-group" style={{ flex: "1 1 0", minWidth: 0, marginBottom: 0 }}>
            <label>Cuota</label>
            <input
              type="text"
              readOnly
              value={
                (() => {
                  const montoNum = interiorDecimalCOPToNumber(monto);
                  const nCuotas = parseInt(numeroCuotas, 10);
                  const iVal = parseInteresPct(interes);
                  if (isNaN(montoNum) || montoNum <= 0 || !nCuotas || nCuotas < 1) return "—";
                  const total = montoNum * (1 + iVal / 100);
                  return formatMoneda(total / nCuotas);
                })()
              }
              aria-label="Cuota (calculada)"
              style={{ width: "100%", backgroundColor: "var(--bg)", cursor: "default" }}
            />
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem", marginBottom: 0 }}>
            </p>
          </div>
        </div>

        {totalAPagar > 0 && (
          <div
            className="form-group"
            style={{
              padding: "1rem",
              backgroundColor: "var(--bg)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.95rem" }}>Resumen del préstamo</h4>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
              <li>Monto a prestar: <strong>{formatMoneda(montoNum)}</strong></li>
              <li>Interés: <strong>{formatInteresResumenPct(iVal)}%</strong></li>
              <li>Total a pagar: <strong>{formatMoneda(totalAPagar)}</strong></li>
              <li>Número de cuotas: <strong>{nCuotasVal}</strong> ({modalidad})</li>
              <li>Cuota por pago: <strong>{formatMoneda(cuotaPorPago)}</strong></li>
            </ul>
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            </p>
          </div>
        )}

        {(error || listaError) && (
          <p className="error-msg">{error ?? listaError}</p>
        )}
        <div
          className="prestamo-nuevo-actions"
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "1rem",
            justifyContent: "flex-start",
            width: "100%",
          }}
        >
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creating}
            style={{ flexShrink: 0 }}
          >
            {creating ? "Creando..." : "Crear préstamo"}
          </button>
          {requiereConfirmarMonto && (
            <label
              className="prestamo-nuevo-confirm-label"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.65rem",
                cursor: "pointer",
                margin: 0,
                flexShrink: 0,
                lineHeight: 1.2,
              }}
            >
              <input
                type="checkbox"
                checked={confirmarMontoAlto}
                onChange={(e) => setConfirmarMontoAlto(e.target.checked)}
                aria-label={`Confirmo creación de préstamo por ${formatMoneda(montoNum)}`}
                style={{
                  flexShrink: 0,
                  cursor: "pointer",
                  margin: "0 0.2rem",
                  transform: "scale(1.5)",
                  transformOrigin: "center",
                  accentColor: "var(--link, #6366f1)",
                }}
              />
              <span style={{ fontSize: "1.05rem" }}>Confirmo</span>
            </label>
          )}
        </div>
      </form>
      )}

      {!showCreateForm && (
      <>
        <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>Historial de préstamos</h3>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateForm(true)}
            aria-label="Crear nuevo préstamo"
            title="Crear nuevo préstamo"
            style={{ padding: "0.4rem 0.65rem", minWidth: "auto", lineHeight: 1, flexShrink: 0 }}
          >
            +
          </button>
        </div>
        {loading ? (
          <p>Cargando...</p>
        ) : prestamos.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay préstamos.</p>
        ) : (
          <>
            <div className="ruta-dia-search-toolbar" style={{ marginBottom: "0.85rem" }}>
              <div className="ruta-dia-search-field">
                <span className="ruta-dia-search-icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
                <input
                  id="trabajador-prestamos-buscador"
                  className="ruta-dia-search-input"
                  type="search"
                  value={busquedaNombre}
                  onChange={(e) => setBusquedaNombre(e.target.value)}
                  placeholder="Buscar por nombre, código o cédula..."
                  aria-label="Buscar préstamos por nombre de cliente"
                  autoComplete="off"
                />
                {busquedaTrim ? (
                  <button
                    type="button"
                    className="ruta-dia-search-clear"
                    onClick={() => setBusquedaNombre("")}
                    aria-label="Limpiar búsqueda"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {busquedaTrim ? (
                <p className="ruta-dia-search-hint">
                  {prestamosFiltrados.length} préstamo
                  {prestamosFiltrados.length !== 1 ? "s" : ""} encontrado
                  {prestamosFiltrados.length !== 1 ? "s" : ""}
                </p>
              ) : null}
            </div>
            <div className="prestamo-historial-filtros prestamo-trabajador-historial-filtros" role="tablist" aria-label="Filtrar por estado">
              {(["todos", "activo", "mora", "pagado"] as const).map((est) => (
                <button
                  key={est}
                  type="button"
                  role="tab"
                  aria-selected={filtroEstado === est}
                  onClick={() => setFiltroEstado(est)}
                  style={{
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.8125rem",
                    border: "1px solid var(--card-border)",
                    borderRadius: "var(--radius)",
                    background: filtroEstado === est ? "var(--link)" : "var(--card-bg)",
                    color: filtroEstado === est ? "#fff" : "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  {est === "todos" ? "Todos" : est === "activo" ? "Activos" : est === "mora" ? "En mora" : "Pagados"}
                </button>
              ))}
            </div>
            <div className="table-wrap table-historial-wrap prestamo-historial-scroll">
              <table className="table-historial prestamo-historial-simple">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Cliente</th>
                    <th className="col-num">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {prestamosHistorialOrdenados.map((p) => {
                    const cl = clientePorId[p.clienteId];
                    const num = cl ? clienteNumFromCodigo(cl.codigo) : null;
                    const codigoDisplay = num ? `#${num}` : "—";
                    const nombre = cl?.nombre ?? p.clienteId;
                    return (
                      <tr key={p.id}>
                        <td>{codigoDisplay}</td>
                        <td className="prestamo-histo-simple-nombre">{nombre}</td>
                        <td className="col-num">{formatMoneda(p.monto)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          {prestamosFiltrados.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
              {busquedaTrim
                ? `No hay préstamos que coincidan con «${busquedaTrim}».`
                : `No hay préstamos con estado «${filtroEstado === "todos" ? "todos" : filtroEstado === "activo" ? "activos" : filtroEstado === "mora" ? "en mora" : "pagados"}».`}
            </p>
          )}
          </>
        )}
        </div>
      </>
      )}
    </div>
  );
}
