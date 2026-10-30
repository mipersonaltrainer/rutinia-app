import { test, expect } from "@playwright/test";
import { admin, createWorld, login, publishPlan, watchCsp } from "./helpers";

test.describe("inicio del alumno", () => {
  test("sin plan: no es una pantalla vacía, guía los primeros pasos y marca los que ya hizo", async ({ page }) => {
    const w = await createWorld("homeA"); const csp = watchCsp(page);
    await login(page, w.clientEmail); await expect(page).toHaveURL(/\/client$/);
    await expect(page.getByRole("heading", { level: 1, name: /Hola, Alumno/ })).toBeVisible();
    await expect(page.getByText("Completa tu evaluación inicial").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mientras tu entrenador prepara tu plan" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registra tus medidas de partida" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Habla con Entrenadora homeA/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tus logros" })).toHaveCount(0);               // nothing to show yet: no empty badges
    await admin.from("messages").insert({ trainer_id: w.trainerId, client_id: w.clientId, sender_id: w.clientId, body: "Hola, quiero bajar de peso y ganar fuerza" });
    await page.reload();
    await expect(page.getByText("Salúdalo y cuéntale tus objetivos")).toHaveClass(/line-through/);       // done steps are crossed out, not linked
    expect(csp).toEqual([]);
  });

  test("con plan: muestra el entrenamiento de hoy, deja empezarlo y luego continuarlo desde el inicio", async ({ page }) => {
    const w = await createWorld("homeB"); const plan = await publishPlan(w);
    await login(page, w.clientEmail); await expect(page).toHaveURL(/\/client$/);
    await expect(page.getByRole("heading", { name: "Tu entrenamiento de hoy" })).toBeVisible();
    await expect(page.getByText(plan.sessionName).first()).toBeVisible();
    for (const e of plan.exercises) await expect(page.getByText(e.name).first()).toBeVisible();
    await expect(page.getByText(/2 ejercicios · 4 series/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu semana" })).toBeVisible(); await expect(page.getByRole("heading", { name: "Retos de la semana" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu racha" })).toBeVisible(); await expect(page.getByRole("heading", { name: /Tus logros/ })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Sesiones completadas esta semana" })).toHaveAttribute("aria-valuenow", "0");

    await page.getByRole("button", { name: "Empezar entrenamiento" }).click();
    await expect(page).toHaveURL(/\/client\/workout\//);
    await page.goto("/client");
    await expect(page.getByRole("heading", { name: "Entrenamiento en curso" })).toBeVisible();
    await page.getByRole("link", { name: "Continuar entrenamiento" }).click();
    await expect(page).toHaveURL(/\/client\/workout\//);
  });

  test("con un entrenamiento terminado hoy: lo celebra, cuenta la semana, la racha y desbloquea el primer logro", async ({ page }) => {
    const w = await createWorld("homeC"); const plan = await publishPlan(w);
    const log = (await admin.from("workout_logs").insert({ client_id: w.clientId, plan_id: plan.planId, version_id: plan.versionId, session_id: plan.sessionId, planned_sets: 4 }).select("id").single()).data!;
    const sets = plan.exercises.flatMap((e) => [1, 2].map((n) => ({ log_id: log.id, prescribed_exercise_id: e.prescribedId, exercise_id: e.exerciseId, kind: "work", set_number: n, reps: 8, load_kg: 40, rpe: 7 })));
    expect((await admin.from("logged_sets").insert(sets)).error).toBeNull();
    expect((await admin.from("workout_logs").update({ status: "completed", finished_at: new Date().toISOString(), session_rpe: 7, pain_level: 0, logged_work_sets: 4 }).eq("id", log.id)).error).toBeNull();
    await login(page, w.clientEmail); await expect(page).toHaveURL(/\/client$/);
    await expect(page.getByRole("heading", { name: "¡Entrenamiento de hoy completado!" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Sesiones completadas esta semana" })).toHaveAttribute("aria-valuenow", "100");
    await expect(page.getByText("1 de 1").first()).toBeVisible();
    await expect(page.getByText(/1 semana seguida/)).toBeVisible();
    await expect(page.getByText("Primer entrenamiento").locator("..")).toContainText("Conseguido");
    await expect(page.getByText("10 entrenamientos").locator("..")).toContainText("1 de 10");
    await expect(page.getByText(/Carga levantada esta semana/)).toBeVisible();
    await expect(page.getByText(/1\.?280 kg/)).toBeVisible();                                              // 4 sets × 8 reps × 40 kg
  });
});
