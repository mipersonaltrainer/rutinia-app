import { parseAlertUrl, postAlert, type DeliveryResult } from "@/lib/ops/alerts";
import { categoryLabel } from "./schema";

/**
 * Tells the team (Slack/Discord webhook) that a trainer is waiting for an answer. It carries the trainer's name, the topic and a link to
 * the conversation, never the message itself: the alert leaves the platform. SUPPORT_ALERT_WEBHOOK_URL wins; otherwise the operator
 * channel (ADMIN_ALERT_WEBHOOK_URL) is used. Never throws: support must keep working when the webhook does not.
 */
export async function notifySupportTeam(
  t: { threadId: string; trainerName: string; category: string; subject: string; reply: boolean },
  env: Record<string, string | undefined> = process.env, fetchImpl?: typeof fetch,
): Promise<DeliveryResult> {
  const url = parseAlertUrl(env.SUPPORT_ALERT_WEBHOOK_URL || env.ADMIN_ALERT_WEBHOOK_URL);
  const base = (env.APPLICATION_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 120);
  const text = `${t.reply ? "💬 Respuesta nueva" : "🆘 Soporte nuevo"} · ${clean(t.trainerName)} · ${categoryLabel(t.category)} · «${clean(t.subject)}»${base ? ` → ${base}/staff/soporte/${t.threadId}` : ""}`;
  try { return await postAlert(url, text, { fetchImpl }); } catch { return { ok: false, reason: "network_error" }; }
}
