"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getCajaAdmin,
  getResumenEconomico,
  invertirEnCajaAdmin,
  invertirEnCajaRuta,
  listInversionesCajaAdmin,
  listInversionesCajaRuta,
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

  const load = useCallback(async () => {
    if (!user || !profile || profile.role !== "admin") return;

    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [caja, resumen] = await Promise.all([getCajaAdmin(token), getResumenEconomico(token)]);
      setCajaAdmin(caja);
      setRutas(resumen.rutas ?? []);
      try {
        const [listaRuta, listaAdmin] = await Promise.all([
          listInversionesCajaRuta(token),
          listInversionesCajaAdmin(token),
        ]);
        setInversiones(listaRuta ?? []);
        setInversionesAdmin(listaAdmin ?? []);
      } catch {
        setInversiones([]);
        setInversionesAdmin([]);
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
    if (!user || !profile || profile.role !== "admin" || !pending) return;
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
    if (!user || !profile || profile.role !== "admin") return;
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
    if (!user || !profile || profile.role !== "admin") return;
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

  if (!profile || profile.role !== "admin") return null;

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
              <div className="gf-salidas-card card" style={{ marginTop: "0.75rem" }}>
                <div className="gf-salidas-header">
                  <span className="gf-salidas-icon" aria-hidden>
                    📥
                  </span>
                  <h2 className="gf-salidas-title">Invertir en base de ruta</h2>
                </div>
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

              <div className="gf-historial-card card" style={{ marginTop: "1rem" }}>
                <div className="gf-historial-header">
                  <h2 className="gf-historial-title">
                    <span className="gf-historial-icon" aria-hidden>
                      📒
                    </span>
                    Historial de inversiones en base de ruta
                  </h2>
                </div>
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

            <div
              id="gf-panel-inversion-admin"
              role="tabpanel"
              aria-labelledby="gf-tab-inversion-admin"
              hidden={tabInversion !== "admin"}
            >
              <div className="gf-salidas-card card" style={{ marginTop: "0.75rem" }}>
                <div className="gf-salidas-header">
                  <span className="gf-salidas-icon" aria-hidden>
                    📤
                  </span>
                  <h2 className="gf-salidas-title">Mover dinero a base del administrador</h2>
                </div>
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

              <div className="gf-historial-card card" style={{ marginTop: "1rem" }}>
                <div className="gf-historial-header">
                  <h2 className="gf-historial-title">
                    <span className="gf-historial-icon" aria-hidden>
                      📒
                    </span>
                    Historial de inversiones en base del admin
                  </h2>
                </div>
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
