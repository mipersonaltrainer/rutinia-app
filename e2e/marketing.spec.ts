import { test, expect } from "@playwright/test";
import { admin, createWorld, login, PASSWORD, type World } from "./helpers";

let w: World; let staffEmail: string; let staffId: string;
const colombiaToday = () => { const l = new Date(Date.now() - 5 * 3600_000); return { y: l.getUTCFullYear(), md: `${String(l.getUTCMonth() + 1).padStart(2, "0")}-${String(l.getUTCDate()).padStart(2, "0")}` }; };

test.beforeAll(async () => {
  w = await createWorld("mkt");
  staffEmail = `e2e-mkt-staff-${Date.now()}@x.co`;
  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Marketing E2E" } });
  if (error) throw error; staffId = data.user.id;
  const c = await admin.rpc("make_support_staff", { p_user: staffId }); if (c.error) throw c.error;
});
test.afterAll(async () => { await admin.rpc("remove_support_staff", { p_user: staffId }); });

test.describe("marketing", () => {
  test("el equipo crea un comunicado, ve la vista previa y el alcance, lo envía y el entrenador lo recibe en su campana", async ({ browser }) => {
    const sctx = await browser.newContext(); const staff = await sctx.newPage(); await login(staff, staffEmail);
    await staff.getByRole("link", { name: "Marketing", exact: true }).click(); await expect(staff).toHaveURL(/\/staff\/marketing$/);
    await expect(staff.getByText("Listo para enviar").first()).toBeVisible();                                      // the in-app channel is always available
    await staff.getByRole("link", { name: /Nueva campaña/ }).click();
    await staff.getByLabel("Título (máx. 80)").fill("Mantenimiento esta noche");
    await staff.getByLabel(/Mensaje \(máx\. 600\)/).fill("Hola {nombre}, esta noche hacemos mantenimiento de 11 a 11:30 p. m.");
    await staff.getByLabel("Enlace (opcional)").fill("/trainer/support");
    await staff.getByLabel("¿A quién se envía?").selectOption("uno");
    await staff.getByLabel(/Si elegiste «Un entrenador»/).fill(w.trainerEmail);
    await expect(staff.getByLabel(/Push al celular/)).toBeDisabled();                                              // not configured in this environment: offered but disabled, with the reason
    await staff.getByRole("button", { name: "Guardar borrador y ver vista previa" }).click();
    await expect(staff).toHaveURL(/\/staff\/marketing\/[0-9a-f-]{36}$/);
    await expect(staff.getByText("Hola Camila, esta noche hacemos mantenimiento")).toBeVisible();                  // preview personalised with a sample first name
    await expect(staff.getByText("A cuántas personas llegaría")).toBeVisible();
    await staff.getByRole("button", { name: "Enviar ahora" }).click();
    await expect(staff.getByText("Marca la casilla para confirmar el envío.")).toBeVisible();                      // nothing goes out without the confirmation
    await staff.getByLabel(/Confirmo que se enviará a 1 persona/).check(); await staff.getByRole("button", { name: "Enviar ahora" }).click();
    await expect(staff.getByRole("heading", { name: "Resultado" })).toBeVisible();
    await expect(staff.getByText("Notificaciones en la plataforma")).toBeVisible();
    await sctx.close();

    const tctx = await browser.newContext(); const page = await tctx.newPage(); await login(page, w.trainerEmail);
    await page.goto("/trainer/notifications");
    await expect(page.getByText("Mantenimiento esta noche")).toBeVisible();
    await expect(page.getByText(/Hola Entrenadora, esta noche hacemos mantenimiento/)).toBeVisible();              // first name only
    await tctx.close();
  });

  test("el entrenador guarda su fecha de nacimiento y sus preferencias en Mi cuenta", async ({ page }) => {
    await login(page, w.trainerEmail); await page.goto("/trainer/account");
    await page.getByLabel("Fecha de nacimiento (opcional)").fill("1990-05-10");
    await page.getByLabel("Recibir novedades por correo").uncheck();
    await page.getByRole("button", { name: "Guardar preferencias" }).click(); await expect(page.getByText("Preferencias guardadas")).toBeVisible();
    expect((await admin.from("profiles").select("birth_date,marketing_email,marketing_in_app").eq("id", w.trainerId).single()).data).toEqual({ birth_date: "1990-05-10", marketing_email: false, marketing_in_app: true });
    await page.getByLabel("Fecha de nacimiento (opcional)").fill("2999-01-01"); await page.getByRole("button", { name: "Guardar preferencias" }).click();
    await expect(page.getByText("Revisa la fecha de nacimiento.")).toBeVisible();
  });

  test("cumpleaños: el equipo ve a quien cumple hoy, lo felicita una sola vez y el entrenador recibe el saludo", async ({ browser }) => {
    const t = colombiaToday(); await admin.from("profiles").update({ birth_date: `1990-${t.md}` }).eq("id", w.trainerId);
    const sctx = await browser.newContext(); const staff = await sctx.newPage(); await login(staff, staffEmail);
    await staff.goto("/staff/marketing/cumpleanos");
    await expect(staff.getByRole("heading", { name: "Cumpleaños" })).toBeVisible();
    await expect(staff.getByText("Entrenadora mkt")).toBeVisible(); await expect(staff.getByText("Pendiente").first()).toBeVisible();
    await staff.getByLabel(/Confirmo el envío del saludo/).check(); await staff.getByRole("button", { name: /Felicitar a \d+ ahora/ }).click();
    await expect(staff.getByText(/Felicitaste a \d+ entrenador/)).toBeVisible();
    await staff.reload(); await expect(staff.getByText("Felicitado").first()).toBeVisible();
    expect((await admin.from("notifications").select("id").eq("user_id", w.trainerId).eq("dedupe_key", `bday:${t.y}`)).data).toHaveLength(1);
    await sctx.close();
    const tctx = await browser.newContext(); const page = await tctx.newPage(); await login(page, w.trainerEmail); await page.goto("/trainer/notifications");
    await expect(page.getByText("¡Feliz cumpleaños, Entrenadora! 🎂")).toBeVisible(); await tctx.close();
    await admin.from("profiles").update({ birth_date: null }).eq("id", w.trainerId);
  });

  test("un entrenador no entra al marketing del equipo", async ({ browser }) => {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); await login(page, w.trainerEmail);
    for (const p of ["/staff/marketing", "/staff/marketing/nueva", "/staff/marketing/cumpleanos", "/staff/ventas"]) { await page.goto(p); await expect(page, p).toHaveURL(/\/trainer$/); }
    await ctx.close();
  });
});
