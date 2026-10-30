import { test, expect } from "@playwright/test";
import { admin, createWorld, login, watchCsp, type World } from "./helpers";

let w: World;
test.beforeAll(async () => {
  w = await createWorld("nut");
  // the world's client needs a submitted assessment for the energy card; a minimal valid one
  await admin.from("assessments").insert({ client_id: w.clientId, status: "submitted", risk_level: "none", risk_reasons: [], submitted_at: new Date().toISOString(), data: {
    personal: { birthDate: "1990-04-02", sexForFormulas: "male", occupation: "", workType: "sedentary", sittingHours: 6, activityLevel: "light", sleepQuality: 4, stress: 3 },
    training: { experienceYears: 2, weeklyFrequency: 3, sessionMinutes: 60, location: "gym", equipment: "", avoidExercises: "" }, goals: { goals: ["fat_loss"], timeframe: "", motivation: "" },
    health: { chestPainDuringExercise: false, dizzinessOrFainting: false, unusualBreathlessness: false, cardiovascularHistory: false, medicalRestriction: false, medicalClearance: true, pregnancyStatus: "not_applicable", eatingDisorderHistory: false, currentPain: 0, injuries: "", surgeries: "", conditions: "", medications: "" },
    habits: { sleepHours: 7, recovery: 4, barriers: "" } } });
  await admin.from("anthropometric_measurements").insert({ client_id: w.clientId, entered_by: w.clientId, taken_by: "self", method: "scale", measured_on: new Date().toISOString().slice(0, 10), weight_kg: 82, height_cm: 178, waist_cm: 90, neck_cm: 38 });
});

test("el entrenador activa nutrición, arma un plan con medidas caseras y gramos, lo publica y el alumno lo ve; sin activar no existe", async ({ browser }) => {
  const tctx = await browser.newContext(), cctx = await browser.newContext(); const tp = await tctx.newPage(), cp = await cctx.newPage(); const csp = watchCsp(tp);
  await login(cp, w.clientEmail); await expect(cp).toHaveURL(/\/client$/);
  // 1. Not agreed: no menu entry, and the page itself is a 404
  await expect(cp.getByRole("link", { name: "Nutrición" })).toHaveCount(0);
  expect((await cp.goto("/client/nutrition"))!.status()).toBe(404);

  // 2. The trainer sees the automatic estimate and switches the section on
  await login(tp, w.trainerEmail); await tp.goto(`/trainer/clients/${w.clientId}/nutrition`);
  await expect(tp.getByText("US Navy")).toBeVisible(); await expect(tp.getByText(/Objetivo según su meta/)).toBeVisible(); await expect(tp.getByText("Pérdida de grasa")).toBeVisible();
  await tp.getByRole("button", { name: "Activar nutrición para este alumno" }).click();
  await expect(tp.getByRole("button", { name: "Desactivar nutrición" })).toBeVisible();

  // 3. Create the plan (3 empty meals, targets pre-filled) and add foods in household measures and in grams
  await tp.getByRole("button", { name: "Crear plan en blanco" }).click(); await expect(tp).toHaveURL(/\/nutrition\/[0-9a-f-]{36}$/);
  const add = async (meal: number, food: string, unit: string, qty: string, shows: RegExp) => {
    const form = tp.locator("form").filter({ has: tp.locator('select[name="foodId"]') }).nth(meal);
    await form.getByLabel("Buscar alimento").fill(food); await form.locator('select[name="unit"]').selectOption(unit); await form.locator('input[name="qty"]').fill(qty);
    await form.getByRole("button", { name: "Añadir alimento" }).click(); await expect(tp.getByText(shows)).toBeVisible();   // wait for the saved item itself, not for a status message
  };
  await add(0, "Huevo entero", "unidad", "2", /2 unidades · 100 g/); await add(1, "Arroz blanco", "cucharon", "2", /2 cucharones · 180 g/); await add(1, "Pechuga", "g", "150", /150 g/); await add(1, "Aceite de oliva", "cucharada", "1", /1 cucharada · 13,5 ml/);
  await expect(tp.getByText(/frente al objetivo calórico/)).toBeVisible();
  await tp.getByRole("button", { name: "Publicar para el alumno" }).click(); await expect(tp.getByText(/Publicado: el alumno lo ve/)).toBeVisible();

  // 4. The client now has the section, with the household amount AND the exact weight
  await cp.goto("/client"); await expect(cp.getByRole("link", { name: "Nutrición" })).toBeVisible();
  await cp.goto("/client/nutrition");
  await expect(cp.getByRole("heading", { name: "Mi nutrición" })).toBeVisible(); await expect(cp.getByText(/2 cucharones · 180 g/)).toBeVisible(); await expect(cp.getByText(/Pechuga de pollo/)).toBeVisible();
  await expect(cp.getByText(/frente al objetivo calórico/)).toHaveCount(0);          // the target-deviation hint is for the trainer only

  // 5. Switching it off removes it again, at once
  await tp.goto(`/trainer/clients/${w.clientId}/nutrition`); await tp.getByRole("button", { name: "Desactivar nutrición" }).click(); await expect(tp.getByRole("button", { name: "Activar nutrición para este alumno" })).toBeVisible();
  expect((await cp.goto("/client/nutrition"))!.status()).toBe(404);
  expect(csp, "violaciones de CSP").toEqual([]);
});

test("el buscador de ejercicios ofrece salida cuando los filtros no dan resultados y distingue plano, inclinado y declinado", async ({ browser }) => {
  const ctx = await browser.newContext(); const p = await ctx.newPage(); await login(p, w.trainerEmail);
  // the real case: too many filters together
  await p.goto("/trainer/exercises?q=press&muscle=chest&equipment=machine&level=advanced&pattern=push_horizontal");
  await expect(p.getByText(/Con todos los filtros a la vez no hay ejercicios/)).toBeVisible();
  await expect(p.getByRole("link", { name: /Quitar «Dificultad: Avanzado»/ })).toBeVisible(); await expect(p.getByText(/Resultados parecidos/)).toBeVisible();
  await p.getByRole("link", { name: /Quitar «Dificultad: Avanzado»/ }).click(); await expect(p.getByText(/ejercicios · página 1/)).toBeVisible();
  // minimal queries find plenty
  await p.goto("/trainer/exercises?q=biceps"); await expect(p.getByRole("link", { name: /curl/i }).first()).toBeVisible();
  // bench angle
  for (const [angle, label] of [["incline", "Inclinado"], ["decline", "Declinado"], ["flat", "Plano"]] as const) {
    await p.goto(`/trainer/exercises?q=press&angle=${angle}`); await expect(p.getByText(new RegExp(`· ${label}`)).first()).toBeVisible();
  }
});
