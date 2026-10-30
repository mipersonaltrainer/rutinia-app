// What the trainer should see about their workspace, derived from the same fields the gate uses
// (mirrors trainer_has_access / trainerAccess in session.ts). Pure: `now` is injected so it is testable.
export type SubInput = { status: string; trial_ends_at: string; current_period_end: string | null; provider?: string | null };
export type AccessStatus = {
  allowed: boolean;
  tone: "info" | "warn" | "danger" | "ok";
  headline: string;
  detail: string;
  /** Whole days left in the current window (trial or paid period); null when not applicable. */
  daysLeft: number | null;
  /** 0..1 elapsed share of the trial, for the progress bar; null outside a trial. */
  trialProgress: number | null;
  /** Show a call-to-action to /trainer/billing in the banner. */
  cta: boolean;
};
export const TRIAL_DAYS = 7;
const DAY = 86_400_000;
const d = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describeAccess(sub: SubInput | null, now: Date = new Date()): AccessStatus {
  if (!sub) return { allowed: false, tone: "danger", headline: "Sin suscripción", detail: "Tu cuenta no tiene una suscripción asociada. Contacta soporte.", daysLeft: null, trialProgress: null, cta: true };
  const t = now.getTime();
  const trialEnd = new Date(sub.trial_ends_at).getTime();
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null;
  const paidWindow = ["active", "past_due", "canceled"].includes(sub.status) && periodEnd !== null && periodEnd > t;
  const left = (end: number) => Math.max(0, Math.ceil((end - t) / DAY));

  if (sub.status === "trialing" && trialEnd > t) {
    const days = left(trialEnd); const hours = Math.max(1, Math.ceil((trialEnd - t) / 3_600_000));
    const progress = Math.min(1, Math.max(0, 1 - (trialEnd - t) / (TRIAL_DAYS * DAY)));
    const last = days <= 1;
    return { allowed: true, tone: days <= 2 ? "warn" : "info", daysLeft: days, trialProgress: progress, cta: days <= 3,
      headline: last ? (hours < 24 ? `Tu prueba termina en ${plural(hours, "hora", "horas")}` : "Tu prueba termina mañana") : `Prueba gratis: te quedan ${plural(days, "día", "días")}`,
      detail: `Vence el ${d(sub.trial_ends_at)}. Al terminar, tus datos se conservan pero el espacio se bloquea hasta que actives la suscripción.` };
  }
  if (paidWindow && periodEnd !== null) {
    const days = left(periodEnd);
    if (sub.status === "past_due") return { allowed: true, tone: "danger", daysLeft: days, trialProgress: null, cta: true, headline: "No pudimos cobrar tu última renovación", detail: `Conservas el acceso hasta el ${d(sub.current_period_end!)}. Revisa tu método de pago para no perderlo.` };
    if (sub.status === "canceled") return { allowed: true, tone: "warn", daysLeft: days, trialProgress: null, cta: days <= 7, headline: "Suscripción cancelada", detail: `Tu acceso continúa hasta el ${d(sub.current_period_end!)}. No habrá más cobros.` };
    return { allowed: true, tone: "ok", daysLeft: days, trialProgress: null, cta: false, headline: "Suscripción activa", detail: `Periodo pagado hasta el ${d(sub.current_period_end!)}.` };
  }
  // Everything else blocks the workspace; the data is kept.
  const why = sub.status === "trialing" ? "Tu prueba gratuita terminó" : sub.status === "payment_required" ? "Falta el pago de tu suscripción" : sub.status === "suspended" ? "Tu cuenta está suspendida" : "Tu suscripción expiró";
  return { allowed: false, tone: "danger", daysLeft: null, trialProgress: null, cta: true, headline: why, detail: "Tus datos y los de tus alumnos están intactos. El acceso se restablece cuando el pago sea verificado por el proveedor." };
}
