import { describe, it, expect } from "vitest";
import { evaluateClient, evaluateExercise, evaluatePlan, type ClientContext, type ExerciseInput, type SessionObs } from "@/lib/progression/engine";

const sess = (date: string, sets: [number, number, number?][], o: Partial<SessionObs> = {}): SessionObs => ({ date, sets: sets.map(([reps, load, rpe]) => ({ reps, load_kg: load, rpe: rpe ?? null })), plannedSets: o.plannedSets ?? sets.length, sessionRpe: null, pain: 0, recovery: 3, discomfort: null, ...o });
const ex = (o: Partial<ExerciseInput> = {}): ExerciseInput => ({ prescribedId: "pe1", exerciseId: "e1", name: "Sentadilla goblet", equipment: "dumbbell", durationBased: false, sets: 3, repsMin: 8, repsMax: 10, loadKg: 20, rpeTarget: null, rule: "double_progression", alternatives: [{ id: "alt1", name: "Sentadilla búlgara" }], sessions: [], ...o });
const ctx = (o: Partial<ClientContext> = {}): ClientContext => ({ level: "intermediate", adherence: { scheduled: 3, completed: 3 }, recentSessions: [], ...o });
const three = (reps: number, load: number, rpe = 7): [number, number, number][] => [[reps, load, rpe], [reps, load, rpe], [reps, load, rpe]];
const good = [sess("2026-10-15", three(10, 20)), sess("2026-10-12", three(10, 20))];
const complete = (p: ReturnType<typeof evaluateExercise>) => { expect(p).not.toBeNull(); expect(p!.rationale.length).toBeGreaterThan(0); expect(p!.data.length).toBeGreaterThan(0); expect(p!.uncertainty.length).toBeGreaterThan(0); expect(p!.checks.length).toBeGreaterThan(0); expect(p!.changes.length).toBeGreaterThan(0); expect(p!.title).toBeTruthy(); };

describe("when to progress", () => {
  it("needs data: no sessions or a single session -> nothing", () => {
    expect(evaluateExercise(ex(), ctx())).toBeNull();
    expect(evaluateExercise(ex({ sessions: [sess("2026-10-15", three(10, 20))] }), ctx())).toBeNull();
  });
  it("two clean sessions at the top of the range -> smallest load step, fully explained", () => {
    const p = evaluateExercise(ex({ sessions: good }), ctx())!; complete(p);
    expect(p.type).toBe("increase_load"); expect(p.changes[0]).toMatchObject({ field: "load_kg", from: 20, to: 22 }); expect(p.confidence).toBe("high"); expect(p.severity).toBe("info");
  });
  it("increment depends on the equipment", () => {
    const step = (equipment: string) => evaluateExercise(ex({ equipment, sessions: good }), ctx())!.changes[0].to;
    expect(step("barbell")).toBe(22.5); expect(step("kettlebell")).toBe(24); expect(step("machine")).toBe(22.5); expect(step("cable")).toBe(22.5);
  });
  it("custom increments override the defaults", () => { expect(evaluateExercise(ex({ sessions: good }), ctx({ increments: { dumbbell: 1 } }))!.changes[0].to).toBe(21); });
  it("one good session is not enough, nor are different loads, nor high effort", () => {
    expect(evaluateExercise(ex({ sessions: [good[0], sess("2026-10-12", three(9, 20))] }), ctx())).toBeNull();
    expect(evaluateExercise(ex({ sessions: [sess("2026-10-15", three(10, 22)), sess("2026-10-12", three(10, 20))] }), ctx())).toBeNull();
    expect(evaluateExercise(ex({ sessions: [sess("2026-10-15", three(10, 20, 9.5)), sess("2026-10-12", three(10, 20, 9.5))] }), ctx())).toBeNull();
  });
  it("skipped sets (fewer than planned) are not a success", () => {
    expect(evaluateExercise(ex({ sessions: [sess("2026-10-15", [[10, 20, 7], [10, 20, 7]], { plannedSets: 3 }), good[1]] }), ctx())).toBeNull();
  });
  it("respects an RPE target and notes lower confidence when effort was not logged", () => {
    expect(evaluateExercise(ex({ rpeTarget: 7, sessions: [sess("a", three(10, 20, 8)), sess("b", three(10, 20, 8))] }), ctx())).toBeNull();
    const noRpe = [sess("2026-10-15", [[10, 20], [10, 20], [10, 20]]), sess("2026-10-12", [[10, 20], [10, 20], [10, 20]])];
    const p = evaluateExercise(ex({ sessions: noRpe }), ctx())!; expect(p.type).toBe("increase_load"); expect(p.confidence).toBe("medium"); expect(p.uncertainty.join(" ")).toMatch(/RPE/);
  });
  it("progression rule and level matter: linear beginners move after 1 session, others need 2", () => {
    const one = [sess("2026-10-15", three(10, 20)), sess("2026-10-12", three(9, 20))];
    expect(evaluateExercise(ex({ rule: "linear_load", sessions: one }), ctx({ level: "beginner" }))!.type).toBe("increase_load");
    expect(evaluateExercise(ex({ rule: "linear_load", sessions: one }), ctx({ level: "intermediate" }))).toBeNull();
    expect(evaluateExercise(ex({ rule: "double_progression", sessions: one }), ctx({ level: "beginner" }))).toBeNull();
  });
  it("unloaded exercises progress by repetitions, not by load", () => {
    const p = evaluateExercise(ex({ equipment: "bodyweight", loadKg: null, sessions: [sess("a", three(10, 0)), sess("b", three(10, 0))] }), ctx())!; complete(p);
    expect(p.type).toBe("increase_reps"); expect(p.changes.map((c) => [c.field, c.to])).toEqual([["reps_min", 10], ["reps_max", 12]]);
  });
  it("duration-based exercises are not evaluated", () => { expect(evaluateExercise(ex({ durationBased: true, sessions: good }), ctx())).toBeNull(); });
});

describe("what blocks an increase", () => {
  it("low adherence -> maintain with the reason, never increase", () => {
    const p = evaluateExercise(ex({ sessions: good }), ctx({ adherence: { scheduled: 4, completed: 1 } }))!; complete(p);
    expect(p.type).toBe("maintain"); expect(p.rationale.join(" ")).toMatch(/adherencia baja/);
    expect(evaluateExercise(ex({ sessions: good }), ctx({ adherence: null }))!.type).toBe("increase_load");
  });
  it("moderate discomfort (4-5) or poor recovery blocks the increase", () => {
    const withDisc = [sess("2026-10-15", three(10, 20), { discomfort: 5 }), good[1]];
    expect(evaluateExercise(ex({ sessions: withDisc }), ctx())!.type).toBe("maintain");
    const rec = ctx({ recentSessions: [{ date: "a", sessionRpe: 7, pain: 0, recovery: 2, maxDiscomfort: 0 }, { date: "b", sessionRpe: 7, pain: 0, recovery: 1, maxDiscomfort: 0 }] });
    expect(evaluateExercise(ex({ sessions: good }), rec)!.rationale.join(" ")).toMatch(/recuperación/);
  });
  it("a painful episode in the last 3 sessions blocks increases even if the latest sessions were clean", () => {
    const clean = [sess("d", three(10, 20)), sess("c", three(10, 20)), sess("b", three(10, 20), { discomfort: 7 })];
    const p = evaluateExercise(ex({ sessions: clean }), ctx())!;
    expect(p.type).toBe("maintain"); expect(p.rationale.join(" ")).toMatch(/últimas 3 sesiones/);
    const later = [sess("e", three(10, 20)), ...clean];
    expect(evaluateExercise(ex({ sessions: later }), ctx())!.type).toBe("increase_load");   // 4th session back: no longer blocks
  });
  it("significant discomfort (>=6) is professional-level and never leads to an increase", () => {
    const s1 = [sess("2026-10-15", three(10, 20), { discomfort: 7 }), good[1]];
    const p = evaluateExercise(ex({ sessions: s1 }), ctx())!; complete(p);
    expect(p.type).toBe("review_technique"); expect(p.severity).toBe("professional"); expect(p.checks.join(" ")).toMatch(/profesional de la salud/);
    const rec = [sess("2026-10-15", three(10, 20), { discomfort: 7 }), sess("2026-10-12", three(10, 20), { discomfort: 4 })];
    const sub = evaluateExercise(ex({ sessions: rec }), ctx())!; expect(sub.type).toBe("substitute_exercise"); expect(sub.substituteExerciseId).toBe("alt1"); expect(sub.severity).toBe("professional");
    expect(evaluateExercise(ex({ alternatives: [], sessions: rec }), ctx())!.type).toBe("review_technique");
    expect(evaluateExercise(ex({ sessions: [sess("2026-10-15", three(10, 20), { discomfort: 8 })] }), ctx())!.severity).toBe("professional");   // even with a single session
  });
});

describe("when performance goes wrong", () => {
  it("two consecutive volume drops of >=10% -> reduce volume by one set", () => {
    const p = evaluateExercise(ex({ sessions: [sess("c", three(8, 20)), sess("b", three(9, 20)), sess("a", three(10, 20))] }), ctx())!; complete(p);
    expect(p.type).toBe("reduce_volume"); expect(p.changes[0]).toMatchObject({ field: "sets", from: 3, to: 2 }); expect(p.checks.join(" ")).toMatch(/sueño|molestias/);
  });
  it("a single drop or small drops do nothing", () => {
    expect(evaluateExercise(ex({ sessions: [sess("c", three(9, 20)), sess("b", three(10, 20)), sess("a", three(10, 20))] }), ctx())).toBeNull();
  });
  it("failing the lower rep bound twice at the same load -> reduce load", () => {
    const p = evaluateExercise(ex({ sessions: [sess("b", three(6, 22)), sess("a", three(7, 22))] }), ctx())!; complete(p);
    expect(p.type).toBe("reduce_load"); expect((p.changes[0].to as number)).toBeLessThan(22); expect((p.changes[0].to as number) % 0.5).toBe(0);
  });
  it("one bad session is not enough", () => { expect(evaluateExercise(ex({ sessions: [sess("b", three(6, 22)), sess("a", three(9, 22))] }), ctx())).toBeNull(); });
  it("a plateau over 4 sessions suggests a variant with low confidence; without alternatives, nothing", () => {
    const flat = [sess("d", three(9, 20)), sess("c", three(9, 20)), sess("b", three(9, 20)), sess("a", three(9, 20))];
    const p = evaluateExercise(ex({ sessions: flat }), ctx())!; complete(p); expect(p.type).toBe("substitute_exercise"); expect(p.confidence).toBe("low"); expect(p.severity).toBe("info");
    expect(evaluateExercise(ex({ alternatives: [], sessions: flat }), ctx())).toBeNull();
  });
});

describe("client-level safety and fatigue", () => {
  const r = (o: Partial<ClientContext["recentSessions"][number]> = {}, d = "2026-10-15") => ({ date: d, sessionRpe: 7, pain: 0, recovery: 4, maxDiscomfort: 0, ...o });
  it("pain or discomfort >= 6 -> request reassessment (professional)", () => {
    const a = evaluateClient(ctx({ recentSessions: [r({ pain: 7 })] }), [{ sets: 3 }]); expect(a[0].type).toBe("request_reassessment"); expect(a[0].severity).toBe("professional");
    expect(evaluateClient(ctx({ recentSessions: [r({ maxDiscomfort: 6 })] }), [{ sets: 3 }])[0].type).toBe("request_reassessment");
    expect(evaluateClient(ctx({ recentSessions: [r({ pain: 5, maxDiscomfort: 5 })] }), [{ sets: 3 }])).toEqual([]);
  });
  it("two fatigue signals together -> deload; one alone -> nothing", () => {
    const two = evaluateClient(ctx({ recentSessions: [r({ sessionRpe: 9, recovery: 2 }), r({ sessionRpe: 9, recovery: 2 }, "b"), r({ sessionRpe: 9, recovery: 4 }, "c")] }), [{ sets: 3 }]);
    expect(two.map((p) => p.type)).toEqual(["deload"]); expect(two[0].rationale.length).toBeGreaterThan(2);
    expect(evaluateClient(ctx({ recentSessions: [r({ sessionRpe: 9 }), r({ sessionRpe: 9 }, "b"), r({ sessionRpe: 9 }, "c")] }), [{ sets: 3 }])).toEqual([]);
    expect(evaluateClient(ctx({ recentSessions: [r({ sessionRpe: 9, recovery: 2 }), r({ sessionRpe: 9, recovery: 2 }, "b")] }), [{ sets: 3 }])).toEqual([]);   // needs 3 sessions
  });
  it("plan evaluation orders by severity, and a deload replaces load/rep increases", () => {
    const fatigue = ctx({ recentSessions: [r({ sessionRpe: 9, recovery: 2 }), r({ sessionRpe: 9, recovery: 2 }, "b"), r({ sessionRpe: 9 }, "c")] });
    const out = evaluatePlan([ex({ sessions: good })], fatigue);
    expect(out.map((p) => p.type)).toEqual(["deload"]);
    const withPain = evaluatePlan([ex({ sessions: good })], ctx({ recentSessions: [r({ pain: 8 })] }));
    expect(withPain[0].severity).toBe("professional");
  });
});

describe("determinism and invariants", () => {
  it("same inputs give the same fingerprint; different data gives a different one", () => {
    const a = evaluateExercise(ex({ sessions: good }), ctx())!, b = evaluateExercise(ex({ sessions: good }), ctx())!;
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(evaluateExercise(ex({ sessions: [sess("2026-10-19", three(10, 20)), ...good] }), ctx())!.fingerprint).not.toBe(a.fingerprint);
  });
  it("fuzz: never throws, always explains, never raises load under discomfort, respects increments", () => {
    let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    for (let i = 0; i < 1500; i++) {
      const sets = 1 + Math.floor(rnd() * 4); const load = pick([0, 10, 20, 22.5, 40, 100]);
      const sessions = Array.from({ length: Math.floor(rnd() * 6) }, (_, k) => sess(`2026-10-${20 - k}`, Array.from({ length: Math.max(0, sets - (rnd() < 0.2 ? 1 : 0)) }, () => [Math.floor(rnd() * 14), load + (rnd() < 0.2 ? 2 : 0), rnd() < 0.5 ? pick([6, 7, 8, 9, 10]) : undefined] as [number, number, number?]), { plannedSets: sets, discomfort: rnd() < 0.3 ? Math.floor(rnd() * 10) : null, sessionRpe: rnd() < 0.7 ? 1 + Math.floor(rnd() * 10) : null, recovery: rnd() < 0.7 ? 1 + Math.floor(rnd() * 5) : null, pain: Math.floor(rnd() * 8) }));
      const e = ex({ sets, loadKg: load || null, equipment: pick(["dumbbell", "barbell", "bodyweight", "band", "machine", "kettlebell"]), rule: pick(["none", "double_progression", "linear_load", "rpe_based"] as const), sessions, repsMin: pick([5, 8, 10]), repsMax: pick([8, 10, 12, null]), rpeTarget: pick([null, 7, 8]) });
      const c = ctx({ level: pick(["beginner", "intermediate", "advanced"] as const), adherence: rnd() < 0.5 ? { scheduled: 3, completed: Math.floor(rnd() * 4) } : null, recentSessions: sessions.map((s) => ({ date: s.date, sessionRpe: s.sessionRpe, pain: s.pain, recovery: s.recovery, maxDiscomfort: s.discomfort })) });
      const out = evaluatePlan([e], c);
      for (const p of out) {
        expect(p.rationale.length).toBeGreaterThan(0); expect(p.data.length).toBeGreaterThan(0); expect(p.uncertainty.length).toBeGreaterThan(0); expect(p.checks.length).toBeGreaterThan(0); expect(p.fingerprint).toHaveLength(32);
        if ((sessions[0]?.discomfort ?? 0) >= 6 && p.scope === "exercise") expect(["increase_load", "increase_reps"]).not.toContain(p.type);
        if (p.type === "increase_load") { const ch = p.changes[0]; expect(Number(ch.to)).toBeGreaterThan(Number(ch.from)); expect(Number(ch.to) % 0.5).toBe(0); expect(["bodyweight", "band"]).not.toContain(e.equipment); }
        if (p.type === "reduce_load") expect(Number(p.changes[0].to)).toBeLessThan(Number(p.changes[0].from));
        if (p.type === "reduce_volume") expect(Number(p.changes[0].to)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
