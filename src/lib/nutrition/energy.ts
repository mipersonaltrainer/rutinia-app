import { ACTIVITY_FACTORS, bmi, bmrMifflin, bodyFatNavy } from "@/lib/calculations/body";

// Energy and body-fat estimates. Every number is an ESTIMATE from published population formulas, never a measurement, and the
// result says which formula and how precise it is. Missing optional data lowers the precision; it never invents a value.
export const ENERGY_FORMULA_VERSION = "2026.1";

export type Activity = keyof typeof ACTIVITY_FACTORS;
export type Goal = "hypertrophy" | "strength" | "fat_loss" | "endurance" | "recomposition" | "mobility" | "general_health" | "sport" | "return_to_training";
export interface EnergyInput {
  weightKg: number | null; heightCm: number | null; ageYears: number | null; sex: "male" | "female" | "unspecified";
  activityLevel: Activity | null; goals: Goal[];
  /** Optional, they raise precision when present. */
  neckCm?: number | null; waistCm?: number | null; hipCm?: number | null; measuredBodyFatPct?: number | null; plannedSessionsPerWeek?: number | null;
  /** Safety flags from the assessment: when any is set no automatic target is produced. */
  pregnancyOrPostpartum?: boolean; eatingDisorderHistory?: boolean;
}
export type Precision = "medido" | "media" | "baja";
export interface BodyFat { pct: number; low: number; high: number; method: string; precision: Precision; note: string }
export interface Macros { proteinG: number; carbsG: number; fatG: number }
export interface EnergyResult {
  blocked: string | null;                      // reason why no energy target is given (safety)
  missing: string[];                           // data that would unlock or improve the result
  bodyFat: BodyFat | null;
  bmr: { kcal: number; formula: string } | null;
  tdee: { kcal: number; factor: number; note: string | null } | null;
  goal: { label: string; adjustmentPct: number } | null;
  target: { kcal: number; macros: Macros; floorApplied: boolean } | null;
  notes: string[];
  precision: Precision;
  formulaVersion: string;
}

const r = (n: number, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };

/** Navy (neck+waist[+hip]) when available, otherwise the BMI-based Deurenberg equation (adults only, wider error). */
export function estimateBodyFat(i: Pick<EnergyInput, "weightKg" | "heightCm" | "ageYears" | "sex" | "neckCm" | "waistCm" | "hipCm" | "measuredBodyFatPct">): BodyFat | null {
  if (i.measuredBodyFatPct && i.measuredBodyFatPct >= 3 && i.measuredBodyFatPct <= 60) return { pct: r(i.measuredBodyFatPct, 1), low: r(i.measuredBodyFatPct - 1.5, 1), high: r(i.measuredBodyFatPct + 1.5, 1), method: "Medición registrada (dispositivo o profesional)", precision: "medido", note: "Valor ingresado, no calculado." };
  if (i.sex === "unspecified" || !i.weightKg || !i.heightCm) return null;
  if (i.neckCm && i.waistCm && (i.sex === "male" || i.hipCm)) {
    try {
      const n = bodyFatNavy({ sex: i.sex, heightCm: i.heightCm, neckCm: i.neckCm, waistCm: i.waistCm, hipCm: i.hipCm ?? undefined });
      return { pct: n.value, low: r(n.value - 3.5, 1), high: r(n.value + 3.5, 1), method: "US Navy (cuello, cintura" + (i.sex === "female" ? " y cadera" : "") + ")", precision: "media", note: "Error típico de ±3 a 4 puntos porcentuales frente a métodos de laboratorio." };
    } catch { /* fall through to the BMI-based estimate */ }
  }
  if (i.ageYears === null || i.ageYears < 18 || i.ageYears > 100) return null;
  const b = bmi(i.weightKg, i.heightCm).value;
  const pct = r(Math.min(60, Math.max(3, 1.2 * b + 0.23 * i.ageYears - 10.8 * (i.sex === "male" ? 1 : 0) - 5.4)), 1);
  return { pct, low: r(Math.max(3, pct - 6), 1), high: r(Math.min(60, pct + 6), 1), method: "Deurenberg (IMC, edad y sexo)", precision: "baja", note: "Estimación general con error de ±5 a 6 puntos; sobreestima grasa en personas musculosas. Añadir cuello y cintura la mejora." };
}

const PRIORITY: Goal[] = ["fat_loss", "hypertrophy", "recomposition", "strength", "endurance", "sport", "return_to_training", "general_health", "mobility"];
const ADJUST: Record<Goal, { pct: number; label: string }> = {
  fat_loss: { pct: -20, label: "Pérdida de grasa (déficit moderado)" }, recomposition: { pct: -5, label: "Recomposición corporal (déficit leve)" },
  hypertrophy: { pct: 10, label: "Ganancia muscular (superávit leve)" }, strength: { pct: 5, label: "Fuerza (superávit mínimo)" },
  endurance: { pct: 0, label: "Resistencia (mantenimiento)" }, sport: { pct: 0, label: "Rendimiento deportivo (mantenimiento)" },
  return_to_training: { pct: 0, label: "Volver a entrenar (mantenimiento)" }, general_health: { pct: 0, label: "Salud general (mantenimiento)" }, mobility: { pct: 0, label: "Movilidad (mantenimiento)" },
};
const FLOOR = { male: 1500, female: 1200, unspecified: 1500 } as const;

export function pickGoal(goals: Goal[]): { label: string; pct: number; key: Goal } | null {
  if (!goals.length) return null;
  if (goals.includes("fat_loss") && goals.includes("hypertrophy")) return { key: "recomposition", ...ADJUST.recomposition };
  const key = PRIORITY.find((g) => goals.includes(g))!;
  return { key, ...ADJUST[key] };
}

export function computeEnergy(i: EnergyInput): EnergyResult {
  const out: EnergyResult = { blocked: null, missing: [], bodyFat: null, bmr: null, tdee: null, goal: null, target: null, notes: [], precision: "baja", formulaVersion: ENERGY_FORMULA_VERSION };
  if (!i.weightKg) out.missing.push("Peso actual (registra una medición)");
  if (!i.heightCm) out.missing.push("Estatura");
  if (i.ageYears === null) out.missing.push("Fecha de nacimiento (evaluación inicial)");
  if (!i.activityLevel) out.missing.push("Nivel de actividad (evaluación inicial)");
  if (i.sex === "unspecified") out.notes.push("Sin dato de sexo para fórmulas: se usa un valor promedio entre hombre y mujer, menos preciso, y no se estima grasa corporal.");

  if (i.pregnancyOrPostpartum) { out.blocked = "Embarazo o posparto: no se calcula un objetivo calórico automático. Requiere acompañamiento de un profesional de la salud."; return out; }
  if (i.eatingDisorderHistory) { out.blocked = "El alumno declaró antecedentes de trastornos de la conducta alimentaria: no se calcula un objetivo calórico automático. Requiere acompañamiento profesional."; return out; }
  if (i.ageYears !== null && i.ageYears < 18) { out.blocked = "Menor de 18 años: las fórmulas de adultos no aplican. Requiere un profesional de la salud."; return out; }
  if (!i.weightKg || !i.heightCm || i.ageYears === null) return out;

  out.bodyFat = estimateBodyFat(i);
  const mif = (sex: "male" | "female") => bmrMifflin({ weightKg: i.weightKg!, heightCm: i.heightCm!, ageYears: i.ageYears!, sex }).value;
  if (out.bodyFat?.precision === "medido") {
    const lbm = i.weightKg * (1 - out.bodyFat.pct / 100);
    out.bmr = { kcal: Math.round(370 + 21.6 * lbm), formula: "Katch-McArdle (usa masa libre de grasa)" };
  } else if (i.sex === "unspecified") out.bmr = { kcal: Math.round((mif("male") + mif("female")) / 2), formula: "Mifflin-St Jeor (promedio, sexo no indicado)" };
  else out.bmr = { kcal: mif(i.sex), formula: "Mifflin-St Jeor" };

  if (!i.activityLevel) { out.precision = "baja"; return out; }
  let level: Activity = i.activityLevel; let tdeeNote: string | null = null;
  if (level === "sedentary" && (i.plannedSessionsPerWeek ?? 0) >= 3) { level = "light"; tdeeNote = `Se subió de «sedentario» a «ligero» porque su plan tiene ${i.plannedSessionsPerWeek} sesiones por semana.`; }
  out.tdee = { kcal: Math.round(out.bmr.kcal * ACTIVITY_FACTORS[level]), factor: ACTIVITY_FACTORS[level], note: tdeeNote };

  const g = pickGoal(i.goals);
  const bm = bmi(i.weightKg, i.heightCm).value;
  let pct = g?.pct ?? 0; let label = g?.label ?? "Mantenimiento (sin objetivo indicado)";
  if (pct < 0 && bm < 18.5) { pct = 0; label = "Mantenimiento"; out.notes.push("El IMC es bajo (menos de 18,5): no se propone déficit calórico. Consulta a un profesional antes de buscar pérdida de peso."); }
  else if (pct < 0 && bm < 22 && g?.key === "fat_loss") { pct = -10; label = "Pérdida de grasa (déficit leve por IMC bajo-normal)"; out.notes.push("Con IMC por debajo de 22 el déficit se limita al 10 %."); }
  out.goal = { label, adjustmentPct: pct };

  let kcal = Math.round(out.tdee.kcal * (1 + pct / 100)); let floorApplied = false;
  const floor = Math.max(FLOOR[i.sex], out.bmr.kcal);
  if (pct < 0 && kcal < floor) { kcal = floor; floorApplied = true; out.notes.push(`Se aplicó un mínimo de ${floor} kcal (el mayor entre el piso de seguridad y el metabolismo basal): el déficit real es menor al indicado.`); }

  const ref = bm >= 30 ? 0.5 * (i.weightKg + 25 * (i.heightCm / 100) ** 2) : i.weightKg;   // protein from a reference weight in obesity
  const gPerKg = g?.key === "fat_loss" ? 2.0 : g?.key === "hypertrophy" || g?.key === "recomposition" ? 1.8 : 1.6;
  const proteinG = Math.round(Math.min(2.2, gPerKg) * ref);
  const fatG = Math.round(Math.max(0.6 * ref, (kcal * 0.25) / 9));
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  out.target = { kcal, macros: { proteinG, carbsG, fatG }, floorApplied };

  const hasMeasured = out.bodyFat?.precision === "medido";
  out.precision = hasMeasured ? "media" : out.bodyFat?.precision === "media" ? "media" : "baja";
  if (!hasMeasured) out.missing.push("Opcional, para más precisión: % de grasa medido (bioimpedancia, DEXA o profesional)");
  if (!i.neckCm) out.missing.push("Opcional: perímetro del cuello (mejora la estimación de grasa)");
  if (!i.waistCm) out.missing.push("Opcional: perímetro de la cintura (mejora la estimación de grasa)");
  if (i.sex === "female" && !i.hipCm) out.missing.push("Opcional: perímetro de la cadera (mujeres, para el método Navy)");
  out.notes.push("Es un punto de partida: reajusta cada 2 a 3 semanas según el peso, las medidas y el rendimiento reales.");
  return out;
}
