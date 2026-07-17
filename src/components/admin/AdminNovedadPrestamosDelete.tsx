"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import {
  ADMIN_NOVEDAD_PRESTAMOS_DELETE,
  dismissAdminNovedad,
  isAdminNovedadDismissed,
} from "@/lib/admin-novedades";

const ModalConfirmar = dynamic(
  () => import("@/components/trabajador/ModalConfirmar").then((m) => ({ default: m.ModalConfirmar })),
  { ssr: false }
);

/** Aviso único para admins: eliminación de préstamos creados por error. */
export function AdminNovedadPrestamosDelete() {
  const { user, profile, loading } = useAuth();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (loading || !user?.uid || !profile || !isAdminPanelRole(profile.role)) {
      setAbierto(false);
      return;
    }
    setAbierto(!isAdminNovedadDismissed(user.uid, ADMIN_NOVEDAD_PRESTAMOS_DELETE));
  }, [loading, user?.uid, profile]);

  const cerrar = useCallback(() => {
    if (!user?.uid) return;
    dismissAdminNovedad(user.uid, ADMIN_NOVEDAD_PRESTAMOS_DELETE);
    setAbierto(false);
  }, [user?.uid]);

  if (!abierto) return null;

  return (
    <ModalConfirmar
      titulo="Nueva actualización del sistema"
      labelConfirmar="Entendido"
      ocultarCancelar
      cerrarConBackdrop={false}
      onConfirmar={cerrar}
      onCancelar={cerrar}
    >
      <div className="admin-novedad-content">
        <p className="admin-novedad-lead">
          Seguimos trabajando para mejorar tu experiencia en KrediApp.
        </p>
        <p>
          <strong>Ahora puedes eliminar préstamos creados por error</strong> desde la sección{" "}
          <Link
            href="/dashboard/admin/prestamo"
            className="admin-novedad-link"
            onClick={cerrar}
          >
            Préstamos
          </Link>
          .
        </p>
        <div className="admin-novedad-callout" role="note">
          <p>
            <strong>Importante:</strong> solo se pueden eliminar préstamos que{" "}
            <strong>no tengan ninguna cuota cobrada</strong>. Si ya hubo cobros, la opción no
            estará disponible.
          </p>
        </div>
        <p>
          Al eliminar un préstamo, el monto se devuelve a la <strong>base de la ruta</strong> y el
          cliente queda habilitado para un nuevo préstamo. Esta acción <strong>no se puede deshacer</strong>.
        </p>
      </div>
    </ModalConfirmar>
  );
}
