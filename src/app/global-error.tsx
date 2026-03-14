"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <div style={{ maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
          <h1 style={{ marginBottom: "1rem" }}>Error de la aplicación</h1>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            {error.message || "Algo salió mal. Prueba a recargar la página."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              cursor: "pointer",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
