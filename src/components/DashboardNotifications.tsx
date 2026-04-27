"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  getMiSolicitudEntregaReporte,
  getSolicitudesEntregaReportePendientes,
  type SolicitudEntregaReporteApi,
  type SolicitudEntregaPendienteAdmin,
} from "@/lib/empresa-api";

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function formatMonto(value: number): string {
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export default function DashboardNotifications() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pendienteTrabajador, setPendienteTrabajador] =
    useState<SolicitudEntregaReporteApi | null>(null);
  const [rechazadaTrabajador, setRechazadaTrabajador] =
    useState<SolicitudEntregaReporteApi | null>(null);
  const [adminPendientes, setAdminPendientes] = useState<SolicitudEntregaPendienteAdmin[]>([]);

  const role = profile?.role;

  useEffect(() => {
    if (!user || !role) return;
    const firebaseUser = user;
    let cancelled = false;

    async function load() {
      try {
        const token = await firebaseUser.getIdToken();
        if (role === "trabajador") {
          const { pendiente, ultimaRechazada } = await getMiSolicitudEntregaReporte(token);
          if (cancelled) return;
          setPendienteTrabajador(pendiente);
          setRechazadaTrabajador(
            ultimaRechazada?.estado === "rechazada" ? ultimaRechazada : null
          );
        } else if (role === "admin") {
          const list = await getSolicitudesEntregaReportePendientes(token);
          if (cancelled) return;
          setAdminPendientes(Array.isArray(list) ? list : []);
        }
      } catch {
        /* silencioso */
      }
    }

    void load();
    const id = setInterval(() => void load(), 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, role]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const badgeCount = useMemo(() => {
    if (role === "trabajador") {
      let n = 0;
      if (pendienteTrabajador) n += 1;
      if (rechazadaTrabajador) n += 1;
      return n;
    }
    if (role === "admin") return adminPendientes.length;
    return 0;
  }, [role, pendienteTrabajador, rechazadaTrabajador, adminPendientes.length]);

  const badgeLabel =
    badgeCount > 9 ? "9+" : badgeCount > 0 ? String(badgeCount) : null;

  return (
    <div className="dashboard-notifications" ref={containerRef}>
      <button
        type="button"
        className="dashboard-notifications-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          badgeCount > 0
            ? `Notificaciones, ${badgeCount} aviso${badgeCount === 1 ? "" : "s"}`
            : "Notificaciones"
        }
        title="Notificaciones"
      >
        <BellIcon />
        {badgeLabel !== null && (
          <span className="dashboard-notifications-badge" aria-hidden>
            {badgeLabel}
          </span>
        )}
      </button>
      {open && (
        <div
          className="dashboard-notifications-panel"
          role="dialog"
          aria-label="Avisos"
        >
          <div className="dashboard-notifications-panel-title">Avisos</div>

          {role === "trabajador" && (
            <>
              {pendienteTrabajador && (
                <div className="dashboard-notifications-alert dashboard-notifications-alert-warning" role="status">
                  <strong>Entrega de reporte pendiente</strong>
                  <p className="dashboard-notifications-alert-text">
                    Pediste entregar aproximadamente {formatMonto(pendienteTrabajador.montoAlSolicitar)}. El
                    administrador debe confirmar para que el efectivo pase a la caja de la ruta.
                  </p>
                  <Link
                    href="/dashboard/trabajador/resumen"
                    className="dashboard-notifications-link"
                    onClick={() => setOpen(false)}
                  >
                    Ver entrega de reporte
                  </Link>
                </div>
              )}
              {rechazadaTrabajador && (
                <div className="dashboard-notifications-alert dashboard-notifications-alert-danger" role="alert">
                  <strong>Solicitud rechazada</strong>
                  <p className="dashboard-notifications-alert-text">
                    {rechazadaTrabajador.motivoRechazo?.trim()
                      ? rechazadaTrabajador.motivoRechazo
                      : "Sin motivo indicado por el administrador."}
                  </p>
                  <Link
                    href="/dashboard/trabajador/resumen"
                    className="dashboard-notifications-link"
                    onClick={() => setOpen(false)}
                  >
                    Ir a entrega de reporte
                  </Link>
                </div>
              )}
              {!pendienteTrabajador && !rechazadaTrabajador && (
                <p className="dashboard-notifications-empty">No tenés avisos por ahora.</p>
              )}
            </>
          )}

          {role === "admin" && (
            <>
              {adminPendientes.length > 0 ? (
                <div className="dashboard-notifications-alert dashboard-notifications-alert-info" role="status">
                  <strong>
                    {adminPendientes.length === 1
                      ? "1 solicitud de entrega pendiente"
                      : `${adminPendientes.length} solicitudes de entrega pendientes`}
                  </strong>
                  <p className="dashboard-notifications-alert-text">
                    Hay trabajadores esperando que confirmes que recibiste el efectivo del reporte diario.
                  </p>
                  <div className="dashboard-notifications-admin-inner">
                    {adminPendientes.slice(0, 8).map((s, idx) => (
                      <div
                        key={s.id}
                        className={`dashboard-notifications-admin-item${idx > 0 ? " dashboard-notifications-admin-item-divider" : ""}`}
                      >
                        <span className="dashboard-notifications-admin-label">Trabajador</span>
                        <span className="dashboard-notifications-admin-name">{s.empleadoNombre}</span>
                        <span className="dashboard-notifications-admin-meta">
                          {s.rutaNombre || "—"} · {formatMonto(s.montoAlSolicitar)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {adminPendientes.length > 8 && (
                    <p className="dashboard-notifications-admin-extra">
                      … y {adminPendientes.length - 8} más (ver en reportes del día)
                    </p>
                  )}
                  <Link
                    href="/dashboard/admin/reportes-dia"
                    className="dashboard-notifications-link"
                    onClick={() => setOpen(false)}
                  >
                    Ir a reportes del día
                  </Link>
                </div>
              ) : (
                <p className="dashboard-notifications-empty">No hay solicitudes de entrega pendientes.</p>
              )}
            </>
          )}

          {(role === "jefe" || role === "superAdmin") && (
            <p className="dashboard-notifications-empty">No hay avisos en esta cuenta.</p>
          )}
        </div>
      )}
    </div>
  );
}
