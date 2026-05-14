"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getCajaAdmin,
  getResumenEconomico,
  invertirEnCajaRuta,
  listInversionesCajaRuta,
  type InversionCajaRutaItem,
  type ResumenRutaItem,
} from "@/lib/empresa-api";
import { formatMontoEnteroInput } from "@/lib/monto-input-es";

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

type InversionPendienteModal = { rutaId: string; monto: number; rutaNombre: string };

export default function GestionFinancieraPage() {
  const { user, profile } = useAuth();
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
  const [inversionModal, setInversionModal] = useState<InversionPendienteModal | null>(null);

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
        const listaInversiones = await listInversionesCajaRuta(token);
        setInversiones(listaInversiones ?? []);
      } catch {
        setInversiones([]);
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
  }, [invertirSaving]);

  useEffect(() => {
    if (!inversionModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarModalInversion();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inversionModal, cerrarModalInversion]);

  const ejecutarInversionConfirmada = useCallback(async () => {
    const pending = inversionModal;
    if (!user || !profile || profile.role !== "admin" || !pending) return;
    setInvertirError(null);
    setInvertirOk(false);
    setInvertirSaving(true);
    try {
      const token = await user.getIdToken();
      await invertirEnCajaRuta(token, { rutaId: pending.rutaId, monto: pending.monto });
      setInversionModal(null);
      setInvertirMonto("");
      setInvertirOk(true);
      await load();
      setTimeout(() => setInvertirOk(false), 3200);
    } catch (err) {
      setInvertirError(err instanceof Error ? err.message : "Error al invertir");
      setInversionModal(null);
    } finally {
      setInvertirSaving(false);
    }
  }, [user, profile, inversionModal, load]);

  const handleInvertirEnRuta = (e: FormEvent) => {
    e.preventDefault();
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
    setInversionModal({
      rutaId: invertirRutaId.trim(),
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

            <div className="gf-salidas-card card">
              <div className="gf-salidas-header">
                <span className="gf-salidas-icon" aria-hidden>
                  📥
                </span>
                <h2 className="gf-salidas-title">Invertir en base de ruta</h2>
              </div>
              <p className="gf-salidas-desc">
                Transfiere dinero desde tu base de administrador hacia la <strong>base de la ruta</strong>{" "}
                (liquidez disponible en esa ruta).
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
                    disabled={invertirSaving || !!inversionModal}
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
                    <span className="gf-capital-input-prefix">COP $</span>
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
                      disabled={invertirSaving || !!inversionModal}
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
                  <button type="submit" className="gf-btn-actualizar" disabled={invertirSaving || !!inversionModal}>
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
        </div>
      )}

      {inversionModal && (
        <div
          className="gf-modal-backdrop gf-modal-backdrop--inversion"
          onClick={cerrarModalInversion}
          role="presentation"
        >
          <div
            className="gf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gf-inv-modal-title"
            aria-describedby="gf-inv-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="gf-inv-modal-title" className="gf-modal-title">
              ¿Confirmar inversión?
            </h2>
            <p id="gf-inv-modal-desc" className="gf-modal-desc">
              Se transferirá dinero desde tu base de administrador hacia la ruta. Revisa los datos antes de
              continuar.
            </p>
            <div className="gf-inversion-confirm-resumen">
              <div className="gf-inversion-confirm-row">
                <span className="gf-inversion-confirm-label">Ruta</span>
                <span className="gf-inversion-confirm-value">{inversionModal.rutaNombre}</span>
              </div>
              <div className="gf-inversion-confirm-row">
                <span className="gf-inversion-confirm-label">Monto a invertir</span>
                <span className="gf-inversion-confirm-value gf-inversion-confirm-value--monto">
                  COP ${formatMonto(inversionModal.monto)}
                </span>
              </div>
            </div>
            <div className="gf-modal-actions gf-modal-actions--inversion">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cerrarModalInversion}
                disabled={invertirSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void ejecutarInversionConfirmada()}
                disabled={invertirSaving}
                aria-busy={invertirSaving}
              >
                {invertirSaving ? "Procesando…" : "Confirmar inversión"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
