import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: "2rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>404</h1>
      <p style={{ color: "var(--text-muted, #666)", marginBottom: "1.5rem" }}>
        Página no encontrada
      </p>
      <Link
        href="/"
        style={{ color: "var(--link, #2563eb)", textDecoration: "underline" }}
      >
        Volver al inicio
      </Link>
    </div>
  );
}
