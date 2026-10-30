// Requires local Supabase (synthetic data). The operational signals count real stuck rows and announce them once.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { countSignals, evaluateSignals, runSignalAlerts } from "@/lib/ops/signals";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); let uid: string; const ids: string[] = [];
beforeAll(async () => {
  uid = (await admin.auth.admin.createUser({ email: `sig-${run}@x.co`, password: "Test-Pass-12345", email_confirm: true })).data.user!.id;
  await admin.from("operator_alerts").delete().like("key", "signal_%");
});
afterAll(async () => {
  await admin.from("provider_webhook_events").delete().in("event_id", ids); await admin.from("operator_alerts").delete().like("key", "signal_%");
  await admin.auth.admin.deleteUser(uid);
});

describe("operational signals", () => {
  it("counts only what is actually stuck: old unprocessed webhooks and old open AI reservations", async () => {
    const before = await countSignals(admin);
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    ids.push(`sig-old-${run}`, `sig-new-${run}`, `sig-done-${run}`);
    const now = new Date().toISOString();       // every row carries every key: a bulk insert fills missing ones with NULL
    const ins = await admin.from("provider_webhook_events").insert([
      { provider: "bold", event_id: `sig-old-${run}`, payload: {}, received_at: old, processed_at: null },
      { provider: "bold", event_id: `sig-new-${run}`, payload: {}, received_at: now, processed_at: null },
      { provider: "bold", event_id: `sig-done-${run}`, payload: {}, received_at: old, processed_at: now }]);
    expect(ins.error).toBeNull();
    const { data: u } = await admin.from("ai_usage").insert({ user_id: uid, kind: "plan_draft", created_at: new Date(Date.now() - 45 * 60_000).toISOString() }).select("id").single();
    const after = await countSignals(admin);
    expect(after.stuckWebhooks - before.stuckWebhooks).toBe(1);              // only the old, unprocessed one
    expect(after.stuckAiReservations - before.stuckAiReservations).toBe(1);
    await admin.from("ai_usage").delete().eq("id", u!.id);
  });
  it("announces a signal once when it turns on, stays quiet while unchanged, and says so when it clears — counts only, no personal data", async () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    ids.push(`sig-once-${run}`);
    await admin.from("provider_webhook_events").insert({ provider: "bold", event_id: `sig-once-${run}`, payload: { email: "privado@x.co" }, received_at: old });
    const f = vi.fn(async () => new Response("ok", { status: 200 }));
    const env = { ADMIN_ALERT_WEBHOOK_URL: "https://hooks.example.com/ops" };
    const first = await runSignalAlerts(admin, env, new Date(), f as unknown as typeof fetch);
    expect(first.ok && first.sent).toContain("signal_webhooks");
    const sentTexts = f.mock.calls.map((c) => JSON.parse(((c as unknown as [URL, { body: string }])[1]).body).text as string).join("\n");
    expect(sentTexts).toMatch(/sin procesar/); expect(sentTexts).not.toContain("privado@x.co");
    const calls1 = f.mock.calls.length;
    await runSignalAlerts(admin, env, new Date(), f as unknown as typeof fetch);
    expect(f.mock.calls.length).toBe(calls1);                                 // unchanged → quiet
    await admin.from("provider_webhook_events").update({ processed_at: new Date().toISOString() }).in("event_id", ids);
    await runSignalAlerts(admin, env, new Date(), f as unknown as typeof fetch);
    expect(f.mock.calls.length).toBeGreaterThan(calls1);                      // recovery notice
  });
  it("evaluates every signal as ok when nothing is wrong", () => {
    expect(evaluateSignals({ stuckWebhooks: 0, stuckAiReservations: 0, staffBurstActors: 0 }).every((s) => s.state === "ok")).toBe(true);
  });
});
