// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];

async function mk(email: string, client = false) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} });
  if (error) throw error; created.push(data.user.id); return data.user.id;
}
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const ok = <T>(r: { data: T; error: unknown }) => { expect(r.error).toBeNull(); return r.data; };

let t1: string, t2: string, c1: string, c2: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient;
let exA: string, exB: string;

beforeAll(async () => {
  t1 = await mk(`pt1-${run}@x.co`); t2 = await mk(`pt2-${run}@x.co`); c1 = await mk(`pc1-${run}@x.co`, true); c2 = await mk(`pc2-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t2, client_id: c2 }]);
  T1 = await login(`pt1-${run}@x.co`); T2 = await login(`pt2-${run}@x.co`); C1 = await login(`pc1-${run}@x.co`);
  const { data } = await admin.from("exercises").select("id").is("owner_id", null).limit(2); exA = data![0].id; exB = data![1].id;
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

const mkPlan = async (T: SupabaseClient, client: string | null, title = "Plan") => ok(await T.rpc("create_plan", { p_title: title, p_goal: "fuerza", p_level: "beginner", p_client: client })) as string;
const draftOf = async (planId: string) => (await admin.from("plan_versions").select("id,version_no").eq("plan_id", planId).eq("status", "draft").single()).data!;
async function addSessionWithExercise(T: SupabaseClient, vid: string, name = "Día 1", privateNote?: string) {
  const s = ok(await T.from("plan_sessions").insert({ version_id: vid, position: 1, name }).select().single());
  const e = ok(await T.from("prescribed_exercises").insert({ session_id: s!.id, position: 1, exercise_id: exA, sets: 3, reps_min: 8, reps_max: 10, rest_sec: 90, client_notes: "visible" }).select().single());
  if (privateNote) ok(await T.from("prescribed_private_notes").insert({ prescribed_id: e!.id, trainer_id: (await T.auth.getUser()).data.user!.id, note: privateNote }));
  return { s: s!, e: e! };
}

describe("plan creation and isolation", () => {
  it("creates a plan with a v1 draft for an active client; rejects a stranger", async () => {
    const id = await mkPlan(T1, c1);
    expect((await draftOf(id)).version_no).toBe(1);
    expect((await T1.rpc("create_plan", { p_title: "X", p_goal: null, p_level: null, p_client: c2 })).error).not.toBeNull();
  });
  it("other trainer cannot read or operate on it", async () => {
    const id = await mkPlan(T1, c1); const d = await draftOf(id);
    expect((await T2.from("training_plans").select("id").eq("id", id)).data).toEqual([]);
    expect((await T2.from("plan_versions").select("id").eq("id", d.id)).data).toEqual([]);
    expect((await T2.rpc("publish_version", { p_version: d.id })).error).not.toBeNull();
    expect((await T2.rpc("new_draft_version", { p_plan: id, p_note: "x" })).error).not.toBeNull();
    expect((await T2.from("plan_sessions").insert({ version_id: d.id, position: 1, name: "hack" })).error).not.toBeNull();
  });
  it("client cannot create or edit plans", async () => {
    expect((await C1.rpc("create_plan", { p_title: "Mine", p_goal: null, p_level: null, p_client: c1 })).error).not.toBeNull();
  });
});

describe("publishing, immutability and versions", () => {
  it("cannot publish an empty plan; publishes once it has an exercise", async () => {
    const id = await mkPlan(T1, c1); const d = await draftOf(id);
    expect((await T1.rpc("publish_version", { p_version: d.id })).error?.message).toMatch(/no exercises/);
    await addSessionWithExercise(T1, d.id);
    expect((await T1.rpc("publish_version", { p_version: d.id })).error).toBeNull();
    expect((await admin.from("training_plans").select("current_version_id").eq("id", id).single()).data?.current_version_id).toBe(d.id);
  });
  it("published versions are immutable (insert/update/delete rejected)", async () => {
    const id = await mkPlan(T1, c1); const d = await draftOf(id); const { s, e } = await addSessionWithExercise(T1, d.id);
    ok(await T1.rpc("publish_version", { p_version: d.id }));
    expect((await T1.from("plan_sessions").insert({ version_id: d.id, position: 2, name: "late" })).error).not.toBeNull();
    await T1.from("prescribed_exercises").update({ sets: 9 }).eq("id", e.id);
    expect((await admin.from("prescribed_exercises").select("sets").eq("id", e.id).single()).data?.sets).toBe(3);
    await T1.from("plan_sessions").delete().eq("id", s.id);
    expect((await admin.from("plan_sessions").select("id").eq("id", s.id)).data?.length).toBe(1);
    await T1.from("plan_versions").update({ change_note: "tamper" }).eq("id", d.id);
    expect((await admin.from("plan_versions").select("change_note").eq("id", d.id).single()).data?.change_note).toBeNull();
    expect((await T1.rpc("publish_version", { p_version: d.id })).error).not.toBeNull();
  });
  it("new version clones, edits do not touch v1, history stays", async () => {
    const id = await mkPlan(T1, c1); const d1 = await draftOf(id); await addSessionWithExercise(T1, d1.id, "Día A", "nota privada");
    ok(await T1.rpc("publish_version", { p_version: d1.id }));
    const v2 = ok(await T1.rpc("new_draft_version", { p_plan: id, p_note: "subo series" })) as string;
    expect((await T1.rpc("new_draft_version", { p_plan: id, p_note: "again" })).error).not.toBeNull();   // one draft at a time
    const { data: s2 } = await T1.from("plan_sessions").select("id,name, prescribed_exercises(id,sets, prescribed_private_notes(note))").eq("version_id", v2);
    type Ex = { id: string; prescribed_private_notes: { note: string } | null };
    expect(s2![0].name).toBe("Día A");
    expect((s2![0].prescribed_exercises as unknown as Ex[])[0].prescribed_private_notes?.note).toBe("nota privada");
    await T1.from("prescribed_exercises").update({ sets: 5 }).eq("id", (s2![0].prescribed_exercises as { id: string }[])[0].id);
    ok(await T1.rpc("publish_version", { p_version: v2 }));
    const { data: all } = await T1.from("plan_versions").select("id,version_no,status").eq("plan_id", id).order("version_no");
    expect(all!.map((v) => [v.version_no, v.status])).toEqual([[1, "published"], [2, "published"]]);
    const { data: v1ex } = await T1.from("prescribed_exercises").select("sets, plan_sessions!inner(version_id)").eq("plan_sessions.version_id", d1.id);
    expect(v1ex![0].sets).toBe(3);
  });
});

describe("what the client can see", () => {
  it("sees only published versions, never drafts or private notes", async () => {
    const id = await mkPlan(T1, c1); const d1 = await draftOf(id);
    const { e } = await addSessionWithExercise(T1, d1.id, "Día 1", "SECRETO");
    expect((await C1.from("plan_versions").select("id").eq("id", d1.id)).data).toEqual([]);          // draft hidden
    expect((await C1.from("plan_sessions").select("id").eq("version_id", d1.id)).data).toEqual([]);
    ok(await T1.rpc("publish_version", { p_version: d1.id }));
    expect((await C1.from("plan_versions").select("id").eq("id", d1.id)).data?.length).toBe(1);
    const { data: ex } = await C1.from("prescribed_exercises").select("client_notes").eq("id", e.id); expect(ex![0].client_notes).toBe("visible");
    expect((await C1.from("prescribed_private_notes").select("note")).data).toEqual([]);
  });
  it("another client cannot see it", async () => {
    const C2c = await login(`pc2-${run}@x.co`);
    expect((await C2c.from("training_plans").select("id").eq("client_id", c1)).data).toEqual([]);
  });
  it("expired trainer workspace hides plans from the client and blocks the trainer", async () => {
    const id = await mkPlan(T1, c1); const d = await draftOf(id); await addSessionWithExercise(T1, d.id); ok(await T1.rpc("publish_version", { p_version: d.id }));
    expect((await C1.from("training_plans").select("id").eq("id", id)).data?.length).toBe(1);
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("trainer_id", t1);
    expect((await C1.from("training_plans").select("id").eq("id", id)).data).toEqual([]);
    expect((await T1.from("training_plans").select("id").eq("id", id)).data).toEqual([]);
    expect((await T1.rpc("create_plan", { p_title: "Nope", p_goal: null, p_level: null, p_client: c1 })).error).not.toBeNull();
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() + 86400000).toISOString() }).eq("trainer_id", t1);
  });
});

describe("templates", () => {
  it("assign creates an independent copy; later template edits do not alter it", async () => {
    const tpl = await mkPlan(T1, null, "Plantilla fullbody"); const td = await draftOf(tpl); await addSessionWithExercise(T1, td.id, "Fullbody");
    expect((await T1.rpc("assign_template", { p_template: tpl, p_client: c1 })).error?.message).toMatch(/publish the template/);
    ok(await T1.rpc("publish_version", { p_version: td.id }));
    const copy = ok(await T1.rpc("assign_template", { p_template: tpl, p_client: c1 })) as string;
    const t2v = ok(await T1.rpc("new_draft_version", { p_plan: tpl, p_note: "cambio" })) as string;
    await T1.from("plan_sessions").update({ name: "CAMBIADO" }).eq("version_id", t2v);
    ok(await T1.rpc("publish_version", { p_version: t2v }));
    const { data } = await T1.from("plan_sessions").select("name, plan_versions!inner(plan_id)").eq("plan_versions.plan_id", copy);
    expect(data!.map((s) => s.name)).toEqual(["Fullbody"]);
    expect((await admin.from("training_plans").select("source_template_id,is_template").eq("id", copy).single()).data).toEqual({ source_template_id: tpl, is_template: false });
  });
  it("cannot assign another trainer's template or to a non-client", async () => {
    const tpl = await mkPlan(T1, null, "Plantilla T"); const d = await draftOf(tpl); await addSessionWithExercise(T1, d.id); ok(await T1.rpc("publish_version", { p_version: d.id }));
    expect((await T2.rpc("assign_template", { p_template: tpl, p_client: c2 })).error).not.toBeNull();
    expect((await T1.rpc("assign_template", { p_template: tpl, p_client: c2 })).error).not.toBeNull();
  });
});

describe("safety gate on publishing", () => {
  it("blocks publishing for a client flagged for professional evaluation unless a documented reason is given", async () => {
    await admin.from("assessments").insert({ client_id: c1, status: "submitted", data: {}, risk_level: "professional_evaluation", risk_reasons: ["Mareo"], submitted_at: new Date().toISOString() });
    const id = await mkPlan(T1, c1); const d = await draftOf(id); await addSessionWithExercise(T1, d.id);
    expect((await T1.rpc("publish_version", { p_version: d.id })).error?.message).toMatch(/professional evaluation/);
    expect((await T1.rpc("publish_version", { p_version: d.id, p_override: "corto" })).error).not.toBeNull();
    ok(await T1.rpc("publish_version", { p_version: d.id, p_override: "Autorización médica recibida por escrito el 2026-10-01" }));
    expect((await admin.from("plan_versions").select("risk_override_reason").eq("id", d.id).single()).data?.risk_override_reason).toMatch(/Autorización/);
    await admin.from("assessments").delete().eq("client_id", c1);
  });
});

describe("editing helpers and exercises RLS", () => {
  it("move_exercise swaps order, duplicate_session copies", async () => {
    const id = await mkPlan(T1, null, "Orden"); const d = await draftOf(id); const { s, e } = await addSessionWithExercise(T1, d.id);
    const e2 = ok(await T1.from("prescribed_exercises").insert({ session_id: s.id, position: 2, exercise_id: exB, reps_min: 10 }).select().single());
    ok(await T1.rpc("move_exercise", { p_id: e2!.id, p_dir: -1 }));
    const { data } = await T1.from("prescribed_exercises").select("id,position").eq("session_id", s.id).order("position");
    expect(data!.map((x) => x.id)).toEqual([e2!.id, e.id]);
    const dup = ok(await T1.rpc("duplicate_session", { p_id: s.id })) as string;
    expect((await T1.from("prescribed_exercises").select("id").eq("session_id", dup)).data?.length).toBe(2);
  });
  it("prescription validation rejects impossible values", async () => {
    const id = await mkPlan(T1, null, "Val"); const d = await draftOf(id); const s = ok(await T1.from("plan_sessions").insert({ version_id: d.id, position: 1, name: "s" }).select().single());
    for (const bad of [{ sets: 0, reps_min: 5 }, { sets: 3, reps_min: 12, reps_max: 8 }, { sets: 3 }, { sets: 3, reps_min: 5, rpe: 11 }, { sets: 3, reps_min: 5, tempo: "abc" }])
      expect((await T1.from("prescribed_exercises").insert({ session_id: s!.id, position: 1, exercise_id: exA, ...bad })).error).not.toBeNull();
  });
  it("custom exercises are private to their trainer and visible to their clients; globals are read-only", async () => {
    const mine = ok(await T1.from("exercises").insert({ owner_id: t1, slug: `mio-${run}`, name_es: `Mío ${run}`, primary_muscle: "chest", equipment: "bodyweight", difficulty: "beginner", movement_pattern: "push_horizontal", exercise_type: "strength", source: "t" }).select().single());
    expect((await T2.from("exercises").select("id").eq("id", mine!.id)).data).toEqual([]);
    expect((await C1.from("exercises").select("id").eq("id", mine!.id)).data?.length).toBe(1);
    expect((await T2.from("exercises").insert({ owner_id: null, slug: `g-${run}`, name_es: `G ${run}`, primary_muscle: "chest", equipment: "bodyweight", difficulty: "beginner", movement_pattern: "push_horizontal", exercise_type: "strength", source: "t" })).error).not.toBeNull();
    await T1.from("exercises").update({ name_es: "hack" }).eq("id", exA);
    expect((await admin.from("exercises").select("name_es").eq("id", exA).single()).data?.name_es).not.toBe("hack");
    expect((await T1.from("exercise_media").insert({ exercise_id: exA, owner_id: t1, kind: "video", url: "https://x.co/v", provenance: "mine" })).error).not.toBeNull(); // not owner of a global exercise
    expect((await T1.from("exercise_media").insert({ exercise_id: mine!.id, owner_id: t1, kind: "video", url: "http://x.co/v", provenance: "mine" })).error).not.toBeNull(); // https only
    expect((await T1.from("exercise_media").insert({ exercise_id: mine!.id, owner_id: t1, kind: "video", url: "https://x.co/v", provenance: "Grabado por mí" })).error).toBeNull();
  });
});
