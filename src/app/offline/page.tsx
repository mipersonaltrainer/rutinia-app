import { NOINDEX } from "@/lib/site";
export const metadata = { title: "Sin conexión", ...NOINDEX };
export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">Sin conexión</h1>
      <p className="text-sm text-[var(--muted)]">No hay internet. Por seguridad, Rutinia no guarda tus datos de salud en el dispositivo para verlos sin conexión. Vuelve a intentarlo cuando tengas señal.</p>
      <a href="/login" className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black">Reintentar</a>
    </main>
  );
}
