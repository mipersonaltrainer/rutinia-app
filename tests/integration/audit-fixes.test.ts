// Requires local Supabase. Regression tests for audit findings SEC-003 … SEC-008 (see docs/SECURITY.md).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { buildClientExport } from "@/lib/privacy/export";
import { PHOTO_BUCKET } from "@/lib/privacy/erase";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, name: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name }, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const ASSESSMENT = { personal: { birthDate: "1990-01-01", sexForFormulas: "male", workType: "sedentary", sittingHours: 5, activityLevel: "light", sleepQuality: 3, stress: 3 }, training: { experienceYears: 1, weeklyFrequency: 3, sessionMinutes: 60, location: "gym" }, goals: { goals: ["fat_loss"] }, health: { chestPainDuringExercise: true, dizzinessOrFainting: false, unusualBreathlessness: false, cardiovascularHistory: false, medicalRestriction: false, medicalClearance: false, pregnancyStatus: "not_applicable", eatingDisorderHistory: false, currentPain: 0 }, habits: { sleepHours: 7, recovery: 3 } };

let t1: string, t2: string, c1: string, c2: string, c3: string, plan1: { id: string; v: string }, sessionOfT2: string, T1: SupabaseClient, C1: SupabaseClient, img: Buffer;
beforeAll(async () => {
  img = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#228844" } }).webp().toBuffer();
  t1 = await mk(`af-t1-${run}@x.co`, "Entrenador Uno"); t2 = await mk(`af-t2-${run}@x.co`, "Entrenador Dos"); c1 = await mk(`af-c1-${run}@x.co`, "Alumno Uno", true); c2 = await mk(`af-c2-${run}@x.co`, "Alumno Dos", true); c3 = await mk(`af-c3-${run}@x.co`, "Alumno Tres", true);
  const ok = (r: { error: { message: string } | null }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };
  ok(await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1, nutrition_enabled: true }, { trainer_id: t2, client_id: c2, nutrition_enabled: false }, { trainer_id: t2, client_id: c3, nutrition_enabled: false }]), "relationships");
  ok(await admin.from("consents").insert([c1, c2].flatMap((u) => ["personal_data", "health_data", "share_with_trainer", "photos"].map((type) => ({ user_id: u, type })))), "consents");
  const { data: ex } = await admin.from("exercises").select("id").is("owner_id", null).limit(1).single();
  const mkPlan = async (trainer: string, client: string, title: string, session: string) => {
    const { data: p } = await admin.from("training_plans").insert({ trainer_id: trainer, client_id: client, title, level: "beginner" }).select("id").single();
    const { data: v } = await admin.from("plan_versions").insert({ plan_id: p!.id, version_no: 1, created_by: trainer }).select("id").single();
    const { data: se } = await admin.from("plan_sessions").insert({ version_id: v!.id, position: 1, name: session }).select("id").single();
    await admin.from("prescribed_exercises").insert({ session_id: se!.id, position: 1, exercise_id: ex!.id, sets: 3, reps_min: 8, reps_max: 10 });
    await admin.from("plan_versions").update({ status: "published", published_at: new Date().toISOString() }).eq("id", v!.id); await admin.from("training_plans").update({ current_version_id: v!.id }).eq("id", p!.id);
    return { id: p!.id, v: v!.id, session: se!.id };
  };
  plan1 = await mkPlan(t1, c1, "Plan exportable", "Sesión exportable"); sessionOfT2 = (await mkPlan(t2, c2, "Plan ajeno", "Sesión ajena")).session;
  T1 = await login(`af-t1-${run}@x.co`); C1 = await login(`af-c1-${run}@x.co`);
});
afterAll(async () => {
  const { data: o } = await admin.storage.from(PHOTO_BUCKET).list(c1); if (o?.length) await admin.storage.from(PHOTO_BUCKET).remove(o.map((x) => `${c1}/${x.name}`));
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("SEC-003: derived and safety fields cannot be written by users", () => {
  it("a client cannot insert an assessment directly (risk level and answers are computed by the server)", async () => {
    const r = await C1.from("assessments").insert({ client_id: c1, kind: "initial", status: "submitted", data: ASSESSMENT, risk_level: "none", risk_reasons: [], submitted_at: new Date().toISOString() });
    expect(r.error, "a forged 'none' risk must be refused").not.toBeNull();
    expect((await admin.from("assessments").select("id").eq("client_id", c1)).data).toEqual([]);
  });
  it("the server path (service role, as the real action) still stores an assessment, and the client and their trainer read it", async () => {
    expect((await admin.from("assessments").insert({ client_id: c1, kind: "initial", status: "submitted", data: ASSESSMENT, risk_level: "professional_evaluation", risk_reasons: ["x"], submitted_at: new Date().toISOString() })).error).toBeNull();
    expect((await C1.from("assessments").select("risk_level")).data).toEqual([{ risk_level: "professional_evaluation" }]);
    expect((await T1.from("assessments").select("risk_level").eq("client_id", c1)).data).toEqual([{ risk_level: "professional_evaluation" }]);
  });
  it("nobody can insert calculation results directly", async () => {
    const { data: m } = await admin.from("anthropometric_measurements").insert({ client_id: c1, entered_by: c1, taken_by: "self", method: "scale", measured_on: "2026-10-01", weight_kg: 70, height_cm: 170 }).select("id").single();
    const row = { client_id: c1, measurement_id: m!.id, indicator: "bmi", value: 1, unit: "x", formula: "f", formula_version: "1", provenance: "estimated", inputs: {} };
    expect((await C1.from("calculation_results").insert(row)).error).not.toBeNull(); expect((await T1.from("calculation_results").insert(row)).error).not.toBeNull();
  });
  it("a workout log can only be created through start_workout, never by inserting a row that points at someone else's session", async () => {
    const r = await C1.from("workout_logs").insert({ client_id: c1, plan_id: plan1.id, version_id: plan1.v, session_id: sessionOfT2, status: "in_progress" });
    expect(r.error, "own plan, another trainer's session").not.toBeNull();
    expect((await admin.from("workout_logs").select("id").eq("client_id", c1)).data).toEqual([]);
  });
});

describe("SEC-004: the export contains everything the platform holds about the client", () => {
  it("includes nutrition plans, assigned training plans and who viewed their data", async () => {
    const { data: food } = await admin.from("foods").select("id").is("owner_id", null).limit(1).single();
    const { data: np } = await admin.from("nutrition_plans").insert({ trainer_id: t1, client_id: c1, title: "Nutrición exportable", status: "published", published_at: new Date().toISOString(), kcal_target: 2000 }).select("id").single();
    const { data: meal } = await admin.from("nutrition_meals").insert({ plan_id: np!.id, position: 1, name: "Desayuno exportable" }).select("id").single();
    await admin.from("nutrition_items").insert({ meal_id: meal!.id, food_id: food!.id, grams: 100 });
    await admin.from("access_audit").insert({ actor_id: t1, client_id: c1, resource: "client_detail" });
    const body = JSON.stringify(await buildClientExport(C1, c1));
    expect(body).toContain("Nutrición exportable"); expect(body).toContain("Desayuno exportable"); expect(body).toContain("Plan exportable"); expect(body).toContain("Sesión exportable"); expect(body).toContain("client_detail");
    expect(body).not.toContain(c2);
  });
});

describe("SEC-005: erasing a client leaves nothing about them in the trainer's inbox", () => {
  it("removes the trainer's notifications that name or link to the erased client", async () => {
    await admin.from("notifications").insert([
      { user_id: t1, kind: "attention", title: "Molestia importante reportada: Alumno Tres", link: `/trainer/clients/${c3}`, dedupe_key: `af-a-${run}` },
      { user_id: t2, kind: "photo_review", title: "Foto de progreso pendiente de revisión", link: `/trainer/clients/${c3}#fotos`, dedupe_key: `af-b-${run}` },
      { user_id: t2, kind: "other", title: "Otra cosa", link: "/trainer/billing", dedupe_key: `af-c-${run}` }]);
    expect((await admin.rpc("erase_client", { p_client: c3 })).error).toBeNull();
    const left = (await admin.from("notifications").select("dedupe_key").in("dedupe_key", [`af-a-${run}`, `af-b-${run}`, `af-c-${run}`])).data!.map((n) => n.dedupe_key);
    expect(left).toEqual([`af-c-${run}`]);
  });
});

describe("SEC-007: the AI audit trail cannot be attributed to clients the caller cannot access", () => {
  it("ai_finish refuses an inaccessible client and an invalid status", async () => {
    const reserve = async () => ((await T1.rpc("ai_reserve", { p_kind: "t", p_client: null, p_sensitive: false })).data as { usage_id: string }).usage_id;
    const fin = (usage: string, client: string | null, st = "ok") => admin.rpc("ai_finish", { p_usage: usage, p_status: "ok", p_provider: "x", p_model: "m", p_in: 1, p_out: 1, p_ms: 1, p_client: client, p_digest: "d", p_output: {}, p_violations: [], p_flags: [], p_inter_status: st });
    expect((await T1.rpc("ai_finish", { p_usage: await reserve(), p_status: "ok", p_provider: "x", p_model: "m", p_in: 1, p_out: 1, p_ms: 1, p_client: null, p_digest: "d", p_output: {}, p_violations: [], p_flags: [], p_inter_status: "ok" })).error, "a user cannot file records").not.toBeNull();
    expect((await fin(await reserve(), c2)).error, "client other than the one reserved for").not.toBeNull();
    expect((await fin(await reserve(), c1, "ok-pero-no")).error, "status outside the allowed set").not.toBeNull();
    expect((await fin(await reserve(), null)).error, "the reserved client (none) is fine").toBeNull();
  });
});

describe("SEC-008: photos, reviews and notifications", () => {
  it("users cannot upload to the photo bucket directly: only the server path (service role) stores photos", async () => {
    const path = `${c1}/${crypto.randomUUID()}.webp`;
    expect((await C1.storage.from(PHOTO_BUCKET).upload(path, img, { contentType: "image/webp" })).error).not.toBeNull();
    expect((await admin.storage.from(PHOTO_BUCKET).upload(path, img, { contentType: "image/webp" })).error).toBeNull();
    expect((await C1.storage.from(PHOTO_BUCKET).download(path)).error).toBeNull();                      // the owner still reads it
  });
  it("the daily photo limit is enforced by the database, not only by the screen", async () => {
    const before = (await admin.from("progress_photos").select("id", { count: "exact", head: true }).eq("client_id", c1)).count ?? 0;
    let failed = 0;
    for (let i = 0; i < 13; i++) { const r = await C1.from("progress_photos").insert({ client_id: c1, taken_on: "2026-10-01", pose: "front", storage_path: `${c1}/lim-${run}-${i}.webp`, content_type: "image/webp", size_bytes: 10 }); if (r.error) failed++; }
    const after = (await admin.from("progress_photos").select("id", { count: "exact", head: true }).eq("client_id", c1)).count ?? 0;
    expect(after - before).toBeLessThanOrEqual(10); expect(failed).toBeGreaterThanOrEqual(3);
  });
  it("a trainer can edit their own review (second save works) and loses it when sharing stops", async () => {
    const { data: p } = await admin.from("progress_photos").select("id").eq("client_id", c1).limit(1).single();
    expect((await T1.from("photo_reviews").upsert({ photo_id: p!.id, trainer_id: t1, comment: "uno" }, { onConflict: "photo_id,trainer_id" })).error).toBeNull();
    expect((await T1.from("photo_reviews").upsert({ photo_id: p!.id, trainer_id: t1, comment: "dos" }, { onConflict: "photo_id,trainer_id" })).error, "second review of the same photo").toBeNull();
    expect((await T1.from("photo_reviews").select("comment").eq("photo_id", p!.id)).data).toEqual([{ comment: "dos" }]);
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    expect((await T1.from("photo_reviews").select("comment").eq("photo_id", p!.id)).data, "no access to the client's data after revocation").toEqual([]);
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "share_with_trainer");
  });
  it("users can mark their notifications as read but cannot rewrite their text or link", async () => {
    await admin.from("notifications").insert({ user_id: c1, kind: "t", title: "original", link: "/client", dedupe_key: `af-n-${run}` });
    await C1.from("notifications").update({ title: "falsificado", link: "https://evil.example" }).eq("dedupe_key", `af-n-${run}`);
    expect((await admin.from("notifications").select("title,link,read_at").eq("dedupe_key", `af-n-${run}`).single()).data).toMatchObject({ title: "original", link: "/client", read_at: null });
    expect((await C1.from("notifications").update({ read_at: new Date().toISOString() }).eq("dedupe_key", `af-n-${run}`)).error).toBeNull();
    expect((await admin.from("notifications").select("read_at").eq("dedupe_key", `af-n-${run}`).single()).data!.read_at).not.toBeNull();
  });
});
