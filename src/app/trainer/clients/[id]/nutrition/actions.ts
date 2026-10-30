"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { gramsFromHousehold } from "@/lib/nutrition/amounts";
import { computeEnergy } from "@/lib/nutrition/energy";
import { loadEnergyInput } from "@/lib/nutrition/load";
import { loadLatestAssessment } from "@/lib/ai/loaders";
import { runLlm } from "@/lib/ai/run";
import { DietDraftSchema, buildDietPrompt, filterFoods, validateDiet, type DietType, type FoodCandidate, type ValidDiet } from "@/lib/ai/diet";
import { ageFromBirthDate } from "@/lib/units";

type State = { error?: string; ok?: string } | undefined;
const friendly = (m: string) => /workspace not active/.test(m) ? "Tu suscripción no está activa." : /client not found/.test(m) ? "Alumno no encontrado." : /row-level security|violates/.test(m) ? "No se pudo guardar: ¿la sección de nutrición está activada para este alumno y mantiene sus permisos?" : "No se pudo completar la acción.";
const base = (clientId: string) => `/trainer/clients/${clientId}/nutrition`;

export async function setNutritionEnabled(clientId: string, enabled: boolean) {
  const supabase = await createClient();
  await supabase.rpc("set_client_nutrition", { p_client: clientId, p_enabled: enabled });
  revalidatePath(`/trainer/clients/${clientId}`); revalidatePath(base(clientId)); revalidatePath("/client", "layout");
}

const planSchema = z.object({ title: z.string().trim().min(2, "Pon un título").max(120) });
export async function createNutritionPlan(clientId: string, _: State, fd: FormData): Promise<State> {
  const p = planSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Sesión expirada" };
  const { input } = await loadEnergyInput(supabase, clientId); const e = computeEnergy(input);
  const { data, error } = await supabase.from("nutrition_plans").insert({
    trainer_id: user.id, client_id: clientId, title: p.data.title,
    kcal_target: e.target?.kcal ?? null, protein_g: e.target?.macros.proteinG ?? null, carbs_g: e.target?.macros.carbsG ?? null, fat_g: e.target?.macros.fatG ?? null,
  }).select("id").single();
  if (error || !data) return { error: friendly(error?.message ?? "") };
  await supabase.from("nutrition_meals").insert(["Desayuno", "Almuerzo", "Cena"].map((name, i) => ({ plan_id: data.id, position: i + 1, name })));
  redirect(`${base(clientId)}/${data.id}`);
}

const targetsSchema = z.object({
  title: z.string().trim().min(2).max(120), kcal: z.coerce.number().int().min(800).max(6000).optional().or(z.literal("").transform(() => undefined)),
  protein: z.coerce.number().int().min(0).max(600).optional().or(z.literal("").transform(() => undefined)), carbs: z.coerce.number().int().min(0).max(1000).optional().or(z.literal("").transform(() => undefined)),
  fat: z.coerce.number().int().min(0).max(400).optional().or(z.literal("").transform(() => undefined)), notes: z.string().max(2000).optional(),
});
export async function updatePlanTargets(clientId: string, planId: string, _: State, fd: FormData): Promise<State> {
  const p = targetsSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: "Revisa los valores: calorías entre 800 y 6000 y macros positivos." };
  const supabase = await createClient();
  const { error } = await supabase.from("nutrition_plans").update({ title: p.data.title, kcal_target: p.data.kcal ?? null, protein_g: p.data.protein ?? null, carbs_g: p.data.carbs ?? null, fat_g: p.data.fat ?? null, notes: p.data.notes || null }).eq("id", planId);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`${base(clientId)}/${planId}`); return { ok: "Guardado" };
}

export async function addMeal(clientId: string, planId: string, _: State, fd: FormData): Promise<State> {
  const name = z.string().trim().min(1, "Pon un nombre").max(60).safeParse(fd.get("name")); if (!name.success) return { error: name.error.issues[0].message };
  const supabase = await createClient();
  const { data: last } = await supabase.from("nutrition_meals").select("position").eq("plan_id", planId).order("position", { ascending: false }).limit(1).maybeSingle();
  if ((last?.position ?? 0) >= 12) return { error: "Máximo 12 comidas por plan." };
  const { error } = await supabase.from("nutrition_meals").insert({ plan_id: planId, position: (last?.position ?? 0) + 1, name: name.data });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`${base(clientId)}/${planId}`); return { ok: "Comida añadida" };
}
export async function deleteMeal(clientId: string, planId: string, mealId: string) {
  const supabase = await createClient(); await supabase.from("nutrition_meals").delete().eq("id", mealId); revalidatePath(`${base(clientId)}/${planId}`);
}

const itemSchema = z.object({ foodId: z.uuid("Elige un alimento"), unit: z.string().min(1), qty: z.coerce.number().positive("La cantidad debe ser mayor que 0").max(5000) });
/** Units: g, kg, or a household unit defined for THAT food. The conversion uses the food's measures from the database, never the browser. */
export async function addItem(clientId: string, planId: string, mealId: string, _: State, fd: FormData): Promise<State> {
  const p = itemSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data: food } = await supabase.from("foods").select("id,measures").eq("id", p.data.foodId).maybeSingle(); if (!food) return { error: "Alimento no encontrado." };
  const grams = p.data.unit === "g" || p.data.unit === "ml" ? p.data.qty : p.data.unit === "kg" || p.data.unit === "l" ? p.data.qty * 1000 : gramsFromHousehold(p.data.unit, p.data.qty, food.measures as Record<string, number>);
  if (!grams || grams <= 0) return { error: "Esa medida no existe para este alimento." };
  if (grams > 3000) return { error: "La cantidad es demasiado grande (máximo 3 kg por ítem)." };
  const { error } = await supabase.from("nutrition_items").insert({ meal_id: mealId, food_id: food.id, grams: Math.round(grams * 10) / 10 });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`${base(clientId)}/${planId}`); return { ok: "Añadido" };
}
/** Inline edit of one amount (plain form: the browser enforces min/max, the database enforces them again). */
export async function setItemGrams(clientId: string, planId: string, itemId: string, fd: FormData) {
  const g = z.coerce.number().positive().max(3000).safeParse(fd.get("grams")); if (!g.success) return;
  const supabase = await createClient(); await supabase.from("nutrition_items").update({ grams: Math.round(g.data * 10) / 10 }).eq("id", itemId);
  revalidatePath(`${base(clientId)}/${planId}`);
}
export async function deleteItem(clientId: string, planId: string, itemId: string) {
  const supabase = await createClient(); await supabase.from("nutrition_items").delete().eq("id", itemId); revalidatePath(`${base(clientId)}/${planId}`);
}

/** Publishing replaces the client's current published plan (it is archived, never deleted). */
export async function publishNutritionPlan(clientId: string, planId: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("nutrition_items").select("id, meal:nutrition_meals!inner(plan_id)", { count: "exact", head: true }).eq("meal.plan_id", planId);
  if (!count) return;
  await supabase.from("nutrition_plans").update({ status: "archived" }).eq("client_id", clientId).eq("status", "published").neq("id", planId);
  await supabase.from("nutrition_plans").update({ status: "published", published_at: new Date().toISOString() }).eq("id", planId);
  revalidatePath(base(clientId)); revalidatePath(`${base(clientId)}/${planId}`);
}
export async function unpublishNutritionPlan(clientId: string, planId: string) {
  const supabase = await createClient(); await supabase.from("nutrition_plans").update({ status: "archived" }).eq("id", planId);
  revalidatePath(base(clientId)); revalidatePath(`${base(clientId)}/${planId}`);
}
export async function deleteNutritionDraft(clientId: string, planId: string) {
  const supabase = await createClient(); await supabase.from("nutrition_plans").delete().eq("id", planId).eq("status", "draft");
  redirect(base(clientId));
}

const dietSchema = z.object({ meals: z.coerce.number().int().min(3).max(6), diet: z.enum(["omnivora", "vegetariana", "vegana"]), excluded: z.string().max(300).optional(), notes: z.string().max(400).optional() });
/** AI drafts a one-day eating plan from the calculated targets and the trainer's constraints. It is saved as a DRAFT that the trainer must review and publish. */
export async function generateDietAction(clientId: string, _: State, fd: FormData): Promise<State> {
  const p = dietSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: "Revisa el número de comidas (3 a 6) y el tipo de dieta." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Sesión expirada" };
  const a = await loadLatestAssessment(supabase, clientId);
  if (!a) return { error: "Se necesita una evaluación enviada y visible del alumno." };
  if (a.risk === "professional_evaluation") return { error: "El cribado de este alumno requiere valoración profesional: no se genera una dieta automáticamente." };
  const { input } = await loadEnergyInput(supabase, clientId); const e = computeEnergy(input);
  if (e.blocked) return { error: e.blocked };
  if (!e.target) return { error: `Faltan datos para calcular los objetivos: ${e.missing.join(", ")}.` };
  const { data: rows } = await supabase.from("foods").select("id,slug,name_es,category,is_liquid,kcal_100,protein_100,carbs_100,fat_100");
  const excluded = (p.data.excluded ?? "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 15);
  const all = (rows ?? []).map((r) => ({ id: r.id as string, slug: r.slug as string, name: r.name_es as string, category: r.category as string, is_liquid: r.is_liquid as boolean, kcal_100: Number(r.kcal_100), protein_100: Number(r.protein_100), carbs_100: Number(r.carbs_100), fat_100: Number(r.fat_100) }));
  const foods: FoodCandidate[] = filterFoods(all, p.data.diet as DietType, excluded).map((f, i) => ({ ...f, code: `A${String(i + 1).padStart(3, "0")}` }));
  if (foods.length < 20) return { error: "Quedan muy pocos alimentos con esas restricciones; relájalas." };
  const age = (() => { try { return ageFromBirthDate(a.data.personal.birthDate); } catch { return 30; } })();
  const built = buildDietPrompt(e, { ageBand: `${Math.floor(age / 10) * 10}-${Math.floor(age / 10) * 10 + 9}`, sex: input.sex, goals: input.goals, activity: input.activityLevel }, { meals: p.data.meals, diet: p.data.diet as DietType, excluded, notes: p.data.notes ?? "" }, foods);
  const target = { kcal: e.target.kcal, protein: e.target.macros.proteinG };
  const r = await runLlm<z.infer<typeof DietDraftSchema>, ValidDiet>({
    supabase, kind: "diet_draft", clientId, sensitive: true, system: built.system, user: built.user, flags: built.flags, digest: built.digest, schema: DietDraftSchema, effort: "medium", maxTokens: 6000,
    post: (d) => { const v = validateDiet(d, foods, target); return { data: v.diet, violations: v.violations, reject: v.diet ? undefined : v.violations.map((x) => x.detail).join(" · ") }; },
  });
  if (!r.ok) return { error: r.message };
  const diet = r.data;
  const { data: plan, error } = await supabase.from("nutrition_plans").insert({ trainer_id: user.id, client_id: clientId, title: `${diet.title} (borrador IA)`.slice(0, 120), kcal_target: e.target.kcal, protein_g: e.target.macros.proteinG, carbs_g: e.target.macros.carbsG, fat_g: e.target.macros.fatG, ai_generated: true, notes: [diet.rationale, ...(diet.questions.length ? ["Para confirmar con el alumno: " + diet.questions.join(" · ")] : [])].filter(Boolean).join("\n\n").slice(0, 2000) || null }).select("id").single();
  if (error || !plan) return { error: friendly(error?.message ?? "") };
  for (const [mi, m] of diet.meals.entries()) {
    const { data: meal } = await supabase.from("nutrition_meals").insert({ plan_id: plan.id, position: mi + 1, name: m.name.slice(0, 60) }).select("id").single();
    if (meal) await supabase.from("nutrition_items").insert(m.items.map((i) => ({ meal_id: meal.id, food_id: i.food_id, grams: i.grams })));
  }
  redirect(`${base(clientId)}/${plan.id}`);
}
