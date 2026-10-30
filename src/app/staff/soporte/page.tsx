import Link from "next/link";
import { requireStaff } from "@/lib/support/staff";
import { PushToggle } from "@/components/PushToggle";
import { SoundToggle } from "@/components/staff/SupportAttention";
import { pushConfig } from "@/lib/marketing/push";
import { waitSince } from "@/lib/support/wait";
import { CATEGORIES, STATUS_LABEL, categoryLabel, type ThreadStatus } from "@/lib/support/schema";

export const metadata = { title: "Bandeja de soporte" };
const FILTERS = [["pendientes", "Pendientes"], ["answered", "Respondidas"], ["closed", "Cerradas"], ["todas", "Todas"]] as const;
const fmt = (s: string) => new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
const CHIP: Record<ThreadStatus, string> = { open: "bg-[var(--warn)]/20 text-[var(--warn-text)]", answered: "bg-[var(--accent)]/15 text-[var(--accent)]", closed: "bg-white/10 text-[var(--muted)]" };

export default async function StaffInbox({ searchParams }: { searchParams: Promise<{ estado?: string; tema?: string }> }) {
  const { estado = "pendientes", tema } = await searchParams;
  const cat = CATEGORIES.some((c) => c.id === tema) ? tema : undefined;
  const { supabase } = await requireStaff();
  let q = supabase.from("support_threads").select("id,category,subject,status,last_message_at,staff_unread,trainer:profiles!support_threads_trainer_id_fkey(full_name)").order("last_message_at", { ascending: false }).limit(100);
  if (estado === "pendientes") q = q.eq("status", "open"); else if (estado === "answered" || estado === "closed") q = q.eq("status", estado);
  if (cat) q = q.eq("category", cat);
  const { data } = await q;
  const rows = (data ?? []) as unknown as { id: string; category: string; subject: string; status: ThreadStatus; last_message_at: string; staff_unread: number; trainer: { full_name: string } | null }[];
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold">Soporte</h1><p className="-mt-3 text-sm text-[var(--muted)]">Consultas, dudas y reportes de los entrenadores.</p>
      <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="font-semibold">Avisos cuando un entrenador escribe</h2>
        <p className="text-sm text-[var(--muted)]">Te llega un correo siempre. Además, activa las notificaciones en cada dispositivo donde quieras enterarte al instante (el celular instalado como aplicación, o este computador).</p>
        <div className="flex flex-wrap items-start gap-3">{pushConfig() ? <PushToggle publicKey={pushConfig()!.publicKey} /> : <p className="text-sm text-[var(--muted)]">Las notificaciones aún no están configuradas en el servidor (faltan las claves VAPID).</p>}<SoundToggle /></div>
      </div>
      <nav aria-label="Filtro" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, l]) => <Link key={k} href={`/staff/soporte?estado=${k}${cat ? `&tema=${cat}` : ""}`} aria-current={estado === k ? "page" : undefined} className={`rounded-full px-3 py-1 ${estado === k ? "bg-[var(--accent)] font-semibold text-black" : "bg-[var(--surface-2)]"}`}>{l}</Link>)}
      </nav>
      <nav aria-label="Tema" className="flex flex-wrap gap-2 text-xs">
        <Link href={`/staff/soporte?estado=${estado}`} aria-current={!cat ? "page" : undefined} className={`rounded-full px-2.5 py-1 ${!cat ? "bg-white/15 font-semibold" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>Todos los temas</Link>
        {CATEGORIES.map((c) => <Link key={c.id} href={`/staff/soporte?estado=${estado}&tema=${c.id}`} aria-current={cat === c.id ? "page" : undefined} className={`rounded-full px-2.5 py-1 ${cat === c.id ? "bg-white/15 font-semibold" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>{c.label}</Link>)}
      </nav>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {rows.length === 0 ? <p className="p-5 text-sm text-[var(--muted)]">No hay conversaciones en esta vista.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--muted)]"><tr><th className="p-3 font-medium">Entrenador</th><th className="p-3 font-medium">Asunto</th><th className="p-3 font-medium">Tema</th><th className="p-3 font-medium">Último mensaje</th><th className="p-3 font-medium">Estado</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="p-3 font-medium">{t.trainer?.full_name ?? "—"}{t.staff_unread > 0 && <span className="ml-2 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{t.staff_unread} sin responder</span>}</td>
                  <td className="p-3"><Link className="underline hover:text-[var(--accent)]" href={`/staff/soporte/${t.id}`}>{t.subject}</Link></td>
                  <td className="p-3 text-[var(--muted)]">{categoryLabel(t.category)}</td>
                  <td className="p-3 text-[var(--muted)]">{fmt(t.last_message_at)}{t.status === "open" && (() => { const w = waitSince(t.last_message_at); return <span className={`mt-0.5 block text-xs ${w.tone === "late" ? "font-semibold text-[var(--warn-text)]" : w.tone === "warn" ? "text-[var(--warn-text)]" : ""}`}>Esperando {w.text}</span>; })()}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${CHIP[t.status]}`}>{STATUS_LABEL[t.status]}</span></td>
                </tr>))}
            </tbody>
          </table>)}
      </div>
    </section>
  );
}
