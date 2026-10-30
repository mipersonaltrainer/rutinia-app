// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { runLlm } from "@/lib/ai/run";
import type { AiConfig, AiProvider } from "@/lib/ai/provider";
import { loadCandidates, loadLatestAssessment, PER_MUSCLE } from "@/lib/ai/loaders";
import { validatePlanDraft, type PlanConstraints } from "@/lib/ai/validate-plan";
import { PlanDraftSchema } from "@/lib/ai/schemas";
import { assessmentSchema } from "@/lib/assessment/schema";
import { eraseClientAccount, closeTrainerAccount } from "@/lib/privacy/erase";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const reserve = async (c: SupabaseClient, kind: string, client: string | null, sensitive: boolean) => (await c.rpc("ai_reserve", { p_kind: kind, p_client: client, p_sensitive: sensitive })).data as { allowed: boolean; reason?: string; usage_id?: string; remaining_day?: number };
const setLimits = (role: "trainer" | "client", v: { per_minute?: number; per_day?: number; monthly_tokens?: number }) => admin.from("ai_limits").update(v).eq("role", role);
const DEFAULT = { trainer: { per_minute: 5, per_day: 60, monthly_tokens: 2000000 }, client: { per_minute: 3, per_day: 10, monthly_tokens: 200000 } };
const cfg: AiConfig = { enabled: true, provider: "anthropic", model: "fake", allowSensitive: true, maxOutputTokens: 1000, timeoutMs: 1000, apiKey: "k" };
const fakeProvider = (text: string): AiProvider & { n: number } => { const p = { name: "fake", model: "fake-1", n: 0, async complete() { p.n++; return { text, model: "fake-1", inputTokens: 100, outputTokens: 50, stopReason: "end_turn" }; } }; return p; };

let t1: string, t2: string, c1: string, c2: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient, C2: SupabaseClient;
beforeAll(async () => {
  t1 = await mk(`ait1-${run}@x.co`); t2 = await mk(`ait2-${run}@x.co`); c1 = await mk(`aic1-${run}@x.co`, true); c2 = await mk(`aic2-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t2, client_id: c2 }]);
  await admin.from("consents").insert([c1, c2].flatMap((u) => ["health_data", "share_with_trainer"].map((type) => ({ user_id: u, type }))));
  await admin.from("ai_credit_purchases").insert({ trainer_id: t1, provider: "wompi", provider_reference: `AC-ai-${run}`, pack: "p100", credits: 100, total_cents: 2000, status: "approved", credits_granted: true });   // drafts are billable: this file exercises the gate, not the credits (see ai-credits.test.ts)
  T1 = await login(`ait1-${run}@x.co`); T2 = await login(`ait2-${run}@x.co`); C1 = await login(`aic1-${run}@x.co`); C2 = await login(`aic2-${run}@x.co`);
});
afterAll(async () => { await setLimits("trainer", DEFAULT.trainer); await setLimits("client", DEFAULT.client); for (const id of created) { await admin.from("ai_credit_purchases").delete().eq("trainer_id", id); await admin.from("ai_usage").delete().eq("user_id", id); } for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("consent, access and isolation are decided by the database, atomically", () => {
  it("the new consent type exists and sending client data needs it (and only the client can grant it)", async () => {
    expect((await reserve(T1, "plan_draft", c1, true)).reason).toBe("no_consent");
    expect((await T1.from("consents").insert({ user_id: c1, type: "ai_processing" })).error).not.toBeNull();             // a trainer cannot consent on someone's behalf
    expect((await C1.from("consents").insert({ user_id: c1, type: "ai_processing" })).error).toBeNull();
    const r = await reserve(T1, "plan_draft", c1, true); expect(r.allowed).toBe(true); expect(r.usage_id).toBeTruthy();
    await C1.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "ai_processing");   // revoking is immediate
    expect((await reserve(T1, "plan_draft", c1, true)).reason).toBe("no_consent");
    await C1.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "ai_processing");
  });
  it("trainers only reach their own clients, clients only themselves, anonymous nobody", async () => {
    await admin.from("consents").upsert([{ user_id: c2, type: "ai_processing", revoked_at: null }], { onConflict: "user_id,type" });
    expect((await reserve(T1, "plan_draft", c2, true)).reason).toBe("no_access");
    expect((await reserve(T2, "plan_draft", c1, true)).reason).toBe("no_access");
    expect((await reserve(C1, "client_qa", c2, true)).reason).toBe("no_access");
    expect((await reserve(C1, "client_qa", null, true)).reason).toBe("no_access");                                        // sensitive without a subject
    expect((await reserve(C1, "client_qa", c1, true)).allowed).toBe(true);
    const anon = createClient(URL, ANON, { auth: { persistSession: false } }); expect((await anon.rpc("ai_reserve", { p_kind: "x", p_client: null, p_sensitive: false })).error).not.toBeNull();
    await admin.from("trainer_client_relationships").update({ status: "archived" }).eq("trainer_id", t1).eq("client_id", c1); expect((await reserve(T1, "plan_draft", c1, true)).reason).toBe("no_access");
    await admin.from("trainer_client_relationships").update({ status: "active" }).eq("trainer_id", t1).eq("client_id", c1);
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer"); expect((await reserve(T1, "plan_draft", c1, true)).reason).toBe("no_access");
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "share_with_trainer");
  });
  it("callers cannot choose their own limits or edit them", async () => {
    expect((await T1.rpc("ai_reserve", { p_kind: "x", p_client: null, p_sensitive: false, p_limit: 9999 })).error).not.toBeNull();
    expect((await T1.from("ai_limits").update({ per_day: 99999 }).eq("role", "trainer")).error?.code).toBe("42501");   // refused by privilege; the persisted value is checked below
    expect((await admin.from("ai_limits").select("per_day").eq("role", "trainer").single()).data?.per_day).toBe(60);
    expect((await T1.from("ai_limits").select("role")).data?.length).toBe(2);
  });
});

describe("rate limits and budgets", () => {
  it("per-minute limit holds even under 12 concurrent requests", async () => {
    await admin.from("ai_usage").delete().eq("user_id", c2); await setLimits("client", { per_minute: 3 });
    const rs = await Promise.all(Array.from({ length: 12 }, () => reserve(C2, "client_qa", c2, true)));
    expect(rs.filter((r) => r.allowed).length).toBe(3); expect(rs.filter((r) => r.reason === "rate_limit_minute").length).toBe(9);
    const { data } = await admin.from("ai_usage").select("status").eq("user_id", c2); expect(data!.filter((u) => u.status === "reserved").length).toBe(3); expect(data!.filter((u) => u.status === "blocked").length).toBe(9);
    await setLimits("client", DEFAULT.client);
  });
  it("daily limit and monthly token budget are enforced from recorded usage", async () => {
    await admin.from("ai_usage").delete().eq("user_id", c2); await setLimits("client", { per_minute: 50, per_day: 2 });
    expect((await reserve(C2, "client_qa", c2, true)).allowed).toBe(true); expect((await reserve(C2, "client_qa", c2, true)).allowed).toBe(true);
    expect((await reserve(C2, "client_qa", c2, true)).reason).toBe("rate_limit_day");
    await admin.from("ai_usage").delete().eq("user_id", c2); await setLimits("client", { per_minute: 50, per_day: 50, monthly_tokens: 1000 });
    const r = await reserve(C2, "client_qa", c2, true); await admin.rpc("ai_finish", { p_usage: r.usage_id, p_status: "ok", p_provider: "t", p_model: "m", p_in: 900, p_out: 200, p_ms: 5, p_client: c2, p_digest: "d", p_output: {}, p_violations: [], p_flags: [], p_inter_status: "ok" });
    expect((await reserve(C2, "client_qa", c2, true)).reason).toBe("budget_month");
    await setLimits("client", DEFAULT.client);
  });
});

describe("audit trail", () => {
  it("ai_finish is single-use, owner-only, and the records are private to their owner", async () => {
    await admin.from("ai_usage").delete().eq("user_id", t1); const r = await reserve(T1, "plan_draft", c1, true);
    const fin = (c: SupabaseClient, id: string) => c.rpc("ai_finish", { p_usage: id, p_status: "ok", p_provider: "fake", p_model: "m", p_in: 10, p_out: 5, p_ms: 3, p_client: c1, p_digest: "abc", p_output: { x: 1 }, p_violations: [{ rule: "r" }], p_flags: ["injection_suspected:lesiones"], p_inter_status: "ok" });
    expect((await fin(T2, r.usage_id!)).error).not.toBeNull();                       // a user cannot file records at all (another trainer's, or their own)
    expect((await fin(T1, r.usage_id!)).error).not.toBeNull();
    const ok = await fin(admin, r.usage_id!); expect(ok.error).toBeNull(); expect(ok.data).toMatch(/^[0-9a-f-]{36}$/);   // only the server, once
    expect((await fin(admin, r.usage_id!)).error).not.toBeNull();                    // already finished
    expect((await fin(admin, crypto.randomUUID())).error).not.toBeNull();
    const { data: mine } = await T1.from("ai_interactions").select("input_digest,flags,output,status").eq("id", ok.data); expect(mine).toEqual([{ input_digest: "abc", flags: ["injection_suspected:lesiones"], output: { x: 1 }, status: "ok" }]);
    expect((await T2.from("ai_interactions").select("id").eq("id", ok.data)).data).toEqual([]);
    expect((await C1.from("ai_interactions").select("id").eq("id", ok.data)).data).toEqual([]);                  // not even the client the interaction is about
    expect((await T1.from("ai_interactions").insert({ usage_id: r.usage_id, user_id: t1, kind: "x", input_digest: "y", status: "ok" })).error).not.toBeNull();
    expect((await T1.from("ai_usage").update({ input_tokens: 0 }).eq("id", r.usage_id)).error?.code).toBe("42501");
    expect((await admin.from("ai_usage").select("input_tokens").eq("id", r.usage_id).single()).data?.input_tokens).toBe(10);
  });
  it("the full gate with the real database: consent blocks the model call; with consent the validated output is stored without the raw prompt", async () => {
    await admin.from("ai_usage").delete().eq("user_id", t1);
    const schema = z.object({ answer: z.string() }); const p = fakeProvider('{"answer":"ok"}');
    const base = { supabase: T1 as never, kind: "plan_draft", clientId: c1, sensitive: true, system: "S", user: "PROMPT-WITH-SECRET-TEXT", flags: [], digest: "dig", schema, cfg, provider: p, post: (d: { answer: string }) => ({ data: d, violations: [] }) };
    await C1.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "ai_processing");
    expect(await runLlm(base)).toMatchObject({ ok: false, code: "no_consent" }); expect(p.n).toBe(0);
    await C1.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "ai_processing");
    const r = await runLlm(base); expect(r).toMatchObject({ ok: true, data: { answer: "ok" } }); expect(p.n).toBe(1);
    const { data } = await admin.from("ai_interactions").select("*").eq("id", (r as { interactionId: string }).interactionId).single();
    expect(data).toMatchObject({ user_id: t1, client_id: c1, kind: "plan_draft", status: "ok", input_digest: "dig" }); expect(JSON.stringify(data)).not.toContain("PROMPT-WITH-SECRET-TEXT");
    expect((await admin.from("ai_usage").select("input_tokens,output_tokens,status,provider").eq("user_id", t1).eq("status", "ok").single()).data).toEqual({ input_tokens: 100, output_tokens: 50, status: "ok", provider: "fake" });
  });
});

describe("candidates and validation against the real library", () => {
  const cons: PlanConstraints = { frequency: 3, minutes: 60, level: "beginner", avoidJoints: ["knee", "lower_back"], equipment: ["dumbbell", "bodyweight", "band"], excludedNames: ["burpee", "sentadilla búlgara"] };
  it("pre-filters in SQL: only allowed equipment/level/joints, no excluded names, bounded per muscle, stable unique codes", async () => {
    const c = await loadCandidates(T1, cons);
    expect(c.length).toBeGreaterThanOrEqual(30); expect(new Set(c.map((x) => x.code)).size).toBe(c.length); expect(c[0].code).toBe("E001");
    for (const x of c) { expect(cons.equipment).toContain(x.equipment); expect(x.difficulty).toBe("beginner"); expect(x.joint_stress.filter((j) => cons.avoidJoints.includes(j))).toEqual([]); expect(x.name.toLowerCase()).not.toMatch(/burpee|b[uú]lgara/); expect(["strength", "isometric", "stability"]).toContain(x.exercise_type); }
    const per = new Map<string, number>(); for (const x of c) per.set(x.primary_muscle, (per.get(x.primary_muscle) ?? 0) + 1); expect(Math.max(...per.values())).toBeLessThanOrEqual(PER_MUSCLE);
    expect(JSON.stringify(await loadCandidates(T1, cons))).toBe(JSON.stringify(c));      // deterministic
  });
  it("an adversarial model answer is cut down to what the library and constraints allow", async () => {
    const knee = (await admin.from("exercises").select("id,name_es").is("owner_id", null).contains("joint_stress", ["knee"]).limit(1)).data![0];
    const cands = await loadCandidates(T1, cons); const good = cands.slice(0, 3);
    const outside = `E${String(cands.length + 20).padStart(3, "0")}`;   // a plausible-looking code that is NOT in this request's candidate list
    const draft = PlanDraftSchema.parse({ title: "T", rationale: "R", sessions: [{ name: "A", weekday: 1, warmup_notes: null, exercises: [...good.map((g) => ({ code: g.code, sets: 3, reps_min: 8, reps_max: 12, rest_sec: 60, rir: 2, client_notes: null })), { code: outside, sets: 3, reps_min: 5, reps_max: 5, rest_sec: 120, rir: 1, client_notes: null }, { code: "E999", sets: 3, reps_min: 5, reps_max: 5, rest_sec: 60, rir: null, client_notes: null }, { code: knee.id, sets: 3, reps_min: 5, reps_max: 5, rest_sec: 60, rir: null, client_notes: null }] }], assumptions: [], questions_for_trainer: [] });
    const v = validatePlanDraft(draft, cands, cons);
    expect(v.plan!.sessions[0].exercises.map((e) => e.exercise_id)).toEqual(good.map((g) => g.id));
    expect(v.violations.map((x) => x.rule).filter((r) => r !== "frecuencia").sort()).toEqual(["biblioteca", "biblioteca", "biblioteca"]);   // outside code, E999 and a raw database id are all rejected
  });
});

describe("assessment loading honours consent", () => {
  it("returns the parsed assessment while shared, nothing after the client withdraws", async () => {
    const data = assessmentSchema.parse({ personal: { birthDate: "1990-06-15", sexForFormulas: "male", workType: "sedentary", sittingHours: 8, activityLevel: "light", sleepQuality: 3, stress: 3 }, training: { experienceYears: 2, weeklyFrequency: 3, sessionMinutes: 60, location: "gym" }, goals: { goals: ["hypertrophy"] }, health: { chestPainDuringExercise: false, dizzinessOrFainting: false, unusualBreathlessness: false, cardiovascularHistory: false, medicalRestriction: false, medicalClearance: false, pregnancyStatus: "not_applicable", eatingDisorderHistory: false, currentPain: 0 }, habits: { sleepHours: 7, recovery: 3 } });
    await admin.from("assessments").insert({ client_id: c1, status: "submitted", data, risk_level: "none", submitted_at: new Date().toISOString() });
    const a = await loadLatestAssessment(T1, c1); expect(a?.data.training.experienceYears).toBe(2); expect(a?.risk).toBe("none");
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "health_data");
    expect(await loadLatestAssessment(T1, c1)).toBeNull(); expect(await loadLatestAssessment(T2, c1)).toBeNull();
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "health_data");
  });
});

describe("erasure covers AI records", () => {
  it("erasing a client removes interactions about them and their own usage; closing a trainer removes their interactions", async () => {
    const ce = await mk(`aice-${run}@x.co`, true); const tc = await mk(`aitc-${run}@x.co`); const TC = await login(`aitc-${run}@x.co`); const CE = await login(`aice-${run}@x.co`);
    await admin.from("trainer_client_relationships").insert({ trainer_id: tc, client_id: ce }); await admin.from("consents").insert(["health_data", "share_with_trainer", "ai_processing"].map((type) => ({ user_id: ce, type })));
    const a = await reserve(TC, "plan_draft", ce, true); await admin.rpc("ai_finish", { p_usage: a.usage_id, p_status: "ok", p_provider: "t", p_model: "m", p_in: 1, p_out: 1, p_ms: 1, p_client: ce, p_digest: "d", p_output: { secret: "salud" }, p_violations: [], p_flags: [], p_inter_status: "ok" });
    const b = await reserve(CE, "client_qa", ce, true); await admin.rpc("ai_finish", { p_usage: b.usage_id, p_status: "ok", p_provider: "t", p_model: "m", p_in: 1, p_out: 1, p_ms: 1, p_client: ce, p_digest: "d2", p_output: {}, p_violations: [], p_flags: [], p_inter_status: "ok" });
    await eraseClientAccount(ce);
    expect((await admin.from("ai_interactions").select("id").eq("client_id", ce)).data).toEqual([]); expect((await admin.from("ai_usage").select("id").eq("user_id", ce)).data).toEqual([]);
    await closeTrainerAccount(tc); expect((await admin.from("ai_interactions").select("id").eq("user_id", tc)).data).toEqual([]);
  });
});
