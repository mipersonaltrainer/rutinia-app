// Requires local Supabase. Two price lists: Wompi charges pesos, PayPal charges dollars. The database refuses any other amount for a list.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { COP_SLOT_TIERS, slotPurchaseTotalCents, slotUnitCents, aiPackTotalCents, basePriceCents } from "@/lib/billing/pricing";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (error) throw error; created.push(data.user.id); return data.user.id; }
const cap = async (t: string) => (await admin.rpc("trainer_capacity", { t })).data as number;
let n = 0; let t1: string;
beforeAll(async () => { t1 = await mk(`cop-t1-${run}@x.co`); });
afterAll(async () => {
  for (const id of created) { await admin.from("subscription_payments").delete().eq("trainer_id", id); await admin.from("slot_purchases").delete().eq("trainer_id", id); await admin.from("ai_credit_purchases").delete().eq("trainer_id", id); await admin.from("billing_audit_events").delete().eq("trainer_id", id); }
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

const slot = (q: number, over: Record<string, unknown> = {}) => admin.from("slot_purchases").insert({ trainer_id: t1, provider: "wompi", provider_reference: `SP-cop-${run}-${++n}`, quantity: q, unit_price_cents: slotUnitCents(q, "COP"), total_cents: slotPurchaseTotalCents(q, "COP"), currency: "COP", charged_amount_cents: slotPurchaseTotalCents(q, "COP"), charged_currency: "COP", status: "pending", ...over });

describe("student slots in pesos", () => {
  it("every quantity is accepted at exactly its tier price, and the application and the database agree on the tiers", async () => {
    for (let q = 1; q <= 10; q++) expect((await slot(q)).error, `quantity ${q}`).toBeNull();
    expect(COP_SLOT_TIERS.map((t) => t.unitCents / 100)).toEqual([2500, 2400, 2200, 2000]);
  });
  it("a wrong unit price or total in pesos is refused (no cheaper tier than you bought, no pricier either)", async () => {
    expect((await slot(3, { unit_price_cents: 250_000, total_cents: 750_000 })).error).not.toBeNull();     // 3 students are 2.400 each, not 2.500
    expect((await slot(3, { unit_price_cents: 200_000, total_cents: 600_000 })).error).not.toBeNull();     // nor the 10-student price
    expect((await slot(1, { unit_price_cents: 240_000, total_cents: 240_000 })).error).not.toBeNull();
    expect((await slot(5, { total_cents: 1 })).error).not.toBeNull();
  });
  it("dollars keep their own flat price", async () => {
    expect((await admin.from("slot_purchases").insert({ trainer_id: t1, provider: "paypal", provider_reference: `ORD-cop-${run}`, quantity: 4, unit_price_cents: 75, total_cents: 300, currency: "USD", charged_amount_cents: 300, charged_currency: "USD", status: "pending" })).error).toBeNull();
    expect((await admin.from("slot_purchases").insert({ trainer_id: t1, provider: "paypal", provider_reference: `ORD-cop-${run}-b`, quantity: 4, unit_price_cents: 60, total_cents: 240, currency: "USD", charged_amount_cents: 240, charged_currency: "USD", status: "pending" })).error).not.toBeNull();
  });
  it("a verified payment in pesos grants the slots once, and a wrong amount grants nothing", async () => {
    const ref = `SP-cop-${run}-pay`; const total = slotPurchaseTotalCents(3, "COP");
    expect((await slot(3, { provider_reference: ref })).error).toBeNull();
    const before = await cap(t1); const settle = (amount: number) => admin.rpc("settle_slot_purchase", { p_provider: "wompi", p_reference: ref, p_txn_id: `tx-${ref}`, p_status: "approved", p_amount: amount, p_currency: "COP" });
    expect((await settle(total - 100)).data.result).toBe("amount_mismatch"); expect(await cap(t1)).toBe(before);
    expect((await settle(total)).data).toMatchObject({ result: "updated", granted: true }); expect(await cap(t1)).toBe(before + 3);
    expect((await settle(total)).data.result).toBe("noop"); expect(await cap(t1)).toBe(before + 3);
  });
});

describe("the subscription in pesos", () => {
  it("40.000 COP is the only amount accepted for a Wompi month, and approving it extends the period with a snapshot in pesos", async () => {
    const row = (ref: string, charged: number) => admin.from("subscription_payments").insert({ trainer_id: t1, provider: "wompi", provider_reference: ref, amount_usd_cents: null, charged_amount_cents: charged, charged_currency: "COP", status: "pending" });
    expect(basePriceCents("COP")).toBe(4_000_000);
    expect((await row(`SUB-cop-${run}-bad`, 3_000_000)).error).not.toBeNull();
    const ref = `SUB-cop-${run}-ok`; expect((await row(ref, 4_000_000)).error).toBeNull();
    const r = await admin.rpc("settle_subscription_payment", { p_provider: "wompi", p_reference: ref, p_txn_id: `tx-${ref}`, p_status: "approved", p_amount: 4_000_000, p_currency: "COP" });
    expect(r.data).toMatchObject({ result: "updated", status: "approved" });
    expect((await admin.from("trainer_subscriptions").select("status,current_period_end").eq("trainer_id", t1).single()).data).toMatchObject({ status: "active" });
    const { data: p } = await admin.from("subscription_payments").select("snapshot,amount_usd_cents").eq("provider_reference", ref).single();
    expect(p!.amount_usd_cents).toBeNull(); expect(p!.snapshot).toMatchObject({ base_price_cents: 4_000_000, currency: "COP", included_clients: 20 });
  });
  it("the dollar month is still exactly 10.00 USD", async () => {
    expect((await admin.from("subscription_payments").insert({ trainer_id: t1, provider: "paypal", provider_reference: `PP-cop-${run}`, amount_usd_cents: 999, charged_amount_cents: 999, charged_currency: "USD", status: "pending" })).error).not.toBeNull();
    expect((await admin.from("subscription_payments").insert({ trainer_id: t1, provider: "paypal", provider_reference: `PP-cop-${run}-ok`, amount_usd_cents: 1000, charged_amount_cents: 1000, charged_currency: "USD", status: "pending" })).error).toBeNull();
  });
});

describe("AI packs in both currencies", () => {
  const pack = (id: string, credits: number, total: number, currency: string) => admin.from("ai_credit_purchases").insert({ trainer_id: t1, provider: currency === "COP" ? "wompi" : "paypal", provider_reference: `AC-cop-${run}-${++n}`, pack: id, credits, total_cents: total, currency, status: "pending" });
  it("20 drafts for 25.000 COP / 6.00 USD and 100 for 100.000 COP / 20.00 USD are accepted; anything else is refused", async () => {
    expect((await pack("p20", 20, aiPackTotalCents("p20", "COP"), "COP")).error).toBeNull(); expect((await pack("p100", 100, aiPackTotalCents("p100", "COP"), "COP")).error).toBeNull();
    expect((await pack("p20", 20, aiPackTotalCents("p20", "USD"), "USD")).error).toBeNull(); expect((await pack("p100", 100, aiPackTotalCents("p100", "USD"), "USD")).error).toBeNull();
    expect((await pack("p20", 20, 2_000_000, "COP")).error).not.toBeNull(); expect((await pack("p100", 100, 2000, "COP")).error).not.toBeNull();
    expect((await pack("p20", 25, 2_500_000, "COP")).error).not.toBeNull(); expect((await pack("p25", 25, 700, "USD")).error).not.toBeNull();
  });
});
