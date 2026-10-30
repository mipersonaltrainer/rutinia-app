// Requires local Supabase. AI credits: 3 free drafts a month, then prepaid packs. Only trainer-initiated drafts are billable.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AI_PACKS, BILLABLE_AI_KINDS, FREE_MONTHLY_DRAFTS } from "@/lib/billing/pricing";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
type Res = { allowed: boolean; reason?: string; usage_id?: string; credits_left?: number | null };
const reserve = async (c: SupabaseClient, kind: string, client: string | null) => (await c.rpc("ai_reserve", { p_kind: kind, p_client: client, p_sensitive: client !== null })).data as Res;
const finish = (_c: SupabaseClient, usage: string, client: string | null, status = "ok", inter = "ok", tokens = 10) => admin.rpc("ai_finish",   // the server writes the record; the first argument (the user's session) is kept so callers read the same
 { p_usage: usage, p_status: status, p_provider: "fake", p_model: "m", p_in: tokens, p_out: tokens, p_ms: 1, p_client: client, p_digest: "d", p_output: {}, p_violations: [], p_flags: [], p_inter_status: inter });
const credits = async (c: SupabaseClient) => (await c.rpc("my_ai_credits")).data as { free_left: number; paid_left: number; free_monthly: number } | null;
const setLimits = (role: "trainer" | "client", v: { per_minute?: number; per_day?: number; monthly_tokens?: number }) => admin.from("ai_limits").update(v).eq("role", role);
const DEFAULT = { trainer: { per_minute: 5, per_day: 60, monthly_tokens: 2000000 }, client: { per_minute: 3, per_day: 10, monthly_tokens: 200000 } };
let n = 0;
async function purchase(trainer: string, pack: "p20" | "p100", over: Record<string, unknown> = {}) {
  const p = { credits: AI_PACKS[pack].credits, cents: AI_PACKS[pack].cents.USD }; const ref = `AC-${run}-${++n}`;
  const { error } = await admin.from("ai_credit_purchases").insert({ trainer_id: trainer, provider: "wompi", provider_reference: ref, pack, credits: p.credits, total_cents: p.cents, currency: "USD", charged_amount_cents: p.cents * 4000, charged_currency: "COP", status: "pending", ...over });
  expect(error).toBeNull(); return { ref, amount: p.cents * 4000 };
}
const settle = (ref: string, status: string, amount: number, currency = "COP") => admin.rpc("settle_ai_credit_purchase", { p_provider: "wompi", p_reference: ref, p_txn_id: `tx-${ref}`, p_status: status, p_amount: amount, p_currency: currency });

let t1: string, t2: string, t3: string, c1: string, T1: SupabaseClient, T2: SupabaseClient, T3: SupabaseClient, C1: SupabaseClient;
beforeAll(async () => {
  await setLimits("trainer", { per_minute: 500, per_day: 500, monthly_tokens: 2000000 });
  t1 = await mk(`acr-t1-${run}@x.co`); t2 = await mk(`acr-t2-${run}@x.co`); t3 = await mk(`acr-t3-${run}@x.co`); c1 = await mk(`acr-c1-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1, nutrition_enabled: false }, { trainer_id: t3, client_id: (await mk(`acr-c3-${run}@x.co`, true)), nutrition_enabled: false }]);
  await admin.from("consents").insert(["health_data", "share_with_trainer", "ai_processing"].map((type) => ({ user_id: c1, type })));
  T1 = await login(`acr-t1-${run}@x.co`); T2 = await login(`acr-t2-${run}@x.co`); T3 = await login(`acr-t3-${run}@x.co`); C1 = await login(`acr-c1-${run}@x.co`);
});
afterAll(async () => {
  await setLimits("trainer", DEFAULT.trainer); await setLimits("client", DEFAULT.client);
  for (const id of created) { await admin.from("ai_credit_purchases").delete().eq("trainer_id", id); await admin.from("billing_audit_events").delete().eq("trainer_id", id); await admin.from("ai_usage").delete().eq("user_id", id); }
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("free monthly drafts", () => {
  it("the database and the app agree on the allowance, and the billable kinds are the drafts only", async () => {
    expect(FREE_MONTHLY_DRAFTS).toBe(3); expect([...BILLABLE_AI_KINDS].sort()).toEqual(["diet_draft", "plan_draft"]);
    expect(await credits(T1)).toEqual({ free_left: 3, paid_left: 0, free_monthly: 3 });
  });
  it("three drafts are free, the fourth is refused with no_credits, and a refusal records nothing", async () => {
    const left: (number | null | undefined)[] = [];
    for (const kind of ["diet_draft", "plan_draft", "diet_draft"]) { const r = await reserve(T1, kind, c1); expect(r.allowed, kind).toBe(true); left.push(r.credits_left); await finish(T1, r.usage_id!, c1); }
    expect(left).toEqual([2, 1, 0]);
    const before = (await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", t1)).count;
    const r = await reserve(T1, "diet_draft", c1); expect(r).toMatchObject({ allowed: false, reason: "no_credits" });
    expect((await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", t1)).count).toBe(before);
    expect(await credits(T1)).toMatchObject({ free_left: 0, paid_left: 0 });
  });
  it("other AI uses are not billed: the trainer's report text still works with no credits, and so does the client's assistant", async () => {
    const r = await reserve(T1, "report_text", c1); expect(r.allowed).toBe(true); expect(r.credits_left ?? null).toBeNull();
    expect((await reserve(C1, "client_qa", c1)).allowed).toBe(true);
    expect(await credits(T1)).toMatchObject({ free_left: 0, paid_left: 0 });
  });
  it("the allowance comes back with the new month", async () => {
    await admin.from("ai_usage").update({ created_at: new Date(Date.now() - 40 * 86400000).toISOString() }).eq("user_id", t1).eq("credit_source", "free");
    expect(await credits(T1)).toMatchObject({ free_left: 3 });
  });
  it("a draft that fails, is rejected by the validator or never finishes gives its credit back", async () => {
    expect(await credits(T2)).toMatchObject({ free_left: 3 });
    const a = await reserve(T2, "diet_draft", null); expect(a.allowed).toBe(true); expect(await credits(T2)).toMatchObject({ free_left: 2 });
    await finish(T2, a.usage_id!, null, "error", "error"); expect(await credits(T2)).toMatchObject({ free_left: 3 });
    const b = await reserve(T2, "diet_draft", null); await finish(T2, b.usage_id!, null, "ok", "rejected"); expect(await credits(T2)).toMatchObject({ free_left: 3 });
    const c = await reserve(T2, "diet_draft", null); await finish(T2, c.usage_id!, null, "ok", "ok"); expect(await credits(T2)).toMatchObject({ free_left: 2 });
    const d = await reserve(T2, "diet_draft", null); expect(d.allowed).toBe(true); expect(await credits(T2)).toMatchObject({ free_left: 1 });
    await admin.from("ai_usage").update({ created_at: new Date(Date.now() - 11 * 60000).toISOString() }).eq("id", d.usage_id!);   // abandoned for more than 10 minutes
    expect(await credits(T2)).toMatchObject({ free_left: 2 });
  });
});

describe("prepaid packs", () => {
  it("pending, declined, wrong-amount and wrong-currency payments grant nothing; the verified one grants the pack once", async () => {
    const { ref, amount } = await purchase(t1, "p20");
    expect((await settle(ref, "pending", amount)).data.result).toBe("noop");
    expect((await settle(ref, "approved", 1)).data.result).toBe("amount_mismatch");
    expect((await settle(ref, "approved", amount, "USD")).data.result).toBe("amount_mismatch");
    expect(await credits(T1)).toMatchObject({ paid_left: 0 });
    expect((await settle("AC-unknown", "approved", amount)).data.result).toBe("unknown_reference");
    expect((await settle(ref, "approved", amount)).data).toMatchObject({ result: "updated", status: "approved", granted: true });
    expect(await credits(T1)).toMatchObject({ paid_left: 20 });
    expect((await settle(ref, "approved", amount)).data.result).toBe("noop");                  // webhook + redirect both arrive: idempotent
    expect(await credits(T1)).toMatchObject({ paid_left: 20 });
  });
  it("paid credits are used after the free ones, one per draft, and the balance goes down", async () => {
    const r = await reserve(T1, "diet_draft", c1); expect(r).toMatchObject({ allowed: true });
    expect((await admin.from("ai_usage").select("credit_source").eq("id", r.usage_id!).single()).data!.credit_source).toBe("free");   // the free ones came back with the new month
    await finish(T1, r.usage_id!, c1);
    await admin.from("ai_usage").update({ created_at: new Date(Date.now() - 40 * 86400000).toISOString() }).eq("user_id", t1).eq("credit_source", "free");
    for (let i = 0; i < 3; i++) { const x = await reserve(T1, "plan_draft", c1); await finish(T1, x.usage_id!, c1); }
    const paid = await reserve(T1, "plan_draft", c1); expect(paid.allowed).toBe(true);
    expect((await admin.from("ai_usage").select("credit_source").eq("id", paid.usage_id!).single()).data!.credit_source).toBe("paid");
    expect(await credits(T1)).toMatchObject({ free_left: 0, paid_left: 19 });
  });
  it("a refunded (voided) pack cannot be spent any more, and the balance never shows below zero", async () => {
    const { ref, amount } = await purchase(t3, "p100"); await settle(ref, "approved", amount);
    expect(await credits(T3)).toMatchObject({ paid_left: 100 });
    expect((await settle(ref, "voided", amount)).data).toMatchObject({ result: "updated", status: "voided" });
    expect(await credits(T3)).toMatchObject({ paid_left: 0 });
  });
  it("the trainer's monthly token budget does not block drafts they paid for, but still limits the free-form uses", async () => {
    const { ref, amount } = await purchase(t2, "p20"); await settle(ref, "approved", amount);
    await setLimits("trainer", { monthly_tokens: 100 });
    const u = await reserve(T2, "report_text", null); await finish(T2, u.usage_id!, null, "ok", "ok", 500);
    expect((await reserve(T2, "report_text", null)).reason).toBe("budget_month");
    expect((await reserve(T2, "diet_draft", null)).allowed).toBe(true);
    await setLimits("trainer", { per_minute: 500, per_day: 500, monthly_tokens: 2000000 });
  });
});

describe("who can do what", () => {
  it("only the server can create or change purchases and the allowance; each trainer reads only their own", async () => {
    const row = { trainer_id: t1, provider: "wompi", provider_reference: `AC-forged-${run}`, pack: "p100", credits: 100, total_cents: 2000, currency: "USD", status: "approved", credits_granted: true };
    expect((await T1.from("ai_credit_purchases").insert(row)).error).not.toBeNull();
    expect((await admin.from("ai_credit_purchases").select("id").eq("provider_reference", row.provider_reference)).data).toEqual([]);
    const mine = (await T1.from("ai_credit_purchases").select("trainer_id")).data!; expect(mine.length).toBeGreaterThan(0); expect(mine.every((p) => p.trainer_id === t1)).toBe(true);
    await T1.from("ai_credit_purchases").update({ status: "pending" }).eq("trainer_id", t1); await T1.from("ai_credit_purchases").delete().eq("trainer_id", t1);
    expect((await admin.from("ai_credit_purchases").select("status").eq("trainer_id", t1)).data!.some((p) => p.status === "approved")).toBe(true);
    for (const fn of ["settle_ai_credit_purchase", "ai_credit_state"]) {
      const args = fn === "ai_credit_state" ? { p_trainer: t1 } : { p_provider: "wompi", p_reference: "x", p_txn_id: "x", p_status: "approved", p_amount: 1, p_currency: "COP" };
      expect((await T1.rpc(fn, args)).error, fn).not.toBeNull();
    }
  });
  it("the usage records, including which credit was spent, cannot be edited by the trainer", async () => {
    const r = await reserve(T2, "diet_draft", null);
    await T2.from("ai_usage").update({ credit_source: null, status: "error" }).eq("id", r.usage_id!);
    expect((await admin.from("ai_usage").select("credit_source,status").eq("id", r.usage_id!).single()).data).toMatchObject({ status: "reserved" });
    expect((await admin.from("ai_usage").select("credit_source").eq("id", r.usage_id!).single()).data!.credit_source).not.toBeNull();
  });
  it("clients have no credits and a lower daily cap (their assistant costs the platform, not the trainer)", async () => {
    expect(await credits(C1)).toBeNull();
    const { data } = await admin.from("ai_limits").select("per_day,monthly_tokens").eq("role", "client").single(); expect(data).toEqual({ per_day: 10, monthly_tokens: 200000 });
  });
});
