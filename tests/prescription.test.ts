import { describe, it, expect } from "vitest";
import { prescriptionSchema, describePrescription } from "@/lib/plans/prescription";

const base = { sets: "3", warmup_sets: "0", reps_min: "8", reps_max: "10", duration_sec: "", load_kg: "", rpe: "", rir: "", rest_sec: "90", tempo: "", superset_group: "", progression: "none", alternative_exercise_id: "", client_notes: "", private_note: "" };
const parse = (o: object) => prescriptionSchema.safeParse({ ...base, ...o });

describe("prescription validation", () => {
  it("accepts a normal prescription and turns blanks into null", () => {
    const r = parse({}); expect(r.success).toBe(true);
    if (r.success) { expect(r.data.rpe).toBeNull(); expect(r.data.tempo).toBeNull(); expect(r.data.sets).toBe(3); }
  });
  it("rejects impossible values", () => {
    for (const o of [{ sets: "0" }, { sets: "21" }, { reps_min: "10", reps_max: "8" }, { rpe: "11" }, { tempo: "abc" }, { load_kg: "-1" }, { reps_min: "", reps_max: "" }]) expect(parse(o).success).toBe(false);
  });
  it("accepts duration-based sets and X in tempo", () => {
    expect(parse({ reps_min: "", reps_max: "", duration_sec: "45", tempo: "20X0" }).success).toBe(true);
  });
  it("does not allow RPE and RIR together", () => { expect(parse({ rpe: "8", rir: "2" }).success).toBe(false); });
  it("describes prescriptions", () => {
    expect(describePrescription({ sets: 4, reps_min: 8, reps_max: 10, duration_sec: null })).toBe("4 × 8-10");
    expect(describePrescription({ sets: 3, reps_min: 12, reps_max: 12, duration_sec: null })).toBe("3 × 12");
    expect(describePrescription({ sets: 3, reps_min: null, reps_max: null, duration_sec: 45 })).toBe("3 × 45 s");
  });
});
