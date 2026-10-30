import Link from "next/link";
import { notFound } from "next/navigation";
import { logStaffAccess, requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupportThread } from "@/components/support/SupportThread";
import { staffSetStatus } from "@/app/support-actions";
import { formatMoney } from "@/lib/billing/pricing";
import { STATUS_LABEL, categoryLabel, type ThreadStatus } from "@/lib/support/schema";

export const metadata = { title: "Conversación de soporte" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—");
const money = (cents: number, cur: string) => formatMoney(cents, cur === "COP" ? "COP" : "USD");

export default async function StaffThread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const { data: t } = await supabase.from("support_threads").select("id,trainer_id,category,subject,status,trainer:profiles!support_threads_trainer_id_fkey(full_name)").eq("id", id).maybeSingle();
  if (!t) notFound();
  await logStaffAccess(supabase, "view_thread", t.trainer_id, id);
  await supabase.rpc("support_mark_read", { p_thread: id, p_as_staff: true });

  // Context to solve payment/access questions without asking the trainer for it. Read with the service role, only after requireStaff() passed.
  const admin = createAdminClient();
  const [{ data: user }, { data: sub }, { data: slots }, { data: subs }] = await Promise.all([
    admin.auth.admin.getUserById(t.trainer_id),
    admin.from("trainer_subscriptions").select("status,trial_ends_at,current_period_end,provider").eq("trainer_id", t.trainer_id).maybeSingle(),
    admin.from("slot_purchases").select("created_at,provider,status,quantity,charged_amount_cents,charged_currency").eq("trainer_id", t.trainer_id).order("created_at", { ascending: false }).limit(4),
    admin.from("subscription_payments").select("created_at,provider,status,charged_amount_cents,charged_currency").eq("trainer_id", t.trainer_id).order("created_at", { ascending: false }).limit(4),
  ]);
  const trainer = t.trainer as unknown as { full_name: string } | null;
  const closed = t.status === "closed";
  return (
    <section className="space-y-5">
      <p className="text-sm"><Link href="/staff/soporte" className="text-[var(--accent)] underline">← Soporte</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{t.subject}</h1><p className="text-sm text-[var(--muted)]">{categoryLabel(t.category)} · {STATUS_LABEL[t.status as ThreadStatus]}</p></div>
        <form action={staffSetStatus.bind(null, id, closed ? "open" : "closed")}><button className="btn btn-secondary">{closed ? "Reabrir" : "Cerrar conversación"}</button></form>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <SupportThread supabase={supabase} threadId={id} viewer="staff" closed={closed} />
        <aside className="space-y-4 text-sm">
          <div className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="font-semibold"><Link className="underline hover:text-[var(--accent)]" href={`/staff/entrenadores/${t.trainer_id}`}>{trainer?.full_name ?? "Entrenador"}</Link></h2>
            <p className="break-all text-[var(--muted)]">{user?.user?.email ?? "—"}</p>
            <dl className="mt-3 space-y-1">
              <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Suscripción</dt><dd>{sub?.status ?? "—"}{sub?.provider ? ` · ${sub.provider}` : ""}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Vence</dt><dd>{fmt(sub?.current_period_end ?? sub?.trial_ends_at ?? null)}</dd></div>
            </dl>
          </div>
          <div className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-2 font-semibold">Últimos pagos</h2>
            {[...(subs ?? []).map((p) => ({ ...p, what: "Suscripción" })), ...(slots ?? []).map((p) => ({ ...p, what: `${(p as { quantity: number }).quantity} cupo(s)` }))]
              .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 6).map((p, i) => (
                <p key={i} className="flex justify-between gap-3 py-0.5"><span>{p.what} · {p.provider}</span><span className="text-[var(--muted)]">{money(p.charged_amount_cents, p.charged_currency)} · {p.status}</span></p>))}
            {(subs ?? []).length + (slots ?? []).length === 0 && <p className="text-[var(--muted)]">Sin pagos registrados.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
