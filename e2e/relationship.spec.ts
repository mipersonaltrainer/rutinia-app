import { test, expect } from "@playwright/test";
import { admin, createWorld, login, type World } from "./helpers";

let w: World;
test.beforeAll(async () => { w = await createWorld("rel"); });

test("el alumno termina la relación: el entrenador pierde el acceso y no puede reactivarla; archivar y reactivar sí funcionan mientras el alumno no decida", async ({ browser }) => {
  const tctx = await browser.newContext(), cctx = await browser.newContext(); const tp = await tctx.newPage(), cp = await cctx.newPage();
  await login(tp, w.trainerEmail); await login(cp, w.clientEmail);

  // The trainer archives and reactivates through the normal screen (a database function now, not a direct write)
  await tp.goto("/trainer/clients");
  await tp.getByRole("button", { name: "Archivar" }).click(); await expect(tp.getByRole("button", { name: "Reactivar" })).toBeVisible();
  await tp.getByRole("button", { name: "Reactivar" }).click(); await expect(tp.getByRole("button", { name: "Archivar" })).toBeVisible();

  // The client ends it from Privacy
  await cp.goto("/client/privacy");
  await cp.getByRole("button", { name: "Terminar la relación con mi entrenador" }).click(); await expect(cp.getByText("Marca la casilla para confirmar.")).toBeVisible();
  await cp.getByLabel("Entiendo y quiero terminarla").check(); await cp.getByRole("button", { name: "Terminar la relación con mi entrenador" }).click();
  await expect(cp.getByText(/Terminaste la relación/)).toBeVisible();
  const { data } = await admin.from("trainer_client_relationships").select("status,archived_by").eq("trainer_id", w.trainerId).eq("client_id", w.clientId).single(); expect(data).toEqual({ status: "archived", archived_by: "client" });

  // The trainer cannot undo it, and is told why
  await tp.goto("/trainer/clients"); await tp.getByRole("button", { name: "Reactivar" }).click();
  await expect(tp.getByText(/terminó la relación contigo y no puedes reactivarla/)).toBeVisible();
  expect((await admin.from("trainer_client_relationships").select("status").eq("trainer_id", w.trainerId).eq("client_id", w.clientId).single()).data!.status).toBe("archived");
});
