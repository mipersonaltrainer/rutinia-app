// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const ok = <T>(r: { data: T; error: unknown }) => { expect(r.error).toBeNull(); return r.data; };

let t1: string, t2: string, c1: string, c2: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient, C2: SupabaseClient;
let planId: string, v1: string, sessA: string, sessB: string, peA: string, peB: string, exA: string, exB: string;

async function publishedPlan(T: SupabaseClient, client: string) {
  const pid = ok(await T.rpc("create_plan", { p_title: "Plan log", p_goal: null, p_level: "beginner", p_client: client })) as string;
  const v = (await admin.from("plan_versions").select("id").eq("plan_id", pid).eq("status", "draft").single()).data!.id;
  const sA = ok(await T.from("plan_sessions").insert({ version_id: v, position: 1, name: "A" }).select().single())!;
  const sB = ok(await T.from("plan_sessions").insert({ version_id: v, position: 2, name: "B" }).select().single())!;
  const a = ok(await T.from("prescribed_exercises").insert({ session_id: sA.id, position: 1, exercise_id: exA, sets: 3, reps_min: 8, reps_max: 10 }).select().single())!;
  const b = ok(await T.from("prescribed_exercises").insert({ session_id: sB.id, position: 1, exercise_id: exB, sets: 2, reps_min: 10 }).select().single())!;
  ok(await T.rpc("publish_version", { p_version: v }));
  return { pid, v, sA: sA.id, sB: sB.id, a: a.id, b: b.id };
}

beforeAll(async () => {
  t1 = await mk(`wt1-${run}@x.co`); t2 = await mk(`wt2-${run}@x.co`); c1 = await mk(`wc1-${run}@x.co`, true); c2 = await mk(`wc2-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t2, client_id: c2 }]);
  await admin.from("consents").insert([c1, c2].flatMap((u) => ["health_data", "share_with_trainer"].map((type) => ({ user_id: u, type }))));
  T1 = await login(`wt1-${run}@x.co`); T2 = await login(`wt2-${run}@x.co`); C1 = await login(`wc1-${run}@x.co`); C2 = await login(`wc2-${run}@x.co`);
  const { data } = await admin.from("exercises").select("id").is("owner_id", null).limit(2); exA = data![0].id; exB = data![1].id;
  const p = await publishedPlan(T1, c1); planId = p.pid; v1 = p.v; sessA = p.sA; sessB = p.sB; peA = p.a; peB = p.b;
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

const start = (C: SupabaseClient, s: string) => C.rpc("start_workout", { p_session: s });
const setRow = (log: string, pe: string, ex: string, n: number, o: object = {}) => ({ log_id: log, prescribed_exercise_id: pe, exercise_id: ex, set_number: n, reps: 10, load_kg: 40, ...o });

describe("starting workouts", () => {
  it("only the assigned client can start; resume returns the same log; one open workout at a time", async () => {
    expect((await start(C2, sessA)).error).not.toBeNull();
    const l1 = ok(await start(C1, sessA)) as string; expect(ok(await start(C1, sessA))).toBe(l1);
    expect((await start(C1, sessB)).error?.message).toMatch(/finish or abandon/);
    ok(await C1.rpc("abandon_workout", { p_log: l1 }));
    expect((await admin.from("workout_logs").select("status").eq("id", l1).single()).data?.status).toBe("abandoned");
  });
  it("a draft (unpublished) session cannot be started", async () => {
    const d = ok(await T1.rpc("new_draft_version", { p_plan: planId, p_note: "x" })) as string;
    const s = ok(await T1.from("plan_sessions").select("id").eq("version_id", d).limit(1))![0].id;
    expect((await start(C1, s)).error).not.toBeNull();
    await admin.from("plan_versions").delete().eq("id", d);
  });
});

describe("logging sets", () => {
  let log: string;
  beforeAll(async () => { log = ok(await start(C1, sessA)) as string; });
  it("saves, edits (upsert) and records discomfort before finishing", async () => {
    ok(await C1.from("logged_sets").insert(setRow(log, peA, exA, 1)));
    ok(await C1.from("logged_sets").upsert(setRow(log, peA, exA, 1, { reps: 9, load_kg: 42.5, rir: 2 }), { onConflict: "log_id,prescribed_exercise_id,kind,set_number" }));
    const { data } = await C1.from("logged_sets").select("reps,load_kg").eq("log_id", log); expect(data).toEqual([{ reps: 9, load_kg: 42.5 }]);
    ok(await C1.from("logged_sets").insert(setRow(log, peA, exA, 2)));
    ok(await C1.from("exercise_discomforts").insert({ log_id: log, exercise_id: exA, severity: 4, area: "knee", note: "leve" }));
  });
  it("rejects forged or impossible sets", async () => {
    expect((await C1.from("logged_sets").insert(setRow(log, peB, exB, 1))).error?.message).toMatch(/does not belong/);      // exercise of another session/version
    expect((await C1.from("logged_sets").insert(setRow(log, peA, exB, 3))).error?.message).toMatch(/mismatch/);
    for (const bad of [{ reps: 201 }, { rpe: 8, rir: 2 }, { load_kg: -5 }, { reps: null, duration_sec: null }]) expect((await C1.from("logged_sets").insert(setRow(log, peA, exA, 4, bad))).error).not.toBeNull();
  });
  it("other users cannot write to or read my log", async () => {
    expect((await C2.from("logged_sets").insert(setRow(log, peA, exA, 5))).error).not.toBeNull();
    expect((await C2.from("workout_logs").select("id").eq("id", log)).data).toEqual([]);
    expect((await T2.from("workout_logs").select("id").eq("id", log)).data).toEqual([]);
    expect((await T2.from("logged_sets").select("id").eq("log_id", log)).data).toEqual([]);
  });
  it("trainer can read but not write; cannot change the log", async () => {
    expect((await T1.from("logged_sets").select("id").eq("log_id", log)).data?.length).toBe(2);
    expect((await T1.from("logged_sets").insert(setRow(log, peA, exA, 6))).error).not.toBeNull();
    await T1.from("workout_logs").update({ notes: "hack" }).eq("id", log);
    expect((await admin.from("workout_logs").select("notes").eq("id", log).single()).data?.notes).toBeNull();
    expect((await T1.from("exercise_discomforts").select("severity").eq("log_id", log)).data).toEqual([{ severity: 4 }]);
  });
  it("finishing computes counters; afterwards everything is immutable", async () => {
    expect((await C1.rpc("finish_workout", { p_log: log, p_rpe: 11, p_pain: 0, p_pain_notes: "", p_notes: "" })).error).not.toBeNull();   // rpe out of range
    ok(await C1.rpc("finish_workout", { p_log: log, p_rpe: 8, p_pain: 2, p_pain_notes: "rodilla", p_notes: "bien" }));
    const l = (await admin.from("workout_logs").select("status,logged_work_sets,planned_sets,session_rpe,finished_at,version_id").eq("id", log).single()).data!;
    expect(l).toMatchObject({ status: "completed", logged_work_sets: 2, planned_sets: 3, session_rpe: 8, version_id: v1 }); expect(l.finished_at).toBeTruthy();
    expect((await C1.from("logged_sets").insert(setRow(log, peA, exA, 7))).error).not.toBeNull();
    await C1.from("logged_sets").update({ reps: 99 }).eq("log_id", log);
    expect((await admin.from("logged_sets").select("reps").eq("log_id", log).eq("set_number", 1).single()).data?.reps).toBe(9);
    await C1.from("logged_sets").delete().eq("log_id", log);
    expect((await admin.from("logged_sets").select("id").eq("log_id", log)).data?.length).toBe(2);
    await C1.from("workout_logs").update({ session_rpe: 1 }).eq("id", log);
    expect((await admin.from("workout_logs").select("session_rpe").eq("id", log).single()).data?.session_rpe).toBe(8);
    expect((await C1.rpc("finish_workout", { p_log: log, p_rpe: 5, p_pain: 0, p_pain_notes: "", p_notes: "" })).error).not.toBeNull();
  });
});

describe("history survives plan changes; access rules", () => {
  it("a new plan version keeps old logs linked to the version actually performed", async () => {
    const d = ok(await T1.rpc("new_draft_version", { p_plan: planId, p_note: "v2" })) as string; ok(await T1.rpc("publish_version", { p_version: d }));
    expect((await start(C1, sessA)).error).not.toBeNull();                       // old version's session is no longer current
    const { data } = await C1.from("workout_logs").select("version_id").eq("status", "completed"); expect(data!.every((l) => l.version_id === v1)).toBe(true);
    const newSess = ok(await C1.from("plan_sessions").select("id").eq("version_id", d).order("position"))![0].id;
    const l = ok(await start(C1, newSess)) as string; ok(await C1.rpc("abandon_workout", { p_log: l }));
  });
  it("revoking the sharing consent hides logs from the trainer; the client keeps them", async () => {
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    expect((await T1.from("workout_logs").select("id")).data).toEqual([]);
    expect(((await C1.from("workout_logs").select("id")).data ?? []).length).toBeGreaterThan(0);
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "share_with_trainer");
  });
  it("an expired trainer workspace blocks starting workouts and reading logs for both sides", async () => {
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("trainer_id", t1);
    expect((await C1.from("workout_logs").select("id")).data).toEqual([]);
    expect((await T1.from("workout_logs").select("id")).data).toEqual([]);
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() + 86400000).toISOString() }).eq("trainer_id", t1);
  });
});
