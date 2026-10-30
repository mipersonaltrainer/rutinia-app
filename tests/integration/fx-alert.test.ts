// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { runFxAlert } from "@/lib/billing/fx-alert";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const KEY = `test-${Date.now()}`;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const claim = async (state: string, mins = 60, key = KEY) => (await admin.rpc("claim_operator_alert", { p_key: key, p_state: state, p_repeat_minutes: mins })).data as { claimed: boolean; prev: unknown };

afterAll(async () => { await admin.from("operator_alerts").delete().like("key", `${KEY}%`); });

describe("claim_operator_alert (database)", () => {
  it("only the service role can use it", async () => {
    expect((await anon.rpc("claim_operator_alert", { p_key: KEY, p_state: "expired", p_repeat_minutes: 5 })).error).not.toBeNull();
    expect((await anon.rpc("revert_operator_alert", { p_key: KEY, p_prev: null })).error).not.toBeNull();
    expect((await anon.from("operator_alerts").select("key")).data ?? []).toEqual([]);
  });
  it("the first observation of 'ok' is remembered silently", async () => { const k = `${KEY}-a`; expect((await claim("ok", 60, k)).claimed).toBe(false); expect((await claim("ok", 60, k)).claimed).toBe(false); });
  it("a change is announced; the same problem is not repeated until the repeat window passes", async () => {
    const k = `${KEY}-b`;
    expect((await claim("expiring", 60, k)).claimed).toBe(true);
    expect((await claim("expiring", 60, k)).claimed).toBe(false);                          // the 15-minute cron does not nag
    await admin.from("operator_alerts").update({ last_sent_at: new Date(Date.now() - 61 * 60_000).toISOString() }).eq("key", k);
    expect((await claim("expiring", 60, k)).claimed).toBe(true);                           // reminder after the window
    expect((await claim("expired", 60, k)).claimed).toBe(true);                            // escalation is immediate
    expect((await claim("expired", 60, k)).claimed).toBe(false);
    expect((await claim("ok", 60, k)).claimed).toBe(true);                                 // recovery is announced once
    expect((await claim("ok", 60, k)).claimed).toBe(false);
    expect((await admin.from("operator_alerts").select("send_count").eq("key", k).single()).data!.send_count).toBe(4);
  });
  it("concurrent cron runs: exactly one wins", async () => {
    const k = `${KEY}-c`;
    const results = await Promise.all(Array.from({ length: 12 }, () => claim("expired", 60, k)));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
  });
  it("a failed delivery can be reverted so the next run retries", async () => {
    const k = `${KEY}-d`;
    const first = await claim("expired", 360, k); expect(first.claimed).toBe(true);
    await admin.rpc("revert_operator_alert", { p_key: k, p_prev: first.prev });
    expect((await claim("expired", 360, k)).claimed).toBe(true);                           // retried right away
    const second = await claim("ok", 360, k); expect(second.claimed).toBe(true);
    await admin.rpc("revert_operator_alert", { p_key: k, p_prev: second.prev });           // restores 'expired' with its previous timestamp
    expect((await admin.from("operator_alerts").select("state").eq("key", k).single()).data!.state).toBe("expired");
    expect((await claim("expired", 360, k)).claimed).toBe(false);
  });
  it("rejects a non-positive repeat interval", async () => expect((await admin.rpc("claim_operator_alert", { p_key: `${KEY}-e`, p_state: "expired", p_repeat_minutes: 0 })).error).not.toBeNull());
});

describe("runFxAlert (cron path) against a real webhook receiver", () => {
  let server: Server, hookUrl = ""; let received: { text: string; content: string }[] = []; let respond = 200;
  let parked: Record<string, unknown>[] = []; let captured = false;
  const env = () => ({ ADMIN_ALERT_WEBHOOK_URL: hookUrl, FX_MAX_AGE_HOURS: "168", FX_WARN_HOURS: "24" });
  const setRate = async (hours: number | null) => { await admin.from("fx_rates").delete().not("id", "is", null); if (hours !== null) await admin.from("fx_rates").insert({ rate: "4000", source: "fx-alert test", effective_at: hoursAgo(hours) }); };

  beforeAll(async () => {
    server = createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { if (respond === 200) received.push(JSON.parse(b)); res.statusCode = respond; res.end("x"); }); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r)); hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/alert`;
  });
  afterAll(async () => { server.close(); await admin.from("fx_rates").delete().not("id", "is", null); if (parked.length) await admin.from("fx_rates").insert(parked as never[]); await admin.from("operator_alerts").delete().eq("key", "fx_rate"); });
  beforeEach(async () => {
    if (!captured) { parked = (await admin.from("fx_rates").select("*")).data ?? []; captured = true; }
    received = []; respond = 200; await admin.from("operator_alerts").delete().eq("key", "fx_rate");
  });

  it("does nothing when Wompi is not configured", async () => { await setRate(167); expect(await runFxAlert(admin, env(), false)).toMatchObject({ state: "disabled", sent: false }); expect(received).toHaveLength(0); });
  it("a fresh rate stays quiet", async () => { await setRate(5); expect(await runFxAlert(admin, env(), true)).toMatchObject({ state: "ok", sent: false }); expect(received).toHaveLength(0); });

  it("warns 24 h before the limit, once, then escalates when it expires, and announces recovery", async () => {
    await setRate(168 - 20.5);                                             // half an hour of slack so the test clock cannot tip the floor()
    const a = await runFxAlert(admin, env(), true); expect(a).toMatchObject({ state: "expiring", hoursLeft: 20, sent: true });
    expect(received).toHaveLength(1); expect(received[0].text).toMatch(/vence en ~20 h/); expect(received[0].content).toBe(received[0].text);
    for (let i = 0; i < 4; i++) expect((await runFxAlert(admin, env(), true)).sent).toBe(false);          // four more cron ticks: silence
    expect(received).toHaveLength(1);

    await setRate(170);
    expect(await runFxAlert(admin, env(), true)).toMatchObject({ state: "expired", sent: true });
    expect(received).toHaveLength(2); expect(received[1].text).toMatch(/pausados/);

    await setRate(1);
    expect(await runFxAlert(admin, env(), true)).toMatchObject({ state: "ok", sent: true });
    expect(received).toHaveLength(3); expect(received[2].text).toMatch(/al día/);
    expect((await runFxAlert(admin, env(), true)).sent).toBe(false); expect(received).toHaveLength(3);
  });

  it("a missing rate is announced as well", async () => { await setRate(null); expect(await runFxAlert(admin, env(), true)).toMatchObject({ state: "missing", sent: true }); expect(received[0].text).toMatch(/No hay una tasa/); });

  it("when the receiver is down the alert is not lost: the next run delivers it", async () => {
    await setRate(170); respond = 500;
    expect(await runFxAlert(admin, env(), true)).toMatchObject({ state: "expired", sent: false, delivery: "http_error" });
    expect(received).toHaveLength(0);
    respond = 200;
    expect(await runFxAlert(admin, env(), true)).toMatchObject({ state: "expired", sent: true }); expect(received).toHaveLength(1);
  });

  it("without a webhook configured nothing is sent, nothing throws, and it is retried when one appears", async () => {
    await setRate(170);
    expect(await runFxAlert(admin, { ...env(), ADMIN_ALERT_WEBHOOK_URL: "" }, true)).toMatchObject({ sent: false, delivery: "no_webhook" });
    expect(await runFxAlert(admin, env(), true)).toMatchObject({ sent: true });
  });

  it("honors FX_WARN_HOURS", async () => {
    await setRate(168 - 40);
    expect((await runFxAlert(admin, env(), true)).state).toBe("ok");
    expect(await runFxAlert(admin, { ...env(), FX_WARN_HOURS: "48" }, true)).toMatchObject({ state: "expiring", sent: true });
  });
});
