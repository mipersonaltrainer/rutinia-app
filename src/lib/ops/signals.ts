import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAlertUrl, postAlert } from "./alerts";

// Operational signals the daily cron watches and announces through the operator webhook (counts only: no names, e-mails or content leave the platform).
// A daily schedule cannot catch a problem within minutes — pair this with an external uptime monitor (an uptime check on /api/health).
export const WEBHOOK_STUCK_MINUTES = 15;
export const AI_RESERVATION_STUCK_MINUTES = 30;
export const STAFF_BURST = { actions: 10, minutes: 5 };

export type SignalCounts = { stuckWebhooks: number; stuckAiReservations: number; staffBurstActors: number };
export type Signal = { key: string; state: "ok" | "alert"; message: string };

export function evaluateSignals(c: SignalCounts): Signal[] {
  return [
    { key: "signal_webhooks", state: c.stuckWebhooks > 0 ? "alert" : "ok", message: `⚠️ Rutinia: ${c.stuckWebhooks} aviso(s) de pago sin procesar hace más de ${WEBHOOK_STUCK_MINUTES} min. Revisa Bold/PayPal y reintenta.` },
    { key: "signal_ai_reservations", state: c.stuckAiReservations > 0 ? "alert" : "ok", message: `⚠️ Rutinia: ${c.stuckAiReservations} solicitud(es) de IA quedaron reservadas sin cerrar (más de ${AI_RESERVATION_STUCK_MINUTES} min). El crédito sigue retenido.` },
    { key: "signal_staff_burst", state: c.staffBurstActors > 0 ? "alert" : "ok", message: `⚠️ Rutinia: ${c.staffBurstActors} persona(s) del equipo de soporte hicieron ${STAFF_BURST.actions}+ acciones en ${STAFF_BURST.minutes} min. Revisa staff_access_log.` },
  ];
}

export async function countSignals(admin: SupabaseClient, now: Date = new Date()): Promise<SignalCounts> {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  const [w, a, s] = await Promise.all([
    admin.from("provider_webhook_events").select("id", { count: "exact", head: true }).is("processed_at", null).lt("received_at", ago(WEBHOOK_STUCK_MINUTES)),
    admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("status", "reserved").lt("created_at", ago(AI_RESERVATION_STUCK_MINUTES)),
    admin.from("staff_access_log").select("actor_id").gte("at", ago(STAFF_BURST.minutes)).limit(5000),
  ]);
  const perActor = new Map<string, number>(); for (const r of s.data ?? []) perActor.set(r.actor_id, (perActor.get(r.actor_id) ?? 0) + 1);
  return { stuckWebhooks: w.count ?? 0, stuckAiReservations: a.count ?? 0, staffBurstActors: [...perActor.values()].filter((n) => n >= STAFF_BURST.actions).length };
}

/** Announces a signal when it turns on (and again every 24 h while it stays on) and once when it clears. Never throws: the cron's essential work must not depend on it. */
export async function runSignalAlerts(admin: SupabaseClient, env: Record<string, string | undefined>, now: Date = new Date(), fetchImpl?: typeof fetch) {
  try {
    const signals = evaluateSignals(await countSignals(admin, now)); const sent: string[] = [];
    for (const sig of signals) {
      const { data, error } = await admin.rpc("claim_operator_alert", { p_key: sig.key, p_state: sig.state, p_repeat_minutes: 24 * 60 });
      if (error || !data) continue;
      const { claimed, prev } = data as { claimed: boolean; prev: unknown };
      if (!claimed) continue;
      const text = sig.state === "ok" ? `🟢 Rutinia: se normalizó «${sig.key}».` : sig.message;
      const r = await postAlert(parseAlertUrl(env.ADMIN_ALERT_WEBHOOK_URL), text, { fetchImpl });
      if (sig.state !== "ok") console.warn(`[signals] ${sig.key}`);          // hosting logs are the second channel
      if (!r.ok) await admin.rpc("revert_operator_alert", { p_key: sig.key, p_prev: prev }); else sent.push(sig.key);
    }
    return { ok: true as const, active: signals.filter((x) => x.state === "alert").map((x) => x.key), sent };
  } catch { return { ok: false as const }; }
}
