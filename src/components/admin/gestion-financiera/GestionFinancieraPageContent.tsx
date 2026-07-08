"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { isAdminEmpresaRole, isAdminPanelRole } from "@/lib/admin-panel-role";
import {
  getCajaAdmin,
  getResumenEconomico,
  ingresarBaseAdminEmpresa,
  invertirEnCajaAdmin,
  invertirEnCajaRuta,
  listIngresosBaseAdminEmpresa,
  listInversionesCajaAdmin,
  listInversionesCajaRuta,
  type IngresoBaseAdminEmpresaItem,
  type InversionCajaRutaItem,
  type InversionRutaCajaAdminItem,
  type ResumenRutaItem,
} from "@/lib/empresa-api";
import { formatMontoEnteroInput } from "@/lib/monto-input-es";
import { guardOfflineWrite, useOnline } from "@/hooks/useOnline";
import dynamic from "next/dynamic";

const ModalConfirmar = dynamic(
  () => import("@/components/trabajador/ModalConfirmar").then((m) => ({ default: m.ModalConfirmar })),
  { ssr: false }
);

function formatMoneda(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Formato numérico sin prefijo (paneles gf-*, alineado con vista jefe) */
function formatMonto(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

function parseMontoInvertir(value: string): { num: number; valid: boolean } {
  const raw = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number(raw);
  if (raw === "" || Number.isNaN(num)) return { num: 0, valid: false };
  if (num <= 0) return { num, valid: false };
  return { num, valid: true };
}

type InversionPendienteModal = {
  tipo: "a-ruta" | "a-admin";
  rutaId: string;
  monto: number;
  rutaNombre: string;
};

type IngresoBasePendienteModal = {
  monto: number;
};

type TabInversion = "ruta" | "admin";

export default function GestionFinancieraPageContent() {
  const { user, profile } = useAuth();
  const online = useOnline();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cajaAdmin, setCajaAdmin] = useState(0);
  const [rutas, setRutas] = useState<ResumenRutaItem[]>([]);

  const [invertirRutaId, setInvertirRutaId] = useState("");
  const [invertirMonto, setInvertirMonto] = useState("");
  const [invertirSaving, setInvertirSaving] = useState(false);
  const [invertirError, setInvertirError] = useState<string | null>(null);
  const [invertirOk, setInvertirOk] = useState(false);
  const [inversiones, setInversiones] = useState<InversionCajaRutaItem[]>([]);
  const [inversionesAdmin, setInversionesAdmin] = useState<InversionRutaCajaAdminItem[]>([]);
  const [inversionModal, setInversionModal] = useState<InversionPendienteModal | null>(null);
  const [confirmarInversionMarcado, setConfirmarInversionMarcado] = useState(false);

  const [invertirAdminRutaId, setInvertirAdminRutaId] = useState("");
  const [invertirAdminMonto, setInvertirAdminMonto] = useState("");
  const [invertirAdminError, setInvertirAdminError] = useState<string | null>(null);
  const [invertirAdminOk, setInvertirAdminOk] = useState(false);
  const [tabInversion, setTabInversion] = useState<TabInversion>("ruta");
  const [formInvertirRutaAbierto, setFormInvertirRutaAbierto] = useState(false);
  const [formInvertirAdminAbierto, setFormInvertirAdminAbierto] = useState(false);
  const [formIngresoBaseAbierto, setFormIngresoBaseAbierto] = useState(false);
  const [historialIngresosAbierto, setHistorialIngresosAbierto] = useState(false);
  const [historialRutaAbierto, setHistorialRutaAbierto] = useState(false);
  const [historialAdminAbierto, setHistorialAdminAbierto] = useState(false);

  const esAdminEmpresa = isAdminEmpresaRole(profile?.role);
  const [ingresoMonto, setIngresoMonto] = useState("");
  const [ingresoError, setIngresoError] = useState<string | null>(null);
  const [ingresoOk, setIngresoOk] = useState(false);
  const [ingresoSaving, setIngresoSaving] = useState(false);
  const [ingresosBase, setIngresosBase] = useState<IngresoBaseAdminEmpresaItem[]>([]);
  const [ingresoModal, setIngresoModal] = useState<IngresoBasePendienteModal | null>(null);
  const [confirmarIngresoMarcado, setConfirmarIngresoMarcado] = useState(false);

  const load = useCallback(async () => {
    if (!user || !profile || !isAdminPanelRole(profile.role)) return;

    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [caja, resumen] = await Promise.all([getCajaAdmin(token), getResumenEconomico(token)]);
      setCajaAdmin(caja);
      setRutas(resumen.rutas ?? []);
      try {
        const promises: [
          Promise<InversionCajaRutaItem[]>,
          Promise<InversionRutaCajaAdminItem[]>,
          Promise<IngresoBaseAdminEmpresaItem[] | null>,
        ] = [
          listInversionesCajaRuta(token),
          listInversionesCajaAdmin(token),
          isAdminEmpresaRole(profile.role) ? listIngresosBaseAdminEmpresa(token) : Promise.resolve(null),
        ];
        const [listaRuta, listaAdmin, listaIngresos] = await Promise.all(promises);
        setInversiones(listaRuta ?? []);
        setInversionesAdmin(listaAdmin ?? []);
        setIngresosBase(listaIngresos ?? []);
      } catch {
        setInversiones([]);
        setInversionesAdmin([]);
        setIngresosBase([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar gestión financiera");
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const rutasPropias = useMemo(
    () => (user ? rutas.filter((r) => r.adminId === user.uid) : []),
    [rutas, user]
  );

  const cerrarModalInversion = useCallback(() => {
    if (invertirSaving) return;
    setInversionModal(null);
    setConfirmarInversionMarcado(false);
  }, [invertirSaving]);

  const ejecutarInversionConfirmada = useCallback(async () => {
    const pending = inversionModal;
    if (!guardOfflineWrite(online, setError)) return;
    if (!user || !profile || !isAdminPanelRole(profile.role) || !pending) return;
    setInvertirSaving(true);
    try {
      const token = await user.getIdToken();
      if (pending.tipo === "a-ruta") {
        setInvertirError(null);
        setInvertirOk(false);
        await invertirEnCajaRuta(token, { rutaId: pending.rutaId, monto: pending.monto });
        setInvertirMonto("");
        setInvertirOk(true);
        setTimeout(() => setInvertirOk(false), 3200);
      } else {
        setInvertirAdminError(null);
        setInvertirAdminOk(false);
        await invertirEnCajaAdmin(token, { rutaId: pending.rutaId, monto: pending.monto });
        setInvertirAdminMonto("");
        setInvertirAdminOk(true);
        setTimeout(() => setInvertirAdminOk(false), 3200);
      }
      setInversionModal(null);
      setConfirmarInversionMarcado(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al invertir";
      if (pending.tipo === "a-ruta") setInvertirError(msg);
      else setInvertirAdminError(msg);
      setInversionModal(null);
      setConfirmarInversionMarcado(false);
    } finally {
      setInvertirSaving(false);
    }
  }, [user, profile, inversionModal, load, online]);

  const handleInvertirEnRuta = (e: FormEvent) => {
    e.preventDefault();
    if (!guardOfflineWrite(online, setInvertirError)) return;
    if (!user || !profile || !isAdminPanelRole(profile.role)) return;
    setInvertirError(null);
    setInvertirOk(false);
    if (!invertirRutaId.trim()) {
      setInvertirError("Selecciona una ruta.");
      return;
    }
    const { num, valid } = parseMontoInvertir(invertirMonto);
    if (!valid) {
      setInvertirError("Ingresa un monto válido mayor a 0.");
      return;
    }
    if (num > cajaAdmin) {
      setInvertirError("No tienes suficiente base disponible.");
      return;
    }
    const ruta = rutasPropias.find((r) => r.rutaId === invertirRutaId.trim());
    setConfirmarInversionMarcado(false);
    setInversionModal({
      tipo: "a-ruta",
      rutaId: invertirRutaId.trim(),
      monto: num,
      rutaNombre: ruta?.nombre?.trim() ? ruta.nombre : "Sin nombre",
    });
  };

  const handleInvertirEnAdmin = (e: FormEvent) => {
    e.preventDefault();
    if (!guardOfflineWrite(online, setInvertirAdminError)) return;
    if (!user || !profile || !isAdminPanelRole(profile.role)) return;
    setInvertirAdminError(null);
    setInvertirAdminOk(false);
    if (!invertirAdminRutaId.trim()) {
      setInvertirAdminError("Selecciona una ruta.");
      return;
    }
    const { num, valid } = parseMontoInvertir(invertirAdminMonto);
    if (!valid) {
      setInvertirAdminError("Ingresa un monto válido mayor a 0.");
      return;
    }
    const ruta = rutasPropias.find((r) => r.rutaId === invertirAdminRutaId.trim());
    const cajaRuta = typeof ruta?.cajaRuta === "number" ? ruta.cajaRuta : 0;
    if (num > cajaRuta) {
      setInvertirAdminError("La ruta no tiene suficiente base disponible.");
      return;
    }
    setConfirmarInversionMarcado(false);
    setInversionModal({
      tipo: "a-admin",
      rutaId: invertirAdminRutaId.trim(),
      monto: num,
      rutaNombre: ruta?.nombre?.trim() ? ruta.nombre : "Sin nombre",
    });
  };

  const cerrarModalIngreso = useCallback(() => {
    if (ingresoSaving) return;
    setIngresoModal(null);
    setConfirmarIngresoMarcado(false);
  }, [ingresoSaving]);

  const ejecutarIngresoConfirmado = useCallback(async () => {
    const pending = ingresoModal;
    if (!guardOfflineWrite(online, setIngresoError)) return;
    if (!user || !profile || !isAdminEmpresaRole(profile.role) || !pending) return;
    setIngresoSaving(true);
    setIngresoError(null);
    setIngresoOk(false);
    try {
      const token = await user.getIdToken();
      await ingresarBaseAdminEmpresa(token, { monto: pending.monto });
      setIngresoMonto("");
      setIngresoOk(true);
      setTimeout(() => setIngresoOk(false), 3200);
      setIngresoModal(null);
      setConfirmarIngresoMarcado(false);
      await load();
    } catch (err) {
      setIngresoError(err instanceof Error ? err.message : "Error al ingresar a la base");
      setIngresoModal(null);
      setConfirmarIngresoMarcado(false);
    } finally {
      setIngresoSaving(false);
    }
  }, [user, profile, ingresoModal, load, online]);

  const handleIngresarBase = (e: FormEvent) => {
    e.preventDefault();
    if (!guardOfflineWrite(online, setIngresoError)) return;
    if (!user || !profile || !isAdminEmpresaRole(profile.role)) return;
    setIngresoError(null);
    setIngresoOk(false);
    const { num, valid } = parseMontoInvertir(ingresoMonto);
    if (!valid) {
      setIngresoError("Ingresa un monto válido mayor a 0.");
      return;
    }
    setConfirmarIngresoMarcado(false);
    setIngresoModal({ monto: num });
  };

  if (!profile || !isAdminPanelRole(profile.role)) return null;

  return (
    <>
      {loading ? (
        <p>Cargando gestión...</p>
      ) : (
        <div className="gestion-financiera-page">
          {error && <p className="error-msg">{error}</p>}
          <div className="gf-panel" aria-label="Base del administrador">
            <div className="gf-capital-card card gf-capital-card--admin-75">
              <div className="gf-capital-card-header">
                <div className="gf-capital-card-title-wrap">
                  <span className="gf-capital-icon" aria-hidden>
                    🏦
                  </span>
                  <h2 className="gf-capital-card-title">Base del administrador</h2>
                </div>
                <span className="gf-capital-badge-privado">🔒 Privado</span>
              </div>

              <div className="gf-capital-display">
                <span className="gf-capital-label">BASE TOTAL</span>
                <span className="gf-capital-monto" aria-live="polite">
                  ${formatMonto(cajaAdmin)}
                </span>
              </div>
            </div>

            {esAdminEmpresa ? (
              <div
                className={`gf-salidas-card card gf-salidas-card--collapsible${formIngresoBaseAbierto ? " gf-salidas-card--open" : ""}`}
                style={{ marginTop: "1rem" }}
              >
                <button
                  type="button"
                  className="gf-salidas-toggle"
                  aria-expanded={formIngresoBaseAbierto}
                  aria-controls="gf-form-ingreso-base"
                  id="gf-toggle-ingreso-base"
                  onClick={() => setFormIngresoBaseAbierto((v) => !v)}
                >
                  <span className="gf-salidas-icon" aria-hidden>
                    💵
                  </span>
                  <span className="gf-salidas-toggle-text">
                    <span className="gf-salidas-title">Invertir</span>
                    {!formIngresoBaseAbierto ? (
                      <span className="gf-salidas-toggle-hint">Toca para expandir</span>
                    ) : null}
                  </span>
                  <span className="gf-salidas-chevron" aria-hidden>
                    {formIngresoBaseAbierto ? "▾" : "▸"}
                  </span>
                </button>
                <div
                  id="gf-form-ingreso-base"
                  className="gf-salidas-body"
                  role="region"
                  aria-labelledby="gf-toggle-ingreso-base"
                  hidden={!formIngresoBaseAbierto}
                >
                  <form onSubmit={handleIngresarBase} className="gf-capital-form" style={{ maxWidth: "22rem" }}>
                    <label htmlFor="gf-ingreso-base-monto" className="gf-capital-form-label">
                      MONTO A INGRESAR
                    </label>
                    <div className="gf-capital-input-wrap">
                      <input
                        id="gf-ingreso-base-monto"
                        type="text"
                        inputMode="decimal"
                        value={ingresoMonto}
                        onChange={(e) => {
                          setIngresoMonto(formatMontoEnteroInput(e.target.value));
                          setIngresoError(null);
                        }}
                        placeholder="Ej. 500000"
                        className={`gf-capital-input ${ingresoError ? "gf-capital-input-error" : ""}`}
                        disabled={ingresoSaving || !!ingresoModal || !online}
                        autoComplete="off"
                      />
                    </div>
                    {ingresoError && (
                      <p className="gf-capital-input-msg-error" role="alert">
                        {ingresoError}
                      </p>
                    )}
                    {ingresoOk && (
                      <p className="gf-msg" style={{ color: "#22c55e", fontSize: "0.875rem" }}>
                        Ingreso registrado correctamente.
                      </p>
                    )}
                    <button
                      type="submit"
                      className="gf-btn-actualizar"
                      disabled={ingresoSaving || !!ingresoModal || !online}
                    >
                      Registrar ingreso en base
                    </button>
                  </form>
                </div>
              </div>
            ) : null}

            {esAdminEmpresa ? (
              <div
                className={`gf-historial-card card gf-historial-card--collapsible${historialIngresosAbierto ? " gf-historial-card--open" : ""}`}
                style={{ marginTop: "1rem" }}
              >
                <button
                  type="button"
                  className="gf-historial-toggle"
                  aria-expanded={historialIngresosAbierto}
                  aria-controls="gf-historial-ingresos-base"
                  id="gf-toggle-historial-ingresos"
                  onClick={() => setHistorialIngresosAbierto((v) => !v)}
                >
                  <span className="gf-historial-toggle-text">
                    <span className="gf-historial-title">
                      <span className="gf-historial-icon" aria-hidden>
                        📒
                      </span>
                      Historial de ingresos a base
                    </span>
                    {!historialIngresosAbierto ? (
                      <span className="gf-salidas-toggle-hint">Toca para expandir</span>
                    ) : null}
                  </span>
                  <span className="gf-salidas-chevron" aria-hidden>
                    {historialIngresosAbierto ? "▾" : "▸"}
                  </span>
                </button>
                <div
                  id="gf-historial-ingresos-base"
                  className="gf-historial-body"
                  role="region"
                  aria-labelledby="gf-toggle-historial-ingresos"
                  hidden={!historialIngresosAbierto}
                >
                  {ingresosBase.length === 0 ? (
                    <p className="gf-historial-empty">Aún no hay ingresos registrados.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th className="col-num">Monto</th>
                            <th className="col-num">Base anterior</th>
                            <th className="col-num">Base nueva</th>
                            <th>Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ingresosBase.map((ing) => (
                            <tr key={ing.id}>
                              <td className="col-num">{formatMoneda(ing.monto)}</td>
                              <td className="col-num">{formatMoneda(ing.cajaAnterior)}</td>
                              <td className="col-num">{formatMoneda(ing.cajaNueva)}</td>
                              <td>{formatFechaCorta(ing.at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <nav
              className="gf-tabs"
              role="tablist"
              aria-label="Tipo de inversión: hacia ruta o hacia administrador"
              style={{ marginTop: "1rem" }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tabInversion === "ruta"}
                aria-controls="gf-panel-inversion-ruta"
                id="gf-tab-inversion-ruta"
                className={`gf-tab ${tabInversion === "ruta" ? "gf-tab-active" : ""}`}
                onClick={() => setTabInversion("ruta")}
              >
                <span className="gf-tab-icon" aria-hidden>
                  📥
                </span>
                Ruta
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tabInversion === "admin"}
                aria-controls="gf-panel-inversion-admin"
                id="gf-tab-inversion-admin"
                className={`gf-tab ${tabInversion === "admin" ? "gf-tab-active" : ""}`}
                onClick={() => setTabInversion("admin")}
              >
                <span className="gf-tab-icon" aria-hidden>
                  📤
                </span>
                Admin
              </button>
            </nav>

            <div
              id="gf-panel-inversion-ruta"
              role="tabpanel"
              aria-labelledby="gf-tab-inversion-ruta"
              hidden={tabInversion !== "ruta"}
            >
              <div
                className={`gf-salidas-card card gf-salidas-card--collapsible${formInvertirRutaAbierto ? " gf-salidas-card--open" : ""}`}
                style={{ marginTop: "0.75rem" }}
              >
                <button
                  type="button"
                  className="gf-salidas-toggle"
                  aria-expanded={formInvertirRutaAbierto}
                  aria-controls="gf-form-invertir-ruta"
                  id="gf-toggle-invertir-ruta"
                  onClick={() => setFormInvertirRutaAbierto((v) => !v)}
                >
                  <span className="gf-salidas-icon" aria-hidden>
                    📥
                  </span>
                  <span className="gf-salidas-toggle-text">
                    <span className="gf-salidas-title">Invertir en base de ruta</span>
                    {!formInvertirRutaAbierto ? (
                      <span className="gf-salidas-toggle-hint">Toca para expandir</span>
                    ) : null}
                  </span>
                  <span className="gf-salidas-chevron" aria-hidden>
                    {formInvertirRutaAbierto ? "▾" : "▸"}
                  </span>
                </button>
                <div
                  id="gf-form-invertir-ruta"
                  className="gf-salidas-body"
                  role="region"
                  aria-labelledby="gf-toggle-invertir-ruta"
                  hidden={!formInvertirRutaAbierto}
                >
                  <p className="gf-salidas-desc">
                    Transfiere dinero desde tu base de administrador hacia la{" "}
                    <strong>base de la ruta</strong> (liquidez disponible en esa ruta).
                  </p>

                  {rutasPropias.length === 0 ? (
                    <p className="gf-salidas-empty">No tienes rutas asignadas aún. Crea una ruta primero.</p>
                  ) : (
                    <form onSubmit={handleInvertirEnRuta} className="gf-capital-form" style={{ maxWidth: "22rem" }}>
                      <label htmlFor="gf-invertir-ruta" className="gf-capital-form-label">
                        RUTA
                      </label>
                      <select
                        id="gf-invertir-ruta"
                        className="gf-capital-input"
                        style={{ width: "100%", maxWidth: "22rem", padding: "0.65rem 0.75rem" }}
                        value={invertirRutaId}
                        onChange={(e) => {
                          setInvertirRutaId(e.target.value);
                          setInvertirError(null);
                        }}
                        disabled={invertirSaving || !!inversionModal || !online}
                        required
                      >
                        <option value="">— selecciona —</option>
                        {rutasPropias.map((r) => (
                          <option key={r.rutaId} value={r.rutaId}>
                            {r.nombre?.trim() ? r.nombre : "Sin nombre"}
                          </option>
                        ))}
                      </select>

                      <label htmlFor="gf-invertir-monto" className="gf-capital-form-label gf-capital-form-label-second">
                        MONTO A INVERTIR
                      </label>
                      <div className="gf-capital-input-wrap">
                        <input
                          id="gf-invertir-monto"
                          type="text"
                          inputMode="decimal"
                          value={invertirMonto}
                          onChange={(e) => {
                            setInvertirMonto(formatMontoEnteroInput(e.target.value));
                            setInvertirError(null);
                          }}
                          placeholder="Ej. 500000"
                          className={`gf-capital-input ${invertirError ? "gf-capital-input-error" : ""}`}
                          disabled={invertirSaving || !!inversionModal || !online}
                          autoComplete="off"
                        />
                      </div>
                      {invertirError && (
                        <p className="gf-capital-input-msg-error" role="alert">
                          {invertirError}
                        </p>
                      )}
                      {invertirOk && (
                        <p className="gf-msg" style={{ color: "#22c55e", fontSize: "0.875rem" }}>
                          Inversión aplicada correctamente.
                        </p>
                      )}
                      <button type="submit" className="gf-btn-actualizar" disabled={invertirSaving || !!inversionModal || !online}>
                        Invertir en la ruta
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <div
                className={`gf-historial-card card gf-historial-card--collapsible${historialRutaAbierto ? " gf-historial-card--open" : ""}`}
                style={{ marginTop: "1rem" }}
              >
                <button
                  type="button"
                  className="gf-historial-toggle"
                  aria-expanded={historialRutaAbierto}
                  aria-controls="gf-historial-inversiones-ruta"
                  id="gf-toggle-historial-ruta"
                  onClick={() => setHistorialRutaAbierto((v) => !v)}
                >
                  <span className="gf-historial-toggle-text">
                    <span className="gf-historial-title">
                      <span className="gf-historial-icon" aria-hidden>
                        📒
                      </span>
                      Historial de inversiones en base de ruta
                    </span>
                    {!historialRutaAbierto ? (
                      <span className="gf-salidas-toggle-hint">Toca para expandir</span>
                    ) : null}
                  </span>
                  <span className="gf-salidas-chevron" aria-hidden>
                    {historialRutaAbierto ? "▾" : "▸"}
                  </span>
                </button>
                <div
                  id="gf-historial-inversiones-ruta"
                  className="gf-historial-body"
                  role="region"
                  aria-labelledby="gf-toggle-historial-ruta"
                  hidden={!historialRutaAbierto}
                >
                  {inversiones.length === 0 ? (
                    <p className="gf-historial-empty">Aún no hay inversiones registradas.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Ruta</th>
                            <th className="col-num">Monto invertido</th>
                            <th>Fecha</th>
                            <th>Quién invirtió</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inversiones.map((inv) => (
                            <tr key={inv.id}>
                              <td>{inv.rutaNombre?.trim() ? inv.rutaNombre : inv.rutaId}</td>
                              <td className="col-num">{formatMoneda(inv.monto)}</td>
                              <td>{inv.fecha ? formatFechaCorta(inv.fecha) : "—"}</td>
                              <td>{inv.invertidoPorNombre || inv.invertidoPorUid}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              id="gf-panel-inversion-admin"
              role="tabpanel"
              aria-labelledby="gf-tab-inversion-admin"
              hidden={tabInversion !== "admin"}
            >
              <div
                className={`gf-salidas-card card gf-salidas-card--collapsible${formInvertirAdminAbierto ? " gf-salidas-card--open" : ""}`}
                style={{ marginTop: "0.75rem" }}
              >
                <button
                  type="button"
                  className="gf-salidas-toggle"
                  aria-expanded={formInvertirAdminAbierto}
                  aria-controls="gf-form-invertir-admin"
                  id="gf-toggle-invertir-admin"
                  onClick={() => setFormInvertirAdminAbierto((v) => !v)}
                >
                  <span className="gf-salidas-icon" aria-hidden>
                    📤
                  </span>
                  <span className="gf-salidas-toggle-text">
                    <span className="gf-salidas-title">Mover dinero a base del administrador</span>
                    {!formInvertirAdminAbierto ? (
                      <span className="gf-salidas-toggle-hint">Toca para expandir</span>
                    ) : null}
                  </span>
                  <span className="gf-salidas-chevron" aria-hidden>
                    {formInvertirAdminAbierto ? "▾" : "▸"}
                  </span>
                </button>
                <div
                  id="gf-form-invertir-admin"
                  className="gf-salidas-body"
                  role="region"
                  aria-labelledby="gf-toggle-invertir-admin"
                  hidden={!formInvertirAdminAbierto}
                >
                  <p className="gf-salidas-desc">
                    Transfiere dinero desde la <strong>base de la ruta</strong> seleccionada hacia tu{" "}
                    <strong>base de administrador</strong>.
                  </p>

                  {rutasPropias.length === 0 ? (
                    <p className="gf-salidas-empty">No tienes rutas asignadas aún. Crea una ruta primero.</p>
                  ) : (
                    <form
                      onSubmit={handleInvertirEnAdmin}
                      className="gf-capital-form"
                      style={{ maxWidth: "22rem" }}
                    >
                      <label htmlFor="gf-invertir-admin-ruta" className="gf-capital-form-label">
                        RUTA
                      </label>
                      <select
                        id="gf-invertir-admin-ruta"
                        className="gf-capital-input"
                        style={{ width: "100%", maxWidth: "22rem", padding: "0.65rem 0.75rem" }}
                        value={invertirAdminRutaId}
                        onChange={(e) => {
                          setInvertirAdminRutaId(e.target.value);
                          setInvertirAdminError(null);
                        }}
                        disabled={invertirSaving || !!inversionModal || !online}
                        required
                      >
                        <option value="">— selecciona —</option>
                        {rutasPropias.map((r) => (
                          <option key={r.rutaId} value={r.rutaId}>
                            {r.nombre?.trim() ? r.nombre : "Sin nombre"}
                            {typeof r.cajaRuta === "number"
                              ? ` (base: $${formatMonto(r.cajaRuta)})`
                              : ""}
                          </option>
                        ))}
                      </select>

                      <label
                        htmlFor="gf-invertir-admin-monto"
                        className="gf-capital-form-label gf-capital-form-label-second"
                      >
                        MONTO A INVERTIR
                      </label>
                      <div className="gf-capital-input-wrap">
                        <input
                          id="gf-invertir-admin-monto"
                          type="text"
                          inputMode="decimal"
                          value={invertirAdminMonto}
                          onChange={(e) => {
                            setInvertirAdminMonto(formatMontoEnteroInput(e.target.value));
                            setInvertirAdminError(null);
                          }}
                          placeholder="Ej. 500000"
                          className={`gf-capital-input ${invertirAdminError ? "gf-capital-input-error" : ""}`}
                          disabled={invertirSaving || !!inversionModal || !online}
                          autoComplete="off"
                        />
                      </div>
                      {invertirAdminError && (
                        <p className="gf-capital-input-msg-error" role="alert">
                          {invertirAdminError}
                        </p>
                      )}
                      {invertirAdminOk && (
                        <p className="gf-msg" style={{ color: "#22c55e", fontSize: "0.875rem" }}>
                          Transferencia aplicada correctamente.
                        </p>
                      )}
                      <button
                        type="submit"
                        className="gf-btn-actualizar"
                        disabled={invertirSaving || !!inversionModal || !online}
                      >
                        Mover dinero a base del administrador
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <div
                className={`gf-historial-card card gf-historial-card--collapsible${historialAdminAbierto ? " gf-historial-card--open" : ""}`}
                style={{ marginTop: "1rem" }}
              >
                <button
                  type="button"
                  className="gf-historial-toggle"
                  aria-expanded={historialAdminAbierto}
                  aria-controls="gf-historial-inversiones-admin"
                  id="gf-toggle-historial-admin"
                  onClick={() => setHistorialAdminAbierto((v) => !v)}
                >
                  <span className="gf-historial-toggle-text">
                    <span className="gf-historial-title">
                      <span className="gf-historial-icon" aria-hidden>
                        📒
                      </span>
                      Historial de inversiones en base del admin
                    </span>
                    {!historialAdminAbierto ? (
                      <span className="gf-salidas-toggle-hint">Toca para expandir</span>
                    ) : null}
                  </span>
                  <span className="gf-salidas-chevron" aria-hidden>
                    {historialAdminAbierto ? "▾" : "▸"}
                  </span>
                </button>
                <div
                  id="gf-historial-inversiones-admin"
                  className="gf-historial-body"
                  role="region"
                  aria-labelledby="gf-toggle-historial-admin"
                  hidden={!historialAdminAbierto}
                >
                  {inversionesAdmin.length === 0 ? (
                    <p className="gf-historial-empty">Aún no hay transferencias desde rutas registradas.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Ruta origen</th>
                            <th className="col-num">Monto transferido</th>
                            <th>Fecha</th>
                            <th>Quién registró</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inversionesAdmin.map((inv) => (
                            <tr key={inv.id}>
                              <td>{inv.rutaNombre?.trim() ? inv.rutaNombre : inv.rutaId}</td>
                              <td className="col-num">{formatMoneda(inv.monto)}</td>
                              <td>{inv.fecha ? formatFechaCorta(inv.fecha) : "—"}</td>
                              <td>{inv.invertidoPorNombre || inv.invertidoPorUid}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {ingresoModal && (
        <ModalConfirmar
          titulo="Confirmar ingreso a base"
          labelConfirmar="Sí, registrar ingreso"
          confirmando={ingresoSaving}
          confirmarDeshabilitado={!online}
          confirmacionMarcada={confirmarIngresoMarcado}
          onConfirmacionMarcadaChange={setConfirmarIngresoMarcado}
          labelConfirmacion={
            <>
              Confirmo el ingreso de <strong>${formatMonto(ingresoModal.monto)}</strong> a mi base
              de administrador
            </>
          }
          onCancelar={cerrarModalIngreso}
          onConfirmar={() => {
            void ejecutarIngresoConfirmado();
          }}
        >
          <p>
            Se registrará liquidez externa en tu base de administrador. Revisa el monto antes de
            continuar.
          </p>
          <div className="gf-inversion-confirm-resumen">
            <div className="gf-inversion-confirm-row">
              <span className="gf-inversion-confirm-label">Monto a ingresar</span>
              <span className="gf-inversion-confirm-value gf-inversion-confirm-value--monto">
                ${formatMonto(ingresoModal.monto)}
              </span>
            </div>
            <div className="gf-inversion-confirm-row">
              <span className="gf-inversion-confirm-label">Base actual</span>
              <span className="gf-inversion-confirm-value">${formatMonto(cajaAdmin)}</span>
            </div>
            <div className="gf-inversion-confirm-row">
              <span className="gf-inversion-confirm-label">Base resultante</span>
              <span className="gf-inversion-confirm-value gf-inversion-confirm-value--monto">
                ${formatMonto(cajaAdmin + ingresoModal.monto)}
              </span>
            </div>
          </div>
        </ModalConfirmar>
      )}

      {inversionModal && (
        <ModalConfirmar
          titulo="Confirmar inversión"
          labelConfirmar="Sí, registrar inversión"
          confirmando={invertirSaving}
          confirmarDeshabilitado={!online}
          confirmacionMarcada={confirmarInversionMarcado}
          onConfirmacionMarcadaChange={setConfirmarInversionMarcado}
          labelConfirmacion={
            inversionModal.tipo === "a-ruta" ? (
              <>
                Confirmo la inversión de <strong>${formatMonto(inversionModal.monto)}</strong> en la
                ruta <strong>{inversionModal.rutaNombre}</strong>
              </>
            ) : (
              <>
                Confirmo la devolución de <strong>${formatMonto(inversionModal.monto)}</strong> desde
                la ruta <strong>{inversionModal.rutaNombre}</strong> hacia mi base
              </>
            )
          }
          onCancelar={cerrarModalInversion}
          onConfirmar={() => { void ejecutarInversionConfirmada(); }}
        >
          <p>
            {inversionModal.tipo === "a-ruta"
              ? "Se transferirá dinero desde tu base de administrador hacia la ruta. Revisa los datos antes de continuar."
              : "Se transferirá dinero desde la base de la ruta hacia tu base de administrador. Revisa los datos antes de continuar."}
          </p>
          <div className="gf-inversion-confirm-resumen">
            <div className="gf-inversion-confirm-row">
              <span className="gf-inversion-confirm-label">Ruta</span>
              <span className="gf-inversion-confirm-value">{inversionModal.rutaNombre}</span>
            </div>
            <div className="gf-inversion-confirm-row">
              <span className="gf-inversion-confirm-label">Monto a invertir</span>
              <span className="gf-inversion-confirm-value gf-inversion-confirm-value--monto">
                ${formatMonto(inversionModal.monto)}
              </span>
            </div>
          </div>
        </ModalConfirmar>
      )}
    </>
  );
}
