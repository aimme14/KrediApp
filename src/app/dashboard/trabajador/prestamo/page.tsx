"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import {
  createPrestamo,
  clienteNumFromCodigo,
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

  const prestamosFiltrados = useMemo(() => {
    if (filtroEstado === "todos") return prestamos;
    return prestamos.filter((p) => p.estado === filtroEstado);
  }, [prestamos, filtroEstado]);

  const prestamosHistorialOrdenados = useMemo(
    () => ordenarPrestamosParaPrincipal([...prestamosFiltrados]),
    [prestamosFiltrados]
  );

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
                <div className="table-wrap prestamo-historial-economico-wrap" style={{ marginTop: "0.5rem" }}>
                  <table className="prestamo-historial-economico-table prestamo-historial-economico-simple">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Cliente</th>
                        <th className="col-num">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prestamosDelCliente.map((p) => {
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
            value={monto ? formatMontoDecimalCOPDisplay(monto) : ""}
            onChange={(e) => setMonto(sanitizeMontoDecimalCOP(e.target.value))}
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
                const montoNum = interiorDecimalCOPToNumber(monto);
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
              Al crear el préstamo, el monto a prestar sale de tu caja y pasa a inversiones de la ruta.
              Al cobrar, lo que corresponde a capital vuelve a tu caja desde inversiones; el interés
              suma a tu caja como ganancia (no sale de inversiones).
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
