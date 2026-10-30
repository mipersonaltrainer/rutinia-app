// Documented formulas. formulaVersion is stored with every result.
export const FORMULA_VERSION = "2026.1";

export function bmi(weightKg: number, heightCm: number) {
  assertRange(weightKg, 20, 400, "weightKg");
  assertRange(heightCm, 100, 250, "heightCm");
  const m = heightCm / 100;
  return { value: round(weightKg / (m * m), 1), unit: "kg/m²", formula: "kg / m²", version: FORMULA_VERSION, kind: "estimated" as const };
}

/** Mifflin-St Jeor (adults 18+). Sex-specific constant is required; no guessing. */
export function bmrMifflin(p: { weightKg: number; heightCm: number; ageYears: number; sex: "male" | "female" }) {
  assertRange(p.weightKg, 20, 400, "weightKg");
  assertRange(p.heightCm, 100, 250, "heightCm");
  if (p.ageYears < 18 || p.ageYears > 100) throw new RangeError("Mifflin-St Jeor applies to adults 18-100");
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears;
  return { value: Math.round(base + (p.sex === "male" ? 5 : -161)), unit: "kcal/day", formula: "Mifflin-St Jeor", version: FORMULA_VERSION, kind: "estimated" as const };
}

export const ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, veryHigh: 1.9 } as const;

export function tdee(bmr: number, level: keyof typeof ACTIVITY_FACTORS) {
  return { value: Math.round(bmr * ACTIVITY_FACTORS[level]), unit: "kcal/day", formula: `BMR × ${ACTIVITY_FACTORS[level]}`, version: FORMULA_VERSION, kind: "estimated" as const };
}

/** US Navy method, metric (cm), log10. Anthropometric estimate, not a clinical measurement. */
export function bodyFatNavy(p: { sex: "male" | "female"; heightCm: number; neckCm: number; waistCm: number; hipCm?: number }) {
  const { sex, heightCm, neckCm, waistCm, hipCm } = p;
  let pct: number;
  if (sex === "male") {
    if (waistCm <= neckCm) throw new RangeError("waist must exceed neck");
    pct = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (hipCm === undefined) throw new RangeError("hip required for female formula");
    if (waistCm + hipCm <= neckCm) throw new RangeError("waist + hip must exceed neck");
    pct = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  }
  if (!Number.isFinite(pct) || pct < 2 || pct > 60) throw new RangeError("result outside plausible range");
  return { value: round(pct, 1), unit: "%", formula: "US Navy", version: FORMULA_VERSION, kind: "estimated" as const };
}

export const waistToHeight = (waistCm: number, heightCm: number) => round(waistCm / heightCm, 2);
export const waistToHip = (waistCm: number, hipCm: number) => round(waistCm / hipCm, 2);

function round(n: number, d: number) { const f = 10 ** d; return Math.round(n * f) / f; }
function assertRange(v: number, min: number, max: number, name: string) {
  if (!Number.isFinite(v) || v < min || v > max) throw new RangeError(`${name} out of range`);
}
