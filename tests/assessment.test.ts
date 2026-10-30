import { describe, it, expect } from "vitest";
import { assessmentSchema, type AssessmentData } from "@/lib/assessment/schema";
import { screenRisk } from "@/lib/assessment/risk";
import { computeIndicators } from "@/lib/calculations/indicators";
import { compareMeasurements } from "@/lib/calculations/compare";
import { ageFromBirthDate, toKg, toCm, fromKg, fromCm } from "@/lib/units";

const base: AssessmentData = assessmentSchema.parse({
  personal: { birthDate: "1990-06-15", sexForFormulas: "male", workType: "sedentary", sittingHours: 8, activityLevel: "light", sleepQuality: 3, stress: 3 },
  training: { experienceYears: 2, weeklyFrequency: 3, sessionMinutes: 60, location: "gym" },
  goals: { goals: ["hypertrophy"] },
  health: { chestPainDuringExercise: false, dizzinessOrFainting: false, unusualBreathlessness: false, cardiovascularHistory: false, medicalRestriction: false, medicalClearance: false, pregnancyStatus: "not_applicable", eatingDisorderHistory: false, currentPain: 0 },
  habits: { sleepHours: 7, recovery: 3 },
});
const withHealth = (o: Partial<AssessmentData["health"]>): AssessmentData => ({ ...base, health: { ...base.health, ...o } });
const today = new Date("2026-10-19T12:00:00Z");

describe("units", () => {
  it("converts lb/in and back", () => {
    expect(toKg(220, "lb")).toBe(99.8); expect(toCm(70, "in")).toBe(177.8);
    expect(fromKg(100, "lb")).toBe(220.5); expect(fromCm(177.8, "in")).toBe(70);
  });
  it("age handles birthdays correctly and rejects invalid", () => {
    expect(ageFromBirthDate("1990-10-19", today)).toBe(36);
    expect(ageFromBirthDate("1990-10-20", today)).toBe(35);
    expect(() => ageFromBirthDate("2999-01-01", today)).toThrow();
    expect(() => ageFromBirthDate("nope", today)).toThrow();
  });
});

describe("assessment schema", () => {
  it("rejects impossible values and empty goals", () => {
    expect(assessmentSchema.safeParse({ ...base, goals: { goals: [] } }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...base, health: { ...base.health, currentPain: 11 } }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...base, personal: { ...base.personal, sleepQuality: 9 } }).success).toBe(false);
  });
});

describe("risk screening", () => {
  it("clean profile -> none", () => expect(screenRisk(base, today).level).toBe("none"));
  it("alarm symptoms -> professional evaluation", () => {
    expect(screenRisk(withHealth({ chestPainDuringExercise: true }), today).level).toBe("professional_evaluation");
    expect(screenRisk(withHealth({ dizzinessOrFainting: true }), today).level).toBe("professional_evaluation");
    expect(screenRisk(withHealth({ currentPain: 8 }), today).level).toBe("professional_evaluation");
  });
  it("cardio history needs clearance", () => {
    expect(screenRisk(withHealth({ cardiovascularHistory: true }), today).level).toBe("professional_evaluation");
    expect(screenRisk(withHealth({ cardiovascularHistory: true, medicalClearance: true }), today).level).toBe("review");
  });
  it("pregnancy without clearance and minors escalate", () => {
    expect(screenRisk(withHealth({ pregnancyStatus: "pregnant" }), today).level).toBe("professional_evaluation");
    expect(screenRisk({ ...base, personal: { ...base.personal, birthDate: "2012-01-01" } }, today).level).toBe("professional_evaluation");
  });
  it("injuries/meds -> review; eating disorder flagged", () => {
    expect(screenRisk(withHealth({ injuries: "rodilla" }), today).level).toBe("review");
    expect(screenRisk(withHealth({ eatingDisorderHistory: true }), today).reasons.join()).toMatch(/calóricos/);
  });
});

describe("indicators", () => {
  const full = { weight_kg: 80, height_cm: 180, waist_cm: 90, hip_cm: 100, neck_cm: 38 };
  const ctx = { ageYears: 30, sex: "male" as const, activityLevel: "moderate" as const, adult: true };
  it("computes all available with provenance estimated", () => {
    const { results } = computeIndicators(full, ctx);
    const by = Object.fromEntries(results.map((r) => [r.indicator, r]));
    expect(by.bmi.value).toBe(24.7); expect(by.bmr.value).toBe(1780); expect(by.tdee.value).toBe(2759);
    expect(by.waist_to_height.value).toBe(0.5); expect(by.waist_to_hip.value).toBe(0.9);
    expect(results.every((r) => r.provenance === "estimated" && r.formulaVersion)).toBe(true);
  });
  it("does not fabricate: missing inputs or unspecified sex => unavailable with reason", () => {
    const r = computeIndicators({ ...full, neck_cm: null }, { ...ctx, sex: "unspecified" });
    expect(r.results.find((x) => x.indicator === "bmr")).toBeUndefined();
    expect(r.results.find((x) => x.indicator === "body_fat_navy")).toBeUndefined();
    expect(r.unavailable.map((u) => u.indicator)).toEqual(expect.arrayContaining(["bmr", "tdee", "body_fat_navy", "muscle_bone_water"]));
  });
  it("minors get no BMR", () => {
    expect(computeIndicators(full, { ...ctx, ageYears: 15, adult: false }).results.find((x) => x.indicator === "bmr")).toBeUndefined();
  });
});

describe("comparison", () => {
  const a = { measured_on: "2026-09-01", method: "tape", taken_by: "self", weight_kg: 82, waist_cm: 92 };
  const b = { measured_on: "2026-10-01", method: "tape", taken_by: "self", weight_kg: 80.5, waist_cm: 90 };
  it("computes deltas and always warns about weight != fat", () => {
    const r = compareMeasurements(a, b);
    expect(r.deltas).toEqual({ weight_kg: -1.5, waist_cm: -2 });
    expect(r.warnings.join()).toMatch(/grasa/);
  });
  it("warns on different method/taker", () => {
    expect(compareMeasurements(a, { ...b, method: "bioimpedance", taken_by: "trainer" }).warnings.length).toBeGreaterThanOrEqual(3);
  });
});
