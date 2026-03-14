"use client";

import { useEffect } from "react";

export default function Error({
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
    <div style={{ padding: "2rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: "1rem" }}>Algo salió mal</h2>
      <p style={{ color: "var(--text-muted, #666)", marginBottom: "1.5rem" }}>
        {error.message || "Error inesperado"}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: "0.5rem 1rem",
          cursor: "pointer",
          background: "var(--text, #111)",
          color: "var(--bg, #fff)",
          border: "none",
          borderRadius: "6px",
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
