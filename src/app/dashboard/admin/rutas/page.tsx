"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { AdminRutaStatsGrid } from "@/components/AdminRutaStatsGrid";
import { createRuta } from "@/lib/empresa-api";

export default function RutasPage() {
  const { user, profile } = useAuth();
  const { rutas, loading, error: ctxError } = useAdminDashboard();
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [creating, setCreating] = useState(false);

  const rutasOrdenadas = useMemo(
    () =>
      [...rutas].sort((a, b) =>
        (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" })
      ),
    [rutas]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setCreating(true);
    try {
      const token = await user.getIdToken();
      await createRuta(token, {
        nombre: nombre.trim(),
        ubicacion: ubicacion.trim() || undefined,
      });
      setNombre("");
      setUbicacion("");
      setShowForm(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error al crear ruta");
    } finally {
      setCreating(false);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  const error = formError ?? ctxError;

  return (
    <div className="card rutas-admin-page">
      <h2 className="rutas-admin-page-title">Rutas</h2>
      <p className="rutas-admin-intro"></p>
      <p className="rutas-admin-gloss"></p>

      <div className="rutas-admin-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "Nueva ruta"}
        </button>
      </div>

      {showForm && (
        <div className="card rutas-admin-form-card">
          <h3>Nueva ruta</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                placeholder="Nombre de la ruta"
              />
            </div>
            <div className="form-group">
              <label>Ubicación</label>
              <input
                type="text"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Zona o ciudad"
              />
            </div>
            {formError && <p className="error-msg">{formError}</p>}
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creando..." : "Crear ruta"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p className="rutas-admin-loading">Cargando rutas…</p>
      ) : rutasOrdenadas.length === 0 ? (
        <p className="rutas-admin-muted">No hay rutas. Creá una con el botón «Nueva ruta».</p>
      ) : (
        <div className="rutas-admin-list">
          {rutasOrdenadas.map((ruta) => (
            <div key={ruta.id} className="card rutas-admin-ruta-card">
              <div className="rutas-admin-ruta-head">
                <span className="rutas-admin-ruta-head-main">
                  {ruta.codigo && (
                    <code className="user-code ruta-code" title="RT = Ruta, primer número = Admin, segundo = N° Ruta">
                      {ruta.codigo}
                    </code>
                  )}
                  <span className="rutas-admin-ruta-nombre">{ruta.nombre}</span>
                </span>
                {ruta.ubicacion ? (
                  <span className="rutas-admin-ruta-ubic">{ruta.ubicacion}</span>
                ) : null}
              </div>

              <AdminRutaStatsGrid ruta={ruta} className="rutas-admin-ruta-stats" showGananciasNetas />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
