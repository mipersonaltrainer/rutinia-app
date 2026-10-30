import { createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { admin, createWorld, login, watchCsp, type World } from "./helpers";

let w: World;
const purchases = async () => (await admin.from("slot_purchases").select("id,quantity,status,provider,unit_price_cents,total_cents,currency,charged_amount_cents,charged_currency,fx_rate,provider_reference").eq("trainer_id", w.trainerId)).data ?? [];
const aiPurchases = async () => (await admin.from("ai_credit_purchases").select("id,pack,credits,status,provider,total_cents,currency,charged_amount_cents,charged_currency,provider_reference").eq("trainer_id", w.trainerId)).data ?? [];

test.beforeAll(async () => { w = await createWorld("bill"); });
test.afterAll(async () => { await admin.from("ai_credit_purchases").delete().eq("trainer_id", w.trainerId); });

const slotForm = (p: Page) => p.locator("form", { has: p.locator("select[name=quantity]") });
const aiForm = (p: Page) => p.locator("form", { has: p.locator("input[name=pack]") });
const subForm = (p: Page) => p.locator("form", { has: p.getByRole("heading", { name: /Suscripción mensual/ }) });

const E2E_BOLD_SECRET = "bold_secret_e2e_local";      // the fake key playwright.config.ts gives the server; never read from the environment, which may hold a real one
// Bold's checkout is a script on the page, not a navigation: the server hands back signed data-* attributes and the browser never reaches the real Bold.
const stubBold = (p: Page) => p.route("https://checkout.bold.co/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
const boldButton = async (p: Page) => {
  const s = p.locator("script[data-bold-button]");
  await expect(s).toHaveCount(1, { timeout: 20_000 });
  return (await s.evaluate((el) => Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value])))) as Record<string, string>;
};
const expectSigned = (b: Record<string, string>) => expect(b["data-integrity-signature"]).toBe(createHash("sha256").update(`${b["data-order-id"]}${b["data-amount"]}COP${E2E_BOLD_SECRET}`).digest("hex"));

test.describe("compra de cupos", () => {
  test("Bold cobra en pesos con precio fijo por tramo (sin tasa de cambio), firma el monto y no activa nada hasta la verificación del servidor", async ({ page }) => {
    await admin.from("fx_rates").delete().not("id", "is", null);          // there is no exchange rate at all, and it does not matter
    const csp = watchCsp(page);
    await stubBold(page);

    await login(page, w.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
    await page.goto("/trainer/billing");
    await expect(page.getByText("Capacidad actual: 20")).toBeVisible();
    const form = slotForm(page);
    await form.locator("select[name=quantity]").selectOption("3");
    await form.getByLabel(/Bold/).check();
    const summary = form.locator("dl");
    await expect(summary.getByText("$2.400 COP")).toBeVisible();                            // 3 students: 2.400 each
    await expect(summary.getByText("$7.200 COP")).toBeVisible();                            // 3 × 2.400
    await form.getByLabel(/Confirmo la compra/).check();
    await form.getByRole("button", { name: /Confirmar y pagar con Bold/ }).click();

    const b = await boldButton(page);
    expect(b["data-currency"]).toBe("COP");
    expect(b["data-amount"]).toBe("7200");                                                   // whole pesos, as Bold takes them
    expect(b["data-order-id"]).toMatch(/^SP-/);
    expect(b["data-integrity-signature"]).toMatch(/^[0-9a-f]{64}$/); expectSigned(b);
    expect(b["data-redirection-url"]).toMatch(/\/billing\/bold\/return$/);
    expect(JSON.stringify(b)).not.toContain(E2E_BOLD_SECRET);   // the secret never reaches the page

    // The pending purchase is priced in pesos; capacity is NOT granted by the redirect.
    const rows = await purchases(); expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 3, status: "pending", provider: "bold", currency: "COP", unit_price_cents: 240000, total_cents: 720000, charged_amount_cents: 720000, charged_currency: "COP", fx_rate: null });
    expect(rows[0].provider_reference).toBe(b["data-order-id"]);

    // Coming back from the provider without a verified payment (the "return" is only a redirect) grants nothing.
    await page.goto("/billing/bold/return?bold-order-id=SP-inexistente&bold-tx-status=approved");
    await expect(page).toHaveURL(/\/trainer\/billing\?pago=/);
    await expect(page.getByText("Capacidad actual: 20")).toBeVisible();
    expect((await purchases())[0].status).toBe("pending");
    expect(csp).toEqual([]);
  });

  test("buying 10 at once is the cheapest tier: 2.000 each, 20.000 in total", async ({ page }) => {
    await login(page, w.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
    await page.goto("/trainer/billing");
    const form = slotForm(page);
    await form.locator("select[name=quantity]").selectOption("10"); await form.getByLabel(/Bold/).check();
    await expect(form.locator("dl").getByText("$20.000 COP")).toBeVisible(); await expect(form.locator("dl").getByText("$2.000 COP")).toBeVisible();
  });

  test("la cantidad se limita a 1–10 en el servidor aunque se manipule el formulario", async ({ page }) => {
    const before = (await purchases()).length;
    await login(page, w.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
    await page.goto("/trainer/billing");
    const form = slotForm(page);
    await form.getByLabel(/Bold/).check(); await form.getByLabel(/Confirmo la compra/).check();
    // Tamper last and without dispatching events: React keeps its own state (5) but the DOM, which is what gets submitted, says 99.
    await form.locator("select[name=quantity]").evaluate((s: HTMLSelectElement) => { s.add(new Option("99 cupos", "99")); s.value = "99"; });
    await form.getByRole("button", { name: /Confirmar y pagar con Bold/ }).click();
    await expect(form.getByRole("alert")).toContainText("1 y 10");
    expect(await purchases()).toHaveLength(before);
  });
});

test.describe("suscripción y paquetes de IA en pesos", () => {
  test("la suscripción muestra 40.000 COP con Bold y 10 USD con PayPal, y Bold cobra exactamente 40.000", async ({ page }) => {
    await stubBold(page);
    await login(page, w.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
    await page.goto("/trainer/billing");
    await expect(page.getByRole("heading", { name: /\$40\.000 COP al mes/ })).toBeVisible();
    await expect(page.getByText("$10.00 USD").first()).toBeVisible();
    const form = subForm(page); await form.getByRole("radio", { name: /Bold/ }).check(); await form.getByRole("checkbox", { name: /Entiendo que este pago cubre 1 mes/ }).check();
    await form.getByRole("button", { name: /Pagar 1 mes con Bold/ }).click();
    const b = await boldButton(page);
    expect(b["data-amount"]).toBe("40000"); expect(b["data-currency"]).toBe("COP"); expect(b["data-order-id"]).toMatch(/^SUB-/); expectSigned(b);
    const { data } = await admin.from("subscription_payments").select("amount_usd_cents,charged_amount_cents,charged_currency,status,fx_rate").eq("trainer_id", w.trainerId).eq("provider_reference", b["data-order-id"]).single();
    expect(data).toEqual({ amount_usd_cents: null, charged_amount_cents: 4000000, charged_currency: "COP", status: "pending", fx_rate: null });
  });

  test("los paquetes de IA: 20 por 25.000 y 100 por 100.000 pesos; el pago queda pendiente hasta que el servidor lo verifica", async ({ page }) => {
    await stubBold(page);
    await login(page, w.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
    await page.goto("/trainer/billing");
    const form = aiForm(page);
    await expect(form.getByText("20 borradores — $25.000 COP")).toBeVisible(); await expect(form.getByText("100 borradores — $100.000 COP")).toBeVisible();
    await form.getByRole("radio", { name: /100 borradores/ }).check(); await form.getByRole("radio", { name: /Bold/ }).check(); await form.getByRole("checkbox", { name: /Confirmo la compra/ }).check();
    await form.getByRole("button", { name: /Confirmar y pagar con Bold/ }).click();
    const b = await boldButton(page);
    expect(b["data-amount"]).toBe("100000"); expect(b["data-order-id"]).toMatch(/^AC-/); expectSigned(b);
    const rows = await aiPurchases(); expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pack: "p100", credits: 100, status: "pending", provider: "bold", currency: "COP", total_cents: 10000000, charged_amount_cents: 10000000, charged_currency: "COP" });
    expect((await admin.rpc("ai_credit_state", { p_trainer: w.trainerId })).data).toMatchObject({ paid_left: 0 });          // nothing is granted by starting a payment
  });
});
