import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSignalAlerts } from "@/lib/ops/signals";
import { getBillingConfig } from "@/lib/billing/config";
import { runFxAlert } from "@/lib/billing/fx-alert";
import { runDueCampaigns, sendBirthdayGreetings } from "@/lib/marketing/send";

export const dynamic = "force-dynamic";

/** Call on a schedule (e.g. every 15 min: the 1-hour call reminder is only as punctual as this schedule) with `Authorization: Bearer $CRON_SECRET`. Access is also enforced lazily by the database. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("expire_subscriptions");
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  const { data: reminders, error: rErr } = await admin.rpc("generate_reminders");
  const { data: calls, error: cErr } = await admin.rpc("send_call_reminders");
  await admin.rpc("auth_throttle_purge");                                    // housekeeping for the attempt limiter
  const fx = await runFxAlert(admin, process.env, getBillingConfig().wompi.enabled && process.env.FX_MONITORING === "on")      // Wompi charges fixed pesos now: the USD→COP rate is only watched when asked for.catch(() => ({ state: "error" as const, sent: false }));
  // Marketing runs after the essentials and can never break them: scheduled campaigns that are due, and the automatic birthday greeting (if the team turned it on).
  const marketing = await (async () => { try { return { campaigns: await runDueCampaigns(admin), birthdays: await sendBirthdayGreetings(admin, { auto: true }) }; } catch { return { error: true }; } })();
  const signals = await runSignalAlerts(admin, process.env);                // counts-only operational alerts; never breaks the run
  return NextResponse.json({ ok: true, ...data, marketing, signals, reminders: rErr ? { error: true } : reminders, call_reminders: cErr ? { error: true } : calls, fx_alert: fx });
}
