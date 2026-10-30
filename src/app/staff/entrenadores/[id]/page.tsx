import Link from "next/link";
import { notFound } from "next/navigation";
import { logStaffAccess, requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/billing/pricing";
import { BUCKET_LABEL, subscriptionBucket } from "@/lib/staff/summary";
import { STATUS_LABEL, categoryLabel, type ThreadStatus } from "@/lib/support/schema";

export const metadata = { title: "Entrenador · Soporte" };
const card = "lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5";
const when = (s: string | null) => (s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—");
const money = (cents: number, cur: string) => formatMoney(cents, cur === "COP" ? "COP" : "USD");

export default async function TrainerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const admin = createAdminClient();                                // service role, only after requireStaff() passed
  const { data: p } = await admin.from("profiles").select("id,full_name,role,created_at").eq("id", id).maybeSingle();
  if (!p || p.role !== "trainer") notFound();
  await logStaffAccess(supabase, "view_trainer", id);
  const [{ data: user }, { data: sub }, { count: clients }, { count: plans }, { data: slots }, { data: subs }, { data: ai }, { data: threads }, { data: audit }] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("trainer_subscriptions").select("status,trial_ends_at,current_period_end,provider").eq("trainer_id", id).maybeSingle(),
    admin.from("trainer_client_relationships").select("*", { count: "exact", head: true }).eq("trainer_id", id).eq("status", "active"),
    admin.from("training_plans").select("*", { count: "exact", head: true }).eq("trainer_id", id).is("archived_at", null),
    admin.from("slot_purchases").select("created_at,provider,status,quantity,charged_amount_cents,charged_currency").eq("trainer_id", id).order("created_at", { ascending: false }).limit(8),
    admin.from("subscription_payments").select("created_at,provider,status,charged_amount_cents,charged_currency").eq("trainer_id", id).order("created_at", { ascending: false }).limit(8),
    admin.from("ai_credit_purchases").select("created_at,provider,status,credits,charged_amount_cents,charged_currency").eq("trainer_id", id).order("created_at", { ascending: false }).limit(8),
    admin.from("support_threads").select("id,subject,category,status,last_message_at").eq("trainer_id", id).order("last_message_at", { ascending: false }).limit(10),
    admin.from("billing_audit_events").select("created_at,kind").eq("trainer_id", id).order("created_at", { ascending: false }).limit(8),
  ]);
  const bucket = subscriptionBucket(sub, new Date());
  const pays = [
    ...(subs ?? []).map((r) => ({ ...r, what: "Suscripción" })),
    ...(slots ?? []).map((r) => ({ ...r, what: `${(r as { quantity: number }).quantity} cupo(s)` })),
    ...(ai ?? []).map((r) => ({ ...r, what: `${(r as { credits: number }).credits} créditos de IA` })),
  ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 12);
  return (
    <section className="space-y-5">
      <p className="text-sm"><Link href="/staff/entrenadores" className="text-[var(--accent)] underline">← Entrenadores</Link></p>
      <div><h1 className="text-3xl font-semibold">{p.full_name}</h1><p className="break-all text-sm text-[var(--muted)]">{user?.user?.email ?? "—"} · registrado el {when(p.created_at)}</p></div>
      <div className="stagger grid gap-4 md:grid-cols-3">
        <div className={card}><p className="text-xs text-[var(--muted)]">Suscripción</p><p className="mt-1 text-xl font-semibold">{BUCKET_LABEL[bucket]}</p><p className="text-xs text-[var(--muted)]">{sub?.status ?? "sin registro"}{sub?.provider ? ` · ${sub.provider}` : ""} · vence {when(sub?.current_period_end ?? sub?.trial_ends_at ?? null)}</p></div>
        <div className={card}><p className="text-xs text-[var(--muted)]">Alumnos activos</p><p className="mt-1 text-xl font-semibold">{clients ?? 0}</p></div>
        <div className={card}><p className="text-xs text-[var(--muted)]">Planes activos</p><p className="mt-1 text-xl font-semibold">{plans ?? 0}</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-2 font-semibold">Pagos y compras</h2>
          {pays.length === 0 ? <p className="text-sm text-[var(--muted)]">Sin pagos registrados.</p> : (
            <ul className="stagger divide-y divide-[var(--border)] text-sm">{pays.map((r, i) => <li key={i} className="flex justify-between gap-3 py-2"><span>{r.what} · {r.provider}<span className="block text-xs text-[var(--muted)]">{when(r.created_at)}</span></span><span className="text-right">{money(r.charged_amount_cents, r.charged_currency)}<span className="block text-xs text-[var(--muted)]">{r.status}</span></span></li>)}</ul>)}
        </div>
        <div className="space-y-4">
          <div className={card}>
            <h2 className="mb-2 font-semibold">Conversaciones con soporte</h2>
            {(threads ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Nunca ha escrito a soporte.</p> : (
              <ul className="stagger divide-y divide-[var(--border)] text-sm">{(threads ?? []).map((t) => <li key={t.id}><Link href={`/staff/soporte/${t.id}`} className="flex justify-between gap-3 py-2 hover:text-[var(--accent)]"><span className="min-w-0 truncate">{t.subject}<span className="block text-xs text-[var(--muted)]">{categoryLabel(t.category)}</span></span><span className="shrink-0 text-xs text-[var(--muted)]">{STATUS_LABEL[t.status as ThreadStatus]}</span></Link></li>)}</ul>)}
          </div>
          <div className={card}>
            <h2 className="mb-2 font-semibold">Alertas de facturación</h2>
            {(audit ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Sin eventos.</p> : <ul className="space-y-1 text-sm">{(audit ?? []).map((a, i) => <li key={i} className="flex justify-between gap-3"><span>{a.kind}</span><span className="text-xs text-[var(--muted)]">{when(a.created_at)}</span></li>)}</ul>}
          </div>
        </div>
      </div>
    </section>
  );
}
