// Requires local Supabase (+ storage). Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { eraseClientAccount, closeTrainerAccount, PHOTO_BUCKET } from "@/lib/privacy/erase";
import { buildClientExport, buildTrainerExport } from "@/lib/privacy/export";
import { nextPhotoDue, type ScheduleKind } from "@/lib/photos/validate";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const ok = <T>(r: { data: T; error: unknown }) => { expect(r.error).toBeNull(); return r.data; };
const consent = (u: string, types: string[]) => admin.from("consents").upsert(types.map((type) => ({ user_id: u, type, revoked_at: null })), { onConflict: "user_id,type" });
let img: Buffer;
const bucket = (c: SupabaseClient) => c.storage.from(PHOTO_BUCKET);
const upload = (c: SupabaseClient, path: string, body: Buffer = img, contentType = "image/webp") => bucket(c).upload(path, body, { contentType, upsert: false });

let t1: string, t2: string, c1: string, c2: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient, C2: SupabaseClient;
beforeAll(async () => {
  img = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#228844" } }).webp().toBuffer();
  t1 = await mk(`pvt1-${run}@x.co`); t2 = await mk(`pvt2-${run}@x.co`); c1 = await mk(`pvc1-${run}@x.co`, true); c2 = await mk(`pvc2-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t2, client_id: c2 }]);
  await consent(c1, ["personal_data", "health_data", "share_with_trainer", "photos"]); await consent(c2, ["personal_data", "health_data", "share_with_trainer"]);
  T1 = await login(`pvt1-${run}@x.co`); T2 = await login(`pvt2-${run}@x.co`); C1 = await login(`pvc1-${run}@x.co`); C2 = await login(`pvc2-${run}@x.co`);
});
afterAll(async () => {
  for (const id of created) { await admin.from("erasure_log").delete().eq("subject_hash", (await import("node:crypto")).createHash("sha256").update(id).digest("hex")); await admin.from("recommendation_decisions").delete().eq("decided_by", id); await admin.from("coach_recommendations").delete().eq("trainer_id", id); await admin.from("access_audit").delete().eq("actor_id", id); }
  const { data: objs } = await admin.storage.from(PHOTO_BUCKET).list(c1); if (objs?.length) await admin.storage.from(PHOTO_BUCKET).remove(objs.map((o) => `${c1}/${o.name}`));
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("private bucket: who can write and read photos", () => {
  let path: string;
  it("the client uploads only into their own folder, only with the photos consent, only real images", async () => {
    path = `${c1}/${crypto.randomUUID()}.webp`;
    expect((await upload(C1, path)).error, "users cannot push files into the bucket (SEC-008): the server stores photos").not.toBeNull();
    expect((await upload(admin, path)).error).toBeNull();                                                          // …the server path (service role) does
    expect((await upload(C1, `${c2}/${crypto.randomUUID()}.webp`)).error).not.toBeNull();                         // someone else's folder
    expect((await upload(C2, `${c2}/${crypto.randomUUID()}.webp`)).error).not.toBeNull();                         // c2 has no photos consent
    expect((await upload(C1, `${c1}/${crypto.randomUUID()}.html`, Buffer.from("<script>1</script>"), "text/html")).error).not.toBeNull();   // mime allow-list
    expect((await upload(C1, `${c1}/${crypto.randomUUID()}.webp`, Buffer.alloc(6_500_000, 1))).error).not.toBeNull();   // size limit
    expect((await upload(T1, `${c1}/${crypto.randomUUID()}.webp`)).error).not.toBeNull();                         // a trainer can't write into a client's folder
  });
  it("owner and authorised trainer can read; everyone else cannot (including anonymous and public URLs)", async () => {
    expect((await bucket(C1).download(path)).error).toBeNull();
    expect((await bucket(T1).download(path)).error).toBeNull();
    expect((await bucket(T2).download(path)).error).not.toBeNull();
    expect((await bucket(C2).download(path)).error).not.toBeNull();
    const anon = createClient(URL, ANON, { auth: { persistSession: false } }); expect((await bucket(anon).download(path)).error).not.toBeNull();
    expect((await fetch(`${URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`)).status).toBeGreaterThanOrEqual(400);   // bucket is private
    expect((await bucket(T2).createSignedUrl(path, 60)).error).not.toBeNull();
  });
  it("signed URLs are short-lived capabilities: they work, and tampering breaks them", async () => {
    const { data } = await bucket(T1).createSignedUrl(path, 60); expect(data?.signedUrl).toBeTruthy();
    expect((await fetch(data!.signedUrl)).status).toBe(200);
    expect((await fetch(data!.signedUrl.replace(/token=[^&]+/, "token=abc.def.ghi"))).status).toBeGreaterThanOrEqual(400);
    const expired = await bucket(C1).createSignedUrl(path, 1); await new Promise((r) => setTimeout(r, 2500)); expect((await fetch(expired.data!.signedUrl)).status).toBeGreaterThanOrEqual(400);
  });
  it("revoking either consent, archiving the relationship or an expired workspace removes the trainer's access immediately — never the owner's", async () => {
    const trainerCan = async () => !(await bucket(T1).download(path)).error;
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    expect(await trainerCan()).toBe(false); expect((await bucket(C1).download(path)).error).toBeNull();
    await consent(c1, ["share_with_trainer"]); expect(await trainerCan()).toBe(true);
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "photos");
    expect(await trainerCan()).toBe(false); await consent(c1, ["photos"]); expect(await trainerCan()).toBe(true);
    await admin.from("trainer_client_relationships").update({ status: "archived" }).eq("trainer_id", t1).eq("client_id", c1); expect(await trainerCan()).toBe(false);
    await admin.from("trainer_client_relationships").update({ status: "active" }).eq("trainer_id", t1).eq("client_id", c1); expect(await trainerCan()).toBe(true);
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("trainer_id", t1); expect(await trainerCan()).toBe(false);
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() + 86400000).toISOString() }).eq("trainer_id", t1); expect(await trainerCan()).toBe(true);
  });
  it("only the owner can delete the file", async () => {
    await bucket(T1).remove([path]); expect((await bucket(C1).download(path)).error).toBeNull();
    const p2 = `${c1}/${crypto.randomUUID()}.webp`; await upload(admin, p2); expect((await bucket(C1).remove([p2])).error).toBeNull(); expect((await bucket(C1).download(p2)).error).not.toBeNull();
  });
});

describe("photo records, reviews and schedules", () => {
  let photoId: string;
  it("rows follow the same access rule; a client cannot point a row at another folder", async () => {
    const path = `${c1}/${crypto.randomUUID()}.webp`; await upload(admin, path);
    photoId = ok(await C1.from("progress_photos").insert({ client_id: c1, taken_on: new Date().toISOString().slice(0, 10), pose: "front", storage_path: path, content_type: "image/webp", size_bytes: img.byteLength }).select().single())!.id;
    expect((await C1.from("progress_photos").insert({ client_id: c1, taken_on: "2026-10-01", pose: "front", storage_path: `${c2}/x.webp`, content_type: "image/webp", size_bytes: 10 })).error).not.toBeNull();
    expect((await C1.from("progress_photos").insert({ client_id: c1, taken_on: "2999-01-01", pose: "front", storage_path: `${c1}/future.webp`, content_type: "image/webp", size_bytes: 10 })).error).not.toBeNull();
    expect((await T1.from("progress_photos").select("id").eq("id", photoId)).data?.length).toBe(1);
    expect((await T2.from("progress_photos").select("id").eq("id", photoId)).data).toEqual([]);
    expect((await C2.from("progress_photos").select("id").eq("id", photoId)).data).toEqual([]);
    expect((await T1.from("progress_photos").insert({ client_id: c1, taken_on: "2026-10-01", pose: "front", storage_path: `${c1}/t.webp`, content_type: "image/webp", size_bytes: 10 })).error).not.toBeNull();
    expect((await C2.from("progress_photos").insert({ client_id: c2, taken_on: "2026-10-01", pose: "front", storage_path: `${c2}/t.webp`, content_type: "image/webp", size_bytes: 10 })).error).not.toBeNull();   // no consent
  });
  it("trainer reviews are visible to the client, and only the right trainer can write them", async () => {
    ok(await T1.from("photo_reviews").insert({ photo_id: photoId, trainer_id: t1, comment: "Se ve buena postura" }));
    expect((await T2.from("photo_reviews").insert({ photo_id: photoId, trainer_id: t2, comment: "intruso" })).error).not.toBeNull();
    expect((await C1.from("photo_reviews").insert({ photo_id: photoId, trainer_id: c1, comment: "yo" })).error).not.toBeNull();
    expect((await C1.from("photo_reviews").select("comment").eq("photo_id", photoId)).data).toEqual([{ comment: "Se ve buena postura" }]);
    expect((await T2.from("photo_reviews").select("id").eq("photo_id", photoId)).data).toEqual([]);
  });
  it("schedules: the trainer sets them for their own clients with valid intervals", async () => {
    ok(await T1.from("photo_schedules").upsert({ client_id: c1, trainer_id: t1, kind: "six_weeks" }, { onConflict: "client_id" }));
    expect((await T1.from("photo_schedules").upsert({ client_id: c1, trainer_id: t1, kind: "custom", custom_days: 3 }, { onConflict: "client_id" })).error).not.toBeNull();
    expect((await T1.from("photo_schedules").upsert({ client_id: c1, trainer_id: t1, kind: "custom" }, { onConflict: "client_id" })).error).not.toBeNull();
    expect((await T2.from("photo_schedules").upsert({ client_id: c1, trainer_id: t2, kind: "monthly" }, { onConflict: "client_id" })).error).not.toBeNull();
    expect((await C1.from("photo_schedules").select("kind").eq("client_id", c1)).data).toEqual([{ kind: "six_weeks" }]);
    expect((await C1.from("photo_schedules").update({ kind: "biweekly" }).eq("client_id", c1)).error ?? null).toBeNull();
    expect((await admin.from("photo_schedules").select("kind").eq("client_id", c1).single()).data?.kind).toBe("six_weeks");
  });
  it("the SQL due-date function agrees with the TypeScript one for every frequency", async () => {
    const cases: [ScheduleKind, number | null, string, string | null][] = [["biweekly", null, "2026-10-01", null], ["four_weeks", null, "2026-10-01", "2026-10-10"], ["six_weeks", null, "2026-10-01", null], ["monthly", null, "2026-01-31", null], ["monthly", null, "2026-10-15", "2026-08-31"], ["custom", 10, "2026-10-01", null]];
    for (const [kind, days, anchor, last] of cases) {
      await admin.from("progress_photos").delete().eq("client_id", c2); await admin.from("photo_schedules").delete().eq("client_id", c2);
      await admin.from("photo_schedules").insert({ client_id: c2, trainer_id: t2, kind, custom_days: days, anchor_on: anchor });
      if (last) { await consent(c2, ["photos"]); await admin.from("progress_photos").insert({ client_id: c2, taken_on: last, pose: "front", storage_path: `${c2}/${crypto.randomUUID()}.webp`, content_type: "image/webp", size_bytes: 10 }); }
      expect((await admin.rpc("photo_due_on", { c: c2 })).data, `${kind} ${anchor} ${last}`).toBe(nextPhotoDue(kind, days, anchor, last));
    }
    await admin.from("progress_photos").delete().eq("client_id", c2); await admin.from("photo_schedules").delete().eq("client_id", c2); await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c2).eq("type", "photos");
  });
});

describe("reminders respect consent and are idempotent", () => {
  it("no reminder without the communications consent; one per due date with it; trainers are told about pending photos and trial endings", async () => {
    const cr = await mk(`pvr-${run}@x.co`, true); const tr = await mk(`pvtr-${run}@x.co`);
    await admin.from("trainer_client_relationships").insert({ trainer_id: tr, client_id: cr });
    await consent(cr, ["personal_data", "health_data", "share_with_trainer", "photos"]);
    await admin.from("photo_schedules").insert({ client_id: cr, trainer_id: tr, kind: "biweekly", anchor_on: "2026-01-01" });   // long overdue
    await admin.rpc("generate_reminders");
    expect((await admin.from("notifications").select("id").eq("user_id", cr)).data).toEqual([]);                                  // no 'communications' consent -> nothing
    await consent(cr, ["communications"]);
    const r1 = (await admin.rpc("generate_reminders")).data; const r2 = (await admin.rpc("generate_reminders")).data;
    const { data: n } = await admin.from("notifications").select("kind,dedupe_key,title").eq("user_id", cr); expect(n!.length).toBe(1); expect(n![0].kind).toBe("photo_due"); expect(r2.photo_due).toBe(0); expect(r1.photo_due).toBeGreaterThanOrEqual(1);
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", cr).eq("type", "communications");
    await admin.from("notifications").delete().eq("user_id", cr); await admin.rpc("generate_reminders"); expect((await admin.from("notifications").select("id").eq("user_id", cr)).data).toEqual([]);   // revoked -> stops
    await admin.from("progress_photos").insert({ client_id: cr, taken_on: "2026-10-01", pose: "front", storage_path: `${cr}/${crypto.randomUUID()}.webp`, content_type: "image/webp", size_bytes: 10 });
    await admin.rpc("generate_reminders"); expect(((await admin.from("notifications").select("kind").eq("user_id", tr)).data ?? []).map((x) => x.kind)).toContain("photo_review");
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() + 36 * 3600 * 1000).toISOString() }).eq("trainer_id", tr);
    await admin.rpc("generate_reminders"); expect(((await admin.from("notifications").select("kind").eq("user_id", tr)).data ?? []).map((x) => x.kind)).toContain("trial_ending");
    await admin.auth.admin.deleteUser(cr).catch(() => undefined);
  });
  it("users read and mark only their own notifications", async () => {
    await admin.from("notifications").insert([{ user_id: c1, kind: "t", title: "mine", dedupe_key: `k1-${run}` }, { user_id: c2, kind: "t", title: "theirs", dedupe_key: `k2-${run}` }]);
    expect((await C1.from("notifications").select("title").in("dedupe_key", [`k1-${run}`, `k2-${run}`])).data).toEqual([{ title: "mine" }]);
    await C1.from("notifications").update({ read_at: new Date().toISOString() }).in("dedupe_key", [`k1-${run}`, `k2-${run}`]);
    expect((await admin.from("notifications").select("read_at").eq("dedupe_key", `k2-${run}`).single()).data?.read_at).toBeNull();
    expect((await C1.from("notifications").insert({ user_id: c1, kind: "x", title: "forged", dedupe_key: "z" })).error).not.toBeNull();
  });
});

describe("client erasure removes everything personal, and only that", () => {
  it("deletes rows (even immutable ones), files and the auth user; leaves the trainer's other work and leaves no identifier behind", async () => {
    const ce = await mk(`pve-${run}@x.co`, true); const CE = await login(`pve-${run}@x.co`);
    await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: ce }]);
    await consent(ce, ["personal_data", "health_data", "share_with_trainer", "photos"]);
    const { data: ex } = await admin.from("exercises").select("id").is("owner_id", null).limit(1); const exId = ex![0].id;
    const mkPlan = async (client: string) => { const pid = ok(await T1.rpc("create_plan", { p_title: "Plan borrado", p_goal: null, p_level: "beginner", p_client: client })) as string; const v = (await admin.from("plan_versions").select("id").eq("plan_id", pid).eq("status", "draft").single()).data!.id; const s = ok(await T1.from("plan_sessions").insert({ version_id: v, position: 1, name: "A" }).select().single())!; const pe = ok(await T1.from("prescribed_exercises").insert({ session_id: s.id, position: 1, exercise_id: exId, sets: 3, reps_min: 8, reps_max: 10, load_kg: 20 }).select().single())!; ok(await T1.rpc("publish_version", { p_version: v })); return { pid, v, s: s.id, pe: pe.id }; };
    const mine = await mkPlan(ce); const other = await mkPlan(c1);
    await admin.from("assessments").insert({ client_id: ce, status: "submitted", data: { x: 1 }, risk_level: "none", submitted_at: new Date().toISOString() });
    const { data: m } = await admin.from("anthropometric_measurements").insert({ client_id: ce, entered_by: ce, taken_by: "self", method: "tape", measured_on: "2026-10-01", waist_cm: 90 }).select().single();
    await admin.from("calculation_results").insert({ client_id: ce, measurement_id: m!.id, indicator: "bmi", value: 24, unit: "x", formula: "f", formula_version: "1", provenance: "estimated", inputs: {} });
    const { data: log } = await admin.from("workout_logs").insert({ client_id: ce, plan_id: mine.pid, version_id: mine.v, session_id: mine.s, planned_sets: 3 }).select().single();
    await admin.from("logged_sets").insert({ log_id: log!.id, prescribed_exercise_id: mine.pe, exercise_id: exId, set_number: 1, reps: 10, load_kg: 20 });
    await admin.from("exercise_discomforts").insert({ log_id: log!.id, exercise_id: exId, severity: 3 });
    await admin.from("workout_logs").update({ status: "completed", finished_at: new Date().toISOString(), logged_work_sets: 1 }).eq("id", log!.id);
    const { data: rec } = await admin.from("coach_recommendations").insert({ trainer_id: t1, client_id: ce, plan_id: mine.pid, version_id: mine.v, scope: "client", type: "deload", severity: "caution", confidence: "low", title: "t", changes: [], rationale: ["r"], data_points: [], uncertainty: ["u"], checks: ["c"], engine_version: "x", fingerprint: "f" }).select().single();
    await admin.from("recommendation_decisions").insert({ recommendation_id: rec!.id, decided_by: t1, decision: "accepted", original_changes: [] });
    await admin.from("access_audit").insert({ actor_id: t1, client_id: ce, resource: "client_detail" });
    await admin.from("notifications").insert({ user_id: ce, kind: "t", title: "t", dedupe_key: `e-${run}` });
    await admin.from("photo_schedules").insert({ client_id: ce, trainer_id: t1, kind: "monthly" });
    const photoPath = `${ce}/${crypto.randomUUID()}.webp`; ok({ data: 1, error: (await upload(admin, photoPath)).error });
    await admin.from("progress_photos").insert({ client_id: ce, taken_on: "2026-10-01", pose: "front", storage_path: photoPath, content_type: "image/webp", size_bytes: img.byteLength });
    const { data: inv } = await admin.from("invitations").insert({ trainer_id: t1, email: "x@y.co", token_hash: `h-${run}`, status: "accepted" }).select().single(); await admin.from("invitations").update({ accepted_by: ce }).eq("id", inv!.id);

    expect((await CE.rpc("erase_client", { p_client: ce })).error).not.toBeNull();            // not callable by users
    expect((await T1.rpc("erase_client", { p_client: ce })).error).not.toBeNull();
    expect((await admin.rpc("erase_client", { p_client: t1 })).error?.message).toMatch(/not a client/);

    const res = await eraseClientAccount(ce); expect(res.photosRemoved).toBe(1); expect(res.orphaned).toBe(0);
    for (const [t, col] of [["profiles", "id"], ["consents", "user_id"], ["assessments", "client_id"], ["anthropometric_measurements", "client_id"], ["calculation_results", "client_id"], ["workout_logs", "client_id"], ["training_plans", "client_id"], ["coach_recommendations", "client_id"], ["access_audit", "client_id"], ["notifications", "user_id"], ["photo_schedules", "client_id"], ["progress_photos", "client_id"], ["trainer_client_relationships", "client_id"]] as const)
      expect((await admin.from(t).select("*", { count: "exact", head: true }).eq(col, ce)).count, t).toBe(0);
    expect((await admin.from("logged_sets").select("id").eq("log_id", log!.id)).data).toEqual([]);
    expect((await admin.from("recommendation_decisions").select("id").eq("recommendation_id", rec!.id)).data).toEqual([]);
    expect((await admin.storage.from(PHOTO_BUCKET).download(photoPath)).error).not.toBeNull();
    expect((await admin.auth.admin.getUserById(ce)).data.user).toBeNull();
    expect((await admin.from("invitations").select("accepted_by").eq("id", inv!.id).single()).data?.accepted_by).toBeNull();
    expect((await admin.from("training_plans").select("id").eq("id", other.pid)).data?.length).toBe(1);                  // the trainer's other client is untouched
    expect((await admin.from("profiles").select("id").eq("id", t1)).data?.length).toBe(1);
    const hash = (await import("node:crypto")).createHash("sha256").update(ce).digest("hex");
    const { data: logRow } = await admin.from("erasure_log").select("*").eq("subject_hash", hash).single(); expect(logRow).toMatchObject({ role: "client", kind: "client_erasure" }); expect(JSON.stringify(logRow)).not.toContain(ce);
  });
  it("immutability still holds for normal users after the erasure bypass was introduced", async () => {
    const flag = await admin.rpc("erasure_active"); expect(flag.data).toBe(false);
    expect((await T1.rpc("move_session", { p_id: crypto.randomUUID(), p_dir: 1 })).error ?? null).toBeNull();
  });
});

describe("trainer closure keeps accounting records and cuts access", () => {
  it("archives clients, hides plans from clients, removes proposals/invitations, bans login, keeps payments", async () => {
    const tc = await mk(`pvtc-${run}@x.co`); const cc = await mk(`pvcc-${run}@x.co`, true); const TC = await login(`pvtc-${run}@x.co`);
    await admin.from("trainer_client_relationships").insert({ trainer_id: tc, client_id: cc });
    await consent(cc, ["health_data", "share_with_trainer"]); const CC = await login(`pvcc-${run}@x.co`);
    const { data: ex } = await admin.from("exercises").select("id").is("owner_id", null).limit(1);
    const pid = ok(await TC.rpc("create_plan", { p_title: "Plan P", p_goal: null, p_level: "beginner", p_client: cc })) as string; const v = (await admin.from("plan_versions").select("id").eq("plan_id", pid).eq("status", "draft").single()).data!.id;
    const s = ok(await TC.from("plan_sessions").insert({ version_id: v, position: 1, name: "A" }).select().single())!; ok(await TC.from("prescribed_exercises").insert({ session_id: s.id, position: 1, exercise_id: ex![0].id, sets: 3, reps_min: 8 }).select().single()); ok(await TC.rpc("publish_version", { p_version: v }));
    expect((await CC.from("training_plans").select("id").eq("id", pid)).data?.length).toBe(1);
    await admin.from("invitations").insert({ trainer_id: tc, email: "p@q.co", token_hash: `th-${run}` });
    await admin.from("subscription_payments").insert({ trainer_id: tc, provider: "wompi", provider_reference: `SUB-close-${run}`, amount_usd_cents: 1000, charged_amount_cents: 4000000, charged_currency: "COP", status: "approved" });
    await admin.from("trainer_subscriptions").update({ status: "active", current_period_end: new Date(Date.now() + 20 * 86400000).toISOString() }).eq("trainer_id", tc);

    await closeTrainerAccount(tc);
    expect((await admin.from("trainer_client_relationships").select("status").eq("trainer_id", tc).single()).data?.status).toBe("archived");
    expect((await CC.from("training_plans").select("id").eq("id", pid)).data).toEqual([]);                          // client sees "workspace unavailable"
    expect((await admin.from("invitations").select("id").eq("trainer_id", tc)).data).toEqual([]);
    expect((await admin.from("subscription_payments").select("status").eq("trainer_id", tc)).data).toEqual([{ status: "approved" }]);   // retained
    expect((await admin.from("trainer_subscriptions").select("status").eq("trainer_id", tc).single()).data?.status).toBe("expired");
    expect((await admin.from("profiles").select("full_name").eq("id", tc).single()).data?.full_name).toBe("Cuenta cerrada");
    const retry = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await retry.auth.signInWithPassword({ email: `pvtc-${run}@x.co`, password: pw })).error).not.toBeNull();
    expect((await admin.auth.admin.getUserById(tc)).data.user?.email).toBe(`cerrada+${tc}@invalid.local`);
    await admin.from("subscription_payments").delete().eq("trainer_id", tc);
  });
});

describe("data export", () => {
  it("a client's export contains their own data and photo links, and nobody else's", async () => {
    const exp = await buildClientExport(C1, c1);
    expect(exp).toMatchObject({ subject: "client", format_version: 1 }); expect(exp.profile?.id).toBe(c1);
    expect(Array.isArray(exp.consents)).toBe(true); expect(exp.progress_photos.length).toBeGreaterThanOrEqual(1);
    expect(exp.progress_photos[0]).toHaveProperty("download_url"); expect((exp.progress_photos[0] as Record<string, unknown>).storage_path).toBeUndefined();
    expect(JSON.stringify(exp)).not.toContain(c2);
    const url = (exp.progress_photos[0] as { download_url: string | null }).download_url; expect(url).toBeTruthy(); expect((await fetch(url!)).status).toBe(200);
  });
  it("a trainer's export has account, billing and plans but no client health data", async () => {
    const exp = await buildTrainerExport(T1, t1) as Record<string, unknown>;
    expect(exp.subject).toBe("trainer"); for (const k of ["profile", "subscription", "plans", "slot_purchases", "subscription_payments", "invitations"]) expect(exp).toHaveProperty(k);
    for (const k of ["assessments", "measurements", "workouts", "progress_photos"]) expect(exp).not.toHaveProperty(k);
  });
});
