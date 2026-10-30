import Link from "next/link";
import { requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingConfig } from "@/lib/billing/config";
import { loadOverview } from "@/lib/staff/data";
import { formatMoney } from "@/lib/billing/pricing";
import { Stat } from "@/components/staff/Stat";

export const metadata = { title: "Sistema · Soporte" };
const card = "lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5";
const when = (s: string | null) => (s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function System() {
  await requireStaff();
  const admin = createAdminClient(); const now = new Date();       // service role, only after requireStaff() passed
  const [o, hooks, audit, stale] = await Promise.all([
    loadOverview(admin, now),
    admin.from("provider_webhook_events").select("provider,received_at,processed_at").order("received_at", { ascending: false }).limit(12),
    admin.from("billing_audit_events").select("created_at,kind,trainer:profiles!billing_audit_events_trainer_id_fkey(full_name)").order("created_at", { ascending: false }).limit(12),
    admin.from("slot_purchases").select("created_at,provider,charged_amount_cents,charged_currency,trainer:profiles!slot_purchases_trainer_id_fkey(full_name)").eq("status", "pending").lt("created_at", new Date(now.getTime() - 3600_000).toISOString()).order("created_at", { ascending: false }).limit(10),
  ]);
  const cfg = getBillingConfig();
  const flags: [string, boolean][] = [["Bold (pesos)", cfg.bold.enabled], ["PayPal (dólares)", cfg.paypal.enabled], ["Wompi (histórico)", cfg.wompi.enabled], ["Aviso a Slack/Discord", !!(process.env.SUPPORT_ALERT_WEBHOOK_URL || process.env.ADMIN_ALERT_WEBHOOK_URL)], ["Proveedor de IA", !!process.env.AI_PROVIDER]];
  const p = o.payments; const ai = o.system.ai24h;
  return (
    <section className="space-y-6">
      <div><h1 className="text-3xl font-semibold">Sistema</h1><p className="text-sm text-[var(--muted)]">Pagos, avisos de los proveedores, alertas de facturación y uso de IA. Solo lectura.</p></div>
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pagos aprobados (30 días)" value={p.approved.count} hint={`${formatMoney(p.approved.COP, "COP")} · ${formatMoney(p.approved.USD, "USD")}`} tone="ok" />
        <Stat label="Pendientes de más de 1 h" value={p.stalePending} tone="warn" hint="Checkout abandonado o sin liquidar" />
        <Stat label="Avisos de pago sin procesar" value={o.system.webhooksStuck} tone="warn" hint={`${o.system.webhooks24h} recibidos en 24 h`} />
        <Stat label="Borradores de IA (24 h)" value={ai.calls} hint={`${ai.tokens.toLocaleString("es-CO")} tokens`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-2 font-semibold">Configuración activa</h2>
          <ul className="stagger space-y-1.5 text-sm">{flags.map(([l, on]) => <li key={l} className="flex justify-between gap-3"><span>{l}</span><span className={on ? "text-[var(--accent)]" : "text-[var(--muted)]"}>{on ? "Configurado" : "No configurado"}</span></li>)}</ul>
        </div>
        <div className={card}>
          <h2 className="mb-2 font-semibold">Alertas de facturación recientes</h2>
          {(audit.data ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Sin alertas. Si un monto no coincide con lo cobrado, aparece aquí.</p> : (
            <ul className="stagger divide-y divide-[var(--border)] text-sm">{(audit.data ?? []).map((a, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span>{a.kind}<span className="block text-xs text-[var(--muted)]">{(a.trainer as unknown as { full_name: string } | null)?.full_name ?? "—"}</span></span><span className="text-xs text-[var(--muted)]">{when(a.created_at)}</span></li>)}</ul>)}
        </div>
        <div className={card}>
          <h2 className="mb-2 font-semibold">Avisos recientes de los proveedores de pago</h2>
          {(hooks.data ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Aún no han llegado avisos.</p> : (
            <ul className="stagger divide-y divide-[var(--border)] text-sm">{(hooks.data ?? []).map((h, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span>{h.provider}<span className="block text-xs text-[var(--muted)]">{when(h.received_at)}</span></span><span className={h.processed_at ? "text-[var(--accent)]" : "text-[var(--warn-text)]"}>{h.processed_at ? "Procesado" : "Sin procesar"}</span></li>)}</ul>)}
        </div>
        <div className={card}>
          <h2 className="mb-2 font-semibold">Compras de cupos pendientes de más de 1 h</h2>
          {(stale.data ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Ninguna.</p> : (
            <ul className="stagger divide-y divide-[var(--border)] text-sm">{(stale.data ?? []).map((s, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span>{(s.trainer as unknown as { full_name: string } | null)?.full_name ?? "—"} · {s.provider}<span className="block text-xs text-[var(--muted)]">{when(s.created_at)}</span></span><span>{formatMoney(s.charged_amount_cents, s.charged_currency === "COP" ? "COP" : "USD")}</span></li>)}</ul>)}
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">¿Algo se ve raro? Revisa también <Link href="/staff/soporte" className="text-[var(--accent)] underline">las consultas de los entrenadores</Link>.</p>
    </section>
  );
}
