import type { SupabaseClient } from "@supabase/supabase-js";
import { fxAlertEvaluation, fxMaxAgeHours, fxWarnHours, type FxAlertState } from "./fx";
import { latestRate } from "./rate";
import { parseAlertUrl, postAlert } from "@/lib/ops/alerts";

const KEY = "fx_rate";
/** While the rate stays 'expiring' remind every 12 h; once Wompi is paused, every 6 h. */
const REPEAT_MINUTES: Record<FxAlertState, number> = { ok: 720, expiring: 12 * 60, expired: 6 * 60, missing: 6 * 60, future: 6 * 60 };
const RECOVERY = "🟢 Rutinia: la tasa USD→COP está al día; los cobros con Wompi están disponibles.";

export type FxAlertRun = { state: FxAlertState | "disabled"; hoursLeft: number | null; sent: boolean; delivery?: string };

/**
 * Called by the cron. Announces to the operator when the USD→COP rate is about to expire, has expired (Wompi paused),
 * or has recovered — once per change, and periodically while the problem persists. Does nothing when Wompi is not configured.
 * If delivery fails the claim is reverted, so the next run tries again.
 */
export async function runFxAlert(admin: SupabaseClient, env: Record<string, string | undefined>, wompiEnabled: boolean, now: Date = new Date(), fetchImpl?: typeof fetch): Promise<FxAlertRun> {
  if (!wompiEnabled) return { state: "disabled", hoursLeft: null, sent: false };
  const maxAge = fxMaxAgeHours(env.FX_MAX_AGE_HOURS);
  const ev = fxAlertEvaluation(await latestRate(admin, now), now, maxAge, fxWarnHours(env.FX_WARN_HOURS, maxAge));
  const { data, error } = await admin.rpc("claim_operator_alert", { p_key: KEY, p_state: ev.state, p_repeat_minutes: REPEAT_MINUTES[ev.state] });
  if (error || !data) return { state: ev.state, hoursLeft: ev.hoursLeft, sent: false, delivery: "claim_failed" };
  const { claimed, prev } = data as { claimed: boolean; prev: unknown };
  if (!claimed) return { state: ev.state, hoursLeft: ev.hoursLeft, sent: false };

  const text = ev.message ?? RECOVERY;
  const result = await postAlert(parseAlertUrl(env.ADMIN_ALERT_WEBHOOK_URL), text, { fetchImpl });
  if (ev.state !== "ok") console.warn(`[fx] ${text}`);                       // hosting logs are the second channel
  if (!result.ok) { await admin.rpc("revert_operator_alert", { p_key: KEY, p_prev: prev }); return { state: ev.state, hoursLeft: ev.hoursLeft, sent: false, delivery: result.reason }; }
  return { state: ev.state, hoursLeft: ev.hoursLeft, sent: true };
}
