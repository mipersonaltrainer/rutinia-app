import { test, expect } from "@playwright/test";
import { admin, createWorld, login, PASSWORD, type World } from "./helpers";

let w: World;
test.beforeAll(async () => { w = await createWorld("inv"); });

// The legitimate way a trainer gets a client, end to end through the real screens and server actions:
// invitation created by the trainer → link opened by the invitee → account + consents created → relationship active → the trainer sees them.
// (Relationships are no longer writable by trainers, so this proves the service-role path used by acceptInvitation still works after SEC-001.)
test("flujo legítimo: el entrenador invita, el alumno acepta, la relación queda activa y el entrenador lo ve; el enlace no se reutiliza", async ({ browser }) => {
  const email = `e2e-inv-new-${Date.now()}@x.co`;
  const tctx = await browser.newContext(), cctx = await browser.newContext(); const tp = await tctx.newPage(), cp = await cctx.newPage();
  await login(tp, w.trainerEmail); await tp.goto("/trainer/clients");
  await tp.getByLabel("Nombre", { exact: true }).fill("Invitada Sintética"); await tp.getByLabel("Correo").fill(email);
  await tp.getByRole("button", { name: "Crear invitación" }).click();
  const link = await tp.locator('input[readonly]').first().inputValue(); expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}$/);

  await cp.goto(new URL(link).pathname);
  await cp.getByLabel("Crea una contraseña").fill(PASSWORD);
  for (const t of ["personal_data", "health_data", "share_with_trainer"]) await cp.locator(`input[name="${t}"]`).check();
  await cp.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(cp).toHaveURL(/\/client$/);

  const { data: u } = await admin.from("profiles").select("id,role").eq("full_name", "Invitada Sintética").order("created_at", { ascending: false }).limit(1).single(); expect(u!.role).toBe("client");
  const { data: rel } = await admin.from("trainer_client_relationships").select("status,archived_by").eq("trainer_id", w.trainerId).eq("client_id", u!.id).single(); expect(rel).toEqual({ status: "active", archived_by: null });
  expect((await admin.from("consents").select("type").eq("user_id", u!.id).is("revoked_at", null)).data!.map((c) => c.type).sort()).toEqual(["health_data", "personal_data", "share_with_trainer"]);
  await tp.goto("/trainer/clients"); await expect(tp.getByRole("link", { name: "Invitada Sintética" })).toBeVisible();

  // single use: a used link now says so instead of offering the form again (and the claim in the database is what enforces it)
  const again = await (await browser.newContext()).newPage(); await again.goto(new URL(link).pathname);
  await expect(again.getByRole("heading", { name: "Invitación no disponible" })).toBeVisible(); await expect(again.getByRole("button", { name: "Crear mi cuenta" })).toHaveCount(0);
});
