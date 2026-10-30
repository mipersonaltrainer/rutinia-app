import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { admin, createWorld, login, alerts, type World } from "./helpers";
import { E2E_ALERT_PORT, E2E_CRON_SECRET } from "../playwright.config";

// The operator alert for the USD→COP rate, end to end: real cron route, real database, a receiver standing in for Slack/Discord.
test.describe.configure({ mode: "serial" });

let w: World; let server: Server; const posts: { text: string }[] = []; let status = 200; let parked: Record<string, unknown>[] = [];
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const setRate = async (hours: number) => { await admin.from("fx_rates").delete().not("id", "is", null); await admin.from("fx_rates").insert({ rate: "4000", source: "e2e ops", effective_at: hoursAgo(hours) }); };
const SIGNAL = /aviso\(s\) de pago sin procesar|solicitud\(es\) de IA|persona\(s\) del equipo de soporte|se normalizó «signal_/;
const bearer = { Authorization: `Bearer ${E2E_CRON_SECRET}` };

test.beforeAll(async () => {
  w = await createWorld("ops");
  parked = (await admin.from("fx_rates").select("*")).data ?? [];
  await admin.from("operator_alerts").delete().eq("key", "fx_rate");
  server = createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { if (status === 200) { const m = JSON.parse(b) as { text: string }; if (!SIGNAL.test(m.text)) posts.push(m); }     // this spec is about the FX alert; the counts-only signals (stuck payments / AI / staff) share the receiver and are tested in tests/integration/signals.test.ts
    res.statusCode = status; res.end("ok"); }); });
  await new Promise<void>((r) => server.listen(E2E_ALERT_PORT, "127.0.0.1", r));
});
test.afterAll(async () => {
  server.close(); await admin.from("operator_alerts").delete().eq("key", "fx_rate");
  await admin.from("fx_rates").delete().not("id", "is", null); if (parked.length) await admin.from("fx_rates").insert(parked as never[]);
});

test("el cron exige su secreto y no avisa a nadie sin él", async ({ request }) => {
  await setRate(168 - 20.5);
  expect((await request.get("/api/cron/expire")).status()).toBe(401);
  expect((await request.get("/api/cron/expire", { headers: { Authorization: "Bearer equivocado" } })).status()).toBe(401);
  expect(posts).toHaveLength(0);
});

test("a ~20 h del límite: un solo aviso al operador, aunque el cron corra varias veces", async ({ request }) => {
  const first = await (await request.get("/api/cron/expire", { headers: bearer })).json();
  expect(first.fx_alert).toMatchObject({ state: "expiring", sent: true });
  expect(posts).toHaveLength(1);
  expect(posts[0].text).toMatch(/vence en ~20 h/);
  expect(posts[0].text).not.toMatch(/sb_|secret|@/i);
  for (let i = 0; i < 3; i++) expect((await (await request.get("/api/cron/expire", { headers: bearer })).json()).fx_alert).toMatchObject({ state: "expiring", sent: false });
  expect(posts).toHaveLength(1);
});

test("health: el anónimo no ve nada; el operador ve el estado, el tiempo restante y que hay webhook", async ({ request }) => {
  expect(await (await request.get("/api/health")).json()).toEqual({ ok: true });
  const h = await (await request.get("/api/health", { headers: bearer })).json();
  expect(h.fx).toMatchObject({ alertState: "expiring", hoursLeft: 20, maxAgeHours: 168, alertWebhookConfigured: true, state: "fresh" });
  expect(h.warnings.join()).toMatch(/vence en ~20 h/);
  expect(JSON.stringify(h)).not.toContain("127.0.0.1:3059");                                       // the webhook URL itself is never exposed
});

test("el entrenador no ve información operativa y Bold está disponible (los precios en pesos son fijos)", async ({ page }) => {
  await login(page, w.trainerEmail);
  await page.goto("/trainer/billing");
  await expect(page.getByText(/vence en|límite de 168/)).toHaveCount(0);
  const form = page.locator("form", { has: page.locator("select[name=quantity]") });
  await expect(form.getByRole("radio", { name: /Bold/ })).toBeEnabled();
  await expect(alerts(page).filter({ hasText: "tasa" })).toHaveCount(0);
});

test("al vencer: el aviso escala, los cobros en pesos se pausan y al registrar una tasa nueva se avisa la recuperación", async ({ request, page }) => {
  await setRate(170);
  const expired = await (await request.get("/api/cron/expire", { headers: bearer })).json();
  expect(expired.fx_alert).toMatchObject({ state: "expired", sent: true });
  expect(posts).toHaveLength(2); expect(posts[1].text).toMatch(/pausados/);
  const h = await (await request.get("/api/health", { headers: bearer })).json();
  expect(h.problems.join()).toMatch(/Wompi pausado/);

  await login(page, w.trainerEmail);
  await page.goto("/trainer/billing");
  const form = page.locator("form", { has: page.locator("select[name=quantity]") });
  await expect(form.getByRole("radio", { name: /Bold/ })).toBeEnabled();        // pesos are fixed prices: an expired exchange rate no longer pauses anything for the trainer
  await expect(alerts(page).filter({ hasText: "máximo permitido" })).toHaveCount(0);

  await setRate(1);
  const back = await (await request.get("/api/cron/expire", { headers: bearer })).json();
  expect(back.fx_alert).toMatchObject({ state: "ok", sent: true });
  expect(posts).toHaveLength(3); expect(posts[2].text).toMatch(/al día/);
  expect((await (await request.get("/api/cron/expire", { headers: bearer })).json()).fx_alert).toMatchObject({ sent: false });
});

test("si el receptor del aviso falla, el cron sigue respondiendo bien y reintenta en la siguiente corrida", async ({ request }) => {
  await setRate(170); status = 500;
  const res = await request.get("/api/cron/expire", { headers: bearer });
  expect(res.status()).toBe(200);                                                                  // a broken webhook must not break expiry or reminders
  const body = await res.json();
  expect(body.fx_alert).toMatchObject({ state: "expired", sent: false, delivery: "http_error" });
  expect(body).toHaveProperty("trials_expired");
  status = 200; const before = posts.length;
  expect((await (await request.get("/api/cron/expire", { headers: bearer })).json()).fx_alert).toMatchObject({ state: "expired", sent: true });
  expect(posts).toHaveLength(before + 1);
});
