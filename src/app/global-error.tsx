"use client";

/**
 * Captura errores en el layout raíz (donde error.tsx no alcanza).
 * Debe definir html y body.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: "2rem", fontFamily: "system-ui, sans-serif", background: "#f4f4f5", color: "#18181b" }}>
        <h2 style={{ marginBottom: "1rem" }}>Algo salió mal</h2>
        <p style={{ color: "#52525b", marginBottom: "1.5rem" }}>{error.message || "Error inesperado al cargar la aplicación."}</p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            cursor: "pointer",
            background: "#18181b",
            color: "#fafafa",
            border: "none",
            borderRadius: "6px",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
