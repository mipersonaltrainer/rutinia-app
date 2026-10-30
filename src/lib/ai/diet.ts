import { z } from "zod";
import { createHash } from "node:crypto";
import { RULES, type Built } from "./prompts";
import { checkFreeText, cleanUntrusted, newBoundary, wrapData } from "./sanitize";
import type { Violation } from "./validate-plan";
import type { EnergyResult } from "@/lib/nutrition/energy";
import { itemTotals, sumTotals } from "@/lib/nutrition/totals";

// Schemas stay minimal (types only): quantities, membership and totals are decided by the deterministic validator below.
export const DietDraftSchema = z.object({
  title: z.string(), rationale: z.string(),
  meals: z.array(z.object({ name: z.string(), items: z.array(z.object({ code: z.string(), grams: z.number() })) })),
  assumptions: z.array(z.string()), questions_for_trainer: z.array(z.string()),
});
export type DietDraft = z.infer<typeof DietDraftSchema>;

export interface FoodCandidate { code: string; id: string; slug: string; name: string; category: string; is_liquid: boolean; kcal_100: number; protein_100: number; carbs_100: number; fat_100: number }
export type DietType = "omnivora" | "vegetariana" | "vegana";
const MEAT = /(pollo|carne|cerdo|tilapia|salmon|atun|camaron|jamon)/; const ANIMAL = /(huevo|clara|leche-(entera|semi|desc)|yogur|queso|cuajada|mantequilla$|miel|whey)/;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Hard dietary rules are applied BEFORE the model sees the list, so it cannot propose a food the person doesn't eat. */
export function filterFoods<T extends { slug: string; name: string }>(foods: T[], diet: DietType, excluded: string[]): T[] {
  const ex = excluded.map(norm).filter((x) => x.length >= 3);
  return foods.filter((f) => {
    if (diet !== "omnivora" && MEAT.test(f.slug)) return false;
    if (diet === "vegana" && ANIMAL.test(f.slug)) return false;
    return !ex.some((e) => norm(f.name).includes(e) || f.slug.includes(e));
  });
}

export interface DietRequest { meals: number; diet: DietType; excluded: string[]; notes: string }
export function buildDietPrompt(e: EnergyResult, profile: { ageBand: string; sex: string; goals: string[]; activity: string | null }, req: DietRequest, foods: FoodCandidate[]): Built {
  const b = newBoundary(); const flags: string[] = [];
  const clean = (v: string, field: string, max = 300) => { const c = cleanUntrusted(v, field, max); flags.push(...c.flags); return c.text; };
  const data = {
    objetivos_diarios: { kcal: e.target!.kcal, proteina_g: e.target!.macros.proteinG, carbohidratos_g: e.target!.macros.carbsG, grasa_g: e.target!.macros.fatG },
    perfil: { rango_de_edad: profile.ageBand, sexo: profile.sex, objetivos: profile.goals, nivel_de_actividad: profile.activity },
    preferencias: { comidas_por_dia: req.meals, tipo_de_dieta: req.diet, alimentos_a_evitar: req.excluded.map((x) => clean(x, "evitar", 60)), notas_del_entrenador: clean(req.notes, "notas", 400) },
    alimentos_permitidos: foods.map((f) => ({ codigo: f.code, nombre: f.name, categoria: f.category, kcal_100: f.kcal_100, p_100: f.protein_100, c_100: f.carbs_100, g_100: f.fat_100, liquido: f.is_liquid })),
  };
  const user = `TAREA: propón el borrador de UN día de alimentación para este alumno, en ${req.meals} comidas.\n- Usa EXCLUSIVAMENTE alimentos de "alimentos_permitidos", identificados por su "codigo". Cada ítem es {code, grams}.\n- Las cantidades son en gramos (mililitros para líquidos) y deben ser prácticas de servir y comer (porciones realistas, no 7 g de arroz).\n- Acércate a los objetivos diarios de calorías y proteína; reparte los carbohidratos y las grasas con criterio (más carbohidrato alrededor del entrenamiento si aplica) y busca variedad de verduras, fruta y fuentes de proteína.\n- Nombra las comidas en español (Desayuno, Media mañana, Almuerzo, Merienda, Cena…). Respeta el tipo de dieta y los alimentos a evitar.\n- No des consejos médicos ni indicaciones sobre suplementos o medicamentos.\n- En "assumptions" lista lo que supusiste; en "questions_for_trainer" lo que debería confirmar (alergias, horarios, presupuesto, gustos).\n\n${wrapData("alumno_y_objetivos", data, b)}`;
  return { system: RULES, user, flags: [...new Set(flags)], digest: createHash("sha256").update(JSON.stringify(data)).digest("hex"), numbers: new Set() };
}

export interface ValidDiet { title: string; rationale: string; meals: { name: string; items: { food_id: string; grams: number }[] }[]; assumptions: string[]; questions: string[]; scale: number; totals: { kcal: number; protein: number; carbs: number; fat: number } }
const round = (g: number) => (g >= 50 ? Math.round(g / 5) * 5 : Math.round(g));

/** The model PROPOSES; this decides. Unknown foods are dropped, quantities are clamped to servable amounts, and the whole day is scaled to the calorie target. */
export function validateDiet(d: DietDraft, foods: FoodCandidate[], target: { kcal: number; protein: number }): { diet: ValidDiet | null; violations: Violation[] } {
  const v: Violation[] = []; const by = new Map(foods.map((f) => [f.code, f]));
  const text = (s: string, max: number, where: string) => { const bad = checkFreeText(s, max); if (bad.length) { v.push({ rule: "texto", detail: `${where}: ${bad.join("; ")}`, severity: "dropped" }); return ""; } return s.trim(); };
  let meals = d.meals.slice(0, 8).map((m) => ({ name: text(m.name, 40, "comida") || "Comida", items: m.items.slice(0, 10).flatMap((i) => {
    const f = by.get(i.code); if (!f) { v.push({ rule: "alimento", detail: `Alimento desconocido «${i.code}» descartado`, severity: "dropped" }); return []; }
    const [lo, hi] = f.is_liquid ? [30, 1000] : [5, 600]; const g = Number.isFinite(i.grams) ? Math.min(hi, Math.max(lo, i.grams)) : 0;
    if (!g) return []; if (g !== i.grams) v.push({ rule: "cantidad", detail: `${f.name}: ${i.grams} g ajustado a ${g} g`, severity: "warning" });
    return [{ f, grams: g }];
  }) })).filter((m) => m.items.length > 0);
  const count = meals.reduce((a, m) => a + m.items.length, 0);
  if (meals.length < 3 || count < 6) return { diet: null, violations: [...v, { rule: "estructura", detail: "La propuesta tiene muy pocas comidas o alimentos válidos", severity: "rejected" }] };

  const total = () => sumTotals(meals.flatMap((m) => m.items.map((i) => itemTotals(f2(i.f), i.grams))));
  const f2 = (f: FoodCandidate) => ({ kcal_100: f.kcal_100, protein_100: f.protein_100, carbs_100: f.carbs_100, fat_100: f.fat_100 });
  let t = total(); let scale = 1;
  if (t.kcal > 0 && Math.abs(t.kcal - target.kcal) / target.kcal > 0.05) {
    scale = Math.min(1.5, Math.max(0.6, target.kcal / t.kcal));
    meals = meals.map((m) => ({ ...m, items: m.items.map((i) => ({ ...i, grams: Math.max(5, round(i.grams * scale)) })) })); t = total();
    v.push({ rule: "ajuste", detail: `Cantidades escaladas ×${scale.toFixed(2)} para acercarse al objetivo calórico`, severity: "warning" });
  }
  if (Math.abs(t.kcal - target.kcal) / target.kcal > 0.15) v.push({ rule: "calorias", detail: `El total (${t.kcal} kcal) sigue a más de 15 % del objetivo (${target.kcal} kcal): ajústalo a mano`, severity: "warning" });
  if (t.protein < target.protein * 0.8) v.push({ rule: "proteina", detail: `Proteína ${t.protein} g, por debajo del 80 % del objetivo (${target.protein} g)`, severity: "warning" });
  return { diet: { title: text(d.title, 120, "título") || "Plan de alimentación (borrador IA)", rationale: text(d.rationale, 1200, "justificación"), meals: meals.map((m) => ({ name: m.name, items: m.items.map((i) => ({ food_id: i.f.id, grams: i.grams })) })), assumptions: d.assumptions.map((a) => text(a, 300, "supuesto")).filter(Boolean), questions: d.questions_for_trainer.map((q) => text(q, 300, "pregunta")).filter(Boolean), scale, totals: t }, violations: v };
}
