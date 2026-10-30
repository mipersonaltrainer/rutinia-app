import { describe, it, expect } from "vitest";
import { computeEnergy, estimateBodyFat, pickGoal, type EnergyInput } from "@/lib/nutrition/energy";

const base: EnergyInput = { weightKg: 80, heightCm: 180, ageYears: 30, sex: "male", activityLevel: "light", goals: ["fat_loss"] };

describe("grasa corporal", () => {
  it("sin cuello ni cintura usa Deurenberg y lo declara de baja precisión con un rango ancho", () => {
    const b = estimateBodyFat(base)!;
    expect(b.method).toMatch(/Deurenberg/); expect(b.precision).toBe("baja"); expect(b.pct).toBe(20.3);
    expect(b.high - b.low).toBeGreaterThanOrEqual(10);
  });
  it("con cuello y cintura usa US Navy (precisión media, rango más estrecho)", () => {
    const b = estimateBodyFat({ ...base, neckCm: 38, waistCm: 88 })!;
    expect(b.method).toMatch(/Navy/); expect(b.precision).toBe("media"); expect(b.high - b.low).toBeLessThanOrEqual(7);
  });
  it("una mujer sin cadera no puede usar Navy y cae al método por IMC", () => {
    expect(estimateBodyFat({ ...base, sex: "female", neckCm: 32, waistCm: 75 })!.method).toMatch(/Deurenberg/);
  });
  it("un valor medido manda sobre cualquier fórmula", () => {
    const b = estimateBodyFat({ ...base, measuredBodyFatPct: 18, neckCm: 38, waistCm: 88 })!;
    expect(b.precision).toBe("medido"); expect(b.pct).toBe(18);
  });
  it("sin sexo indicado no se estima grasa", () => { expect(estimateBodyFat({ ...base, sex: "unspecified" })).toBeNull(); });
});

describe("calorías", () => {
  it("Mifflin × actividad × objetivo, con macros que suman el objetivo", () => {
    const e = computeEnergy(base);
    expect(e.bmr?.kcal).toBe(1780); expect(e.tdee?.kcal).toBe(2448);
    expect(e.goal?.adjustmentPct).toBe(-20); expect(e.target?.kcal).toBe(1958);
    const m = e.target!.macros; expect(Math.abs(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9 - 1958)).toBeLessThanOrEqual(12);
    expect(m.proteinG).toBe(160);
  });
  it("hipertrofia suma un superávit leve; mantenimiento no ajusta", () => {
    expect(computeEnergy({ ...base, goals: ["hypertrophy"] }).target?.kcal).toBe(Math.round(2448 * 1.1));
    expect(computeEnergy({ ...base, goals: ["general_health"] }).target?.kcal).toBe(2448);
  });
  it("perder grasa y ganar músculo a la vez se trata como recomposición (déficit leve)", () => {
    expect(pickGoal(["fat_loss", "hypertrophy"])?.key).toBe("recomposition");
    expect(computeEnergy({ ...base, goals: ["fat_loss", "hypertrophy"] }).goal?.adjustmentPct).toBe(-5);
  });
  it("nunca baja del piso de seguridad ni del metabolismo basal", () => {
    const e = computeEnergy({ weightKg: 55, heightCm: 160, ageYears: 40, sex: "female", activityLevel: "sedentary", goals: ["fat_loss"] });
    expect(e.target!.kcal).toBeGreaterThanOrEqual(Math.max(1200, e.bmr!.kcal));
  });
  it("IMC bajo: no propone déficit", () => {
    const e = computeEnergy({ ...base, weightKg: 52, goals: ["fat_loss"] });
    expect(e.goal?.adjustmentPct).toBe(0); expect(e.notes.join(" ")).toMatch(/IMC es bajo/);
  });
  it("sedentario con 3+ sesiones por semana en el plan sube a ligero y lo explica", () => {
    const e = computeEnergy({ ...base, activityLevel: "sedentary", plannedSessionsPerWeek: 4 });
    expect(e.tdee?.factor).toBe(1.375); expect(e.tdee?.note).toMatch(/sesiones por semana/);
  });
  it("sin sexo indicado usa un promedio y lo avisa", () => {
    const e = computeEnergy({ ...base, sex: "unspecified" });
    expect(e.bmr?.formula).toMatch(/promedio/); expect(e.bodyFat).toBeNull(); expect(e.notes.join(" ")).toMatch(/sexo/);
  });
  it("un % de grasa medido cambia a Katch-McArdle", () => {
    const e = computeEnergy({ ...base, measuredBodyFatPct: 18 });
    expect(e.bmr?.formula).toMatch(/Katch/); expect(e.precision).toBe("media");
  });
  it("pide los datos opcionales sin bloquear el resultado", () => {
    const e = computeEnergy(base);
    expect(e.target).not.toBeNull(); expect(e.missing.join(" ")).toMatch(/cuello/); expect(e.missing.join(" ")).toMatch(/cintura/);
  });
});

describe("salvaguardas: sin objetivo automático", () => {
  it.each([
    ["embarazo o posparto", { pregnancyOrPostpartum: true }], ["antecedentes de TCA", { eatingDisorderHistory: true }], ["menor de edad", { ageYears: 16 }],
  ])("%s", (_n, patch) => { const e = computeEnergy({ ...base, ...patch }); expect(e.blocked).toBeTruthy(); expect(e.target).toBeNull(); expect(e.bmr).toBeNull(); });
  it("sin peso o estatura no inventa nada y dice qué falta", () => {
    const e = computeEnergy({ ...base, weightKg: null }); expect(e.target).toBeNull(); expect(e.missing.join(" ")).toMatch(/Peso/);
  });
});
