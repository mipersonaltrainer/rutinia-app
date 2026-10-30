import { describe, it, expect } from "vitest";
import { bmi, bmrMifflin, tdee, bodyFatNavy } from "@/lib/calculations/body";

describe("body calculations", () => {
  it("BMI 80kg/180cm = 24.7", () => expect(bmi(80, 180).value).toBe(24.7));
  it("Mifflin male 80kg 180cm 30y = 1780", () => expect(bmrMifflin({ weightKg: 80, heightCm: 180, ageYears: 30, sex: "male" }).value).toBe(1780));
  it("Mifflin female 60kg 165cm 30y = 1320", () => expect(bmrMifflin({ weightKg: 60, heightCm: 165, ageYears: 30, sex: "female" }).value).toBe(1320));
  it("TDEE = BMR x factor", () => expect(tdee(1780, "moderate").value).toBe(2759));
  it("rejects impossible inputs", () => {
    expect(() => bmi(0, 180)).toThrow();
    expect(() => bmrMifflin({ weightKg: 80, heightCm: 180, ageYears: 15, sex: "male" })).toThrow();
    expect(() => bodyFatNavy({ sex: "male", heightCm: 180, neckCm: 40, waistCm: 38 })).toThrow();
  });
  it("Navy male is plausible and labelled estimated", () => {
    const r = bodyFatNavy({ sex: "male", heightCm: 180, neckCm: 38, waistCm: 90 });
    expect(r.value).toBeGreaterThan(10); expect(r.value).toBeLessThan(30); expect(r.kind).toBe("estimated");
  });
});
