import { test, expect, type Page } from "@playwright/test";
import { admin, alerts, createWorld, login, publishPlan, watchCsp, type World, type PlanFixture } from "./helpers";

// ───────────────────────────── Evaluación inicial ─────────────────────────────
test.describe("evaluación inicial", () => {
  let w: World;
  test.beforeAll(async () => { w = await createWorld("eval"); });

  const fillBasics = async (p: Page) => {
    await p.getByLabel("Fecha de nacimiento").fill("1990-05-15");
    await p.getByLabel("Horas sentado al día").fill("6");
  };

  test("valida en el servidor, calcula el riesgo ahí y el entrenador la ve; la reevaluación con señales de alarma exige valoración profesional", async ({ browser }) => {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); const csp = watchCsp(page);
    await login(page, w.clientEmail); await expect(page).toHaveURL(/\/client$/);
    await expect(page.getByText("Completa tu evaluación inicial")).toBeVisible();
    await page.getByRole("link", { name: "evaluación inicial" }).click();
    await expect(page.getByRole("heading", { name: "Evaluación inicial" })).toBeVisible();

    // No goal chosen: the browser lets it through (checkboxes are not required) and the server refuses.
    await fillBasics(page);
    await page.getByRole("button", { name: "Enviar evaluación" }).click();
    await expect(alerts(page)).toContainText("Elige al menos un objetivo");
    expect((await admin.from("assessments").select("id").eq("client_id", w.clientId)).data).toEqual([]);

    // Valid, with a declared injury → "review" (computed on the server).
    await page.getByLabel("Hipertrofia").check();
    await page.getByLabel("Lesiones previas o actuales").fill("Esguince de tobillo hace un año");
    await page.getByRole("button", { name: "Enviar evaluación" }).click();
    // The first submission turns the page into the read-only summary (the form unmounts), which is the confirmation.
    await expect(page.getByRole("heading", { name: "Tu evaluación" })).toBeVisible();
    await expect(page.getByText(/Enviada el/)).toBeVisible();
    const first = (await admin.from("assessments").select("kind,status,risk_level,risk_reasons,data").eq("client_id", w.clientId)).data!;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: "initial", status: "submitted", risk_level: "review" });
    expect(first[0].risk_reasons).toContain("Lesiones declaradas");
    expect((first[0].data as { goals: { goals: string[] } }).goals.goals).toEqual(["hypertrophy"]);

    await page.goto("/client/assessment");
    await expect(page.getByRole("heading", { name: "Tu evaluación" })).toBeVisible();
    await expect(alerts(page)).toContainText("Requiere revisión del entrenador");
    await expect(alerts(page)).not.toContainText("Esguince");        // the client banner never lists the reasons

    // Trainer's file shows the assessment with the reasons.
    const tctx = await browser.newContext(); const tp = await tctx.newPage();
    await login(tp, w.trainerEmail); await expect(tp).toHaveURL(/\/trainer$/);
    await tp.goto(`/trainer/clients/${w.clientId}`);
    await expect(tp.getByText(/Evaluación \(inicial/)).toBeVisible();
    await expect(tp.getByText("Objetivos: hypertrophy")).toBeVisible();
    await expect(tp.getByRole("listitem").filter({ hasText: "Lesiones declaradas" })).toBeVisible();

    // Reassessment with chest pain during exercise → professional evaluation before any standard plan.
    await page.getByRole("link", { name: "Hacer una reevaluación" }).click();
    await expect(page.getByRole("heading", { name: "Reevaluación" })).toBeVisible();
    await fillBasics(page);
    await page.getByLabel("Hipertrofia").check();
    await page.getByLabel("He sentido dolor en el pecho al hacer ejercicio").check();
    await page.getByRole("button", { name: "Enviar evaluación" }).click();
    await expect(page.getByText("Evaluación enviada a tu entrenador")).toBeVisible();
    const second = (await admin.from("assessments").select("kind,risk_level,risk_reasons").eq("client_id", w.clientId).order("created_at", { ascending: false }).limit(1)).data![0];
    expect(second).toMatchObject({ kind: "reassessment", risk_level: "professional_evaluation" });
    expect(second.risk_reasons).toContain("Dolor en el pecho durante la actividad física");

    await page.goto("/client/assessment");
    await expect(alerts(page)).toContainText("Se requiere valoración profesional");
    await expect(alerts(page)).toContainText("no es un diagnóstico");
    await tp.reload();
    await expect(tp.getByText(/Evaluación \(reevaluación/)).toBeVisible();
    await expect(alerts(tp).first()).toContainText("Se requiere valoración profesional");
    await expect(tp.getByRole("listitem").filter({ hasText: "Dolor en el pecho" })).toBeVisible();

    // Access to the sensitive file is audited.
    const audit = await admin.from("access_audit").select("resource").eq("actor_id", w.trainerId).eq("client_id", w.clientId);
    expect(audit.data!.some((r) => r.resource === "client_detail")).toBe(true);
    expect(csp).toEqual([]);
    await ctx.close(); await tctx.close();
  });

  test("sin el consentimiento de salud retirado, el entrenador deja de ver la evaluación", async ({ browser }) => {
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", w.clientId).eq("type", "health_data");
    const tctx = await browser.newContext(); const tp = await tctx.newPage();
    await login(tp, w.trainerEmail); await expect(tp).toHaveURL(/\/trainer$/);
    await tp.goto(`/trainer/clients/${w.clientId}`);
    await expect(tp.getByText("Sin evaluación visible")).toBeVisible();
    await expect(tp.getByText(/Evaluación \(/)).toHaveCount(0);
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", w.clientId).eq("type", "health_data");
    await tctx.close();
  });
});

// ───────────────────────────── Registro de un entrenamiento ─────────────────────────────
test.describe("registro de un entrenamiento", () => {
  let w: World; let plan: PlanFixture;
  test.beforeAll(async () => { w = await createWorld("wkt"); plan = await publishPlan(w); });

  const rows = (p: Page) => p.locator("form").filter({ has: p.getByLabel("kg") });

  test("el alumno inicia, guarda series al instante, reporta una molestia, finaliza incompleto y el entrenador lo ve", async ({ browser }) => {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); const csp = watchCsp(page);
    await login(page, w.clientEmail); await expect(page).toHaveURL(/\/client$/);
    await page.goto("/client/plan");
    await expect(page.getByRole("heading", { name: "Plan E2E" })).toBeVisible();
    for (const e of plan.exercises) await expect(page.getByText(e.name).first()).toBeVisible();

    await page.getByLabel("¿Cómo te sientes hoy? (1–5)").selectOption("4");
    await page.getByRole("button", { name: "Entrenar" }).click();
    await expect(page).toHaveURL(/\/client\/workout\/[0-9a-f-]{36}$/);
    const logId = page.url().split("/").pop()!;
    await expect(page.getByText("0 de 4 series guardadas")).toBeVisible();
    expect((await admin.from("workout_logs").select("status,recovery_rating,planned_sets").eq("id", logId).single()).data).toMatchObject({ status: "in_progress", recovery_rating: 4, planned_sets: 4 });

    // Only one open workout: the plan now offers to continue, not to start another.
    await page.goto("/client/plan");
    await expect(page.getByRole("link", { name: "Continuar entrenamiento" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrenar" })).toHaveCount(0);
    await page.getByRole("link", { name: "Continuar entrenamiento" }).click();

    // Save sets one by one (each is persisted on its own).
    const loads = ["40", "42.5", "20"];
    for (const [i, kg] of loads.entries()) {
      const row = rows(page).nth(i);
      await row.getByLabel("kg").fill(kg);
      await row.getByRole("button", { name: "Guardar" }).click();
      await expect(row.getByRole("button", { name: "✓" })).toBeVisible();
    }
    const saved = (await admin.from("logged_sets").select("set_number,kind,reps,load_kg,exercise_id").eq("log_id", logId).order("exercise_id").order("set_number")).data!;
    expect(saved).toHaveLength(3);
    expect(saved.map((s) => Number(s.load_kg)).sort((a, b) => a - b)).toEqual([20, 40, 42.5]);
    expect(saved.every((s) => s.kind === "work" && s.reps === 8)).toBe(true);          // reps came prefilled from the prescription

    // The same data comes back after a reload.
    await page.reload();
    await expect(page.getByText("3 de 4 series guardadas")).toBeVisible();
    await expect(rows(page).nth(0).getByLabel("kg")).toHaveValue("40");
    await expect(rows(page).nth(0).getByRole("button", { name: "✓" })).toBeVisible();
    await expect(rows(page).nth(3).getByRole("button", { name: "Guardar" })).toBeVisible();   // the fourth set is still pending

    // A severe discomfort on the first exercise.
    await page.getByText("¿Sentiste alguna molestia?").first().click();
    await page.getByLabel("Intensidad (0 = ninguna)").first().fill("8");
    await page.getByLabel("Zona").first().selectOption("knee");
    await page.getByRole("button", { name: "Guardar molestia" }).first().click();
    await expect(page.getByText("Molestia registrada").first()).toBeVisible();
    await expect(page.getByText("recibe un aviso (sin detalles)").first()).toBeVisible();

    // Finish with an incomplete session.
    await page.getByLabel("Esfuerzo de la sesión (1 = muy fácil, 10 = máximo)").fill("8");
    await page.getByRole("button", { name: "Finalizar entrenamiento" }).click();
    await expect(page.getByText(/Completado/)).toBeVisible();
    await expect(page.getByText(/Series realizadas:\s*3\s*de 4 planeadas \(75%\)/)).toBeVisible();
    await expect(page.getByText("Sesión incompleta")).toBeVisible();
    await expect(alerts(page)).toContainText("Reportaste molestias importantes");
    await expect(page.getByLabel("kg")).toHaveCount(0);                                         // a finished workout is read-only: no set inputs…
    await expect(page.getByRole("button", { name: /Guardar|Finalizar entrenamiento|Abandonar/ })).toHaveCount(0);   // …and no way to save, finish or abandon
    const done = (await admin.from("workout_logs").select("status,session_rpe,logged_work_sets").eq("id", logId).single()).data!;
    expect(done).toMatchObject({ status: "completed", session_rpe: 8, logged_work_sets: 3 });

    // Back on the plan the next workout can start again.
    await page.goto("/client/plan"); await expect(page.getByRole("button", { name: "Entrenar" })).toBeVisible();

    // The trainer sees the session, the discomfort and the loads.
    const tctx = await browser.newContext(); const tp = await tctx.newPage();
    await login(tp, w.trainerEmail); await expect(tp).toHaveURL(/\/trainer$/);
    await tp.goto(`/trainer/clients/${w.clientId}`);
    await expect(tp.getByText(/3\/4 series \(75%\)/)).toBeVisible();
    await expect(tp.getByText("Requiere atención profesional: Molestia de intensidad 8/10")).toBeVisible();
    expect(csp).toEqual([]);
    await ctx.close(); await tctx.close();
  });

  test("otro alumno no puede abrir el entrenamiento ajeno", async ({ browser }) => {
    const other = await createWorld("wkt-other");
    const log = (await admin.from("workout_logs").select("id").eq("client_id", w.clientId).limit(1).single()).data!.id as string;
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await login(p, other.clientEmail); await expect(p).toHaveURL(/\/client$/);
    const res = await p.goto(`/client/workout/${log}`);
    expect(res?.status()).toBe(404);
    await ctx.close();
  });
});

// ───────────────────────────── Aviso al entrenador por molestias ─────────────────────────────
test.describe("aviso al entrenador por molestias de 6/10 o más", () => {
  let w: World;
  test.beforeAll(async () => { w = await createWorld("att"); await publishPlan(w); });

  const saveDiscomfort = async (p: Page, severity: string) => {
    if (!(await p.getByLabel("Intensidad (0 = ninguna)").first().isVisible())) await p.getByText(/¿Sentiste alguna molestia\?|Molestia registrada/).first().click();
    await p.getByLabel("Intensidad (0 = ninguna)").first().fill(severity);
    await p.getByLabel("Zona").first().selectOption("lower_back");
    await p.getByLabel("Nota").first().fill("dolor-lumbar-privado");
    await p.getByRole("button", { name: "Guardar molestia" }).first().click();
    await expect(p.getByText("Molestia registrada").first()).toBeVisible();
  };
  const attentionCount = async () => (await admin.from("notifications").select("id").eq("user_id", w.trainerId).eq("kind", "attention")).data!.length;

  test("el aviso llega en vivo solo al cruzar el umbral, sin detalles de salud, y lleva a la ficha", async ({ browser }) => {
    const tctx = await browser.newContext(), cctx = await browser.newContext();
    const tp = await tctx.newPage(), cp = await cctx.newPage(); const cspT = watchCsp(tp), cspC = watchCsp(cp);
    await login(tp, w.trainerEmail); await expect(tp).toHaveURL(/\/trainer$/);
    await tp.evaluate(() => { (window as unknown as { __live: string }).__live = "sin-recarga"; });
    const nav = tp.getByRole("navigation", { name: "Principal" });
    await expect(nav.getByRole("link", { name: /^Notificaciones$/ })).toBeVisible();          // no badge yet

    await login(cp, w.clientEmail); await expect(cp).toHaveURL(/\/client$/);
    await cp.goto("/client/plan"); await cp.getByRole("button", { name: "Entrenar" }).click();
    await expect(cp).toHaveURL(/\/client\/workout\//);

    // 5/10 is below the threshold: nothing for the trainer.
    await saveDiscomfort(cp, "5");
    await cp.waitForTimeout(2500);
    expect(await attentionCount()).toBe(0);
    await expect(nav.getByRole("link", { name: /^Notificaciones$/ })).toBeVisible();

    // 6/10 crosses it: the trainer's badge appears without reloading their page.
    await saveDiscomfort(cp, "6");
    await expect(nav.getByRole("link", { name: /^Notificaciones\s*1$/ })).toBeVisible();
    expect(await tp.evaluate(() => (window as unknown as { __live?: string }).__live)).toBe("sin-recarga");
    expect(await attentionCount()).toBe(1);

    // Raising it further or editing the note is the same event: still one notification.
    await saveDiscomfort(cp, "9");
    await cp.waitForTimeout(1500);
    expect(await attentionCount()).toBe(1);

    // Finish the session: general pain at the threshold is a second, separate event.
    await cp.getByLabel("Esfuerzo de la sesión (1 = muy fácil, 10 = máximo)").fill("6");
    await cp.getByLabel("Dolor general (0 a 10)").fill("6");
    await cp.getByRole("button", { name: "Finalizar entrenamiento" }).click();
    await expect(cp.getByText(/Completado/)).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Notificaciones\s*2$/ })).toBeVisible();

    // The inbox: who and where to look, never the clinical detail.
    await nav.getByRole("link", { name: /^Notificaciones/ }).click();
    const items = tp.getByRole("listitem").filter({ hasText: "Molestia importante reportada: Alumno att" });
    await expect(items).toHaveCount(2);
    const text = (await items.allInnerTexts()).join("\n").replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, "");   // the notification's own date ("26/10/2026") must not be mistaken for a pain score ("6/10")
    for (const leak of ["9/10", "6/10", "lower_back", "lumbar", "dolor-lumbar-privado", "Zona lumbar"]) expect(text).not.toContain(leak);
    await expect(items.first()).toContainText("Revisa su ficha");
    await items.first().getByRole("link", { name: "Abrir" }).click();
    await expect(tp).toHaveURL(new RegExp(`/trainer/clients/${w.clientId}$`));
    await expect(tp.getByText("Requiere atención profesional: Molestia de intensidad 9/10")).toBeVisible();   // the detail is on the file, behind the consents
    expect(cspT).toEqual([]); expect(cspC).toEqual([]);
    await tctx.close(); await cctx.close();
  });

  test("si el alumno retira el permiso de compartir, el entrenador no recibe aviso", async ({ browser }) => {
    const before = await attentionCount();
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", w.clientId).eq("type", "share_with_trainer");
    const ctx = await browser.newContext(); const cp = await ctx.newPage();
    await login(cp, w.clientEmail); await expect(cp).toHaveURL(/\/client$/);
    await cp.goto("/client/plan"); await cp.getByRole("button", { name: "Entrenar" }).click();
    await expect(cp).toHaveURL(/\/client\/workout\//);
    await saveDiscomfort(cp, "10");
    await cp.waitForTimeout(1500);
    expect(await attentionCount()).toBe(before);
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", w.clientId).eq("type", "share_with_trainer");
    await ctx.close();
  });
});
