// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluatePlan } from "@/lib/progression/engine";
import { loadPlanInputs } from "@/lib/progression/inputs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const ok = <T>(r: { data: T; error: unknown }) => { expect(r.error).toBeNull(); return r.data; };

let t1: string, c1: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient;
let exA: string, exB: string; const counters = new Map<string, number>();

async function makePlan(client: string, T: SupabaseClient, trainer: string) {
  const pid = ok(await T.rpc("create_plan", { p_title: "Plan prog", p_goal: null, p_level: "intermediate", p_client: client })) as string;
  const v = (await admin.from("plan_versions").select("id").eq("plan_id", pid).eq("status", "draft").single()).data!.id;
  const s = ok(await T.from("plan_sessions").insert({ version_id: v, position: 1, name: "A" }).select().single())!;
  const a = ok(await T.from("prescribed_exercises").insert({ session_id: s.id, position: 1, exercise_id: exA, sets: 3, reps_min: 8, reps_max: 10, load_kg: 20, progression: "double_progression" }).select().single())!;
  const b = ok(await T.from("prescribed_exercises").insert({ session_id: s.id, position: 2, exercise_id: exB, sets: 4, reps_min: 10, reps_max: 12, load_kg: 30 }).select().single())!;
  ok(await T.rpc("publish_version", { p_version: v }));
  void trainer; return { pid, v, s: s.id, a: a.id, b: b.id };
}
/** Insert a completed workout (n sets of reps×load) on a past day. */
async function logSession(client: string, plan: { pid: string; v: string; s: string }, rows: { pe: string; ex: string; sets: number; reps: number; load: number; rpe?: number; disc?: number }[], o: { rpe?: number; pain?: number; recovery?: number } = {}) {
  const n = counters.get(plan.pid) ?? 0; counters.set(plan.pid, n + 1);
  const day = new Date(Date.now() - (6 - n) * 86400000).toISOString();   // recent: adherence is evaluated over the last two weeks
  const { data: log, error } = await admin.from("workout_logs").insert({ client_id: client, plan_id: plan.pid, version_id: plan.v, session_id: plan.s, started_at: day, planned_sets: rows.reduce((a, r) => a + r.sets, 0), recovery_rating: o.recovery ?? 4 }).select().single();
  expect(error).toBeNull();
  for (const r of rows) {
    for (let i = 1; i <= r.sets; i++) ok(await admin.from("logged_sets").insert({ log_id: log!.id, prescribed_exercise_id: r.pe, exercise_id: r.ex, set_number: i, reps: r.reps, load_kg: r.load, rpe: r.rpe ?? 7 }));
    if (r.disc) ok(await admin.from("exercise_discomforts").insert({ log_id: log!.id, exercise_id: r.ex, severity: r.disc }));
  }
  ok(await admin.from("workout_logs").update({ status: "completed", finished_at: day, session_rpe: o.rpe ?? 7, pain_level: o.pain ?? 0, logged_work_sets: rows.reduce((a, r) => a + r.sets, 0) }).eq("id", log!.id));
}
let cn = 0;
async function freshClient() {   // history is per client: isolate scenarios that depend on "the last N sessions"
  const id = await mk(`gcx${++cn}-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert({ trainer_id: t1, client_id: id });
  await admin.from("consents").insert(["health_data", "share_with_trainer"].map((type) => ({ user_id: id, type })));
  return id;
}
const analyze = async (T: SupabaseClient, planId: string) => {
  const inputs = (await loadPlanInputs(T, planId))!; const proposals = evaluatePlan(inputs.exercises, inputs.ctx);
  const r = ok(await T.rpc("save_recommendations", { p_plan: planId, p_items: proposals })) as { inserted: number; superseded: number };
  return { proposals, ...r };
};
const pending = async (planId: string) => ((await admin.from("coach_recommendations").select("*").eq("plan_id", planId).eq("status", "pending")).data ?? []);

beforeAll(async () => {
  t1 = await mk(`gt1-${run}@x.co`); await mk(`gt2-${run}@x.co`); c1 = await mk(`gc1-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert({ trainer_id: t1, client_id: c1 });
  await admin.from("consents").insert(["health_data", "share_with_trainer"].map((type) => ({ user_id: c1, type })));
  T1 = await login(`gt1-${run}@x.co`); T2 = await login(`gt2-${run}@x.co`); C1 = await login(`gc1-${run}@x.co`);
  // Pick exercises by slug: the engine's load step depends on the equipment (dumbbell = 2 kg), so tests must not depend on row order.
  const { data } = await admin.from("exercises").select("id,slug").is("owner_id", null).in("slug", ["sentadilla-goblet-con-mancuerna", "remo-con-mancuerna-a-una-mano"]);
  exA = data!.find((e) => e.slug === "sentadilla-goblet-con-mancuerna")!.id; exB = data!.find((e) => e.slug === "remo-con-mancuerna-a-una-mano")!.id;
});
afterAll(async () => {
  for (const id of created) { await admin.from("recommendation_decisions").delete().eq("decided_by", id); await admin.from("coach_recommendations").delete().eq("trainer_id", id); }
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("generation is explainable, idempotent and private", () => {
  let plan: Awaited<ReturnType<typeof makePlan>>;
  beforeAll(async () => {
    plan = await makePlan(c1, T1, t1);
    for (let i = 0; i < 2; i++) await logSession(c1, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }, { pe: plan.b, ex: exB, sets: 4, reps: 11, load: 30 }]);
  });
  it("loads real logs and proposes the smallest load step with all five explanation parts", async () => {
    const r = await analyze(T1, plan.pid); expect(r.inserted).toBe(1);
    const [rec] = await pending(plan.pid);
    expect(rec).toMatchObject({ type: "increase_load", scope: "exercise", severity: "info", status: "pending", prescribed_exercise_id: plan.a });
    expect(rec.changes[0]).toMatchObject({ field: "load_kg", from: 20, to: 22 });
    for (const k of ["rationale", "uncertainty", "checks"]) expect(rec[k].length).toBeGreaterThan(0); expect(rec.data_points.length).toBeGreaterThan(0);
  });
  it("re-running with the same data creates nothing new", async () => { const r = await analyze(T1, plan.pid); expect(r.inserted).toBe(0); expect(r.superseded).toBe(0); expect((await pending(plan.pid)).length).toBe(1); });
  it("clients, other trainers and anonymous users cannot see proposals or decisions", async () => {
    expect((await C1.from("coach_recommendations").select("id").eq("plan_id", plan.pid)).data).toEqual([]);
    expect((await T2.from("coach_recommendations").select("id").eq("plan_id", plan.pid)).data).toEqual([]);
    expect((await T2.rpc("save_recommendations", { p_plan: plan.pid, p_items: [] })).error).not.toBeNull();
    expect((await C1.rpc("save_recommendations", { p_plan: plan.pid, p_items: [] })).error).not.toBeNull();
    const anon = createClient(URL, ANON, { auth: { persistSession: false } }); expect((await anon.rpc("save_recommendations", { p_plan: plan.pid, p_items: [] })).error).not.toBeNull();
  });
  it("users cannot write proposals or decisions directly", async () => {
    expect((await T1.from("coach_recommendations").insert({ trainer_id: t1, client_id: c1, plan_id: plan.pid, version_id: plan.v, scope: "client", type: "deload", severity: "info", confidence: "low", title: "x", changes: [], rationale: ["x"], data_points: [], uncertainty: ["x"], checks: ["x"], engine_version: "x", fingerprint: "x" })).error).not.toBeNull();
    const [rec] = await pending(plan.pid);
    await T1.from("coach_recommendations").update({ status: "accepted" }).eq("id", rec.id);
    expect((await admin.from("coach_recommendations").select("status").eq("id", rec.id).single()).data?.status).toBe("pending");
  });
  it("new data supersedes old pending proposals instead of deleting them", async () => {
    await logSession(c1, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }, { pe: plan.b, ex: exB, sets: 4, reps: 11, load: 30 }]);
    const r = await analyze(T1, plan.pid); expect(r.inserted).toBe(1); expect(r.superseded).toBe(1);
    expect((await admin.from("coach_recommendations").select("id").eq("plan_id", plan.pid).eq("status", "superseded")).data?.length).toBe(1);
    expect((await pending(plan.pid)).length).toBe(1);
  });
});

describe("decisions: accept / modify / reject, always traceable, never silent", () => {
  it("accept applies to a DRAFT only; the published version and the client's plan do not change", async () => {
    const plan = await makePlan(c1, T1, t1);
    for (let i = 0; i < 2; i++) await logSession(c1, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }]);
    await analyze(T1, plan.pid); const [rec] = await pending(plan.pid);
    const r = ok(await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "accepted" })) as { status: string; draft_version_id: string };
    expect(r.status).toBe("accepted"); expect(r.draft_version_id).toBeTruthy();
    const pub = await admin.from("prescribed_exercises").select("load_kg").eq("id", plan.a).single(); expect(pub.data?.load_kg).toBe(20);        // published untouched
    const { data: v } = await admin.from("plan_versions").select("status,version_no").eq("id", r.draft_version_id).single(); expect(v).toMatchObject({ status: "draft", version_no: 2 });
    const { data: draftEx } = await admin.from("prescribed_exercises").select("load_kg, plan_sessions!inner(version_id)").eq("plan_sessions.version_id", r.draft_version_id).eq("exercise_id", exA); expect(draftEx![0].load_kg).toBe(22);
    expect((await admin.from("training_plans").select("current_version_id").eq("id", plan.pid).single()).data?.current_version_id).toBe(plan.v);
    expect((await C1.from("plan_versions").select("id").eq("id", r.draft_version_id)).data).toEqual([]);                                          // the client never sees the draft
    const { data: d } = await T1.from("recommendation_decisions").select("*").eq("recommendation_id", rec.id).single();
    expect(d).toMatchObject({ decision: "accepted", decided_by: t1, applied_version_id: r.draft_version_id }); expect(d!.original_changes[0].to).toBe(22);
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "rejected", p_reason: "otra vez" })).error?.message).toMatch(/already resolved/);   // decisions are final
    expect((await T1.from("recommendation_decisions").update({ decision: "rejected" }).eq("recommendation_id", rec.id)).error?.code).toBe("42501");
    expect((await admin.from("recommendation_decisions").select("decision").eq("recommendation_id", rec.id).single()).data?.decision).toBe("accepted");
  });
  it("modify requires new values and a reason, records both versions, and applies the trainer's values", async () => {
    const plan = await makePlan(c1, T1, t1);
    for (let i = 0; i < 2; i++) await logSession(c1, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }]);
    await analyze(T1, plan.pid); const [rec] = await pending(plan.pid);
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "modified", p_reason: "pocos", p_changes: null })).error).not.toBeNull();
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "modified", p_reason: "no", p_changes: rec.changes })).error?.message).toMatch(/reason/);
    const mine = [{ ...rec.changes[0], to: 21 }];
    const r = ok(await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "modified", p_reason: "Subo solo 1 kg por la rodilla del alumno", p_changes: mine })) as { draft_version_id: string };
    const { data: ex } = await admin.from("prescribed_exercises").select("load_kg, plan_sessions!inner(version_id)").eq("plan_sessions.version_id", r.draft_version_id).eq("exercise_id", exA); expect(ex![0].load_kg).toBe(21);
    const { data: d } = await admin.from("recommendation_decisions").select("*").eq("recommendation_id", rec.id).single();
    expect(d).toMatchObject({ decision: "modified", reason: "Subo solo 1 kg por la rodilla del alumno" }); expect(d!.original_changes[0].to).toBe(22); expect(d!.applied_changes[0].to).toBe(21);
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "modified", p_reason: "mal", p_changes: [{ field: "rpe", to: 3 }] })).error).not.toBeNull();   // already resolved
  });
  it("a modification cannot touch fields outside the whitelist or write impossible values", async () => {
    const plan = await makePlan(c1, T1, t1);
    for (let i = 0; i < 2; i++) await logSession(c1, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }]);
    await analyze(T1, plan.pid); const [rec] = await pending(plan.pid);
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "modified", p_reason: "campo no permitido", p_changes: [{ field: "client_notes", to: "hack" }] })).error?.message).toMatch(/cannot be applied/);
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "modified", p_reason: "valor imposible", p_changes: [{ field: "load_kg", to: 99999 }] })).error).not.toBeNull();
    expect((await admin.from("coach_recommendations").select("status").eq("id", rec.id).single()).data?.status).toBe("pending");   // failed attempts roll back completely
    const { data: drafts } = await admin.from("plan_versions").select("id").eq("plan_id", plan.pid).eq("status", "draft"); expect(drafts).toEqual([]);   // ...including the draft that was about to be created
  });
  it("reject needs a reason, changes nothing in the plan, and stays on record", async () => {
    const plan = await makePlan(c1, T1, t1);
    for (let i = 0; i < 2; i++) await logSession(c1, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }]);
    await analyze(T1, plan.pid); const [rec] = await pending(plan.pid);
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "rejected" })).error?.message).toMatch(/reason/);
    ok(await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "rejected", p_reason: "El alumno viene de lesión; prefiero esperar" }));
    expect((await admin.from("plan_versions").select("id").eq("plan_id", plan.pid)).data?.length).toBe(1);     // no draft created
    expect((await admin.from("recommendation_decisions").select("decision,reason").eq("recommendation_id", rec.id).single()).data).toEqual({ decision: "rejected", reason: "El alumno viene de lesión; prefiero esperar" });
    await analyze(T1, plan.pid); expect((await pending(plan.pid)).length).toBe(0);                               // same data -> same fingerprint: a rejected proposal is not nagged again
  });
  it("another trainer cannot decide; neither can the client", async () => {
    const plan = await makePlan(c1, T1, t1);
    for (let i = 0; i < 2; i++) await logSession(c1, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }]);
    await analyze(T1, plan.pid); const [rec] = await pending(plan.pid);
    expect((await T2.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "accepted" })).error?.message).toMatch(/not allowed/);
    expect((await C1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "accepted" })).error?.message).toMatch(/not allowed/);
  });
  it("publishing a new plan version makes pending proposals stale and blocks deciding them", async () => {
    const plan = await makePlan(c1, T1, t1);
    for (let i = 0; i < 2; i++) await logSession(c1, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }]);
    await analyze(T1, plan.pid); const [rec] = await pending(plan.pid);
    const d = ok(await T1.rpc("new_draft_version", { p_plan: plan.pid, p_note: "cambio manual" })) as string; ok(await T1.rpc("publish_version", { p_version: d }));
    expect((await admin.from("coach_recommendations").select("status").eq("id", rec.id).single()).data?.status).toBe("stale");
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "accepted" })).error?.message).toMatch(/already resolved|stale/);
  });
});

describe("safety paths", () => {
  it("discomfort >= 6 yields a professional-attention proposal (never an increase) and informational ones create no draft", async () => {
    const cx = await freshClient(); const plan = await makePlan(cx, T1, t1);
    await logSession(cx, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }]);
    await logSession(cx, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20, disc: 7 }], { pain: 7 });
    await analyze(T1, plan.pid);
    const recs = await pending(plan.pid);
    expect(recs.every((r) => !["increase_load", "increase_reps"].includes(r.type))).toBe(true);
    expect(recs.filter((r) => r.severity === "professional").map((r) => r.type).sort()).toEqual(["request_reassessment", "review_technique"]);
    const tech = recs.find((r) => r.type === "review_technique")!;
    const r = ok(await T1.rpc("decide_recommendation", { p_rec: tech.id, p_decision: "accepted" })) as { draft_version_id: string | null };
    expect(r.draft_version_id).toBeNull(); expect((await admin.from("plan_versions").select("id").eq("plan_id", plan.pid)).data?.length).toBe(1);
  });
  it("deload applies -40% sets / -10% load to every exercise of a draft (never below 1 set, load rounded to 0.5)", async () => {
    const cx = await freshClient(); const plan = await makePlan(cx, T1, t1);
    for (let i = 0; i < 3; i++) await logSession(cx, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 8, load: 20, rpe: 9 }, { pe: plan.b, ex: exB, sets: 4, reps: 10, load: 30, rpe: 9 }], { rpe: 9, recovery: 2 });
    await analyze(T1, plan.pid); const recs = await pending(plan.pid); const dl = recs.find((r) => r.type === "deload");
    expect(dl).toBeTruthy(); expect(recs.some((r) => r.type === "increase_load")).toBe(false);
    const r = ok(await T1.rpc("decide_recommendation", { p_rec: dl!.id, p_decision: "accepted" })) as { draft_version_id: string };
    const { data } = await admin.from("prescribed_exercises").select("exercise_id,sets,load_kg, plan_sessions!inner(version_id)").eq("plan_sessions.version_id", r.draft_version_id);
    const by = Object.fromEntries(data!.map((x) => [x.exercise_id, x])); expect(by[exA]).toMatchObject({ sets: 2, load_kg: 18 }); expect(by[exB]).toMatchObject({ sets: 2, load_kg: 27 });
    expect((await admin.from("prescribed_exercises").select("sets,load_kg").eq("id", plan.a).single()).data).toEqual({ sets: 3, load_kg: 20 });   // published untouched
  });
  it("an expired trainer workspace blocks reading and deciding", async () => {
    const cx = await freshClient(); const plan = await makePlan(cx, T1, t1);
    for (let i = 0; i < 2; i++) await logSession(cx, plan, [{ pe: plan.a, ex: exA, sets: 3, reps: 10, load: 20 }]);
    await analyze(T1, plan.pid); const [rec] = await pending(plan.pid);
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("trainer_id", t1);
    expect((await T1.from("coach_recommendations").select("id").eq("id", rec.id)).data).toEqual([]);
    expect((await T1.rpc("decide_recommendation", { p_rec: rec.id, p_decision: "accepted" })).error?.message).toMatch(/not allowed/);
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() + 86400000).toISOString() }).eq("trainer_id", t1);
  });
});
