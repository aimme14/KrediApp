"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRuta } from "@/hooks/useRuta";
import { useRutaDia } from "@/hooks/useRutaDia";

const filtros: { id: "todos" | "mora" | "hoy" | "pendientes" | "cobrados"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "mora", label: "En mora" },
  { id: "hoy", label: "Vencen hoy" },
  { id: "pendientes", label: "Pendientes" },
  { id: "cobrados", label: "Cobrados" },
];

function formatCurrency(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

export default function RutaDelDiaPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const { ruta } = useRuta();
  const { clientes, filtro, setFiltro, clientesFiltrados, loading } = useRutaDia();

  if (!profile || profile.role !== "trabajador") return null;

  const hoy = new Date();
  const fechaLabel = hoy.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const totalClientes = clientes.length;
  const totalCobrados = clientes.filter((c) => c.estado === "pagada").length;
  const totalCobrado = clientes
    .filter((c) => c.estado === "pagada")
    .reduce((sum, c) => sum + c.monto, 0);

  const gruposPorPrioridad = useMemo(() => {
    const grupos: Record<number, typeof clientesFiltrados> = {
      1: [],
      2: [],
      3: [],
      4: [],
    };
    for (const c of clientesFiltrados) {
      grupos[c.prioridad].push(c);
    }
    return grupos;
  }, [clientesFiltrados]);

  const secciones = [
    { prioridad: 1, titulo: "URGENTE · EN MORA" },
    { prioridad: 2, titulo: "VENCEN HOY" },
    { prioridad: 3, titulo: "MAÑANA" },
    { prioridad: 4, titulo: "ESTA SEMANA" },
  ];

  const handleClickCliente = (clienteId: string, prestamoId: string) => {
    router.push(`/dashboard/trabajador/cobrar?clienteId=${encodeURIComponent(clienteId)}&prestamoId=${encodeURIComponent(prestamoId)}`);
  };

  return (
    <div className="card ruta-dia-card">
      <header className="ruta-dia-header">
        <div>
          <h2 className="ruta-dia-title">Ruta del día</h2>
          <p className="ruta-dia-subtitle">
            {fechaLabel} · {ruta?.nombre ?? "Sin ruta"}
          </p>
        </div>
        <div className="ruta-dia-summary">
          <span>{totalClientes} clientes</span>
          <span>{formatCurrency(totalCobrado)} cobrado</span>
        </div>
      </header>

      <div className="ruta-dia-filtros">
        {filtros.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`ruta-dia-chip ${filtro === f.id ? "ruta-dia-chip-active" : ""}`}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Cargando clientes...</p>
      ) : clientesFiltrados.length === 0 ? (
        <p className="ruta-dia-empty">No hay clientes para mostrar en este filtro.</p>
      ) : (
        <div className="ruta-dia-list">
          {secciones.map(({ prioridad, titulo }) => {
            const list = gruposPorPrioridad[prioridad] ?? [];
            if (list.length === 0) return null;
            return (
              <section key={prioridad} className="ruta-dia-section">
                <h3 className={`ruta-dia-section-title ruta-dia-section-${prioridad}`}>{titulo}</h3>
                <ul className="ruta-dia-section-list">
                  {list.map((c) => {
                    const initials = c.clienteNombre
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase())
                      .join("");
                    const badgeLabel =
                      c.estado === "mora"
                        ? "Mora"
                        : c.estado === "pagada"
                        ? "Pagada"
                        : prioridad === 2
                        ? "Hoy"
                        : prioridad === 3
                        ? "Mañana"
                        : "Pronto";

                    const subtituloParts: string[] = [];
                    subtituloParts.push(`${c.frecuencia} · ${c.estado}`);
                    if (c.diasMora > 0) {
                      subtituloParts.push(`${c.diasMora} días de mora`);
                    }

                    return (
                      <li
                        key={c.cuotaId}
                        className="ruta-dia-item"
                        onClick={() => handleClickCliente(c.clienteId, c.prestamoId)}
                      >
                        <div className={`ruta-dia-avatar prioridad-${prioridad}`}>
                          <span>{initials || "?"}</span>
                        </div>
                        <div className="ruta-dia-item-main">
                          <div className="ruta-dia-item-row">
                            <span className="ruta-dia-item-nombre">{c.clienteNombre}</span>
                            <span className="ruta-dia-item-monto">{formatCurrency(c.monto)}</span>
                          </div>
                          <div className="ruta-dia-item-row ruta-dia-item-secondary">
                            <span className="ruta-dia-item-sub">
                              {subtituloParts.join(" · ")}
                            </span>
                            <span className={`ruta-dia-badge estado-${c.estado.toLowerCase()}`}>{badgeLabel}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <footer className="ruta-dia-footer">
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">Cobrados</span>
          <span className="ruta-dia-footer-value">{totalCobrados}</span>
        </div>
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">Pendientes</span>
          <span className="ruta-dia-footer-value">{totalClientes - totalCobrados}</span>
        </div>
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">Total cobrado</span>
          <span className="ruta-dia-footer-value">{formatCurrency(totalCobrado)}</span>
        </div>
      </footer>
    </div>
  );
}
