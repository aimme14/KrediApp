"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import {
  createPrestamo,
  clienteNumFromCodigo,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";
import { formatInteresResumenPct, parseInteresPct } from "@/lib/interes-pct";

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

/** Cuotas ya pagadas (a partir de saldo y total). Para mostrar como "X / total". */
function cuotasPagadas(totalAPagar: number, numeroCuotas: number, saldoPendiente: number): number {
  if (totalAPagar <= 0 || numeroCuotas <= 0) return 0;
  if (saldoPendiente <= 0) return numeroCuotas;
  const cuotaUnit = totalAPagar / numeroCuotas;
  const pagado = totalAPagar - saldoPendiente;
  return Math.min(numeroCuotas, Math.round(pagado / cuotaUnit));
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

type GrupoClientePrestamos = { clienteId: string; prestamos: PrestamoItem[] };

/** Fecha actual en formato dd/mm/aaaa */
function hoyDDMMAAAA(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

export default function PrestamoTrabajadorPage() {
  const { user, profile } = useAuth();
  const {
    clientes,
    prestamos,
    loading,
    error: listaError,
    refresh,
  } = useTrabajadorLista();
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [modalidad, setModalidad] = useState<"diario" | "semanal" | "mensual">("mensual");
  const [numeroCuotas, setNumeroCuotas] = useState("");
  const [interes, setInteres] = useState("");
  const [monto, setMonto] = useState("");
  const [montoFocused, setMontoFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmarMontoAlto, setConfirmarMontoAlto] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activo" | "mora" | "pagado">("todos");
  const [historialEconomicoColapsado, setHistorialEconomicoColapsado] = useState(true);

  useEffect(() => {
    setHistorialEconomicoColapsado(true);
  }, [clienteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const montoNum = parseFloat(monto.replace(",", "."));
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
  const montoNum = parseFloat(monto.replace(",", "."));
  const nCuotasVal = parseInt(numeroCuotas, 10) || 0;
  const iVal = parseInteresPct(interes);
  const totalAPagar = !isNaN(montoNum) && montoNum > 0 && nCuotasVal >= 1
    ? montoNum * (1 + iVal / 100)
    : 0;
  const cuotaPorPago = totalAPagar > 0 && nCuotasVal >= 1 ? totalAPagar / nCuotasVal : 0;
  const requiereConfirmarMonto = !isNaN(montoNum) && montoNum >= MONTO_CONFIRMAR_ALTO;

  const resumenPrestamos = useMemo(() => {
    const activos = prestamos.filter((p) => p.estado === "activo");
    const mora = prestamos.filter((p) => p.estado === "mora");
    const pagados = prestamos.filter((p) => p.estado === "pagado");
    const saldoPorCobrar = prestamos
      .filter((p) => p.estado !== "pagado")
      .reduce((s, p) => s + p.saldoPendiente, 0);
    return {
      activos: activos.length,
      mora: mora.length,
      pagados: pagados.length,
      saldoPorCobrar,
    };
  }, [prestamos]);

  const prestamosFiltrados = useMemo(() => {
    if (filtroEstado === "todos") return prestamos;
    return prestamos.filter((p) => p.estado === filtroEstado);
  }, [prestamos, filtroEstado]);

  const gruposPorCliente = useMemo((): GrupoClientePrestamos[] => {
    const byCliente = new Map<string, PrestamoItem[]>();
    for (const p of prestamosFiltrados) {
      const list = byCliente.get(p.clienteId) ?? [];
      list.push(p);
      byCliente.set(p.clienteId, list);
    }
    const grupos: GrupoClientePrestamos[] = [];
    byCliente.forEach((lista, clienteId) => {
      grupos.push({ clienteId, prestamos: ordenarPrestamosParaPrincipal(lista) });
    });
    grupos.sort((a, b) => {
      const pa = a.prestamos[0];
      const pb = b.prestamos[0];
      const oa = ESTADO_ORDEN[pa.estado] ?? 2;
      const ob = ESTADO_ORDEN[pb.estado] ?? 2;
      if (oa !== ob) return oa - ob;
      const ta = new Date(pa.fechaInicio || 0).getTime();
      const tb = new Date(pb.fechaInicio || 0).getTime();
      return tb - ta;
    });
    return grupos.slice(0, 20);
  }, [prestamosFiltrados]);

  const [clientesExpandidos, setClientesExpandidos] = useState<Set<string>>(() => new Set());
  const toggleExpandirCliente = useCallback((clienteId: string) => {
    setClientesExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(clienteId)) next.delete(clienteId);
      else next.add(clienteId);
      return next;
    });
  }, []);

  const prestamosDelCliente = useMemo(
    () => (clienteId ? prestamos.filter((p) => p.clienteId === clienteId) : []),
    [prestamos, clienteId]
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
        <div className="form-group">
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
              const cedulaPart = c.cedula ? ` · ${c.cedula}` : "";
              return (
                <option key={c.id} value={c.id}>
                  {codigoPart}{c.nombre}{cedulaPart}
                </option>
              );
            })}
            {clientesSinPrestamo.length === 0 && clientes.length > 0 && (
              <option value="" disabled>Todos los clientes tienen préstamo activo o son morosos</option>
            )}
          </select>
          {clienteSeleccionado && (
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: 0 }}>
              Cliente seleccionado:{" "}
              {clienteNumFromCodigo(clienteSeleccionado.codigo) && (
                <span className="cliente-code">#{clienteNumFromCodigo(clienteSeleccionado.codigo)}</span>
              )}
              {clienteNumFromCodigo(clienteSeleccionado.codigo) && " · "}
              <strong>{clienteSeleccionado.nombre}</strong>
              {clienteSeleccionado.cedula && <> · Céd. {clienteSeleccionado.cedula}</>}
            </p>
          )}
        </div>

        {clienteId && (
          <div className="form-group" style={{ marginBottom: "1.25rem", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setHistorialEconomicoColapsado((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "var(--card-bg)",
                border: "none",
                color: "var(--text)",
                fontSize: "1rem",
                cursor: "pointer",
                textAlign: "left",
              }}
              aria-expanded={!historialEconomicoColapsado}
              aria-controls="historial-economico-content"
              id="historial-economico-toggle"
            >
              <span style={{ fontWeight: 600 }}>Historial económico</span>
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }} aria-hidden>
                {historialEconomicoColapsado ? "Expandir ▼" : "Colapsar ▲"}
              </span>
            </button>
            <div id="historial-economico-content" role="region" aria-labelledby="historial-economico-toggle" style={{ display: historialEconomicoColapsado ? "none" : "block", padding: "0 0.75rem 0.75rem" }}>
              {loading ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "0.5rem 0 0" }}>Cargando...</p>
              ) : prestamosDelCliente.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "0.5rem 0 0" }}>Este cliente no tiene préstamos anteriores.</p>
              ) : (
                <div className="table-wrap" style={{ marginTop: "0.5rem" }}>
                  <table>
                    <thead>
                      <tr>
                        <th className="col-num">Monto</th>
                        <th className="col-num">Total a pagar</th>
                        <th className="col-num">Saldo</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prestamosDelCliente.map((p) => (
                        <tr key={p.id}>
                          <td className="col-num">{formatMoneda(p.monto)}</td>
                          <td className="col-num">{formatMoneda(p.totalAPagar)}</td>
                          <td className="col-num">{formatMoneda(p.saldoPendiente)}</td>
                          <td>{p.estado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {historialEconomicoColapsado && !loading && (
              <p style={{ padding: "0 0.75rem 0.75rem", margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
                {prestamosDelCliente.length === 0 ? "Sin préstamos anteriores" : `${prestamosDelCliente.length} préstamo${prestamosDelCliente.length !== 1 ? "s" : ""} registrado${prestamosDelCliente.length !== 1 ? "s" : ""}. Haz clic en «Expandir» para ver el detalle.`}
              </p>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Fecha del préstamo</label>
          <input
            type="text"
            readOnly
            value={hoyDDMMAAAA()}
            aria-label="Fecha del préstamo (día actual)"
            style={{ backgroundColor: "var(--bg)", cursor: "default", maxWidth: "10rem" }}
          />
        </div>
        <div className="form-group">
          <label>Frecuencia de pago</label>
          <select value={modalidad} onChange={(e) => setModalidad(e.target.value as "diario" | "semanal" | "mensual")} style={{ width: "100%", padding: "0.5rem" }}>
            {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="form-group">
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
            placeholder="Ej: 12 (según frecuencia: 12 pagos)"
            required
            aria-label="Número de cuotas"
          />
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem", marginBottom: 0 }}>
            Número de pagos según la frecuencia elegida (diario, semanal o mensual).
          </p>
        </div>
        <div className="form-group">
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
            placeholder="Ej: 10 (porcentaje aplicado al monto)"
            aria-label="Interés en porcentaje"
          />
        </div>
        <div className="form-group">
          <label>Cantidad a prestar</label>
          <input
            type="text"
            inputMode="decimal"
            value={
              montoFocused
                ? monto
                : (monto ? formatMoneda(parseFloat(monto.replace(",", ".")) || 0) : "")
            }
            onChange={(e) => {
              let v = e.target.value.replace(/\./g, "").replace(/[^\d,]/g, "");
              if ((v.match(/,/g) || []).length > 1) return;
              setMonto(v);
            }}
            onFocus={() => setMontoFocused(true)}
            onBlur={() => setMontoFocused(false)}
            required
            placeholder="0,00"
          />
        </div>
        <div className="form-group">
          <label>Cuota</label>
          <input
            type="text"
            readOnly
            value={
              (() => {
                const montoNum = parseFloat(monto.replace(",", "."));
                const nCuotas = parseInt(numeroCuotas, 10);
                const iVal = parseInteresPct(interes);
                if (isNaN(montoNum) || montoNum <= 0 || !nCuotas || nCuotas < 1) return "—";
                const total = montoNum * (1 + iVal / 100);
                return formatMoneda(total / nCuotas);
              })()
            }
            aria-label="Cuota (calculada)"
            style={{ backgroundColor: "var(--bg)", cursor: "default" }}
          />
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem", marginBottom: 0 }}>
            (Cantidad a prestar × (1 + interés %) ÷ número de cuotas)
          </p>
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
              Al crear el préstamo, el monto a prestar sale de tu base y pasa a inversiones de la ruta.
              Al cobrar, lo que corresponde a capital vuelve a tu base desde inversiones; el interés
              suma a tu base como ganancia (no sale de inversiones).
            </p>
          </div>
        )}

        {requiereConfirmarMonto && (
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={confirmarMontoAlto}
                onChange={(e) => setConfirmarMontoAlto(e.target.checked)}
                aria-label="Confirmar préstamo de monto alto"
              />
              <span>Confirmo la creación de un préstamo por <strong>{formatMoneda(montoNum)}</strong></span>
            </label>
          </div>
        )}

        {(error || listaError) && (
          <p className="error-msg">{error ?? listaError}</p>
        )}
        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? "Creando..." : "Crear préstamo"}
        </button>
      </form>
      )}

      {!showCreateForm && (
      <>
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
            <div style={{ padding: "0.5rem 0.65rem", backgroundColor: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", justifyContent: "center" }} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text)", flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><path d="M10 8l4 4-4 4" />
                </svg>
                <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{resumenPrestamos.activos}</span>
              </div>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1 }}>Activos</span>
            </div>
            <div style={{ padding: "0.5rem 0.65rem", backgroundColor: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", justifyContent: "center" }} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--error, #ef4444)", flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--error, #ef4444)", lineHeight: 1 }}>{resumenPrestamos.mora}</span>
              </div>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1 }}>En mora</span>
            </div>
            <div style={{ padding: "0.5rem 0.65rem", backgroundColor: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", justifyContent: "center" }} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text)", flexShrink: 0 }}>
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{resumenPrestamos.pagados}</span>
              </div>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1 }}>Pagados</span>
            </div>
            <div style={{ padding: "0.5rem 0.65rem", backgroundColor: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", justifyContent: "center" }} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text)", flexShrink: 0 }}>
                  <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
                <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{formatMoneda(resumenPrestamos.saldoPorCobrar)}</span>
              </div>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1 }}>Saldo por cobrar</span>
            </div>
          </div>
        )}
        <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>Historial de préstamos</h3>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateForm(true)}
            aria-label="Crear nuevo préstamo"
            title="Crear nuevo préstamo"
            style={{ padding: "0.4rem 0.65rem", minWidth: "auto", lineHeight: 1 }}
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }} role="tablist" aria-label="Filtrar por estado">
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
            <div className="table-wrap table-historial-wrap" style={{ width: "100%", overflow: "visible" }}>
            <table className="table-historial" style={{ width: "100%", tableLayout: "fixed", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th aria-label="Expandir historial" />
                  <th>Código</th>
                  <th>Cliente</th>
                  <th className="col-num">Monto</th>
                  <th className="col-num">Total a pagar</th>
                  <th className="col-num">Saldo</th>
                  <th className="col-num">Cuotas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {gruposPorCliente.map((grupo) => {
                  const principal = grupo.prestamos[0];
                  const cl = clientePorId[grupo.clienteId];
                  const nombre = cl?.nombre ?? grupo.clienteId;
                  const num = cl ? clienteNumFromCodigo(cl.codigo) : "";
                  const codigoDisplay = num ? "#" + num : "—";
                  const pagadas = cuotasPagadas(principal.totalAPagar, principal.numeroCuotas, principal.saldoPendiente);
                  const tieneMas = grupo.prestamos.length > 1;
                  const expandido = clientesExpandidos.has(grupo.clienteId);
                  const otros = grupo.prestamos.slice(1);
                  return (
                    <Fragment key={grupo.clienteId}>
                      <tr>
                        <td>
                          {tieneMas ? (
                            <button
                              type="button"
                              className="btn-expand-historial"
                              onClick={() => toggleExpandirCliente(grupo.clienteId)}
                              aria-expanded={expandido}
                              aria-controls={`historial-cliente-${grupo.clienteId}`}
                              id={`btn-expand-${grupo.clienteId}`}
                              title={expandido ? "Ocultar otros préstamos" : `Ver ${otros.length} préstamo(s) más`}
                            >
                              {expandido ? "−" : `+${otros.length}`}
                            </button>
                          ) : (
                            <span aria-hidden style={{ display: "inline-block", width: "1.5rem", minHeight: "1.25rem" }} />
                          )}
                        </td>
                        <td>{codigoDisplay}</td>
                        <td>{nombre}</td>
                        <td className="col-num">{formatMoneda(principal.monto)}</td>
                        <td className="col-num">{formatMoneda(principal.totalAPagar)}</td>
                        <td className="col-num">{formatMoneda(principal.saldoPendiente)}</td>
                        <td className="col-num" title="Cuotas pagadas / total">{pagadas} / {principal.numeroCuotas}</td>
                        <td>{principal.estado}</td>
                      </tr>
                      {tieneMas && expandido && (
                        <tr id={`historial-cliente-${grupo.clienteId}`} aria-labelledby={`btn-expand-${grupo.clienteId}`}>
                          <td colSpan={8} style={{ padding: "0.5rem 0.75rem", backgroundColor: "var(--bg)", borderBottom: "1px solid var(--table-border)", verticalAlign: "top" }}>
                            <div className="historial-prestamos-list" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                              <span style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem", display: "block" }}>Otros préstamos</span>
                              <ul>
                                {otros.map((p) => (
                                    <li key={p.id}>
                                      {formatMoneda(p.monto)} · {p.estado} · {p.numeroCuotas} cuotas
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {prestamosFiltrados.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
              No hay préstamos con estado «{filtroEstado === "todos" ? "todos" : filtroEstado === "activo" ? "activos" : filtroEstado === "mora" ? "en mora" : "pagados"}».
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
