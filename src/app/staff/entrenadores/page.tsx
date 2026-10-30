import Link from "next/link";
import { requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTrainers } from "@/lib/staff/data";
import { BUCKET_LABEL, type Bucket } from "@/lib/staff/summary";

export const metadata = { title: "Entrenadores · Soporte" };
const FILTERS = [["todos", "Todos"], ["paid", "Pagando"], ["trial", "En prueba"], ["blocked", "Bloqueados"]] as const;
const CHIP: Record<Bucket, string> = { paid: "bg-[var(--accent)]/15 text-[var(--accent)]", trial: "bg-white/10", blocked: "bg-[var(--warn)]/20 text-[var(--warn-text)]", none: "bg-white/10 text-[var(--muted)]" };
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium" }) : "—");

export default async function Trainers({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const { q = "", estado = "todos" } = await searchParams;
  await requireStaff();
  let rows = await loadTrainers(createAdminClient(), new Date());
  const total = rows.length;
  const needle = q.trim().toLowerCase();
  if (needle) rows = rows.filter((r) => r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle));
  if (estado === "paid" || estado === "trial" || estado === "blocked") rows = rows.filter((r) => r.bucket === estado);
  return (
    <section className="space-y-5">
      <div><h1 className="text-3xl font-semibold">Entrenadores</h1><p className="text-sm text-[var(--muted)]">{total} cuenta{total === 1 ? "" : "s"} de entrenador. Solo se muestra información de la cuenta, nunca datos de salud de los alumnos.</p></div>
      <form className="flex flex-wrap items-center gap-3" role="search">
        <label className="sr-only" htmlFor="q">Buscar por nombre o correo</label>
        <input id="q" name="q" defaultValue={q} placeholder="Buscar por nombre o correo" className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
        {estado !== "todos" && <input type="hidden" name="estado" value={estado} />}
        <button className="btn btn-secondary">Buscar</button>
      </form>
      <nav aria-label="Estado" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, l]) => <Link key={k} href={`/staff/entrenadores?estado=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={estado === k ? "page" : undefined} className={`rounded-full px-3 py-1 ${estado === k ? "bg-[var(--accent)] font-semibold text-black" : "bg-[var(--surface-2)]"}`}>{l}</Link>)}
      </nav>
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {rows.length === 0 ? <p className="p-5 text-sm text-[var(--muted)]">Ningún entrenador coincide.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--muted)]"><tr><th className="p-3 font-medium">Entrenador</th><th className="p-3 font-medium">Correo</th><th className="p-3 font-medium">Estado</th><th className="p-3 font-medium">Vence</th><th className="p-3 font-medium">Alumnos</th><th className="p-3 font-medium">Registro</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.slice(0, 200).map((t) => (
                <tr key={t.id}>
                  <td className="p-3 font-medium"><Link className="underline hover:text-[var(--accent)]" href={`/staff/entrenadores/${t.id}`}>{t.name}</Link></td>
                  <td className="break-all p-3 text-[var(--muted)]">{t.email}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${CHIP[t.bucket]}`}>{BUCKET_LABEL[t.bucket]}</span></td>
                  <td className="p-3 text-[var(--muted)]">{day(t.until)}</td>
                  <td className="p-3">{t.clients}</td>
                  <td className="p-3 text-[var(--muted)]">{day(t.created_at)}</td>
                </tr>))}
            </tbody>
          </table>)}
      </div>
      {rows.length > 200 && <p className="text-xs text-[var(--muted)]">Se muestran los primeros 200 de {rows.length}. Afina la búsqueda.</p>}
    </section>
  );
}
