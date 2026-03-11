"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { getResumenEconomico, type ResumenRutaItem } from "@/lib/empresa-api";

export default function ResumenPage() {
  const { user, profile } = useAuth();
  const [rutas, setRutas] = useState<ResumenRutaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      getResumenEconomico(token)
        .then(setRutas)
        .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar resumen"))
        .finally(() => setLoading(false));
    });
  }, [user]);

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Resumen Económico</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Tabla por ruta: ingreso, egreso, gastos, salidas, inversión y bolsa.
      </p>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando resumen...</p>
      ) : rutas.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No hay rutas. Crea rutas en la sección Rutas para ver el resumen.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ruta</th>
                <th>Ubicación</th>
                <th className="col-num">Ingreso</th>
                <th className="col-num">Egreso</th>
                <th className="col-num">Gastos</th>
                <th className="col-num">Salidas</th>
                <th className="col-num">Inversión</th>
                <th className="col-num">Bolsa</th>
              </tr>
            </thead>
            <tbody>
              {rutas.map((r) => (
                <tr key={r.rutaId}>
                  <td>{r.nombre}</td>
                  <td>{r.ubicacion || "—"}</td>
                  <td className="col-num">{r.ingreso.toFixed(2)}</td>
                  <td className="col-num">{r.egreso.toFixed(2)}</td>
                  <td className="col-num">{r.gastos.toFixed(2)}</td>
                  <td className="col-num">{r.salidas.toFixed(2)}</td>
                  <td className="col-num">{r.inversion.toFixed(2)}</td>
                  <td className="col-num">{r.bolsa.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
