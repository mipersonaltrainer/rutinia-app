// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inflateSync } from "node:zlib";
import { loadReportInput } from "@/lib/reports/load";
import { buildReportData } from "@/lib/reports/data";
import { renderReportPdf } from "@/lib/reports/pdf";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const ok = <T>(r: { data: T; error: unknown }) => { expect(r.error).toBeNull(); return r.data; };
const text = (bytes: Uint8Array) => { const s = Buffer.from(bytes).toString("latin1"); const out: string[] = []; for (const m of s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) { let b: Buffer; try { b = inflateSync(Buffer.from(m[1], "latin1")); } catch { continue; } for (const h of b.toString("latin1").matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) out.push(Buffer.from(h[1], "hex").toString("latin1")); } return out.join("\n"); };
const ymd = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

let t1: string, t2: string, c1: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient;
beforeAll(async () => {
  t1 = await mk(`rt1-${run}@x.co`); t2 = await mk(`rt2-${run}@x.co`); c1 = await mk(`rc1-${run}@x.co`, true);
  await admin.from("profiles").update({ full_name: "Camila Ñáñez" }).eq("id", c1);
  await admin.from("trainer_client_relationships").insert({ trainer_id: t1, client_id: c1 });
  await admin.from("consents").insert(["health_data", "share_with_trainer"].map((type) => ({ user_id: c1, type })));
  T1 = await login(`rt1-${run}@x.co`); T2 = await login(`rt2-${run}@x.co`); C1 = await login(`rc1-${run}@x.co`);
  await admin.from("assessments").insert({ client_id: c1, status: "submitted", data: { goals: { goals: ["hypertrophy", "mobility"] } }, risk_level: "none", submitted_at: new Date(Date.now() - 20 * 86400000).toISOString() });
  await admin.from("anthropometric_measurements").insert([{ client_id: c1, entered_by: c1, taken_by: "self", method: "tape", measured_on: ymd(-15), weight_kg: 70, waist_cm: 80 }, { client_id: c1, entered_by: t1, taken_by: "trainer", method: "tape", measured_on: ymd(-2), weight_kg: 68.5, waist_cm: 78 }]);
  const { data: ex } = await admin.from("exercises").select("id,name_es").is("owner_id", null).limit(1);
  const pid = ok(await T1.rpc("create_plan", { p_title: "Plan informe", p_goal: null, p_level: "beginner", p_client: c1 })) as string; const v = (await admin.from("plan_versions").select("id").eq("plan_id", pid).eq("status", "draft").single()).data!.id;
  const s = ok(await T1.from("plan_sessions").insert({ version_id: v, position: 1, name: "A" }).select().single())!; const pe = ok(await T1.from("prescribed_exercises").insert({ session_id: s.id, position: 1, exercise_id: ex![0].id, sets: 3, reps_min: 8 }).select().single())!;
  await T1.from("plan_versions").update({ change_note: "Versión inicial del informe" }).eq("id", v); ok(await T1.rpc("publish_version", { p_version: v }));
  for (const [d, load] of [[-10, 20], [-3, 25]] as const) {
    const day = new Date(Date.now() + d * 86400000).toISOString();
    const { data: log } = await admin.from("workout_logs").insert({ client_id: c1, plan_id: pid, version_id: v, session_id: s.id, started_at: day, planned_sets: 3 }).select().single();
    for (let i = 1; i <= 3; i++) await admin.from("logged_sets").insert({ log_id: log!.id, prescribed_exercise_id: pe.id, exercise_id: ex![0].id, set_number: i, reps: 10, load_kg: load });
    await admin.from("workout_logs").update({ status: "completed", finished_at: day, session_rpe: 7, pain_level: 0, logged_work_sets: 3 }).eq("id", log!.id);
  }
});
afterAll(async () => { for (const id of created) { await admin.from("progress_reports").delete().eq("client_id", id); } for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("a report built from the database contains the real figures, honouring RLS", () => {
  it("trainer report: goals, measurements, loads, plan version and the trainer's own notes", async () => {
    const input = await loadReportInput(T1, { clientId: c1, from: ymd(-28), to: ymd(0), trainerName: "Entrenador Uno", observations: "Mejoró la técnica", nextGoals: "Llegar a 30 kg" });
    expect(input).not.toBeNull(); const data = buildReportData(input!);
    expect(data.sessions).toMatchObject({ completed: 2, plannedSets: 6, loggedSets: 6, completionPct: 100 }); expect(data.measurements.deltas).toMatchObject({ weight_kg: -1.5, waist_cm: -2 });
    expect(data.performance[0]).toMatchObject({ sessions: 2, first: "10×20 kg", last: "10×25 kg", deltaLoad: 5 }); expect(data.planChanges.map((p) => p.change_note)).toContain("Versión inicial del informe");
    const pdf = text(await renderReportPdf(data));
    for (const must of ["Camila Ñáñez", "Hipertrofia muscular", "Movilidad", "Entrenador Uno", "10×25 kg", "+5 kg", "-1.5", "Mejoró la técnica", "Llegar a 30 kg", "Versión inicial del informe"]) expect(pdf, must).toContain(must);
  });
  it("the client's own report works and carries no trainer annotations", async () => {
    const input = await loadReportInput(C1, { clientId: c1, from: ymd(-28), to: ymd(0), trainerName: null, observations: null, nextGoals: null });
    const pdf = text(await renderReportPdf(buildReportData(input!))); expect(pdf).toContain("Camila Ñáñez"); expect(pdf).toContain("Sin observaciones."); expect(pdf).not.toContain("Mejoró la técnica");
  });
  it("another trainer gets nothing, and revoking the sharing consent hides health data from the trainer's report", async () => {
    expect(await loadReportInput(T2, { clientId: c1, from: ymd(-28), to: ymd(0), trainerName: null, observations: null, nextGoals: null })).toBeNull();
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    const input = await loadReportInput(T1, { clientId: c1, from: ymd(-28), to: ymd(0), trainerName: null, observations: null, nextGoals: null });
    if (input) { const d = buildReportData(input); expect(d.sessions.completed).toBe(0); expect(d.measurements.first).toBeNull(); expect(d.goals).toEqual([]); }
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "share_with_trainer");
  });
  it("reports are saved as a traceable record with the summary only", async () => {
    ok(await T1.from("progress_reports").insert({ client_id: c1, generated_by: t1, period_start: ymd(-28), period_end: ymd(0), observations: "x", summary: { sessions: { completed: 2 } } }));
    expect((await T1.from("progress_reports").select("id").eq("client_id", c1)).data?.length).toBe(1);
    expect((await T2.from("progress_reports").select("id").eq("client_id", c1)).data).toEqual([]);
    expect((await T2.from("progress_reports").insert({ client_id: c1, generated_by: t2, period_start: ymd(-28), period_end: ymd(0), summary: {} })).error).not.toBeNull();
    expect((await T1.from("progress_reports").insert({ client_id: c1, generated_by: t1, period_start: ymd(0), period_end: ymd(-5), summary: {} })).error).not.toBeNull();
  });
});
