"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  EMPRESAS_COLLECTION,
  SOLICITUDES_PRESTAMO_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  aprobarSolicitudPrestamo,
  rechazarSolicitudPrestamo,
  type SolicitudPrestamoApi,
} from "@/lib/empresa-api";
import { ModalConfirmar } from "@/components/trabajador/ModalConfirmar";

function formatMonto(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "—";
  const [entero, dec = ""] = n.toFixed(2).split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decTrim = dec.replace(/0+$/, "");
  return decTrim ? `${conPuntos},${decTrim}` : conPuntos;
}

export default function SolicitudesPrestamoAdminPage() {
  const { user, profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudPrestamoApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionId, setAccionId] = useState<string | null>(null);
  const [accion, setAccion] = useState<"aprobar" | "rechazar" | null>(null);
  const [solicitudModalAprobar, setSolicitudModalAprobar] = useState<SolicitudPrestamoApi | null>(null);

  useEffect(() => {
    if (!db || !user || !profile?.empresaId) return;
    const empresaId = profile.empresaId.trim();

    const q = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, SOLICITUDES_PRESTAMO_SUBCOLLECTION),
      where("adminId", "==", user.uid),
      where("estado", "==", "pendiente")
    );

    setLoading(true);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: SolicitudPrestamoApi[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            empleadoUid: x.empleadoUid ?? "",
            empleadoNombre: x.empleadoNombre ?? "",
            clienteId: x.clienteId ?? "",
            clienteNombre: x.clienteNombre ?? "",
            monto: typeof x.monto === "number" ? x.monto : 0,
            interes: typeof x.interes === "number" ? x.interes : 0,
            numeroCuotas: typeof x.numeroCuotas === "number" ? x.numeroCuotas : 0,
            modalidad: x.modalidad ?? "mensual",
            fechaInicio: typeof x.fechaInicio === "string" ? x.fechaInicio : "",
            adminId: x.adminId ?? "",
            rutaId: x.rutaId ?? "",
            estado: x.estado ?? "pendiente",
            motivoRechazo: x.motivoRechazo ?? null,
            prestamoId: x.prestamoId ?? null,
            creadaEn: x.creadaEn?.toDate?.()?.toISOString?.() ?? null,
            resueltaEn: x.resueltaEn?.toDate?.()?.toISOString?.() ?? null,
          };
        });
        items.sort((a, b) => (b.creadaEn ?? "").localeCompare(a.creadaEn ?? ""));
        setSolicitudes(items);
        setLoading(false);
      },
      (err) => {
        console.warn("[SolicitudesPrestamo] onSnapshot:", err);
        setLoading(false);
      }
    );

    return unsub;
  }, [user?.uid, profile?.empresaId]);

  const abrirModalAprobar = (solicitud: SolicitudPrestamoApi) => {
    if (accionId !== null) return;
    setError(null);
    setSolicitudModalAprobar(solicitud);
  };

  const handleEjecutarAprobar = async () => {
    if (!user || !solicitudModalAprobar) return;
    const solicitudId = solicitudModalAprobar.id;
    setAccionId(solicitudId);
    setAccion("aprobar");
    setError(null);
    try {
      const token = await user.getIdToken();
      await aprobarSolicitudPrestamo(token, solicitudId);
      setSolicitudModalAprobar(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aprobar");
    } finally {
      setAccionId(null);
      setAccion(null);
    }
  };

  const handleRechazar = async (solicitudId: string) => {
    if (!user) return;
    setAccionId(solicitudId);
    setAccion("rechazar");
    setError(null);
    try {
      const token = await user.getIdToken();
      await rechazarSolicitudPrestamo(token, solicitudId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al rechazar");
    } finally {
      setAccionId(null);
      setAccion(null);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  const totalPagarModal =
    solicitudModalAprobar != null
      ? solicitudModalAprobar.monto * (1 + solicitudModalAprobar.interes / 100)
      : 0;
  const cuotaModal =
    solicitudModalAprobar != null && solicitudModalAprobar.numeroCuotas > 0
      ? totalPagarModal / solicitudModalAprobar.numeroCuotas
      : 0;
  const aprobandoModal =
    solicitudModalAprobar != null &&
    accionId === solicitudModalAprobar.id &&
    accion === "aprobar";

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Solicitudes de préstamo</h2>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : solicitudes.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No hay solicitudes pendientes.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {solicitudes.map((s) => (
            <div
              key={s.id}
              className="card"
              style={{
                margin: 0,
                padding: "1rem",
                border: "1px solid var(--card-border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <p style={{ margin: "0 0 0.25rem", fontWeight: 600, fontSize: "1rem" }}>
                    {s.clienteNombre}
                  </p>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    Solicitado por {s.empleadoNombre}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem 1.25rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Monto: </span>
                      <strong>$ {formatMonto(s.monto)}</strong>
                    </span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Interés: </span>
                      <strong>{s.interes}%</strong>
                    </span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Cuotas: </span>
                      <strong>
                        {s.numeroCuotas} {s.modalidad}s
                      </strong>
                    </span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Cuota: </span>
                      <strong>
                        $ {formatMonto((s.monto * (1 + s.interes / 100)) / s.numeroCuotas)}
                      </strong>
                    </span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Total a pagar: </span>
                      <strong>$ {formatMonto(s.monto * (1 + s.interes / 100))}</strong>
                    </span>
                  </div>
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {s.creadaEn
                      ? new Date(s.creadaEn).toLocaleString("es-CO", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={accionId !== null}
                    onClick={() => abrirModalAprobar(s)}
                  >
                    {accionId === s.id && accion === "aprobar" ? "Aprobando..." : "Aprobar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={accionId !== null}
                    onClick={() => void handleRechazar(s.id)}
                  >
                    {accionId === s.id && accion === "rechazar" ? "Rechazando..." : "Rechazar"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {solicitudModalAprobar && (
        <ModalConfirmar
          titulo="Confirmar aprobación"
          labelConfirmar="Sí, aprobar solicitud"
          confirmando={aprobandoModal}
          onCancelar={() => {
            if (aprobandoModal) return;
            setSolicitudModalAprobar(null);
          }}
          onConfirmar={() => { void handleEjecutarAprobar(); }}
        >
          <p>¿Estás seguro de aprobar esta solicitud y crear el préstamo?</p>
          <p>
            Cliente: <strong>{solicitudModalAprobar.clienteNombre}</strong>
          </p>
          <p>
            Solicitado por: <strong>{solicitudModalAprobar.empleadoNombre}</strong>
          </p>
          <p>
            Monto: <strong>$ {formatMonto(solicitudModalAprobar.monto)}</strong>
          </p>
          <p>
            Interés: <strong>{solicitudModalAprobar.interes}%</strong>
          </p>
          <p>
            Cuotas:{" "}
            <strong>
              {solicitudModalAprobar.numeroCuotas} {solicitudModalAprobar.modalidad}s
            </strong>
          </p>
          <p>
            Total a pagar: <strong>$ {formatMonto(totalPagarModal)}</strong>
          </p>
          <p>
            Cuota: <strong>$ {formatMonto(cuotaModal)}</strong>
          </p>
        </ModalConfirmar>
      )}
    </div>
  );
}
