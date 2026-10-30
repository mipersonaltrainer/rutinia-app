import { describe, it, expect } from "vitest";
import { ACHIEVEMENT_STEPS, achievements, buildChallenges, dailyMessage, onboardingSteps, pickToday, recentRecords, streakWeeks, weekStrip, weightTrend, type HLog, type HSession } from "@/lib/dashboard/client-home";

// 2026-10-26 is a Monday. Colombia is UTC-5 all year, so "10:00 local" is 15:00Z.
const at = (iso: string) => new Date(iso);
const WED = at("2026-10-28T15:00:00Z"), SUN = at("2026-11-01T15:00:00Z");
const S = (id: string, position: number, weekday: number | null = null): HSession => ({ id, name: `Sesión ${id}`, position, weekday, exercises: [{ name: "Sentadilla", sets: 4 }, { name: "Remo", sets: 3 }] });
const done = (session: string, finished: string, id = `${session}-${finished}`): HLog => ({ id, session_id: session, status: "completed", started_at: finished, finished_at: finished, session_rpe: 7, pain_level: 0 });

describe("which workout is today's", () => {
  it("no published plan, no sessions: nothing to train yet", () => expect(pickToday([], [], WED)).toEqual({ kind: "none" }));
  it("a workout left half-way is always offered first", () => {
    const open: HLog = { id: "L1", session_id: "B", status: "in_progress", started_at: "2026-10-28T14:00:00Z", finished_at: null, session_rpe: null, pain_level: null };
    expect(pickToday([S("A", 1), S("B", 2)], [open], WED)).toMatchObject({ kind: "in_progress", logId: "L1", session: { id: "B" } });
  });
  it("sessions with weekdays: today's weekday decides", () => {
    expect(pickToday([S("A", 1, 1), S("B", 2, 3), S("C", 3, 5)], [], WED)).toMatchObject({ kind: "ready", why: "scheduled", session: { id: "B" } });
  });
  it("sessions with weekdays and none today: a rest day, and the next scheduled session is named", () => {
    const r = pickToday([S("A", 1, 1), S("C", 2, 5)], [], WED);
    expect(r).toMatchObject({ kind: "rest", next: { id: "C" } });
  });
  it("a rest day wraps to next week's first session after the last scheduled day", () => {
    expect(pickToday([S("A", 1, 1), S("C", 2, 3)], [], SUN)).toMatchObject({ kind: "rest", next: { id: "A" } });
  });
  it("no weekdays: the session after the last one finished, in order, and back to the first after the last", () => {
    const plan = [S("A", 1), S("B", 2), S("C", 3)];
    expect(pickToday(plan, [], WED)).toMatchObject({ kind: "ready", why: "next", session: { id: "A" } });
    expect(pickToday(plan, [done("A", "2026-10-26T15:00:00Z")], WED)).toMatchObject({ kind: "ready", session: { id: "B" } });
    expect(pickToday(plan, [done("C", "2026-10-26T15:00:00Z")], WED)).toMatchObject({ kind: "ready", session: { id: "A" } });
  });
  it("already trained today: celebrate and say what comes next", () => {
    const plan = [S("A", 1), S("B", 2)];
    expect(pickToday(plan, [done("A", "2026-10-28T13:00:00Z")], WED)).toMatchObject({ kind: "done_today", next: { id: "B" } });
  });
  it("'today' is the Colombian day: a workout finished at 03:00Z on the 29th still belongs to the 28th", () => {
    expect(pickToday([S("A", 1), S("B", 2)], [done("A", "2026-10-29T03:00:00Z")], WED).kind).toBe("done_today");
  });
  it("abandoned workouts never count as done", () => {
    const aband: HLog = { ...done("A", "2026-10-28T13:00:00Z"), status: "abandoned" };
    expect(pickToday([S("A", 1)], [aband], WED)).toMatchObject({ kind: "ready", session: { id: "A" } });
  });
});

describe("the week strip", () => {
  it("seven days Monday to Sunday, today marked, trained days checked, future days not", () => {
    const strip = weekStrip([done("A", "2026-10-26T15:00:00Z"), done("B", "2026-10-28T13:00:00Z")], WED);
    expect(strip.map((d) => d.label)).toEqual(["L", "M", "M", "J", "V", "S", "D"]);
    expect(strip.map((d) => d.trained)).toEqual([true, false, true, false, false, false, false]);
    expect(strip.map((d) => d.today)).toEqual([false, false, true, false, false, false, false]);
    expect(strip.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
    expect(strip[0].date).toBe("2026-10-26");
  });
  it("a workout from last week does not light up this week", () => expect(weekStrip([done("A", "2026-10-25T15:00:00Z")], WED).some((d) => d.trained)).toBe(false));
});

describe("weekly streak", () => {
  const week = (n: number) => done("A", new Date(Date.UTC(2026, 9, 26 + n * 7, 15)).toISOString(), `w${n}`);     // n = 0 this week, -1 last week…
  it("no workouts: 0", () => expect(streakWeeks([], WED)).toBe(0));
  it("counts consecutive weeks with at least one workout, this week included", () => expect(streakWeeks([week(0), week(-1), week(-2)], WED)).toBe(3));
  it("this week with nothing yet does not break the streak (the week is not over)", () => expect(streakWeeks([week(-1), week(-2)], WED)).toBe(2));
  it("a missed full week ends it", () => expect(streakWeeks([week(0), week(-2), week(-3)], WED)).toBe(1));
  it("several workouts in one week count once", () => expect(streakWeeks([week(0), done("B", "2026-10-27T15:00:00Z"), week(-1)], WED)).toBe(2));
});

describe("challenges", () => {
  const base = { now: WED, sessionsPerWeek: 3, completedThisWeek: 1, measuredThisWeek: false, streak: 1, recordsThisMonth: [] as { exercise: string; detail: string }[] };
  it("the weekly goal comes from the plan and shows real progress", () => {
    const c = buildChallenges(base).find((x) => x.id === "sessions")!;
    expect(c).toMatchObject({ done: false, progress: { value: 1, target: 3 } });
    expect(buildChallenges({ ...base, completedThisWeek: 3 }).find((x) => x.id === "sessions")!.done).toBe(true);
  });
  it("without a plan there is no sessions challenge, and no division by zero", () => expect(buildChallenges({ ...base, sessionsPerWeek: 0 }).some((x) => x.id === "sessions")).toBe(false));
  it("measuring this week is a challenge until it is done", () => {
    expect(buildChallenges(base).find((x) => x.id === "measure")!.done).toBe(false);
    expect(buildChallenges({ ...base, measuredThisWeek: true }).find((x) => x.id === "measure")!.done).toBe(true);
  });
  it("the streak challenge always aims at the next milestone", () => {
    expect(buildChallenges({ ...base, streak: 1 }).find((x) => x.id === "streak")!.progress).toEqual({ value: 1, target: 2 });
    expect(buildChallenges({ ...base, streak: 3 }).find((x) => x.id === "streak")!.progress).toEqual({ value: 3, target: 4 });
    expect(buildChallenges({ ...base, streak: 60 }).find((x) => x.id === "streak")!.progress!.target).toBeGreaterThan(60);
  });
  it("a personal record this month completes its challenge and names the exercise", () => {
    const c = buildChallenges({ ...base, recordsThisMonth: [{ exercise: "Press de banca", detail: "60 kg × 6" }] }).find((x) => x.id === "record")!;
    expect(c.done).toBe(true); expect(c.detail).toContain("Press de banca");
  });
});

describe("achievements", () => {
  it("unlock by real totals and show how far the next ones are", () => {
    const a = achievements({ completed: 6, streak: 2, records: 0 });
    const by = (id: string) => a.find((x) => x.id === id)!;
    expect(by("w1").unlocked).toBe(true); expect(by("w5").unlocked).toBe(true); expect(by("w10")).toMatchObject({ unlocked: false, progress: { value: 6, target: 10 } });
    expect(by("s2").unlocked).toBe(true); expect(by("s4").unlocked).toBe(false); expect(by("pr1").unlocked).toBe(false);
  });
  it("nothing is unlocked for someone who has not trained, and nothing is invented", () => expect(achievements({ completed: 0, streak: 0, records: 0 }).some((x) => x.unlocked)).toBe(false));
  it("the thresholds are the documented ones", () => expect(ACHIEVEMENT_STEPS.workouts).toEqual([1, 5, 10, 25, 50]));
});

describe("personal records (last 30 days)", () => {
  const set = (log: string, date: string, load: number, reps: number, ex = "e1", name = "Press de banca") => ({ log_id: log, exercise_id: ex, name, date, kind: "work" as const, reps, load_kg: load });
  it("reports a record only if it beat an earlier best and happened in the window", () => {
    const rows = [set("l1", "2026-09-01", 50, 8), set("l2", "2026-10-20", 60, 6)];
    expect(recentRecords(rows, WED, 30)).toEqual([expect.objectContaining({ exercise: "Press de banca", date: "2026-10-20" })]);
  });
  it("the first time you ever log an exercise is a baseline, not a record", () => expect(recentRecords([set("l1", "2026-10-20", 60, 6)], WED, 30)).toEqual([]));
  it("an old record is not 'recent'", () => expect(recentRecords([set("l1", "2026-06-01", 50, 8), set("l2", "2026-07-01", 60, 6)], WED, 30)).toEqual([]));
  it("warm-up sets never count", () => {
    const warm = { ...set("l2", "2026-10-20", 90, 5), kind: "warmup" as never };
    expect(recentRecords([set("l1", "2026-09-01", 50, 8), warm], WED, 30)).toEqual([]);
  });
});

describe("weight trend, neutral by design", () => {
  it("reports first and latest weight and the difference, never a judgement", () => {
    expect(weightTrend([{ measured_on: "2026-10-01", weight_kg: 68.4 }, { measured_on: "2026-10-20", weight_kg: 66.9 }])).toEqual({ first: 68.4, last: 66.9, delta: -1.5, count: 2 });
  });
  it("fewer than two weights: no comparison", () => {
    expect(weightTrend([{ measured_on: "2026-10-20", weight_kg: 66.9 }])).toMatchObject({ last: 66.9, delta: null });
    expect(weightTrend([{ measured_on: "2026-10-20", weight_kg: null }])).toBeNull();
  });
});

describe("daily message", () => {
  it("is deterministic for a given day and changes across days", () => {
    expect(dailyMessage({ now: WED, state: "ready", streak: 0 })).toBe(dailyMessage({ now: WED, state: "ready", streak: 0 }));
    const days = new Set(Array.from({ length: 14 }, (_, i) => dailyMessage({ now: new Date(WED.getTime() + i * 86400000), state: "ready", streak: 0 })));
    expect(days.size).toBeGreaterThan(5);
  });
  it("speaks to what is happening: finished today, a streak, a workout left open", () => {
    expect(dailyMessage({ now: WED, state: "done_today", streak: 0 })).toMatch(/hoy/i);
    expect(dailyMessage({ now: WED, state: "ready", streak: 3 })).toContain("3 semanas");
    expect(dailyMessage({ now: WED, state: "in_progress", streak: 0 })).toMatch(/entrenamiento/i);
  });
  it("never shames: no guilt about missed days or weight", () => {
    for (let i = 0; i < 40; i++) for (const state of ["ready", "rest", "done_today", "in_progress", "none"] as const) expect(dailyMessage({ now: new Date(WED.getTime() + i * 86400000), state, streak: i % 5 })).not.toMatch(/perezos|fallaste|gordo|kilos de más|castigo|culpa/i);
  });
});

describe("what to do while there is no plan yet", () => {
  it("lists real steps and marks the ones already done", () => {
    const steps = onboardingSteps({ hasAssessment: true, hasMeasurement: false, hasMessage: false });
    expect(steps.map((s) => [s.id, s.done])).toEqual([["assessment", true], ["measure", false], ["message", false]]);
    expect(steps.every((s) => s.href.startsWith("/client/"))).toBe(true);
  });
});
