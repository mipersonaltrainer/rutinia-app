import Link from "next/link";
import { NOINDEX } from "@/lib/site";

export const metadata = { title: "Página no encontrada", ...NOINDEX };

// Served with a real 404 status by Next. Spanish, no stack traces, a way back.
export default function NotFound() {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-semibold text-[var(--accent)]">Error 404</p>
      <h1 className="text-3xl font-semibold">No encontramos esa página</h1>
      <p className="text-sm text-[var(--muted)]">El enlace puede estar mal escrito o la página ya no existe.</p>
      <Link href="/" className="rounded-lg bg-[var(--accent)] px-5 py-2.5 font-semibold text-black">Ir al inicio</Link>
    </main>
  );
}
