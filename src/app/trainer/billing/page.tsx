import Link from "next/link";
import { requireUser, trainerAccess } from "@/lib/session";
import { getBillingConfig } from "@/lib/billing/config";
import { BASE_PRICE_CENTS, BASE_PRICE_COP_CENTS, INCLUDED_CLIENTS, capacitySummary, formatMoney } from "@/lib/billing/pricing";
import { SlotPurchaseForm } from "@/components/SlotPurchaseForm";
import { AiCreditsForm } from "@/components/AiCreditsForm";
import { SubscriptionForm } from "@/components/SubscriptionForm";
import { ActionForm } from "@/components/ActionForm";
import { cancelSubscription } from "./actions";
import { ReferralCard } from "@/components/ReferralCard";
import { canStillRedeem, referralLink, type ReferralReward } from "@/lib/billing/referrals";
import { appOrigin } from "@/lib/auth/server";
import { describeAccess } from "@/lib/billing/access-status";

const STATUS: Record<string, string> = { trialing: "En prueba gratuita", active: "Activa", payment_required: "Pago requerido", past_due: "Pago vencido", suspended: "Suspendida", canceled: "Cancelada (activa hasta el fin del periodo)", expired: "Expirada" };
const PAY: Record<string, string> = { pending: "pendiente", approved: "aprobado", declined: "rechazado", voided: "anulado/reembolsado", expired: "expirado" };
const BANNER: Record<string, string> = { ok: "Pago recibido y verificado.", pendiente: "Tu pago está pendiente de confirmación. No se activará nada hasta que el proveedor lo confirme.", rechazado: "El pago fue rechazado. No se realizó ningún cargo activo.", cancelado: "Cancelaste el pago. No se cobró nada.", error: "No pudimos verificar ese pago." };

export default async function Billing({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const { pago } = await searchParams;
  const { supabase, profile } = await requireUser("trainer");
  const { allowed, sub } = await trainerAccess(supabase, profile.id);
  const access = describeAccess(sub);
  const cfg = getBillingConfig();
  const [{ count: active }, { data: cap }, { data: purchases }, { data: payments }, { data: aiCredits }, { data: aiPurchases }, { data: refCode }, { data: refs }] = await Promise.all([
    supabase.from("trainer_client_relationships").select("id", { count: "exact", head: true }).eq("trainer_id", profile.id).eq("status", "active"),
    supabase.rpc("trainer_capacity", { t: profile.id }),
    supabase.from("slot_purchases").select("id,created_at,provider,quantity,unit_price_cents,total_cents,currency,charged_amount_cents,charged_currency,status,provider_reference").eq("trainer_id", profile.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("subscription_payments").select("id,created_at,provider,charged_amount_cents,charged_currency,status,period_start,period_end").eq("trainer_id", profile.id).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("my_ai_credits"),
    supabase.from("ai_credit_purchases").select("id,created_at,provider,pack,credits,total_cents,currency,charged_amount_cents,charged_currency,status").eq("trainer_id", profile.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("referral_codes").select("code,reward").eq("trainer_id", profile.id).maybeSingle(),
    supabase.from("referrals").select("status").eq("referrer_id", profile.id),
  ]);
  const mine = await supabase.from("referrals").select("referred_id", { count: "exact", head: true }).eq("referred_id", profile.id);
  const { data: subRow } = await supabase.from("trainer_subscriptions").select("trial_started_at").eq("trainer_id", profile.id).maybeSingle();
  const canRedeem = sub?.status === "trialing" && (mine.count ?? 0) === 0 && (payments ?? []).length === 0 && !!subRow?.trial_started_at && canStillRedeem(subRow.trial_started_at);
  const c = capacitySummary(active ?? 0, (cap ?? 20) - 20);
  const over = (active ?? 0) > c.totalCapacity;
  const providers = { paypal: cfg.paypal.enabled, bold: cfg.bold.enabled };
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  const money = (cents: number, cur: string) => formatMoney(cents, cur === "COP" ? "COP" : "USD");
  return (
    <section className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">Facturación</h1>
      <p className="text-sm text-[var(--muted)]">¿Algo no cuadra con un pago? <Link href="/trainer/support" className="text-[var(--accent)] underline">Escríbenos a soporte</Link>.</p>
      {pago && BANNER[pago] && <p role="status" className="rounded-lg border border-[var(--accent)]/50 p-3 text-sm">{BANNER[pago]}</p>}
      

      <div className={card}>
        <h2 className="mb-2 font-semibold">Tu plan</h2>
        <p className="text-sm">Estado: <b>{sub ? STATUS[sub.status] : "—"}</b></p>
        <p className="mt-1 text-sm font-semibold">{access.headline}</p><p className="text-sm text-[var(--muted)]">{access.detail}</p>
        {access.trialProgress !== null && <div className="mt-3" role="progressbar" aria-label="Progreso de la prueba" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(access.trialProgress * 100)}><div className="h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(access.trialProgress * 100)}%` }} /></div><p className="mt-1 text-xs text-[var(--muted)]">{access.daysLeft} de 7 días restantes</p></div>}
        <p className="mt-2 text-sm text-[var(--muted)]">Suscripción mensual: {formatMoney(BASE_PRICE_COP_CENTS, "COP")} con Bold, o {formatMoney(BASE_PRICE_CENTS, "USD")} con PayPal (incluye {INCLUDED_CLIENTS} alumnos). Cupos adicionales y paquetes de IA son pagos únicos aparte.</p>
      </div>

      <div className={card}>
        <h2 className="mb-2 font-semibold">Capacidad de alumnos</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5"><div><dt className="text-[var(--muted)]">Incluidos</dt><dd className="text-xl font-semibold">{c.included}</dd></div><div><dt className="text-[var(--muted)]">Cupos comprados</dt><dd className="text-xl font-semibold">{c.additionalSlots}</dd></div><div><dt className="text-[var(--muted)]">Capacidad total</dt><dd className="text-xl font-semibold">{c.totalCapacity}</dd></div><div><dt className="text-[var(--muted)]">Alumnos activos</dt><dd className="text-xl font-semibold">{c.activeClients}</dd></div><div><dt className="text-[var(--muted)]">Disponibles</dt><dd className="text-xl font-semibold text-[var(--accent)]">{c.remaining}</dd></div></dl>
        {over && <p role="alert" className="mt-3 text-sm text-[var(--warn)]">Tienes más alumnos activos que tu capacidad verificada (p. ej. por un reembolso). No se elimina a nadie, pero no podrás activar más alumnos hasta ampliar la capacidad.</p>}
      </div>

      <SubscriptionForm providers={providers} planConfigured={!!cfg.paypal.planId} />
      {sub?.provider === "paypal" && sub.status !== "canceled" && sub.status !== "expired" && <ActionForm action={cancelSubscription} submitLabel="Cancelar suscripción"><p className="text-sm">Cancelar detiene los cobros futuros. Conservas el acceso hasta el fin del periodo ya pagado.</p></ActionForm>}
      {allowed && <SlotPurchaseForm providers={providers} capacity={{ total: c.totalCapacity, active: c.activeClients }} />}

      <ReferralCard code={refCode?.code ?? null} reward={(refCode?.reward ?? "slots") as ReferralReward} link={refCode ? referralLink(await appOrigin(), refCode.code) : null} rewarded={(refs ?? []).filter((r) => r.status === "rewarded").length} pending={(refs ?? []).filter((r) => r.status === "pending").length} canRedeem={canRedeem} />

      {allowed && <AiCreditsForm providers={providers} credits={aiCredits as { free_left: number; paid_left: number } | null} />}

      <div className={card}><h2 className="mb-2 font-semibold">Compras de créditos de IA (pago único)</h2>
        {(aiPurchases ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Sin compras.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[var(--muted)]"><tr><th className="py-1">Fecha</th><th>Créditos</th><th>Total USD</th><th>Cobrado</th><th>Método</th><th>Estado</th></tr></thead><tbody>
          {(aiPurchases ?? []).map((p) => <tr key={p.id} className="border-t border-[var(--border)]"><td className="py-1">{new Date(p.created_at).toLocaleDateString("es-CO")}</td><td>{p.credits}</td><td>{money(p.total_cents, p.currency)}</td><td>{money(p.charged_amount_cents, p.charged_currency)}</td><td>{p.provider}</td><td>{PAY[p.status]}</td></tr>)}</tbody></table></div>}</div>
      <div className={card}><h2 className="mb-2 font-semibold">Compras de cupos (pago único)</h2>
        {(purchases ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Sin compras.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[var(--muted)]"><tr><th className="py-1">Fecha</th><th>Cant.</th><th>Unitario</th><th>Total USD</th><th>Cobrado</th><th>Método</th><th>Estado</th></tr></thead><tbody>
          {(purchases ?? []).map((p) => <tr key={p.id} className="border-t border-[var(--border)]"><td className="py-1">{new Date(p.created_at).toLocaleDateString("es-CO")}</td><td>{p.quantity}</td><td>{money(p.unit_price_cents, p.currency)}</td><td>{money(p.total_cents, p.currency)}</td><td>{money(p.charged_amount_cents, p.charged_currency)}</td><td>{p.provider}</td><td>{PAY[p.status]}</td></tr>)}</tbody></table></div>}</div>
      <div className={card}><h2 className="mb-2 font-semibold">Pagos de suscripción</h2>
        {(payments ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Sin pagos de suscripción.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[var(--muted)]"><tr><th className="py-1">Fecha</th><th>Cobrado</th><th>Método</th><th>Periodo</th><th>Estado</th></tr></thead><tbody>
          {(payments ?? []).map((p) => <tr key={p.id} className="border-t border-[var(--border)]"><td className="py-1">{new Date(p.created_at).toLocaleDateString("es-CO")}</td><td>{money(p.charged_amount_cents, p.charged_currency)}</td><td>{p.provider}</td><td>{p.period_end ? `${new Date(p.period_start!).toLocaleDateString("es-CO")} – ${new Date(p.period_end).toLocaleDateString("es-CO")}` : "—"}</td><td>{PAY[p.status]}</td></tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs text-[var(--muted)]">Política de reembolsos: un pago anulado o reembolsado reduce la capacidad verificada; nunca se elimina ni se desactiva a un alumno automáticamente. Las facturas históricas no se reescriben.</p></div>
    </section>
  );
}
