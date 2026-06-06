"use client";

import { useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import {
  useGastoFcmCampanita,
  type OperativoFcmSessionItem,
} from "@/context/GastoFcmCampanitaContext";
import { db } from "@/lib/firebase";
import { type SolicitudEntregaPendienteAdmin } from "@/lib/empresa-api";
import { esDiaActualColombia } from "@/lib/colombia-day-bounds";
import { EMPRESAS_COLLECTION, SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION } from "@/lib/empresas-db";

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

const NOTIFICATIONS_PANEL_IDEAL_MAX_PX = 288;
const NOTIFICATIONS_PANEL_FALLBACK_PX = 200;
const NOTIFICATIONS_PANEL_VIEWPORT_MARGIN_PX = 10;

function formatNotifTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

function NotifAdminPendientes({
  pendientes,
  dismissed,
  onDismiss,
  onClose,
}: {
  pendientes: SolicitudEntregaPendienteAdmin[];
  dismissed: boolean;
  onDismiss: () => void;
  onClose: () => void;
}) {
  if (pendientes.length === 0 || dismissed) {
    return (
      <p className="dashboard-notifications-empty">No hay solicitudes de entrega pendientes.</p>
    );
  }
  return (
    <div
      className="dashboard-notifications-alert dashboard-notifications-alert-info"
      role="status"
    >
      <button
        type="button"
        className="dashboard-notifications-close"
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        title="Cerrar"
      >
        ×
      </button>
      <strong>
        {pendientes.length === 1
          ? "1 solicitud de entrega pendiente"
          : `${pendientes.length} solicitudes de entrega pendientes`}
      </strong>
      <p className="dashboard-notifications-alert-text">
        Hay trabajadores esperando que confirmes que recibiste el efectivo del reporte diario.
      </p>
      <div className="dashboard-notifications-admin-inner">
        {pendientes.slice(0, 8).map((s, idx) => (
          <div
            key={s.id}
            className={`dashboard-notifications-admin-item${idx > 0 ? " dashboard-notifications-admin-item-divider" : ""}`}
          >
            <span className="dashboard-notifications-admin-label">Trabajador</span>
            <span className="dashboard-notifications-admin-name">{s.empleadoNombre}</span>
            <span className="dashboard-notifications-admin-meta">{s.rutaNombre || "—"}</span>
          </div>
        ))}
      </div>
      {pendientes.length > 8 && (
        <p className="dashboard-notifications-admin-extra">
          … y {pendientes.length - 8} más (ver en reportes del día)
        </p>
      )}
      <Link
        href="/dashboard/admin/reportes-dia"
        className="dashboard-notifications-link"
        onClick={onClose}
      >
        Ir a reportes del día
      </Link>
    </div>
  );
}

function NotifAdminOperativo({ lines }: { lines: OperativoFcmSessionItem[] }) {
  const vigentes = lines.filter((row) => esDiaActualColombia(row.at ?? Date.now()));
  if (vigentes.length === 0) return null;
  return (
    <>
      <div className="dashboard-notifications-operativo-header">
        <span>Notificaciones de hoy</span>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Se borran automáticamente a las 11 PM (hora Colombia)
        </span>
      </div>
      {vigentes.slice(0, 8).map((row) => (
        <div
          key={row.id}
          className="dashboard-notifications-alert dashboard-notifications-alert-warning dashboard-notifications-alert-gasto-fcm"
          role="status"
          style={{ marginTop: "0.5rem" }}
        >
          <p className="dashboard-notifications-admin-label">{row.title}</p>
          <p className="dashboard-notifications-admin-name">{row.body}</p>
          <span className="dashboard-notifications-admin-meta notif-time">
            {formatNotifTime(row.at)}
          </span>
        </div>
      ))}
    </>
  );
}

export default function DashboardNotifications() {
  const { user, profile } = useAuth();
  const { sessionOperativoLines, markAllAsRead } = useGastoFcmCampanita();
  const [open, setOpen] = useState(false);
  const [panelMaxWidthPx, setPanelMaxWidthPx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const role = profile?.role;

  const measurePanelMaxWidth = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const trigger = root.querySelector<HTMLButtonElement>(".dashboard-notifications-trigger");
    const r = (trigger ?? root).getBoundingClientRect();
    const m = NOTIFICATIONS_PANEL_VIEWPORT_MARGIN_PX;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const byViewport = Math.max(0, vw - m * 2);
    const byTriggerRight = Math.max(0, r.right - m);
    const w = Math.floor(
      Math.min(NOTIFICATIONS_PANEL_IDEAL_MAX_PX, byViewport, byTriggerRight)
    );
    setPanelMaxWidthPx(w > 0 ? w : NOTIFICATIONS_PANEL_FALLBACK_PX);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelMaxWidthPx(null);
      return;
    }
    measurePanelMaxWidth();
    const onResize = () => measurePanelMaxWidth();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [open, measurePanelMaxWidth]);

  const [adminPendientes, setAdminPendientes] = useState<SolicitudEntregaPendienteAdmin[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);

  const storageKey = useMemo(() => {
    if (!user?.uid || !role) return null;
    return `kredi:dismissed-notifications:${role}:${user.uid}`;
  }, [role, user?.uid]);
  const dismissedSet = useMemo(() => new Set(dismissedKeys), [dismissedKeys]);

  const dismissNotification = (key: string) => {
    setDismissedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const adminPendingKey = "admin-pending-batch";

  useEffect(() => {
    if (!storageKey) {
      setDismissedKeys([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setDismissedKeys([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setDismissedKeys(parsed.filter((x): x is string => typeof x === "string"));
      } else {
        setDismissedKeys([]);
      }
    } catch {
      setDismissedKeys([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(dismissedKeys));
    } catch {
      /* silencioso */
    }
  }, [storageKey, dismissedKeys]);

  useEffect(() => {
    if (!db || !user || role !== "admin" || !profile?.empresaId) return;

    const empresaId = profile.empresaId.trim();
    if (!empresaId) return;

    const q = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION),
      where("adminId", "==", user.uid),
      where("estado", "==", "pendiente")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SolicitudEntregaPendienteAdmin[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            empleadoUid: data.empleadoUid ?? "",
            empleadoNombre: data.empleadoNombre ?? "",
            rutaId: data.rutaId ?? "",
            rutaNombre: data.rutaNombre ?? "",
            estado: data.estado ?? "",
            comentarioTrabajador: data.comentarioTrabajador ?? null,
            montoAlSolicitar: typeof data.montoAlSolicitar === "number" ? data.montoAlSolicitar : 0,
            creadaEn: data.creadaEn?.toDate?.()?.toISOString?.() ?? null,
          };
        });
        setAdminPendientes(list);
      },
      (err) => {
        console.warn("[DashboardNotifications] onSnapshot solicitudes:", err);
      }
    );

    return unsub;
  }, [user?.uid, role, profile?.empresaId]);

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

  const campanitaWasOpen = useRef(false);
  useEffect(() => {
    if (role !== "admin") return;
    if (open && !campanitaWasOpen.current) {
      markAllAsRead();
    }
    campanitaWasOpen.current = open;
  }, [open, role, markAllAsRead]);

  const badgeCount = useMemo(() => {
    if (role === "admin") {
      const operativoUnread = sessionOperativoLines.filter(
        (l) => !l.read && esDiaActualColombia(l.at ?? Date.now())
      ).length;
      const pendingCount = dismissedSet.has(adminPendingKey) ? 0 : adminPendientes.length;
      return pendingCount + operativoUnread;
    }
    return 0;
  }, [
    role,
    dismissedSet,
    adminPendingKey,
    adminPendientes.length,
    sessionOperativoLines,
  ]);

  const badgeLabel =
    badgeCount > 9 ? "9+" : badgeCount > 0 ? String(badgeCount) : null;

  /** Trabajador: sin campanita por ahora. */
  if (role === "trabajador") {
    return null;
  }

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
          style={
            panelMaxWidthPx != null
              ? { maxWidth: `${panelMaxWidthPx}px` }
              : undefined
          }
        >
          <div className="dashboard-notifications-panel-title">Avisos</div>

          {role === "admin" && (
            <>
              <NotifAdminPendientes
                pendientes={adminPendientes}
                dismissed={dismissedSet.has(adminPendingKey)}
                onDismiss={() => dismissNotification(adminPendingKey)}
                onClose={() => setOpen(false)}
              />
              <NotifAdminOperativo lines={sessionOperativoLines} />
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
