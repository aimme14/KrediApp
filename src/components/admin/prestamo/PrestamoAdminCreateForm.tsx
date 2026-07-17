"use client";

import SelectConBusqueda, { type SelectConBusquedaOption } from "@/components/SelectConBusqueda";
import {
  formatClienteCodigoRutaYNumero,
  type ClienteItem,
  type PrestamoHistorialClienteItem,
  type RutaItem,
} from "@/lib/empresa-api";
import { formatInteresResumenPct, parseInteresPct } from "@/lib/interes-pct";
import { labelEstadoPrestamo } from "@/lib/prestamo-estado";
import {
  formatMontoDecimalCOPDisplay,
  interiorDecimalCOPToNumber,
  sanitizeMontoDecimalCOP,
} from "@/lib/monto-input-es";
import {
  formatMonedaPrestamoAdmin,
  PRESTAMO_ADMIN_CUOTAS_MAX,
  PRESTAMO_ADMIN_MODALIDADES,
} from "@/lib/prestamo-admin-format";
import { DIAS_COBRO_MODO_OPTIONS } from "@/lib/prestamo-fecha-final";
import type { DiasCobroModo } from "@/types/firestore";

export type PrestamoAdminCreateFormProps = {
  rutas: RutaItem[];
  rutaIdForm: string;
  onRutaIdFormChange: (value: string) => void;
  clienteId: string;
  onClienteIdChange: (value: string) => void;
  opcionesClientePrestamo: SelectConBusquedaOption[];
  hintClientePrestamo?: string;
  clienteSeleccionado: ClienteItem | null;
  monto: string;
  onMontoChange: (value: string) => void;
  cajaRuta: number;
  historialEconomicoColapsado: boolean;
  onHistorialEconomicoColapsadoToggle: () => void;
  loading: boolean;
  /** Últimos 3 préstamos del cliente (consulta puntual). */
  prestamosDelCliente: PrestamoHistorialClienteItem[];
  modalidad: "diario" | "semanal" | "mensual";
  onModalidadChange: (value: "diario" | "semanal" | "mensual") => void;
  numeroCuotas: string;
  onNumeroCuotasChange: (value: string) => void;
  interes: string;
  onInteresChange: (value: string) => void;
  fechaFinal: string;
  onFechaFinalChange: (value: string) => void;
  diasCobroModo: DiasCobroModo;
  onDiasCobroModoChange: (value: DiasCobroModo) => void;
  montoNum: number;
  nCuotasVal: number;
  iVal: number;
  totalAPagar: number;
  cuotaPorPago: number;
  error: string | null;
  listaError: string | null;
  confirmarMontoAlto: boolean;
  onConfirmarMontoAltoChange: (checked: boolean) => void;
  requiereConfirmarMonto: boolean;
  creating: boolean;
  online: boolean;
  onSubmit: () => void;
  onClose: () => void;
};

/** Formulario de creación de préstamo (admin); cargado bajo demanda. */
export default function PrestamoAdminCreateForm({
  rutas,
  rutaIdForm,
  onRutaIdFormChange,
  clienteId,
  onClienteIdChange,
  opcionesClientePrestamo,
  hintClientePrestamo,
  clienteSeleccionado,
  monto,
  onMontoChange,
  cajaRuta,
  historialEconomicoColapsado,
  onHistorialEconomicoColapsadoToggle,
  loading,
  prestamosDelCliente,
  modalidad,
  onModalidadChange,
  numeroCuotas,
  onNumeroCuotasChange,
  interes,
  onInteresChange,
  fechaFinal,
  onFechaFinalChange,
  diasCobroModo,
  onDiasCobroModoChange,
  montoNum,
  nCuotasVal,
  iVal,
  totalAPagar,
  cuotaPorPago,
  error,
  listaError,
  confirmarMontoAlto,
  onConfirmarMontoAltoChange,
  requiereConfirmarMonto,
  creating,
  online,
  onSubmit,
  onClose,
}: PrestamoAdminCreateFormProps) {
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== "TEXTAREA") e.preventDefault();
      }}
      className="card prestamo-admin-create-form"
      style={{ marginBottom: "1.25rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          marginBottom: "0.5rem",
        }}
      >
        <h3 style={{ margin: 0 }}>Nuevo préstamo</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar formulario y volver al listado"
          title="Cerrar"
          style={{ padding: "0.35rem 0.6rem", minWidth: "auto", lineHeight: 1, flexShrink: 0 }}
          className="btn btn-primary"
        >
          ×
        </button>
      </div>
      <div className="prestamo-admin-create-row prestamo-admin-create-row--top">
        <div className="form-group prestamo-admin-create-ruta">
          <label>Ruta</label>
          <select
            value={rutaIdForm}
            onChange={(e) => onRutaIdFormChange(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem" }}
            aria-label="Seleccionar ruta"
          >
            <option value="">Seleccionar ruta</option>
            {rutas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.ubicacion ? ` · ${r.ubicacion}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group prestamo-admin-create-cliente">
          <label>Cliente</label>
          <SelectConBusqueda
            value={clienteId}
            onChange={onClienteIdChange}
            options={opcionesClientePrestamo}
            placeholder={rutaIdForm ? "Buscar cliente…" : "Primero elige una ruta"}
            disabled={!rutaIdForm}
            required={Boolean(rutaIdForm)}
            aria-label="Seleccionar cliente"
            hint={hintClientePrestamo}
          />
          {clienteSeleccionado && (
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: 0 }}>
              Cliente:{" "}
              {clienteSeleccionado.codigo && (
                <span className="cliente-code">{formatClienteCodigoRutaYNumero(clienteSeleccionado.codigo)}</span>
              )}
              {clienteSeleccionado.codigo && " · "}
              <strong>{clienteSeleccionado.nombre}</strong>
              {clienteSeleccionado.cedula && <> · Céd. {clienteSeleccionado.cedula}</>}
            </p>
          )}
        </div>
        <div className="form-group prestamo-admin-create-monto">
          <label>Cantidad a prestar</label>
          <input
            type="text"
            inputMode="decimal"
            value={monto ? formatMontoDecimalCOPDisplay(monto) : ""}
            onChange={(e) => onMontoChange(sanitizeMontoDecimalCOP(e.target.value))}
            required
            placeholder="0,00"
          />
          {rutaIdForm && (
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Base disponible en ruta: <strong>$ {formatMonedaPrestamoAdmin(cajaRuta)}</strong>
            </p>
          )}
        </div>
      </div>

      {clienteId && (
        <div
          className="form-group"
          style={{
            marginBottom: "1.25rem",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={onHistorialEconomicoColapsadoToggle}
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
          <div
            id="historial-economico-content"
            role="region"
            aria-labelledby="historial-economico-toggle"
            style={{ display: historialEconomicoColapsado ? "none" : "block", padding: "0 0.75rem 0.75rem" }}
          >
            {loading ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "0.5rem 0 0" }}>Cargando...</p>
            ) : prestamosDelCliente.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "0.5rem 0 0" }}>
                Este cliente no tiene préstamos anteriores.
              </p>
            ) : (
              <div className="table-wrap" style={{ marginTop: "0.5rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th className="col-num">Monto</th>
                      <th className="col-num">Total a pagar</th>
                      <th className="col-num">Saldo</th>
                      <th>Estado</th>
                      <th>Frecuencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prestamosDelCliente.map((p) => (
                      <tr key={p.id}>
                        <td className="col-num">{formatMonedaPrestamoAdmin(p.monto)}</td>
                        <td className="col-num">{formatMonedaPrestamoAdmin(p.totalAPagar)}</td>
                        <td className="col-num">{formatMonedaPrestamoAdmin(p.saldoPendiente)}</td>
                        <td>{labelEstadoPrestamo(p)}</td>
                        <td>{p.modalidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {historialEconomicoColapsado && !loading && (
            <p style={{ padding: "0 0.75rem 0.75rem", margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
              {prestamosDelCliente.length === 0
                ? "Sin préstamos anteriores"
                : `Últimos ${prestamosDelCliente.length} préstamo${prestamosDelCliente.length !== 1 ? "s" : ""}. Haz clic en «Expandir» para ver el detalle.`}
            </p>
          )}
        </div>
      )}

      <div className="prestamo-admin-create-row prestamo-admin-create-row--terms">
        <div className="form-group prestamo-admin-create-freq">
          <label>Frecuencia de pago</label>
          <select
            value={modalidad}
            onChange={(e) => onModalidadChange(e.target.value as "diario" | "semanal" | "mensual")}
            style={{ width: "100%", padding: "0.5rem" }}
          >
            {PRESTAMO_ADMIN_MODALIDADES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group prestamo-admin-create-cuotas">
          <label>Número de cuotas</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={PRESTAMO_ADMIN_CUOTAS_MAX}
            value={numeroCuotas}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (v === "" || /^\d+$/.test(v)) onNumeroCuotasChange(v);
            }}
            onKeyDown={(e) => {
              const k = e.key;
              if (k === "e" || k === "E" || k === "+" || k === "-" || k === "." || k === ",") e.preventDefault();
            }}
            placeholder="Ej: 12"
            required
            aria-label="Número de cuotas"
          />
        </div>
        <div className="form-group prestamo-admin-create-interes">
          <label>Interés (%)</label>
          <input
            type="text"
            inputMode="decimal"
            value={interes}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (v === "" || /^\d*\.?\d*$/.test(v)) onInteresChange(v);
            }}
            onKeyDown={(e) => {
              const k = e.key;
              if (k === "e" || k === "E" || k === "+" || k === "-") e.preventDefault();
            }}
            placeholder="Ej: 10"
            aria-label="Interés en porcentaje"
          />
        </div>
        <div className="form-group prestamo-admin-create-cuota">
          <label>Cuota</label>
          <input
            type="text"
            readOnly
            value={(() => {
              const m = interiorDecimalCOPToNumber(monto);
              const nCuotas = parseInt(numeroCuotas, 10);
              const i = parseInteresPct(interes);
              if (isNaN(m) || m <= 0 || !nCuotas || nCuotas < 1) return "—";
              const total = m * (1 + i / 100);
              return formatMonedaPrestamoAdmin(total / nCuotas);
            })()}
            aria-label="Cuota (calculada)"
            style={{ backgroundColor: "var(--bg)", cursor: "default" }}
          />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: "1rem" }}>
        <label htmlFor="prestamo-admin-dias-cobro">Días de cobro</label>
        <select
          id="prestamo-admin-dias-cobro"
          value={diasCobroModo}
          onChange={(e) => onDiasCobroModoChange(e.target.value as DiasCobroModo)}
          aria-label="Días de cobro"
          style={{ width: "100%", maxWidth: "20rem", padding: "0.5rem" }}
        >
          {DIAS_COBRO_MODO_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {DIAS_COBRO_MODO_OPTIONS.find((o) => o.value === diasCobroModo)?.hint}
        </p>
      </div>
      <div className="form-group" style={{ marginBottom: "1rem" }}>
        <label htmlFor="prestamo-admin-fecha-final">Fecha final del préstamo</label>
        <input
          id="prestamo-admin-fecha-final"
          type="date"
          value={fechaFinal}
          onChange={(e) => onFechaFinalChange(e.target.value)}
          required
          aria-label="Fecha final del préstamo"
          style={{ width: "100%", maxWidth: "16rem", padding: "0.5rem" }}
        />
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          .
          {diasCobroModo === "personalizado"
            ? " Elige la fecha manualmente."
            : " Se sugiere según cuotas, frecuencia y días de cobro."}
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
            <li>
              Monto a prestar: <strong>{formatMonedaPrestamoAdmin(montoNum)}</strong>
            </li>
            <li>
              Interés: <strong>{formatInteresResumenPct(iVal)}%</strong>
            </li>
            <li>
              Total a pagar: <strong>{formatMonedaPrestamoAdmin(totalAPagar)}</strong>
            </li>
            <li>
              Número de cuotas: <strong>{nCuotasVal}</strong> ({modalidad})
            </li>
            {fechaFinal ? (
              <li>
                Fecha final: <strong>{fechaFinal}</strong>
              </li>
            ) : null}
            <li>
              Cuota por pago: <strong>{formatMonedaPrestamoAdmin(cuotaPorPago)}</strong>
            </li>
          </ul>
        </div>
      )}

      {(error || listaError) && <p className="error-msg">{error ?? listaError}</p>}
      <div className="prestamo-nuevo-actions prestamo-admin-create-actions">
        <label className="prestamo-nuevo-confirm-label prestamo-admin-create-confirm-label">
          <input
            type="checkbox"
            checked={confirmarMontoAlto}
            onChange={(e) => onConfirmarMontoAltoChange(e.target.checked)}
            aria-label={
              requiereConfirmarMonto
                ? `Confirmo creación de préstamo por ${formatMonedaPrestamoAdmin(montoNum)}`
                : "Confirmo creación del préstamo"
            }
          />
          <span>
            {requiereConfirmarMonto ? (
              <>
                Confirmo el préstamo <strong>{formatMonedaPrestamoAdmin(montoNum)}</strong>
              </>
            ) : (
              "Confirmo"
            )}
          </span>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={creating || !confirmarMontoAlto || !online}
          onClick={onSubmit}
          aria-disabled={creating || !confirmarMontoAlto || !online}
        >
          {creating ? "Creando..." : "Crear préstamo"}
        </button>
      </div>
    </form>
  );
}
