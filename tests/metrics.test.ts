import { describe, it, expect } from "vitest";
import type { SetRow } from "@/lib/training/metrics";
import { localDate, epley1RM, summarizeSets, detectPRs, compareSessions, weekBounds, weeklyAdherence, completionPct, workoutAlerts, type HistorySession } from "@/lib/training/metrics";

const w = (reps: number, load: number) => ({ kind: "work" as const, reps, load_kg: load });
const S = (date: string, sets: SetRow[], extra: Partial<HistorySession> = {}): HistorySession => ({ date, sets, ...extra });

describe("e1RM and volume", () => {
  it("Epley, bounded to 1-12 reps", () => {
    expect(epley1RM(100, 1)).toBe(100); expect(epley1RM(100, 10)).toBe(133.3); expect(epley1RM(100, 13)).toBeNull(); expect(epley1RM(null, 5)).toBeNull(); expect(epley1RM(100, 0)).toBeNull();
  });
  it("sums only work sets; warm-ups and empty sets ignored", () => {
    const r = summarizeSets([{ kind: "warmup", reps: 10, load_kg: 20 }, w(10, 50), w(8, 55), { kind: "work", reps: 0, load_kg: 60 }, { kind: "work", reps: 12, load_kg: null }]);
    expect(r.workSets).toBe(3); expect(r.totalReps).toBe(30); expect(r.volumeKg).toBe(940); expect(r.topSet).toEqual({ load_kg: 55, reps: 8 });
  });
});

describe("personal records", () => {
  it("needs a strictly higher value than a previous best; first session is baseline only", () => {
    const prs = detectPRs([S("2026-10-01", [w(10, 50)]), S("2026-10-08", [w(10, 50)]), S("2026-10-15", [w(8, 55)])]);
    expect(prs.map((p) => [p.date, p.type, p.value])).toEqual([["2026-10-15", "max_load", 55], ["2026-10-15", "best_e1rm", 69.7]]);
  });
  it("sessions with significant discomfort never produce a record", () => {
    expect(detectPRs([S("2026-10-01", [w(5, 80)]), S("2026-10-08", [w(5, 90)], { discomfortSeverity: 6 })])).toEqual([]);
  });
  it("order of input does not matter and unloaded sets give no load record", () => {
    expect(detectPRs([S("2026-10-15", [w(8, 55)]), S("2026-10-01", [w(10, 50)])]).length).toBe(2);
    expect(detectPRs([S("2026-10-01", [{ kind: "work", reps: 10, load_kg: null }]), S("2026-10-08", [{ kind: "work", reps: 12, load_kg: null }])])).toEqual([]);
  });
});

describe("session comparison (volume is not automatically progress)", () => {
  const prev = S("a", [w(10, 50), w(10, 50)], { sessionRpe: 7, pain: 0 });
  it("clean increase is an improvement", () => { const c = compareSessions(prev, S("b", [w(10, 55), w(10, 55)], { sessionRpe: 7, pain: 0 })); expect(c.improved).toBe(true); expect(c.volumeDeltaPct).toBe(10); expect(c.topLoadDeltaKg).toBe(5); });
  it("more volume with more fatigue or pain is NOT an improvement", () => {
    const c = compareSessions(prev, S("b", [w(10, 60), w(10, 60)], { sessionRpe: 9, pain: 3, discomfortSeverity: 5 }));
    expect(c.improved).toBe(false); expect(c.cautions.length).toBe(3);
  });
  it("no baseline volume => no percentage", () => { expect(compareSessions(S("a", []), S("b", [w(5, 50)])).volumeDeltaPct).toBeNull(); });
});

describe("weeks and adherence (America/Bogota)", () => {
  it("week runs Monday 00:00 -05 to next Monday", () => {
    const { start, end } = weekBounds(new Date("2026-10-21T03:00:00Z")); // Tue 22:00 Bogota on Oct 20
    expect(start.toISOString()).toBe("2026-10-19T05:00:00.000Z"); expect(end.toISOString()).toBe("2026-10-26T05:00:00.000Z");
  });
  it("Sunday night Bogota still belongs to the same week", () => {
    expect(weekBounds(new Date("2026-10-26T04:30:00Z")).start.toISOString()).toBe("2026-10-19T05:00:00.000Z");
  });
  it("counts distinct completed sessions only, caps at 100%", () => {
    const logs = [{ session_id: "s1", status: "completed", finished_at: "2026-10-20T15:00:00Z" }, { session_id: "s1", status: "completed", finished_at: "2026-10-21T15:00:00Z" }, { session_id: "s2", status: "abandoned", finished_at: "2026-10-21T15:00:00Z" }, { session_id: "s3", status: "completed", finished_at: "2026-10-12T15:00:00Z" }];
    expect(weeklyAdherence(3, logs, new Date("2026-10-22T12:00:00Z"))).toEqual({ scheduled: 3, completed: 1, pct: 33 });
    expect(weeklyAdherence(0, logs, new Date("2026-10-22T12:00:00Z")).pct).toBeNull();
    expect(completionPct(10, 12)).toBe(100); expect(completionPct(0, 3)).toBe(0);
  });
});

describe("local dates", () => {
  it("uses the Colombian calendar day, not UTC", () => {
    expect(localDate("2026-10-20T02:50:13Z")).toBe("2026-10-19");   // 9:50 pm in Bogota
    expect(localDate("2026-10-20T05:00:00Z")).toBe("2026-10-20");
  });
});

describe("alerts", () => {
  it("separates professional attention from admin reminders", () => {
    const a = workoutAlerts({ pain_level: 7, session_rpe: 10 }, [{ severity: 6 }]);
    expect(a.professional.length).toBe(2); expect(a.admin.length).toBe(1);
    expect(workoutAlerts({ pain_level: 1, session_rpe: 6 }, [{ severity: 3 }])).toEqual({ professional: [], admin: [] });
  });
});
