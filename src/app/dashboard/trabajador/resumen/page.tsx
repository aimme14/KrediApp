"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listPrestamos, listGastos, type PrestamoItem, type GastoItem } from "@/lib/empresa-api";

export default function ResumenDelDiaPage() {
  const { user, profile } = useAuth();
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([]);
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = user.getIdToken().then((t) => t);
    Promise.all([token.then((t) => listPrestamos(t)), token.then((t) => listGastos(t))])
      .then(([p, g]) => {
        setPrestamos(p);
        setGastos(g);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const hoy = new Date().toDateString();
  const recogidoHoy = prestamos.reduce((sum, p) => sum + (p.totalAPagar - p.saldoPendiente), 0);
  const faltaRecoger = prestamos.reduce((sum, p) => sum + p.saldoPendiente, 0);
  const gastosHoy = gastos
    .filter((g) => g.fecha && new Date(g.fecha).toDateString() === hoy)
    .reduce((sum, g) => sum + g.monto, 0);
  const gastosTotal = gastos.reduce((sum, g) => sum + g.monto, 0);

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Resumen del día</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Lo recogido, lo que falta por recoger y los gastos generados.
      </p>

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Lo recogido (cobrado a clientes)</td>
                <td>{recogidoHoy.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Lo que falta por recoger (saldo pendiente)</td>
                <td>{faltaRecoger.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Gastos generados (hoy)</td>
                <td>{gastosHoy.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Gastos totales (historial)</td>
                <td>{gastosTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
