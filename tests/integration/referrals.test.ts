// Requires local Supabase (synthetic data only). Referral codes end to end in SQL: signing up with a code, the 10-day trial, the reward on the first
// approved payment (once), the cap, and that the browser roles cannot write any of it.
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const created: string[] = []; let n = 0;
const PASS = "Test-Pass-12345";
const mk = async (meta: Record<string, unknown> = {}) => { const email = `rf-${run}-${n++}@x.co`; const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true, user_metadata: { full_name: "Ref Tester", ...meta } }); if (error) throw error; created.push(data.user.id); return { id: data.user.id, email }; };
const as = async (email: string) => { const c = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: PASS }); if (error) throw error; return c; };
const sub = async (id: string) => (await admin.from("trainer_subscriptions").select("*").eq("trainer_id", id).single()).data!;
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const pay = (id: string, ref: string) => admin.from("subscription_payments").insert({ trainer_id: id, provider: "wompi", provider_reference: ref, amount_usd_cents: null, charged_amount_cents: 4000000, charged_currency: "COP", status: "pending" })
  .then(() => admin.rpc("settle_subscription_payment", { p_provider: "wompi", p_reference: ref, p_txn_id: "t-" + ref, p_status: "approved", p_amount: 4000000, p_currency: "COP" }));
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("referrals", () => {
  it("a trainer gets one unique code and can change the reward", async () => {
    const t = await mk(); const c = await as(t.email);
    const a = await c.rpc("set_my_referral", { p_reward: "ai" }); expect(a.data).toMatch(/^[A-HJ-NP-Z2-9]{7}$/);
    const b = await c.rpc("set_my_referral", { p_reward: "days" }); expect(b.data).toBe(a.data);
    expect((await c.from("referral_codes").select("reward").single()).data?.reward).toBe("days");
    expect((await c.rpc("set_my_referral", { p_reward: "gold" })).error).not.toBeNull();
  });
  it("signing up with a valid code gives 10 days; without or with a bad code, 7", async () => {
    const r = await mk(); const code = (await (await as(r.email)).rpc("set_my_referral", { p_reward: "slots" })).data as string;
    const withCode = await mk({ ref_code: code.toLowerCase() }); const s1 = await sub(withCode.id);
    expect(days(s1.trial_ends_at, s1.trial_started_at)).toBe(10);
    expect((await admin.from("referrals").select("referrer_id,status").eq("referred_id", withCode.id).single()).data).toEqual({ referrer_id: r.id, status: "pending" });
    const plain = await mk(); expect(days((await sub(plain.id)).trial_ends_at, (await sub(plain.id)).trial_started_at)).toBe(7);
    const bad = await mk({ ref_code: "ZZZZZZ9" }); expect(days((await sub(bad.id)).trial_ends_at, (await sub(bad.id)).trial_started_at)).toBe(7);
    expect((await admin.from("referrals").select("*").eq("referred_id", bad.id)).data).toEqual([]);
  });
  it("slots reward: paid once, raises the capacity, and a second payment does not pay again", async () => {
    const r = await mk(); const rc = await as(r.email); const code = (await rc.rpc("set_my_referral", { p_reward: "slots" })).data as string;
    expect((await rc.rpc("trainer_capacity", { t: r.id })).data).toBe(20);
    const f = await mk({ ref_code: code });
    expect((await rc.rpc("trainer_capacity", { t: r.id })).data).toBe(20);                         // not before the friend pays
    await pay(f.id, `rf-a-${run}`);
    expect((await rc.rpc("trainer_capacity", { t: r.id })).data).toBe(23);
    await pay(f.id, `rf-b-${run}`);
    expect((await rc.rpc("trainer_capacity", { t: r.id })).data).toBe(23);
    expect((await admin.from("referrals").select("status,reward,amount").eq("referred_id", f.id).single()).data).toEqual({ status: "rewarded", reward: "slots", amount: 3 });
  });
  it("ai reward adds paid drafts to the balance; days reward extends the plan", async () => {
    const r = await mk(); const rc = await as(r.email); await rc.rpc("set_my_referral", { p_reward: "ai" });
    const code = (await rc.from("referral_codes").select("code").single()).data!.code;
    const before = (await admin.rpc("ai_credit_state", { p_trainer: r.id })).data.paid_left;
    await pay((await mk({ ref_code: code })).id, `rf-c-${run}`);
    expect((await admin.rpc("ai_credit_state", { p_trainer: r.id })).data.paid_left).toBe(before + 10);

    const d = await mk(); const dc = await as(d.email); await dc.rpc("set_my_referral", { p_reward: "days" });
    const dcode = (await dc.from("referral_codes").select("code").single()).data!.code;
    const t0 = (await sub(d.id)).trial_ends_at;
    await pay((await mk({ ref_code: dcode })).id, `rf-d-${run}`);
    expect(days((await sub(d.id)).trial_ends_at, t0)).toBe(7);
  });
  it("redeem: only for a fresh trial, not your own code, only once", async () => {
    const r = await mk(); const code = (await (await as(r.email)).rpc("set_my_referral", { p_reward: "slots" })).data as string;
    const me = await mk(); const mc = await as(me.email);
    expect((await (await as(r.email)).rpc("redeem_referral_code", { p_code: code })).data).toBe(false);   // own code
    expect((await mc.rpc("redeem_referral_code", { p_code: "AAAAAAA" })).data).toBe(false);
    expect((await mc.rpc("redeem_referral_code", { p_code: code })).data).toBe(true);
    const s = await sub(me.id); expect(days(s.trial_ends_at, s.trial_started_at)).toBe(10);
    expect((await mc.rpc("redeem_referral_code", { p_code: code })).data).toBe(false);                    // once
    const old = await mk(); await admin.from("trainer_subscriptions").update({ trial_started_at: new Date(Date.now() - 5 * 86_400_000).toISOString() }).eq("trainer_id", old.id);
    expect((await (await as(old.email)).rpc("redeem_referral_code", { p_code: code })).data).toBe(false);  // too late
  });
  it("at most 10 referrals are rewarded per trainer", async () => {
    const r = await mk(); const rc = await as(r.email); const code = (await rc.rpc("set_my_referral", { p_reward: "slots" })).data as string;
    for (let i = 0; i < 11; i++) await pay((await mk({ ref_code: code })).id, `rf-cap-${run}-${i}`);
    const rows = (await admin.from("referrals").select("status").eq("referrer_id", r.id)).data!;
    expect(rows.filter((x) => x.status === "rewarded")).toHaveLength(10); expect(rows.filter((x) => x.status === "capped")).toHaveLength(1);
    expect((await rc.rpc("trainer_capacity", { t: r.id })).data).toBe(50);
  }, 60000);
  it("the browser roles cannot write referrals or call the internals", async () => {
    const t = await mk(); const c = await as(t.email);
    expect((await c.from("referral_codes").insert({ trainer_id: t.id, code: "AAAAAAA", reward: "ai" })).error).not.toBeNull();
    expect((await c.from("referrals").insert({ referred_id: t.id, referrer_id: t.id, code: "AAAAAAA" })).error).not.toBeNull();
    expect((await c.rpc("grant_referral_reward", { p_referred: t.id })).error).not.toBeNull();
    expect((await c.rpc("apply_referral", { p_user: t.id, p_code: "AAAAAAA" })).error).not.toBeNull();
    const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.from("referral_codes").select("*")).error).not.toBeNull();
  });
});
