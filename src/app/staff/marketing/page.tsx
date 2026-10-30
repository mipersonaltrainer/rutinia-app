import Link from "next/link";
import { Cake, Megaphone } from "lucide-react";
import { requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfig } from "@/lib/marketing/push";
import { emailConfig } from "@/lib/marketing/email";
import { STATUS_LABEL, audienceLabel, kindLabel, type CampaignStatus } from "@/lib/marketing/schema";

export const metadata = { title: "Marketing · Soporte" };
const CHIP: Record<CampaignStatus, string> = { draft: "bg-white/10", scheduled: "bg-[var(--accent)]/15 text-[var(--accent)]", sending: "bg-[var(--warn)]/20 text-[var(--warn-text)]", sent: "bg-[var(--accent)]/15 text-[var(--accent)]", canceled: "bg-white/10 text-[var(--muted)]", failed: "bg-[var(--warn)]/20 text-[var(--warn-text)]" };
const when = (s: string | null) => (s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—");
const CH = { in_app: "Plataforma", push: "Push", email: "Correo" } as const;

export default async function Marketing() {
  await requireStaff();
  const { data } = await createAdminClient().from("marketing_campaigns").select("id,kind,title,audience,channels,status,scheduled_at,sent_at,created_at,stats").order("created_at", { ascending: false }).limit(60);   // service role, only after requireStaff() passed
  const rows = (data ?? []) as unknown as { id: string; kind: string; title: string; audience: string; channels: (keyof typeof CH)[]; status: CampaignStatus; scheduled_at: string | null; sent_at: string | null; created_at: string; stats: { recipients?: number } }[];
  const channels: [string, boolean, string][] = [["En la plataforma", true, "Siempre disponible"], ["Push", !!pushConfig(), "Faltan las claves VAPID en Vercel"], ["Correo", !!emailConfig(), "Falta configurar el correo (Resend)"]];
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">Marketing</h1><p className="text-sm text-[var(--muted)]">Campañas, comunicados y felicitaciones a los entrenadores.</p></div>
        <div className="flex flex-wrap gap-3"><Link href="/staff/marketing/cumpleanos" className="btn btn-secondary"><Cake size={16} aria-hidden /> Cumpleaños</Link><Link href="/staff/marketing/nueva" className="btn btn-primary"><Megaphone size={16} aria-hidden /> Nueva campaña</Link></div>
      </div>
      <ul className="stagger grid gap-3 sm:grid-cols-3">{channels.map(([l, on, why]) => <li key={l} className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"><p className="text-xs text-[var(--muted)]">Canal</p><p className="font-semibold">{l}</p><p className={on ? "text-[var(--accent)]" : "text-[var(--warn-text)]"}>{on ? "Listo para enviar" : why}</p></li>)}</ul>
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {rows.length === 0 ? <p className="p-5 text-sm text-[var(--muted)]">Aún no hay campañas. Crea la primera con «Nueva campaña».</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--muted)]"><tr><th className="p-3 font-medium">Mensaje</th><th className="p-3 font-medium">Tipo</th><th className="p-3 font-medium">Público</th><th className="p-3 font-medium">Canales</th><th className="p-3 font-medium">Fecha</th><th className="p-3 font-medium">Estado</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">{rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-medium"><Link className="underline hover:text-[var(--accent)]" href={`/staff/marketing/${r.id}`}>{r.title}</Link></td>
                <td className="p-3 text-[var(--muted)]">{kindLabel(r.kind)}</td><td className="p-3 text-[var(--muted)]">{audienceLabel(r.audience)}</td>
                <td className="p-3 text-[var(--muted)]">{r.channels.map((c) => CH[c]).join(" · ")}</td>
                <td className="p-3 text-[var(--muted)]">{when(r.sent_at ?? r.scheduled_at ?? r.created_at)}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${CHIP[r.status]}`}>{STATUS_LABEL[r.status]}{r.status === "sent" && r.stats?.recipients != null ? ` · ${r.stats.recipients}` : ""}</span></td>
              </tr>))}</tbody>
          </table>)}
      </div>
    </section>
  );
}
