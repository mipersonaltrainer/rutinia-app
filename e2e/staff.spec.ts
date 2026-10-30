import { test, expect } from "@playwright/test";
import { admin, createWorld, login, PASSWORD, type World } from "./helpers";

let w: World; let staffEmail: string; let staffId: string;
test.beforeAll(async () => {
  w = await createWorld("stf");
  staffEmail = `e2e-stf-staff-${Date.now()}@x.co`;
  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Soporte E2E" } });
  if (error) throw error; staffId = data.user.id;
  const c = await admin.rpc("make_support_staff", { p_user: staffId }); if (c.error) throw c.error;
});
test.afterAll(async () => { await admin.rpc("remove_support_staff", { p_user: staffId }); });

test.describe("panel de soporte", () => {
  test("una cuenta de soporte no tiene prueba ni suscripción, entra a su propio panel y no ve pantallas de entrenador", async ({ page }) => {
    expect((await admin.from("trainer_subscriptions").select("trainer_id").eq("trainer_id", staffId)).data).toEqual([]);   // the 7-day trial is gone
    expect((await admin.from("profiles").select("role").eq("id", staffId).single()).data).toEqual({ role: "staff" });
    await login(page, staffEmail);
    await expect(page).toHaveURL(/\/staff$/);
    await expect(page.getByText("Panel de soporte")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Hola, Soporte E2E/ })).toBeVisible();
    await expect(page.getByText(/prueba gratuita|días restantes/i)).toHaveCount(0);
    for (const path of ["/trainer", "/trainer/billing", "/client", "/trainer/support"]) { await page.goto(path); await expect(page, path).toHaveURL(/\/staff$/); }   // nothing of a trainer's workspace is reachable
    expect((await page.request.get("/api/export")).status()).toBe(403);
  });

  test("el resumen muestra el estado del sistema y las secciones del menú funcionan", async ({ page }) => {
    await login(page, staffEmail); await page.goto("/staff");
    for (const t of ["Entrenadores", "Alumnos activos", "Consultas sin responder", "Entrenadores por estado", "Pagos de los últimos 30 días", "Salud del sistema"]) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Entrenadores", exact: true }).click(); await expect(page).toHaveURL(/\/staff\/entrenadores$/);
    await page.getByLabel("Buscar por nombre o correo").fill(w.trainerEmail); await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByRole("link", { name: `Entrenadora stf` })).toBeVisible();                       // found by e-mail
    await page.getByRole("link", { name: "Entrenadora stf" }).click();
    await expect(page.getByRole("heading", { name: "Entrenadora stf" })).toBeVisible();
    await expect(page.getByText("Alumnos activos")).toBeVisible(); await expect(page.getByText("Pagos y compras")).toBeVisible();
    await page.getByRole("link", { name: "Sistema", exact: true }).click(); await expect(page).toHaveURL(/\/staff\/sistema$/);
    await expect(page.getByRole("heading", { name: "Configuración activa" })).toBeVisible();
    await expect(page.getByText("Aviso a Slack/Discord")).toBeVisible();
  });

  test("las pantallas del panel no tienen violaciones de accesibilidad y la bandeja filtra por tema", async ({ page }) => {
    await login(page, staffEmail);
    for (const path of ["/staff", "/staff/soporte", "/staff/entrenadores", "/staff/sistema"]) { await page.goto(path); await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); }
    await page.goto("/staff/soporte?estado=todas&tema=pago"); await expect(page.getByRole("link", { name: "Un pago o mi suscripción" })).toHaveAttribute("aria-current", "page");
  });

  test("un entrenador, un alumno o una visita anónima no entran al panel", async ({ browser }) => {
    const anon = await browser.newPage(); await anon.goto("/staff"); await expect(anon).toHaveURL(/\/login/); await anon.close();
    for (const email of [w.trainerEmail, w.clientEmail]) {
      const ctx = await browser.newContext(); const page = await ctx.newPage(); await login(page, email);
      await page.goto("/staff/entrenadores"); await expect(page).not.toHaveURL(/\/staff/); await ctx.close();
    }
  });
});
