import { test, expect } from "@playwright/test";
import { admin, createWorld, login, PASSWORD, type World } from "./helpers";

let w: World, other: World;
test.beforeAll(async () => { w = await createWorld("rl"); other = await createWorld("rl2"); });

test("un alumno que terminó la relación vuelve con una invitación nueva: inicia sesión, confirma los consentimientos y se vincula; otra cuenta no puede usar el enlace", async ({ browser }) => {
  // the client ended the relationship and withdrew the sharing consents (as the Privacy screen would leave things)
  await admin.from("trainer_client_relationships").update({ status: "archived", archived_by: "client" }).eq("trainer_id", w.trainerId).eq("client_id", w.clientId);
  await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", w.clientId).in("type", ["health_data", "share_with_trainer"]);

  const tctx = await browser.newContext(), cctx = await browser.newContext(), octx = await browser.newContext();
  const tp = await tctx.newPage(), cp = await cctx.newPage(), op = await octx.newPage();
  await login(tp, w.trainerEmail);
  const invite = async () => {
    await tp.goto("/trainer/clients"); await tp.getByLabel("Nombre", { exact: true }).fill("Alumno Regresa"); await tp.getByLabel("Correo").fill(w.clientEmail);
    await tp.getByRole("button", { name: "Crear invitación" }).click();
    const link = await tp.locator("input[readonly]").first().inputValue(); return new URL(link).pathname;
  };
  const path = await invite();

  // 1. signed out: they are asked to sign in (the token alone opens nothing)
  await cp.goto(path); await expect(cp.getByRole("heading", { name: "Ya tienes una cuenta" })).toBeVisible();
  await expect(cp.getByText(w.clientEmail)).toHaveCount(0);                                         // the address is masked
  await cp.getByRole("link", { name: "Iniciar sesión" }).click(); await expect(cp).toHaveURL(/\/login\?next=%2Finvite%2F/);
  await cp.getByLabel("Correo").fill(w.clientEmail); await cp.getByLabel("Contraseña").fill(PASSWORD); await cp.getByRole("button", { name: "Entrar" }).click();

  // 2. back on the invitation page, signed in as the owner: the consents must be confirmed again
  await expect(cp).toHaveURL(new RegExp(`${path}$`)); await expect(cp.getByRole("heading", { name: /Vincularte con/ })).toBeVisible();
  await cp.getByRole("button", { name: /Vincularme con/ }).click(); await expect(cp.getByText("Debes aceptar los tres consentimientos para vincularte.")).toBeVisible();
  expect((await admin.from("trainer_client_relationships").select("status").eq("trainer_id", w.trainerId).eq("client_id", w.clientId).single()).data!.status).toBe("archived");
  for (const t of ["personal_data", "health_data", "share_with_trainer"]) await cp.locator(`input[name="${t}"]`).check();
  await cp.getByRole("button", { name: /Vincularme con/ }).click(); await expect(cp).toHaveURL(/\/client$/);
  expect((await admin.from("trainer_client_relationships").select("status,archived_by").eq("trainer_id", w.trainerId).eq("client_id", w.clientId).single()).data).toEqual({ status: "active", archived_by: null });
  expect((await admin.from("consents").select("type").eq("user_id", w.clientId).is("revoked_at", null)).data!.map((c) => c.type)).toEqual(expect.arrayContaining(["health_data", "share_with_trainer", "personal_data"]));
  await tp.goto("/trainer/clients"); await expect(tp.getByText("(activo)").first()).toBeVisible();

  // 3. a different signed-in account cannot use someone else's invitation, and the used link is gone
  await admin.from("trainer_client_relationships").update({ status: "archived", archived_by: "client" }).eq("trainer_id", w.trainerId).eq("client_id", w.clientId);
  const path2 = await invite();
  await login(op, other.clientEmail); await op.goto(path2);
  await expect(op.getByRole("heading", { name: "Esta invitación es para otra cuenta" })).toBeVisible(); await expect(op.getByRole("button", { name: /Vincularme/ })).toHaveCount(0);
  await cp.goto(path); await expect(cp.getByRole("heading", { name: "Invitación no disponible" })).toBeVisible();
  await op.goto("/invite/" + "x".repeat(43)); await expect(op.getByRole("heading", { name: "Invitación no disponible" })).toBeVisible();
});
