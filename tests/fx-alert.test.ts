import { describe, it, expect, vi } from "vitest";
import { fxWarnHours, fxAlertEvaluation, DEFAULT_FX_WARN_HOURS } from "@/lib/billing/fx";
import { parseAlertUrl, postAlert } from "@/lib/ops/alerts";
import { checkEnv } from "@/lib/env";

const NOW = new Date("2026-10-20T12:00:00Z");
const ago = (h: number) => ({ effective_at: new Date(NOW.getTime() - h * 3_600_000).toISOString() });

describe("fxWarnHours", () => {
  it("defaults to 24 h", () => { expect(DEFAULT_FX_WARN_HOURS).toBe(24); expect(fxWarnHours(undefined, 168)).toBe(24); expect(fxWarnHours("", 168)).toBe(24); });
  it("accepts a whole number of hours", () => { expect(fxWarnHours("48", 168)).toBe(48); expect(fxWarnHours(" 6 ", 168)).toBe(6); });
  it("garbage or zero falls back to the default instead of silencing the warning", () => { for (const bad of ["abc", "0", "-3", "1.5", "NaN", "1e2"]) expect([bad, fxWarnHours(bad, 168)]).toEqual([bad, 24]); });
  it("can never reach the limit itself (the warning must come before the pause)", () => { expect(fxWarnHours("500", 168)).toBe(167); expect(fxWarnHours(undefined, 12)).toBe(11); expect(fxWarnHours("5", 1)).toBe(1); });
});

describe("fxAlertEvaluation", () => {
  const ev = (hoursOld: number, max = 168, warn = 24) => fxAlertEvaluation(ago(hoursOld), NOW, max, warn);
  it("a young rate says nothing", () => expect(ev(10)).toMatchObject({ state: "ok", message: null }));
  it("boundary: exactly warn hours before the limit starts the warning, one hour earlier does not", () => {
    expect(ev(168 - 25).state).toBe("ok");
    expect(ev(168 - 24)).toMatchObject({ state: "expiring", hoursLeft: 24 });
  });
  it("counts the hours left and names the limit and the command to fix it", () => {
    const e = ev(168 - 5); expect(e).toMatchObject({ state: "expiring", hoursLeft: 5 });
    expect(e.message).toMatch(/~5 h/); expect(e.message).toMatch(/168 h/); expect(e.message).toMatch(/set-fx-rate\.mjs/);
  });
  it("at the limit it is still usable (about to pause); one millisecond past it is expired", () => {
    expect(ev(168)).toMatchObject({ state: "expiring", hoursLeft: 0 });
    const past = fxAlertEvaluation({ effective_at: new Date(NOW.getTime() - 168 * 3_600_000 - 1).toISOString() }, NOW, 168, 24);
    expect(past).toMatchObject({ state: "expired", hoursLeft: 0 }); expect(past.message).toMatch(/pausados/);
  });
  it("missing and future-dated rates are alerts too", () => {
    expect(fxAlertEvaluation(null, NOW, 168, 24)).toMatchObject({ state: "missing" });
    expect(fxAlertEvaluation({ effective_at: new Date(NOW.getTime() + 3_600_000).toISOString() }, NOW, 168, 24)).toMatchObject({ state: "future" });
  });
  it("messages never contain secrets or personal data", () => { for (const h of [150, 200]) expect(ev(h).message).not.toMatch(/@|sb_|key|secret|password/i); });
});

describe("parseAlertUrl", () => {
  it("accepts https and loopback http", () => { expect(parseAlertUrl("https://hooks.example.com/x")?.host).toBe("hooks.example.com"); expect(parseAlertUrl("http://127.0.0.1:4010/a")?.port).toBe("4010"); expect(parseAlertUrl("http://localhost:1/a")).not.toBeNull(); });
  it("rejects plain http to the internet, credentials, other schemes, and junk", () => {
    for (const bad of ["http://hooks.example.com/x", "https://user:pw@hooks.example.com/x", "ftp://hooks.example.com", "javascript:alert(1)", "not a url", "", "  ", undefined, null]) expect([bad, parseAlertUrl(bad as string)]).toEqual([bad, null]);
  });
});

describe("postAlert", () => {
  const url = new URL("https://hooks.example.com/x");
  it("posts JSON with the text under text and content", async () => {
    const f = vi.fn(async () => new Response("ok", { status: 200 }));
    expect(await postAlert(url, "hola", { fetchImpl: f as unknown as typeof fetch })).toEqual({ ok: true });
    const [u, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(u)).toBe(url.href); expect(init.method).toBe("POST"); expect(JSON.parse(init.body as string)).toEqual({ text: "hola", content: "hola" });
    expect(init.redirect).toBe("error");                                            // a webhook must not bounce us elsewhere
  });
  it("no webhook → reports it without calling anything", async () => { const f = vi.fn(); expect(await postAlert(null, "x", { fetchImpl: f as unknown as typeof fetch })).toEqual({ ok: false, reason: "no_webhook" }); expect(f).not.toHaveBeenCalled(); });
  it("maps HTTP errors, network failures and timeouts to reasons (no throw)", async () => {
    expect(await postAlert(url, "x", { fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch })).toEqual({ ok: false, reason: "http_error", status: 500 });
    expect(await postAlert(url, "x", { fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch })).toEqual({ ok: false, reason: "network_error" });
    const slow = ((_u: unknown, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch;
    expect(await postAlert(url, "x", { fetchImpl: slow, timeoutMs: 20 })).toEqual({ ok: false, reason: "timeout" });
  });
});

describe("env check for the operator webhook", () => {
  const BASE = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_real", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_real", APPLICATION_BASE_URL: "https://app.rutinia.co", CRON_SECRET: "k3j2h4g5f6d7s8a9p0o1i2u3y4t5r6e7w8q9", WOMPI_ENVIRONMENT: "production", WOMPI_PUBLIC_KEY: "pub_prod_abc", WOMPI_PRIVATE_KEY: "prv_prod_abc", WOMPI_EVENTS_SECRET: "prod_events_abc", WOMPI_INTEGRITY_SECRET: "prod_integrity_abc" };
  it("Wompi without a webhook warns that nobody will be told, but only when the rate is being watched (pesos are fixed prices now)", () => {
    expect(checkEnv({ ...BASE, FX_MONITORING: "on" }).warnings.join()).toMatch(/ADMIN_ALERT_WEBHOOK_URL no está configurada/);
    expect(checkEnv(BASE).warnings.join()).not.toMatch(/ADMIN_ALERT_WEBHOOK_URL/);
  });
  it("a valid https webhook is silent", () => expect(checkEnv({ ...BASE, ADMIN_ALERT_WEBHOOK_URL: "https://hooks.example.com/x" })).toEqual({ errors: [], warnings: [] }));
  it("an insecure or malformed webhook stops production from starting (alerts would silently go nowhere)", () => {
    expect(checkEnv({ ...BASE, ADMIN_ALERT_WEBHOOK_URL: "http://hooks.example.com/x" }).errors.join()).toMatch(/ADMIN_ALERT_WEBHOOK_URL debe ser https/);
    expect(checkEnv({ ...BASE, ADMIN_ALERT_WEBHOOK_URL: "https://u:p@hooks.example.com/x" }).errors.join()).toMatch(/ADMIN_ALERT_WEBHOOK_URL/);
  });
  it("without Wompi there is nothing to warn about", () => expect(checkEnv({ ...BASE, WOMPI_PUBLIC_KEY: "", WOMPI_PRIVATE_KEY: "", WOMPI_EVENTS_SECRET: "", WOMPI_INTEGRITY_SECRET: "", PAYPAL_CLIENT_ID: "abc", PAYPAL_CLIENT_SECRET: "def", PAYPAL_WEBHOOK_ID: "ghi", PAYPAL_PLAN_ID: "plan", PAYPAL_ENVIRONMENT: "production" }).warnings.join()).not.toMatch(/ADMIN_ALERT/));
  it("a garbage FX_WARN_HOURS warns", () => expect(checkEnv({ ...BASE, ADMIN_ALERT_WEBHOOK_URL: "https://hooks.example.com/x", FX_WARN_HOURS: "soon" }).warnings.join()).toMatch(/FX_WARN_HOURS/));
});
