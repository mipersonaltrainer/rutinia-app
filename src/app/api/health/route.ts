import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingConfig } from "@/lib/billing/config";
import { checkEnv } from "@/lib/env";
import { fxRateStatus, fxMaxAgeHours, fxWarnHours, fxAlertEvaluation } from "@/lib/billing/fx";
import { latestRate } from "@/lib/billing/rate";
import { parseAlertUrl } from "@/lib/ops/alerts";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? ""; const got = req.headers.get("authorization") ?? ""; const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * Uptime probe. Public callers learn only ok / not ok. With `Authorization: Bearer $CRON_SECRET` it also reports what
 * an operator needs: database latency, the age of the USD→COP rate, webhooks stuck unprocessed, provider switches and
 * configuration problems (names only, never values).
 */
export async function GET(req: Request) {
  const started = Date.now();
  const admin = createAdminClient();
  const db = await admin.from("fx_rates").select("id", { head: true, count: "exact" }).then((r) => ({ ok: !r.error, ms: Date.now() - started }), () => ({ ok: false, ms: Date.now() - started }));
  if (!authorized(req)) return NextResponse.json({ ok: db.ok }, { status: db.ok ? 200 : 503, headers });

  const cfg = getBillingConfig();
  const [fx, { count: stuck }, { count: pendingPay }] = await Promise.all([
    latestRate(admin),
    admin.from("provider_webhook_events").select("id", { head: true, count: "exact" }).is("processed_at", null).lt("received_at", new Date(Date.now() - 15 * 60_000).toISOString()),
    admin.from("slot_purchases").select("id", { head: true, count: "exact" }).eq("status", "pending"),
  ]);
  const fxAgeHours = fx ? Math.round((Date.now() - new Date(fx.effective_at).getTime()) / 3_600_000) : null;
  const maxAge = fxMaxAgeHours(process.env.FX_MAX_AGE_HOURS);
  const fxStatus = fxRateStatus(fx ?? null, new Date(), maxAge);
  const fxAlert = fxAlertEvaluation(fx ?? null, new Date(), maxAge, fxWarnHours(process.env.FX_WARN_HOURS, maxAge));
  const env = checkEnv(process.env);
  const fxMonitoring = process.env.FX_MONITORING === "on";      // Wompi charges fixed pesos: the rate is informational unless monitoring is switched on
  const problems = [
    ...(db.ok ? [] : ["base de datos inaccesible"]),
    ...((stuck ?? 0) > 0 ? [`${stuck} webhook(s) sin procesar hace más de 15 min`] : []),
    ...(fxMonitoring && cfg.wompi.enabled && !fxStatus.usable ? [`Wompi pausado: ${fxStatus.message}`] : []),
    ...env.errors.map((e) => `config: ${e}`),
  ];
  const heads = [...(fxMonitoring && cfg.wompi.enabled && fxAlert.state === "expiring" ? [`La tasa USD→COP vence en ~${fxAlert.hoursLeft} h`] : [])];
  return NextResponse.json({ ok: db.ok, db, fx: { ageHours: fxAgeHours, source: fx?.source ?? null, state: fxStatus.state, alertState: fxAlert.state, hoursLeft: fxAlert.hoursLeft, maxAgeHours: maxAge, alertWebhookConfigured: !!parseAlertUrl(process.env.ADMIN_ALERT_WEBHOOK_URL) }, providers: { wompi: cfg.wompi.enabled, paypal: cfg.paypal.enabled }, webhooksStuck: stuck ?? 0, pendingSlotPurchases: pendingPay ?? 0, problems, warnings: [...heads, ...env.warnings] }, { status: db.ok ? 200 : 503, headers });
}
