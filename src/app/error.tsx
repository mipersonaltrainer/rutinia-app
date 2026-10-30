"use client";
import { useEffect } from "react";
import Link from "next/link";

// Last line of defence for an unexpected error while rendering a page. It shows nothing technical to the visitor
// (only the opaque digest, which support can match to the server log) and lets them retry without losing the session.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[ui] render error", error.digest ?? ""); }, [error]);
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
      <h1 className="text-2xl font-semibold">Algo salió mal</h1>
      <p className="text-sm text-[var(--muted)]">No pudimos mostrar esta página. Tus datos no se perdieron. Inténtalo de nuevo; si el problema sigue, avísanos{error.digest ? ` indicando el código ${error.digest}` : ""}.</p>
      <div className="flex gap-3">
        <button onClick={reset} className="rounded-lg bg-[var(--accent)] px-5 py-2.5 font-semibold text-black">Reintentar</button>
        <Link href="/" className="rounded-lg border border-[var(--border)] px-5 py-2.5">Ir al inicio</Link>
      </div>
    </main>
  );
}
