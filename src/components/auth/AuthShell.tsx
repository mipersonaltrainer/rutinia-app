import Link from "next/link";

export const authField = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-white outline-none focus:border-[var(--accent)]";
export const authCard = "hero-in w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[var(--surface)]/95 p-6 shadow-2xl shadow-black/50 sm:p-8 md:bg-[var(--surface)]/80 md:backdrop-blur-xl";
export const authButton = "w-full rounded-lg bg-[var(--accent)] py-2.5 font-semibold text-black disabled:opacity-60";

export function BackToLogin() { return <p className="text-center text-sm text-[var(--muted)]"><Link className="text-[var(--accent)] underline" href="/login">Volver a iniciar sesión</Link></p>; }
