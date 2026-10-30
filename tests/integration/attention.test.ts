// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ATTENTION_THRESHOLD } from "@/lib/training/metrics";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345";
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const ok = <T>(r: { data: T; error: unknown }) => { expect(r.error).toBeNull(); return r.data; };
const mine = async (user: string) => (await admin.from("notifications").select("kind,title,body,link,dedupe_key").eq("user_id", user).eq("kind", "attention")).data ?? [];

let t1: string, t2: string, c1: string, c2: string, C1: SupabaseClient, T1: SupabaseClient, ex: string[] = [];
let plan: { a: string; b: string; sess: string };

async function world(tag: string) {
  const t = await mk(`att-${tag}-t-${run}@x.co`), c = await mk(`att-${tag}-c-${run}@x.co`, true);
  await admin.from("profiles").update({ full_name: `Alumno ${tag}` }).eq("id", c);
  await admin.from("trainer_client_relationships").insert({ trainer_id: t, client_id: c });
  await admin.from("consents").insert(["health_data", "share_with_trainer"].map((type) => ({ user_id: c, type })));
  const T = await login(`att-${tag}-t-${run}@x.co`), C = await login(`att-${tag}-c-${run}@x.co`);
  const pid = ok(await T.rpc("create_plan", { p_title: "Plan att", p_goal: null, p_level: "beginner", p_client: c })) as string;
  const v = (await admin.from("plan_versions").select("id").eq("plan_id", pid).eq("status", "draft").single()).data!.id;
  const s = ok(await T.from("plan_sessions").insert({ version_id: v, position: 1, name: "S" }).select().single())!;
  await T.from("prescribed_exercises").insert([{ session_id: s.id, position: 1, exercise_id: ex[0], sets: 2, reps_min: 8 }, { session_id: s.id, position: 2, exercise_id: ex[1], sets: 2, reps_min: 8 }]);
  ok(await T.rpc("publish_version", { p_version: v }));
  return { t, c, T, C, sess: s.id as string };
}
const startLog = async (C: SupabaseClient, sess: string) => ok(await C.rpc("start_workout", { p_session: sess })) as string;

beforeAll(async () => {
  ex = (await admin.from("exercises").select("id").is("owner_id", null).order("slug").limit(2)).data!.map((e) => e.id);
  const w1 = await world("one"); t1 = w1.t; c1 = w1.c; T1 = w1.T; C1 = w1.C; plan = { a: ex[0], b: ex[1], sess: w1.sess };
  const w2 = await world("two"); t2 = w2.t; c2 = w2.c;
});

describe("trainer notification for significant discomfort", () => {
  it("the boundary equals the shared constant: below it nothing, at it exactly one notification", async () => {
    const log = await startLog(C1, plan.sess);
    ok(await C1.from("exercise_discomforts").insert({ log_id: log, exercise_id: plan.a, severity: ATTENTION_THRESHOLD - 1, area: "knee" }));
    expect(await mine(t1)).toHaveLength(0);
    ok(await C1.from("exercise_discomforts").update({ severity: ATTENTION_THRESHOLD }).eq("log_id", log).eq("exercise_id", plan.a));
    const n = await mine(t1); expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: "attention", link: `/trainer/clients/${c1}`, dedupe_key: `discomfort:${log}:${plan.a}` });
    expect(n[0].title).toContain("Alumno one");
    ok(await C1.rpc("abandon_workout", { p_log: log }));
  });

  it("carries no health detail: no intensity, area, note or exercise in the notification", async () => {
    const log = await startLog(C1, plan.sess);
    ok(await C1.from("exercise_discomforts").insert({ log_id: log, exercise_id: plan.b, severity: 9, area: "lower_back", note: "dolor-lumbar-secreto" }));
    const all = await mine(t1); const mineNew = all.find((n) => n.dedupe_key.endsWith(plan.b))!;
    const text = JSON.stringify(mineNew);
    for (const leak of ["9/10", "lower_back", "lumbar", "dolor-lumbar-secreto"]) expect(text).not.toContain(leak);
    expect(mineNew.body).toMatch(/Revisa su ficha/);
    ok(await C1.rpc("abandon_workout", { p_log: log }));
  });

  it("editing the same discomfort again does not notify twice, and a different exercise does", async () => {
    const log = await startLog(C1, plan.sess);
    const before = (await mine(t1)).length;
    ok(await C1.from("exercise_discomforts").upsert({ log_id: log, exercise_id: plan.a, severity: 7, area: "knee" }, { onConflict: "log_id,exercise_id" }));
    ok(await C1.from("exercise_discomforts").upsert({ log_id: log, exercise_id: plan.a, severity: 10, area: "knee" }, { onConflict: "log_id,exercise_id" }));
    ok(await C1.from("exercise_discomforts").update({ note: "otra nota" }).eq("log_id", log).eq("exercise_id", plan.a));
    expect((await mine(t1)).length).toBe(before + 1);
    ok(await C1.from("exercise_discomforts").insert({ log_id: log, exercise_id: plan.b, severity: 6, area: "hip" }));
    expect((await mine(t1)).length).toBe(before + 2);
    ok(await C1.rpc("abandon_workout", { p_log: log }));
  });

  it("general pain at the threshold when finishing notifies once; below it does not", async () => {
    const before = (await mine(t1)).length;
    const low = await startLog(C1, plan.sess);
    ok(await C1.rpc("finish_workout", { p_log: low, p_rpe: 7, p_pain: ATTENTION_THRESHOLD - 1, p_pain_notes: "", p_notes: "" }));
    expect((await mine(t1)).length).toBe(before);
    const high = await startLog(C1, plan.sess);
    ok(await C1.rpc("finish_workout", { p_log: high, p_rpe: 7, p_pain: ATTENTION_THRESHOLD, p_pain_notes: "espalda", p_notes: "" }));
    const after = await mine(t1); expect(after.length).toBe(before + 1);
    expect(after.some((n) => n.dedupe_key === `pain:${high}`)).toBe(true);
    expect(JSON.stringify(after)).not.toContain("espalda");
  });

  it("only the client's own trainer is told; an unrelated trainer never is", async () => {
    expect((await mine(t2)).length).toBe(0);
  });

  it("without the client's consents nobody is notified (and restoring them re-enables it)", async () => {
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    const before = (await mine(t1)).length; const log = await startLog(C1, plan.sess);
    ok(await C1.from("exercise_discomforts").insert({ log_id: log, exercise_id: plan.a, severity: 10, area: "knee" }));
    expect((await mine(t1)).length).toBe(before);
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "share_with_trainer");
    ok(await C1.from("exercise_discomforts").update({ severity: 9 }).eq("log_id", log).eq("exercise_id", plan.a));
    expect((await mine(t1)).length).toBe(before + 1);                                         // the consent is back, the next write notifies
    ok(await C1.rpc("abandon_workout", { p_log: log }));
  });

  it("an archived relationship is not notified", async () => {
    const w = await world("arch"); await admin.from("trainer_client_relationships").update({ status: "archived" }).eq("trainer_id", w.t);
    const log = await startLog(w.C, w.sess).catch(() => null);
    if (log) { await w.C.from("exercise_discomforts").insert({ log_id: log, exercise_id: ex[0], severity: 10, area: "knee" }); }
    expect((await mine(w.t)).length).toBe(0);
  });

  it("users cannot forge or read others' attention notifications, nor call the notifier directly", async () => {
    expect((await C1.from("notifications").insert({ user_id: t1, kind: "attention", title: "x", dedupe_key: "forged" })).error).not.toBeNull();
    expect((await C1.rpc("notify_trainer_attention", { p_client: c1, p_key: "direct" })).error).not.toBeNull();
    expect((await T1.rpc("notify_trainer_attention", { p_client: c1, p_key: "direct" })).error).not.toBeNull();
    expect((await C1.from("notifications").select("id").eq("user_id", t1)).data).toEqual([]);          // the client cannot read the trainer's inbox
    void c2;
  });
});
