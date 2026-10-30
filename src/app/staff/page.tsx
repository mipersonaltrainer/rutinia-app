import Link from "next/link";
import { requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOverview } from "@/lib/staff/data";
import { Stat } from "@/components/staff/Stat";
import { formatMoney } from "@/lib/billing/pricing";
import { categoryLabel } from "@/lib/support/schema";
import { daysSince } from "@/lib/staff/summary";

export const metadata = { title: "Resumen · Soporte" };
const card = "lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5";

export default async function StaffHome() {
  const { name } = await requireStaff();
  const now = new Date();
  const o = await loadOverview(createAdminClient(), now);          // service role, only after requireStaff() passed
  const b = o.people.buckets; const pay = o.payments;
  const auditTotal = Object.values(o.system.audit7d).reduce((a, n) => a + n, 0);
  return (
    <section className="space-y-6">
      <div><h1 className="text-3xl font-semibold">Hola, {name}</h1><p className="text-sm text-[var(--muted)]">Así está Rutinia ahora mismo.</p></div>

      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Entrenadores" value={o.people.trainers} hint={`${o.people.newTrainers7d} nuevos en 7 días`} />
        <Stat label="Alumnos activos" value={o.people.activeClients} hint={`${o.people.sessions7d} entrenos completados en 7 días`} />
        <Stat label="Consultas sin responder" value={o.support.unanswered} tone="warn" hint={`${o.support.open} conversaciones abiertas`} />
        <Stat label="Pagos pendientes de más de 1 h" value={pay.stalePending} tone="warn" hint="Posible pago sin liquidar" />
      </div>

      <div className="stagger grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Consultas esperando respuesta</h2><Link href="/staff/soporte" className="text-xs text-[var(--accent)]">Ver bandeja</Link></div>
          {o.support.waiting.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No hay consultas sin responder. Todo al día.</p> : (
            <ul className="stagger mt-3 divide-y divide-[var(--border)] text-sm">
              {o.support.waiting.map((t) => (
                <li key={t.id}><Link href={`/staff/soporte/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-[var(--accent)]">
                  <span className="min-w-0"><span className="block truncate font-medium">{t.subject}</span><span className="text-xs text-[var(--muted)]">{t.trainer?.full_name ?? "—"} · {categoryLabel(t.category)}</span></span>
                  <span className="shrink-0 text-xs text-[var(--warn-text)]">hace {daysSince(t.last_message_at, now) === 0 ? "menos de 1 día" : `${daysSince(t.last_message_at, now)} d`}</span></Link></li>))}
            </ul>)}
        </div>

        <div className={card}>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Entrenadores por estado</h2><Link href="/staff/entrenadores" className="text-xs text-[var(--accent)]">Ver todos</Link></div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {([["Pagando", b.paid, "ok"], ["En prueba", b.trial, undefined], ["Bloqueados", b.blocked, "warn"], ["Sin suscripción", b.none, undefined]] as const).map(([l, n, tone]) => (
              <div key={l} className="rounded-xl bg-[var(--surface-2)] p-3"><dt className="text-xs text-[var(--muted)]">{l}</dt><dd className={`text-2xl font-semibold ${tone === "ok" ? "text-[var(--accent)]" : tone === "warn" && n > 0 ? "text-[var(--warn-text)]" : ""}`}>{n}</dd></div>))}
          </dl>
          <p className="mt-3 text-xs text-[var(--muted)]">«Bloqueados»: la prueba o el periodo pagado ya terminó. Pueden escribir a soporte, pero no usar su panel.</p>
        </div>

        <div className={card}>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Pagos de los últimos 30 días</h2><Link href="/staff/ventas" className="text-xs text-[var(--accent)]">Ver ventas por día</Link></div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Aprobados</dt><dd>{pay.approved.count}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Recaudado en pesos</dt><dd className="font-medium">{formatMoney(pay.approved.COP, "COP")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Recaudado en dólares</dt><dd className="font-medium">{formatMoney(pay.approved.USD, "USD")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Pendientes · rechazados · anulados</dt><dd>{pay.pending} · {pay.declined} · {pay.voided}</dd></div>
          </dl>
        </div>

        <div className={card}>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Salud del sistema</h2><Link href="/staff/sistema" className="text-xs text-[var(--accent)]">Detalle</Link></div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Avisos de pago (24 h)</dt><dd>{o.system.webhooks24h}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Avisos de pago sin procesar</dt><dd className={o.system.webhooksStuck > 0 ? "font-semibold text-[var(--warn-text)]" : ""}>{o.system.webhooksStuck}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Alertas de facturación (7 días)</dt><dd className={auditTotal > 0 ? "" : "text-[var(--muted)]"}>{auditTotal}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Borradores de IA (24 h)</dt><dd>{o.system.ai24h.calls}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}
