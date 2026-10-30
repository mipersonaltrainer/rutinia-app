import { describe, it, expect } from "vitest";
import { ATTENTION_THRESHOLD, needsAttention, workoutAlerts } from "@/lib/training/metrics";

describe("attention threshold", () => {
  it("is 6/10 (documented in the UI copy and in migration 0022)", () => expect(ATTENTION_THRESHOLD).toBe(6));
  it("boundary: 5 does not need attention, 6 does", () => { expect(needsAttention(5)).toBe(false); expect(needsAttention(6)).toBe(true); expect(needsAttention(10)).toBe(true); });
  it("absent values never trigger", () => { expect(needsAttention(null)).toBe(false); expect(needsAttention(undefined)).toBe(false); expect(needsAttention(0)).toBe(false); });
});

describe("workoutAlerts uses the same boundary", () => {
  const base = { session_rpe: 5 };
  it("general pain", () => { expect(workoutAlerts({ ...base, pain_level: 5 }, []).professional).toEqual([]); expect(workoutAlerts({ ...base, pain_level: 6 }, []).professional).toEqual(["Dolor reportado 6/10"]); });
  it("exercise discomfort uses the worst one", () => {
    expect(workoutAlerts({ ...base, pain_level: 0 }, [{ severity: 3 }, { severity: 5 }]).professional).toEqual([]);
    expect(workoutAlerts({ ...base, pain_level: 0 }, [{ severity: 3 }, { severity: 7 }]).professional).toEqual(["Molestia de intensidad 7/10 durante un ejercicio"]);
  });
  it("both can appear together; a high RPE is only an administrative reminder", () => {
    const a = workoutAlerts({ pain_level: 8, session_rpe: 10 }, [{ severity: 9 }]);
    expect(a.professional).toHaveLength(2); expect(a.admin).toHaveLength(1);
    expect(workoutAlerts({ pain_level: 0, session_rpe: 10 }, []).professional).toEqual([]);
  });
});
