import { test, expect } from "@playwright/test";
import { createWorld, login, watchCsp, PASSWORD, type World } from "./helpers";

let w: World;
test.beforeAll(async () => { w = await createWorld("auth"); });

test.describe("login y acceso por rol", () => {
  test("una contraseña incorrecta muestra un error y no inicia sesión", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo").fill(w.trainerEmail);
    await page.getByLabel("Contraseña").fill(PASSWORD + "-mal");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/trainer");
    await expect(page).toHaveURL(/\/login/);              // still no session
  });

  test("el entrenador entra a su panel; la CSP no registra violaciones", async ({ page }) => {
    const csp = watchCsp(page);
    await login(page, w.trainerEmail);
    await expect(page).toHaveURL(/\/trainer$/);
    await expect(page.getByRole("heading", { name: /Hola/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
    expect(csp).toEqual([]);
  });

  test("el alumno entra a su espacio y no puede abrir el del entrenador (ni al revés)", async ({ page, browser }) => {
    await login(page, w.clientEmail);
    await expect(page).toHaveURL(/\/client$/);
    await page.goto("/trainer/billing");
    await expect(page).toHaveURL(/\/client/);              // role mismatch → sent back to the client area
    const ctx = await browser.newContext(); const tp = await ctx.newPage();
    await login(tp, w.trainerEmail); await expect(tp).toHaveURL(/\/trainer$/);
    await tp.goto("/client/messages"); await expect(tp).toHaveURL(/\/trainer/);
    await ctx.close();
  });

  test("sin sesión, las áreas privadas redirigen al login y cerrar sesión revoca el acceso", async ({ page }) => {
    for (const path of ["/trainer", "/trainer/billing", "/client", "/client/messages"]) { await page.goto(path); await expect(page).toHaveURL(/\/login/); }
    await login(page, w.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login|\/$/);
    await page.goto("/trainer"); await expect(page).toHaveURL(/\/login/);
  });

  test("la salud de la app responde sin exponer detalles a un anónimo", async ({ request }) => {
    const r = await request.get("/api/health"); expect(r.status()).toBe(200); expect(await r.json()).toEqual({ ok: true });
    expect(r.headers()["cache-control"]).toBe("no-store");
  });

  test("las cabeceras de seguridad llegan con un nonce distinto en cada petición", async ({ request }) => {
    const a = (await request.get("/login")).headers()["content-security-policy"], b = (await request.get("/login")).headers()["content-security-policy"];
    const n = (s: string) => /'nonce-([^']+)'/.exec(s)?.[1];
    expect(n(a)).toBeTruthy(); expect(n(a)).not.toBe(n(b)); expect(a).toContain("frame-ancestors 'none'"); expect(a).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  });
});
