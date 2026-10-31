import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfig, sendEmail, type EmailMessage } from "@/lib/marketing/email";
import { SUPPORT_EMAIL } from "@/lib/site";

// Service e-mails about the trainer's own subscription: two days before the free trial ends, and five days before a paid plan ends or renews.
// They are notices of the service (not marketing), so they do not depend on the marketing consent. Each goes out once per period: the row in
// `subscription_notices` is written BEFORE sending and removed if the send fails, so a failure is retried on the next run and a success never repeats.
type Deps = { sendEmailImpl?: typeof sendEmail; now?: () => Date };
export const TRIAL_NOTICE_DAYS = 2;
export const RENEWAL_NOTICE_DAYS = 5;

const FOOTER = `Aviso del servicio de Rutinia sobre tu suscripción. ¿Dudas? Escríbenos a ${SUPPORT_EMAIL}.`;
const day = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" });
const firstName = (full: string | null | undefined) => (full ?? "").replace(/[\r\n]+/g, " ").trim().split(/\s+/)[0]?.slice(0, 40) || "";
const hello = (name: string) => (name ? `Hola ${name},` : "Hola,");

export function trialEndingEmail(name: string, endsAt: Date): Omit<EmailMessage, "to"> {
  return {
    subject: "Tu prueba gratuita de Rutinia termina en 2 días",
    text: `${hello(name)}\n\nEsperamos que estés disfrutando de nuestra plataforma. Tu prueba gratuita termina el ${day(endsAt)}.\n\nPara seguir trabajando con tus alumnos sin interrupciones, activa tu plan: $40.000 COP al mes con Bold (o USD 10 al mes con PayPal si pagas desde fuera de Colombia). No hacemos ningún cobro automático al terminar la prueba, y tus datos y los de tus alumnos se conservan.`,
    link: "/trainer/billing", footer: FOOTER,
  };
}

export function renewalEmail(name: string, endsAt: Date, o: { provider: string | null; status: string }): Omit<EmailMessage, "to"> {
  const when = day(endsAt);
  const body = o.status === "canceled"
    ? `Cancelaste tu suscripción, así que tu plan termina el ${when} y no se renovará. Si quieres seguir, puedes reactivarlo cuando quieras desde Facturación.`
    : o.provider === "paypal"
      ? `Tu suscripción se renovará automáticamente el ${when} con PayPal, y verás el cobro en tu cuenta de PayPal. Si no quieres renovarla, cancélala desde Facturación antes de esa fecha.`
      : `Tu plan termina el ${when}. Renuévalo antes de esa fecha para que tu espacio y el de tus alumnos no se bloqueen. No hay cobro automático: pagas cuando quieras desde Facturación. Si el plan termina, tus datos se conservan.`;
  return { subject: `Tu plan de Rutinia ${o.status === "canceled" ? "termina" : o.provider === "paypal" ? "se renueva" : "termina"} en 5 días`, text: `${hello(name)}\n\n${body}`, link: "/trainer/billing", footer: FOOTER };
}

type Row = { trainer_id: string; trial_ends_at: string; current_period_end: string | null; status: string; provider: string | null };

/** Sends what is due. Never throws: a failure here must not break the cron's essential work. Returns counts only. */
export async function runLifecycleEmails(admin: SupabaseClient, env: Record<string, string | undefined> = process.env, deps: Deps = {}) {
  const out = { trial: 0, renewal: 0, failed: 0, skipped: false };
  try {
    const cfg = emailConfig(env); if (!cfg) return { ...out, skipped: true };
    const send = deps.sendEmailImpl ?? sendEmail; const now = deps.now?.() ?? new Date();
    const base = (env.APPLICATION_BASE_URL ?? "").trim().replace(/\/+$/, "");
    const iso = (days: number) => new Date(+now + days * 86_400_000).toISOString();

    const [trial, paid] = await Promise.all([
      admin.from("trainer_subscriptions").select("trainer_id,trial_ends_at,current_period_end,status,provider").eq("status", "trialing").gt("trial_ends_at", now.toISOString()).lte("trial_ends_at", iso(TRIAL_NOTICE_DAYS)),
      admin.from("trainer_subscriptions").select("trainer_id,trial_ends_at,current_period_end,status,provider").in("status", ["active", "canceled"]).gt("current_period_end", now.toISOString()).lte("current_period_end", iso(RENEWAL_NOTICE_DAYS)),
    ]);
    const jobs: { row: Row; kind: "trial_ending" | "renewal_due"; ends: Date }[] = [
      ...((trial.data ?? []) as Row[]).map((row) => ({ row, kind: "trial_ending" as const, ends: new Date(row.trial_ends_at) })),
      ...((paid.data ?? []) as Row[]).map((row) => ({ row, kind: "renewal_due" as const, ends: new Date(row.current_period_end!) })),
    ];
    for (const { row, kind, ends } of jobs) {
      const period_key = ends.toISOString().slice(0, 10);
      const claim = await admin.from("subscription_notices").upsert({ trainer_id: row.trainer_id, kind, period_key }, { onConflict: "trainer_id,kind,period_key", ignoreDuplicates: true }).select("trainer_id");
      if (claim.error || !claim.data?.length) continue;                                        // already sent for this period (or cannot be recorded: do not risk a repeat)
      const undo = () => admin.from("subscription_notices").delete().eq("trainer_id", row.trainer_id).eq("kind", kind).eq("period_key", period_key);
      try {
        const { data: u } = await admin.auth.admin.getUserById(row.trainer_id); const to = u?.user?.email;
        const { data: p } = await admin.from("profiles").select("full_name").eq("id", row.trainer_id).maybeSingle();
        if (!to) { await undo(); out.failed++; continue; }
        const msg = kind === "trial_ending" ? trialEndingEmail(firstName(p?.full_name as string | null), ends) : renewalEmail(firstName(p?.full_name as string | null), ends, { provider: row.provider, status: row.status });
        const r = await send(cfg, { to, ...msg }, base);
        if (r.ok) { if (kind === "trial_ending") out.trial++; else out.renewal++; } else { await undo(); out.failed++; }
      } catch { await undo(); out.failed++; }
    }
  } catch { out.failed++; }
  return out;
}
