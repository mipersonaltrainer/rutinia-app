import { ACTIVITY_FACTORS, FORMULA_VERSION, bmi, bmrMifflin, bodyFatNavy, tdee, waistToHeight, waistToHip } from "./body";

export interface MeasurementInput {
  weight_kg: number | null; height_cm: number | null; waist_cm: number | null;
  hip_cm: number | null; neck_cm: number | null;
}
export interface Context { ageYears: number | null; sex: "male" | "female" | "unspecified"; activityLevel: keyof typeof ACTIVITY_FACTORS | null; adult: boolean }
export interface IndicatorResult { indicator: string; value: number; unit: string; formula: string; formulaVersion: string; provenance: "estimated"; inputs: Record<string, number | string> }
export interface Unavailable { indicator: string; reason: string }

/** Computes every indicator whose inputs exist; never fills gaps with invented values. */
export function computeIndicators(m: MeasurementInput, ctx: Context) {
  const results: IndicatorResult[] = [];
  const unavailable: Unavailable[] = [];
  const add = (indicator: string, r: { value: number; unit: string; formula: string; version: string }, inputs: IndicatorResult["inputs"]) =>
    results.push({ indicator, value: r.value, unit: r.unit, formula: r.formula, formulaVersion: r.version, provenance: "estimated", inputs });
  const attempt = (indicator: string, fn: () => void) => { try { fn(); } catch (e) { unavailable.push({ indicator, reason: (e as Error).message }); } };

  if (m.weight_kg && m.height_cm) attempt("bmi", () => add("bmi", bmi(m.weight_kg!, m.height_cm!), { weight_kg: m.weight_kg!, height_cm: m.height_cm! }));
  else unavailable.push({ indicator: "bmi", reason: "Faltan peso y/o estatura" });

  let bmrValue: number | null = null;
  if (!m.weight_kg || !m.height_cm || ctx.ageYears === null) unavailable.push({ indicator: "bmr", reason: "Faltan peso, estatura o edad" });
  else if (ctx.sex === "unspecified") unavailable.push({ indicator: "bmr", reason: "Mifflin-St Jeor requiere categoría male/female; el usuario no la indicó" });
  else if (!ctx.adult) unavailable.push({ indicator: "bmr", reason: "Mifflin-St Jeor solo aplica a adultos" });
  else attempt("bmr", () => { const r = bmrMifflin({ weightKg: m.weight_kg!, heightCm: m.height_cm!, ageYears: ctx.ageYears!, sex: ctx.sex as "male" | "female" }); bmrValue = r.value; add("bmr", r, { weight_kg: m.weight_kg!, height_cm: m.height_cm!, age: ctx.ageYears!, sex: ctx.sex }); });

  if (bmrValue !== null && ctx.activityLevel) { const b = bmrValue; attempt("tdee", () => add("tdee", tdee(b, ctx.activityLevel!), { bmr: b, activity_factor: ACTIVITY_FACTORS[ctx.activityLevel!] })); }
  else unavailable.push({ indicator: "tdee", reason: "Requiere metabolismo basal y nivel de actividad" });

  const navyOk = m.height_cm && m.neck_cm && m.waist_cm && ctx.sex !== "unspecified" && (ctx.sex === "male" || m.hip_cm);
  if (navyOk) attempt("body_fat_navy", () => add("body_fat_navy", bodyFatNavy({ sex: ctx.sex as "male" | "female", heightCm: m.height_cm!, neckCm: m.neck_cm!, waistCm: m.waist_cm!, hipCm: m.hip_cm ?? undefined }), { height_cm: m.height_cm!, neck_cm: m.neck_cm!, waist_cm: m.waist_cm!, ...(m.hip_cm ? { hip_cm: m.hip_cm } : {}) }));
  else unavailable.push({ indicator: "body_fat_navy", reason: "Requiere estatura, cuello, cintura (y cadera en mujeres) y categoría male/female" });

  if (m.waist_cm && m.height_cm) add("waist_to_height", { value: waistToHeight(m.waist_cm, m.height_cm), unit: "ratio", formula: "cintura / estatura", version: FORMULA_VERSION }, { waist_cm: m.waist_cm, height_cm: m.height_cm });
  if (m.waist_cm && m.hip_cm) add("waist_to_hip", { value: waistToHip(m.waist_cm, m.hip_cm), unit: "ratio", formula: "cintura / cadera", version: FORMULA_VERSION }, { waist_cm: m.waist_cm, hip_cm: m.hip_cm });

  // Never estimated from tape measures: muscle mass, bone mass, body water.
  unavailable.push({ indicator: "muscle_bone_water", reason: "No se estiman sin un dispositivo de medición; dato no disponible" });
  return { results, unavailable };
}
