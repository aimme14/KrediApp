"use client";

export type RutaDiaConteos = {
  cobrados: number;
  noPagoHoy: number;
  pendientes: number;
};

type Props = {
  conteos: RutaDiaConteos;
};

export function RutaDiaConteosResumen({ conteos }: Props) {
  return (
    <section className="ruta-dia-footer ruta-dia-resumen-top" aria-label="Resumen del día">
      <div className="ruta-dia-footer-item">
        <span className="ruta-dia-footer-label">Cobrados</span>
        <span className="ruta-dia-footer-value ruta-dia-footer-value-green">
          {conteos.cobrados}
        </span>
      </div>
      <div className="ruta-dia-footer-item">
        <span className="ruta-dia-footer-label">No pagaron hoy</span>
        <span className="ruta-dia-footer-value">{conteos.noPagoHoy}</span>
      </div>
      <div className="ruta-dia-footer-item">
        <span className="ruta-dia-footer-label">Pendientes</span>
        <span className="ruta-dia-footer-value">{conteos.pendientes}</span>
      </div>
    </section>
  );
}
