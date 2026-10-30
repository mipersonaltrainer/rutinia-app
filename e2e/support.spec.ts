import { test, expect } from "@playwright/test";
import { admin, createWorld, login, PASSWORD, watchCsp, type World } from "./helpers";

let w: World; let staffEmail: string; let staffId: string;
test.beforeAll(async () => {
  w = await createWorld("sup");
  staffEmail = `e2e-sup-staff-${Date.now()}@x.co`;
  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Equipo Rutinia" } });
  if (error) throw error; staffId = data.user.id;
  await admin.from("profiles").update({ full_name: "Equipo Rutinia" }).eq("id", staffId);
  const ins = await admin.rpc("make_support_staff", { p_user: staffId }); if (ins.error) throw ins.error;      // a support account: no trial, own panel
});
test.afterAll(async () => { await admin.from("support_staff").delete().eq("user_id", staffId); });

test.describe("soporte", () => {
  test("el entrenador ve el correo de soporte, abre una conversación y queda registrada sin activar nada más", async ({ page }) => {
    const csp = watchCsp(page);
    await login(page, w.trainerEmail); await page.goto("/trainer/support");
    await expect(page.getByRole("heading", { name: "Soporte", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "support@rutinia.company" })).toHaveAttribute("href", /^mailto:support@rutinia\.company/);
    const form = page.locator("form", { has: page.getByRole("heading", { name: "Nueva consulta" }) });
    await form.getByLabel("¿Sobre qué es?").selectOption("pago");
    await form.getByLabel("Asunto").fill("Pagué un cupo y no se activó");
    await form.getByLabel("Cuéntanos qué pasa").fill("Hola, pagué ayer 2.500 COP y mi capacidad sigue en 20.");
    await form.getByRole("button", { name: "Enviar a soporte" }).click();
    await expect(page).toHaveURL(/\/trainer\/support\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Pagué un cupo y no se activó" })).toBeVisible();
    await expect(page.getByLabel("Mensajes de la conversación").getByText("mi capacidad sigue en 20")).toBeVisible();
    const { data } = await admin.from("support_threads").select("category,status,staff_unread").eq("trainer_id", w.trainerId).single();
    expect(data).toEqual({ category: "pago", status: "open", staff_unread: 1 });
    expect(csp).toEqual([]);
  });

  test("con el espacio de trabajo bloqueado (suscripción vencida) el soporte sigue accesible", async ({ page }) => {
    await admin.from("trainer_subscriptions").update({ status: "payment_required" }).eq("trainer_id", w.trainerId);
    await login(page, w.trainerEmail);
    await page.goto("/trainer/support"); await expect(page).toHaveURL(/\/trainer\/support$/);
    await expect(page.getByRole("heading", { name: "Tus conversaciones" })).toBeVisible();
    await page.goto("/trainer/clients"); await expect(page).toHaveURL(/\/trainer\/billing/);          // everything else still redirects to billing
    await admin.from("trainer_subscriptions").update({ status: "trialing" }).eq("trainer_id", w.trainerId);
  });

  test("el equipo responde desde la bandeja y el entrenador ve la respuesta; un entrenador común no entra a /staff", async ({ browser }) => {
    const staffCtx = await browser.newContext(); const staff = await staffCtx.newPage();
    await login(staff, staffEmail);
    await expect(staff).toHaveURL(/\/staff$/);                                                            // a support account lands in its own panel
    await staff.getByRole("link", { name: /^Soporte/ }).click();
    await expect(staff.getByRole("heading", { name: "Soporte", level: 1 })).toBeVisible();
    await expect(staff).toHaveTitle(/^\(1\) /);                                                              // the tab title counts the conversations waiting for an answer (it drops once she opens it)
    await expect(staff.getByText(/Esperando (ahora|hace)/).first()).toBeVisible();                                 // the inbox says how long each open conversation has waited
    await staff.getByRole("link", { name: "Pagué un cupo y no se activó" }).click();
    await expect(staff.getByLabel("Mensajes de la conversación").getByText("mi capacidad sigue en 20")).toBeVisible();
    await expect(staff.getByText(w.trainerEmail)).toBeVisible();                                          // context for the team: who is writing
    await staff.getByLabel("Respuesta").fill("Hola, ya lo revisamos: tu pago quedó aprobado y activamos el cupo.");
    await staff.getByRole("button", { name: "Responder" }).click();
    await expect(staff.getByLabel("Mensajes de la conversación").getByText("activamos el cupo")).toBeVisible();
    expect((await admin.from("support_threads").select("status,trainer_unread,staff_unread").eq("trainer_id", w.trainerId).single()).data).toEqual({ status: "answered", trainer_unread: 1, staff_unread: 0 });
    const trace = (await admin.from("staff_access_log").select("action,target_user").eq("actor_id", staffId)).data ?? [];       // every look and reply is on record
    expect(trace.map((r) => r.action)).toEqual(expect.arrayContaining(["view_thread", "reply_thread"]));
    expect(trace.find((r) => r.action === "view_thread")?.target_user).toBe(w.trainerId);
    await staffCtx.close();

    const trainerCtx = await browser.newContext(); const page = await trainerCtx.newPage();
    await login(page, w.trainerEmail);
    await expect(page.getByRole("link", { name: /^Soporte\s*1$/ })).toBeVisible();                       // unread badge in the navigation
    await page.goto("/trainer/support"); await expect(page.getByText("1 nuevo")).toBeVisible();
    await page.getByRole("link", { name: /Pagué un cupo y no se activó/ }).click();
    await expect(page.getByLabel("Mensajes de la conversación").getByText("activamos el cupo")).toBeVisible();
    await expect(page.getByLabel("Mensajes de la conversación").getByText("Equipo de Rutinia")).toBeVisible();
    await page.getByRole("button", { name: "Marcar como resuelta" }).click();
    await expect(page.getByText(/Cerrada/)).toBeVisible();
    await page.goto("/staff"); await expect(page).toHaveURL(/\/trainer$/);                                  // not on the team: sent to their own home
    await page.goto("/staff/soporte"); await expect(page).toHaveURL(/\/trainer$/);
    await trainerCtx.close();
  });
});
