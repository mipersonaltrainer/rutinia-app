"use client";

// Replaces the root layout when it fails, so it carries its own <html>. Deliberately dependency-free (no fonts, no app CSS).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <main role="alert" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Algo salió mal</h1>
          <p style={{ color: "#c8c8c8", fontSize: 14, lineHeight: 1.5 }}>La aplicación no pudo cargarse. Tus datos no se perdieron.</p>
          <button onClick={reset} style={{ marginTop: 16, background: "#8cff2e", color: "#000", border: 0, borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}>Reintentar</button>
        </main>
      </body>
    </html>
  );
}
