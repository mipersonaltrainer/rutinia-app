// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const cap = async (t: string) => (await admin.rpc("trainer_capacity", { t })).data as number;
const access = async (t: string) => (await admin.rpc("trainer_has_access", { t })).data as boolean;
let n = 0;
async function purchase(trainer: string, quantity: number, over: Record<string, unknown> = {}) {
  const ref = `SP-${run}-${++n}`;
  const { error } = await admin.from("slot_purchases").insert({ trainer_id: trainer, provider: "wompi", provider_reference: ref, quantity, unit_price_cents: 75, total_cents: 75 * quantity, currency: "USD", charged_amount_cents: 75 * quantity * 4000, charged_currency: "COP", fx_rate: 4000, status: "pending", ...over });
  expect(error).toBeNull(); return ref;
}
const settleSlots = (ref: string, status: string, amount: number, currency = "COP", provider = "wompi") => admin.rpc("settle_slot_purchase", { p_provider: provider, p_reference: ref, p_txn_id: `tx-${ref}`, p_status: status, p_amount: amount, p_currency: currency });

let t1: string, T1: SupabaseClient;
beforeAll(async () => { t1 = await mk(`bt1-${run}@x.co`); T1 = await login(`bt1-${run}@x.co`); });
afterAll(async () => {
  // billing records are never cascade-deleted with users (retention), so tests remove them explicitly
  for (const id of created) { await admin.from("subscription_payments").delete().eq("trainer_id", id); await admin.from("slot_purchases").delete().eq("trainer_id", id); await admin.from("billing_audit_events").delete().eq("trainer_id", id); }
  await admin.from("provider_webhook_events").delete().like("event_id", `%${run}%`);
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("slot purchases (database)", () => {
  it("pending, declined and wrong-amount payments never grant capacity", async () => {
    const before = await cap(t1);
    const r = await purchase(t1, 3);
    expect((await settleSlots(r, "pending", 3 * 75 * 4000)).data.result).toBe("noop");
    expect(await cap(t1)).toBe(before);
    expect((await settleSlots(r, "approved", 1)).data.result).toBe("amount_mismatch");           // wrong amount
    expect((await settleSlots(r, "approved", 3 * 75 * 4000, "USD")).data.result).toBe("amount_mismatch");   // wrong currency
    expect(await cap(t1)).toBe(before);
    expect((await settleSlots(r, "declined", 0)).data.status).toBe("declined");
    expect(await cap(t1)).toBe(before);
    expect((await settleSlots(r, "approved", 3 * 75 * 4000)).data.result).toBe("noop");         // declined is terminal
    expect(await cap(t1)).toBe(before);
  });
  it("verified approval grants exactly once, even if delivered many times or concurrently", async () => {
    const before = await cap(t1); const r = await purchase(t1, 4);
    const results = await Promise.all(Array.from({ length: 6 }, () => settleSlots(r, "approved", 4 * 75 * 4000)));
    expect(results.filter((x) => x.data.granted === true).length).toBe(1);
    expect(await cap(t1)).toBe(before + 4);
    expect((await settleSlots(r, "approved", 4 * 75 * 4000)).data.result).toBe("noop");
    expect(await cap(t1)).toBe(before + 4);
  });
  it("multiple purchases accumulate, unused slots remain, and unknown references are rejected", async () => {
    const before = await cap(t1);
    for (const q of [1, 10, 5]) { const r = await purchase(t1, q); await settleSlots(r, "approved", q * 75 * 4000); }
    expect(await cap(t1)).toBe(before + 16);
    expect((await settleSlots("SP-nope", "approved", 1)).data.result).toBe("unknown_reference");
  });
  it("capacity = 20 + verified slots is enforced on client activation; refunds lower it without deleting clients", async () => {
    const t = await mk(`bt2-${run}@x.co`);
    const clients = await Promise.all(Array.from({ length: 22 }, (_, i) => mk(`bc-${run}-${i}@x.co`, true)));
    await admin.from("trainer_client_relationships").insert(clients.slice(0, 20).map((c) => ({ trainer_id: t, client_id: c })));
    expect((await admin.from("trainer_client_relationships").insert({ trainer_id: t, client_id: clients[20] })).error?.message).toMatch(/capacity/);
    const r = await purchase(t, 2); await settleSlots(r, "approved", 2 * 75 * 4000);
    expect((await admin.from("trainer_client_relationships").insert([{ trainer_id: t, client_id: clients[20] }, { trainer_id: t, client_id: clients[21] }])).error).toBeNull();
    expect(await cap(t)).toBe(22);
    expect((await settleSlots(r, "voided", 0)).data.status).toBe("voided");                      // refund/chargeback
    expect(await cap(t)).toBe(20);
    const { count } = await admin.from("trainer_client_relationships").select("id", { count: "exact", head: true }).eq("trainer_id", t).eq("status", "active");
    expect(count).toBe(22);                                                                        // nobody removed
    const c23 = await mk(`bc-${run}-x@x.co`, true);
    expect((await admin.from("trainer_client_relationships").insert({ trainer_id: t, client_id: c23 })).error?.message).toMatch(/capacity/);
  });
  it("an expired purchase can still be approved when the provider confirms money was received", async () => {
    const before = await cap(t1); const r = await purchase(t1, 2);
    await admin.from("slot_purchases").update({ status: "expired" }).eq("provider_reference", r);
    expect((await settleSlots(r, "approved", 2 * 75 * 4000)).data.granted).toBe(true); expect(await cap(t1)).toBe(before + 2);
  });
  it("users cannot create, edit or settle purchases, or call settlement functions", async () => {
    expect((await T1.from("slot_purchases").insert({ trainer_id: t1, provider: "paypal", provider_reference: "x", quantity: 10, unit_price_cents: 75, total_cents: 750, status: "approved", slots_granted: true })).error).not.toBeNull();
    const r = await purchase(t1, 1);
    await T1.from("slot_purchases").update({ status: "approved", slots_granted: true }).eq("provider_reference", r);
    expect((await admin.from("slot_purchases").select("status").eq("provider_reference", r).single()).data?.status).toBe("pending");
    expect((await T1.rpc("settle_slot_purchase", { p_provider: "wompi", p_reference: r, p_txn_id: "x", p_status: "approved", p_amount: 300000, p_currency: "COP" })).error).not.toBeNull();
    expect((await T1.rpc("expire_subscriptions")).error).not.toBeNull();
    expect((await T1.from("provider_webhook_events").select("id")).data).toEqual([]);
  });
  it("DB constraints keep price and quantity honest", async () => {
    for (const bad of [{ quantity: 11, total_cents: 825 }, { quantity: 0, total_cents: 0 }, { quantity: 3, total_cents: 200 }, { quantity: 3, unit_price_cents: 80, total_cents: 240 }])
      expect((await admin.from("slot_purchases").insert({ trainer_id: t1, provider: "paypal", provider_reference: `bad-${Math.random()}`, unit_price_cents: 75, charged_amount_cents: 1, charged_currency: "USD", ...bad })).error).not.toBeNull();
  });
});

describe("subscription state machine (database)", () => {
  let t: string;
  const subRow = async () => (await admin.from("trainer_subscriptions").select("*").eq("trainer_id", t).single()).data!;
  const pay = (ref: string, status: string, amount = 1000, currency = "USD", provider = "paypal", trainer: string | null = t) => admin.rpc("settle_subscription_payment", { p_provider: provider, p_reference: ref, p_txn_id: ref, p_status: status, p_amount: amount, p_currency: currency, p_trainer: trainer });
  beforeAll(async () => { t = await mk(`bt3-${run}@x.co`); });

  it("trial: 7 days from server time, access until it ends, then payment_required via the scheduled job", async () => {
    const s = await subRow(); expect((new Date(s.trial_ends_at).getTime() - new Date(s.trial_started_at).getTime()) / 86400000).toBe(7);
    expect(s.status).toBe("trialing"); expect(await access(t)).toBe(true);
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("trainer_id", t);
    expect(await access(t)).toBe(false);                                                         // enforced before the job even runs
    expect((await admin.rpc("expire_subscriptions")).data.trials_expired).toBeGreaterThanOrEqual(1);
    expect((await subRow()).status).toBe("payment_required");
  });
  it("a verified payment activates and extends one month; duplicates and mismatches change nothing", async () => {
    expect((await pay(`PP-${run}-1`, "pending")).data.result).toBe("noop");               // recorded as pending, nothing else
    expect((await subRow()).status).toBe("payment_required");                                    // pending never activates
    expect((await pay(`PP-${run}-2`, "approved", 999)).data.result).toBe("amount_mismatch");
    expect((await pay(`PP-${run}-3`, "approved", 1000, "COP")).data.result).toBe("amount_mismatch");
    expect((await subRow()).status).toBe("payment_required");
    const r = (await pay(`PP-${run}-1`, "approved")).data;                                              // same reference pending -> approved
    expect(r.status).toBe("approved");
    const s = await subRow(); expect(s.status).toBe("active"); expect(new Date(s.current_period_end).getTime()).toBeGreaterThan(Date.now() + 27 * 86400000);
    expect(await access(t)).toBe(true);
    const end1 = s.current_period_end;
    expect((await pay(`PP-${run}-1`, "approved")).data.result).toBe("noop");                            // duplicate
    expect((await subRow()).current_period_end).toBe(end1);
    const { data: p } = await admin.from("subscription_payments").select("snapshot,status,amount_usd_cents").eq("provider_reference", `PP-${run}-1`).single();
    expect(p).toMatchObject({ status: "approved", amount_usd_cents: 1000 }); expect(p!.snapshot).toMatchObject({ base_usd_cents: 1000, included_clients: 20 });
  });
  it("early renewal stacks on top of the paid period; invoices are never rewritten", async () => {
    const before = new Date((await subRow()).current_period_end).getTime();
    await pay(`PP-${run}-4`, "approved");
    const after = new Date((await subRow()).current_period_end).getTime();
    expect(after - before).toBeGreaterThan(27 * 86400000);
    const { data: rows } = await admin.from("subscription_payments").select("provider_reference,status").eq("trainer_id", t); expect(rows!.filter((r) => r.status === "approved").length).toBe(2);
  });
  it("provider states: failed renewals -> past_due (paid time honoured); cancel keeps access until period end; lapse blocks", async () => {
    const st = (state: string, failed = 0) => admin.rpc("apply_provider_subscription_state", { p_trainer: t, p_provider: "paypal", p_provider_sub_id: "I-1", p_state: state, p_failed_count: failed });
    await st("ACTIVE", 2); expect((await subRow()).status).toBe("past_due"); expect(await access(t)).toBe(true);
    await st("ACTIVE", 0); expect((await subRow()).status).toBe("active");
    await st("CANCELLED"); expect((await subRow()).status).toBe("canceled"); expect(await access(t)).toBe(true);
    await admin.from("trainer_subscriptions").update({ current_period_end: new Date(Date.now() - 1000).toISOString() }).eq("trainer_id", t);
    expect(await access(t)).toBe(false);
    await admin.rpc("expire_subscriptions"); expect((await subRow()).status).toBe("expired");
    await st("SUSPENDED"); expect((await subRow()).status).toBe("suspended");
    expect((await pay(`PP-${run}-5`, "approved")).data.status).toBe("approved"); expect((await subRow()).status).toBe("active");   // recovery payment restores access
    expect(await access(t)).toBe(true);
  });
  it("a refund voids the payment record but never rewrites history", async () => {
    expect((await pay(`PP-${run}-5`, "voided")).data.status).toBe("voided");
    expect((await admin.from("subscription_payments").select("status,snapshot").eq("provider_reference", `PP-${run}-5`).single()).data?.snapshot).not.toBeNull();
  });
  it("only the owner can read their payments and audit trail", async () => {
    const T3 = await login(`bt3-${run}@x.co`);
    expect(((await T3.from("subscription_payments").select("id")).data ?? []).length).toBeGreaterThan(0);
    expect((await T1.from("subscription_payments").select("id").eq("trainer_id", t)).data).toEqual([]);
    expect((await T1.from("billing_audit_events").select("id").eq("trainer_id", t)).data).toEqual([]);
    expect((await T3.from("subscription_payments").insert({ trainer_id: t, provider: "paypal", provider_reference: "evil", amount_usd_cents: 1000, charged_amount_cents: 1000, charged_currency: "USD", status: "approved" })).error).not.toBeNull();
    expect((await T3.from("trainer_subscriptions").update({ status: "active", current_period_end: new Date(Date.now() + 9e9).toISOString() }).eq("trainer_id", t)).error?.code).toBe("42501");
    expect((await subRow()).status).not.toBe("trialing");   // unchanged by the (RLS-filtered) update attempt
  });
  it("webhook ledger rejects a repeated (provider, event_id)", async () => {
    const id = `evt-${run}`;
    expect((await admin.from("provider_webhook_events").insert({ provider: "paypal", event_id: id, payload: {} })).error).toBeNull();
    expect((await admin.from("provider_webhook_events").insert({ provider: "paypal", event_id: id, payload: {} })).error?.code).toBe("23505");
    expect((await admin.from("provider_webhook_events").insert({ provider: "wompi", event_id: id, payload: {} })).error).toBeNull();
  });
});

// ---- webhook routes end to end (real Supabase, mocked provider HTTP) --------------------------------------------
describe("webhook routes", () => {
  const realFetch = globalThis.fetch;
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  let tw: string; let wompiPost: (r: Request) => Promise<Response>; let paypalPost: (r: Request) => Promise<Response>; let cronGet: (r: Request) => Promise<Response>;
  let txStatus = "APPROVED"; let verification = "SUCCESS"; let order: unknown; let ppSub: unknown; let ppTx: unknown;

  beforeAll(async () => {
    Object.assign(process.env, { WOMPI_PUBLIC_KEY: "pub_test_x", WOMPI_PRIVATE_KEY: "prv_test_x", WOMPI_EVENTS_SECRET: "test_events_x", WOMPI_INTEGRITY_SECRET: "test_integrity_x", WOMPI_ENVIRONMENT: "sandbox",
      PAYPAL_CLIENT_ID: "cid", PAYPAL_CLIENT_SECRET: "cs", PAYPAL_WEBHOOK_ID: "WH", PAYPAL_ENVIRONMENT: "sandbox", CRON_SECRET: "cron-secret-123" });
    tw = await mk(`bt4-${run}@x.co`);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
      if (u.startsWith("https://sandbox.wompi.co/v1/transactions/")) { const ref = decodeURIComponent(u.split("/").pop()!); const [, reference, amount] = ref.split("|"); return json({ data: { id: ref, status: txStatus, reference, amount_in_cents: Number(amount), currency: "COP" } }); }
      if (u.endsWith("/v1/oauth2/token")) return json({ access_token: "t", expires_in: 3600 });
      if (u.endsWith("/v1/notifications/verify-webhook-signature")) return json({ verification_status: verification });
      if (u.includes("/v2/checkout/orders/")) return json(order);
      if (u.includes("/transactions?")) return json(ppTx);
      if (u.includes("/v1/billing/subscriptions/")) return json(ppSub);
      return realFetch(input, init);
    });
    ({ POST: wompiPost } = await import("@/app/api/webhooks/wompi/route")); ({ POST: paypalPost } = await import("@/app/api/webhooks/paypal/route")); ({ GET: cronGet } = await import("@/app/api/cron/expire/route"));
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  const wompiEvent = (txId: string, status: string, amount: number, ts = 1700000000) => {
    const data = { transaction: { id: txId, status, amount_in_cents: amount } }; const props = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
    const checksum = sha(`${txId}${status}${amount}${ts}test_events_x`);
    return { event: "transaction.updated", data, environment: "test", signature: { properties: props, checksum }, timestamp: ts, sent_at: "x" };
  };
  const post = (fn: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) => fn(new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } }));

  it("Wompi: invalid signature is rejected and grants nothing", async () => {
    const ref = `SP-w-${run}-1`; await admin.from("slot_purchases").insert({ trainer_id: tw, provider: "wompi", provider_reference: ref, quantity: 2, unit_price_cents: 75, total_cents: 150, charged_amount_cents: 600000, charged_currency: "COP", status: "pending" });
    const txId = `T|${ref}|600000`; const ev = wompiEvent(txId, "APPROVED", 600000); ev.signature.checksum = "0".repeat(64);
    expect((await post(wompiPost, ev)).status).toBe(401);
    expect(await cap(tw)).toBe(20);
  });
  it("Wompi: approved event grants once; replays are recognised as duplicates; amount comes from the API, not the webhook body", async () => {
    const ref = `SP-w-${run}-2`; await admin.from("slot_purchases").insert({ trainer_id: tw, provider: "wompi", provider_reference: ref, quantity: 2, unit_price_cents: 75, total_cents: 150, charged_amount_cents: 600000, charged_currency: "COP", status: "pending" });
    const txId = `T|${ref}|600000`; txStatus = "APPROVED"; const ev = wompiEvent(txId, "APPROVED", 600000);
    const r1 = await post(wompiPost, ev, { "x-event-checksum": ev.signature.checksum }); expect(r1.status).toBe(200); expect((await r1.json()).result).toBe("updated");
    expect(await cap(tw)).toBe(22);
    const r2 = await post(wompiPost, ev); expect((await r2.json()).duplicate).toBe(true); expect(await cap(tw)).toBe(22);
    const { count } = await admin.from("provider_webhook_events").select("id", { count: "exact", head: true }).eq("provider", "wompi").eq("event_id", ev.signature.checksum.toLowerCase()); expect(count).toBe(1);
  });
  it("Wompi: a forged 'APPROVED' event for a declined transaction grants nothing (API is the source of truth)", async () => {
    const ref = `SP-w-${run}-3`; await admin.from("slot_purchases").insert({ trainer_id: tw, provider: "wompi", provider_reference: ref, quantity: 1, unit_price_cents: 75, total_cents: 75, charged_amount_cents: 300000, charged_currency: "COP", status: "pending" });
    const before = await cap(tw); txStatus = "DECLINED";
    expect((await post(wompiPost, wompiEvent(`T|${ref}|300000`, "APPROVED", 300000, 1700000001))).status).toBe(200);   // correctly signed (secret leaked scenario) but API says DECLINED
    expect(await cap(tw)).toBe(before);
    expect((await admin.from("slot_purchases").select("status").eq("provider_reference", ref).single()).data?.status).toBe("declined");
    txStatus = "APPROVED";
  });
  it("Wompi: wrong amount from the API never grants; pending stays pending; wrong environment rejected; subscription payment activates", async () => {
    const ref = `SP-w-${run}-4`; await admin.from("slot_purchases").insert({ trainer_id: tw, provider: "wompi", provider_reference: ref, quantity: 1, unit_price_cents: 75, total_cents: 75, charged_amount_cents: 300000, charged_currency: "COP", status: "pending" });
    const before = await cap(tw);
    await post(wompiPost, wompiEvent(`T|${ref}|100`, "APPROVED", 100, 1700000002)); expect(await cap(tw)).toBe(before);
    txStatus = "PENDING"; await post(wompiPost, wompiEvent(`T|${ref}|300000`, "PENDING", 300000, 1700000003)); expect(await cap(tw)).toBe(before);
    const bad = { ...wompiEvent("x", "APPROVED", 1), environment: "prod" }; bad.signature.checksum = sha(`xAPPROVED11700000000test_events_x`); expect((await post(wompiPost, bad)).status).toBe(400);
    txStatus = "APPROVED";
    const sref = `SUB-${run}`; await admin.from("subscription_payments").insert({ trainer_id: tw, provider: "wompi", provider_reference: sref, amount_usd_cents: 1000, charged_amount_cents: 4000000, charged_currency: "COP", status: "pending" });
    await post(wompiPost, wompiEvent(`T|${sref}|4000000`, "APPROVED", 4000000, 1700000004));
    expect((await admin.from("trainer_subscriptions").select("status").eq("trainer_id", tw).single()).data?.status).toBe("active"); expect(await access(tw)).toBe(true);
  });
  it("PayPal: invalid signature rejected; capture event grants once; duplicate event id ignored", async () => {
    const orderId = `ORD-${run}`; await admin.from("slot_purchases").insert({ trainer_id: tw, provider: "paypal", provider_reference: orderId, quantity: 5, unit_price_cents: 75, total_cents: 375, charged_amount_cents: 375, charged_currency: "USD", status: "pending" });
    order = { id: orderId, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CAP-${run}`, status: "COMPLETED", amount: { currency_code: "USD", value: "3.75" } }] } }] };
    const ev = { id: `WH-EV-${run}`, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { supplementary_data: { related_ids: { order_id: orderId } } } };
    const before = await cap(tw); verification = "FAILURE";
    expect((await post(paypalPost, ev, { "paypal-transmission-id": "a", "paypal-transmission-sig": "b" })).status).toBe(401); expect(await cap(tw)).toBe(before);
    verification = "SUCCESS"; const h = { "paypal-transmission-id": "a", "paypal-transmission-sig": "b", "paypal-transmission-time": "t", "paypal-cert-url": "u", "paypal-auth-algo": "x" };
    expect((await post(paypalPost, ev, h)).status).toBe(200); expect(await cap(tw)).toBe(before + 5);
    expect((await (await post(paypalPost, ev, h)).json()).duplicate).toBe(true); expect(await cap(tw)).toBe(before + 5);
    const ev2 = { ...ev, id: `WH-EV2-${run}` }; await post(paypalPost, ev2, h); expect(await cap(tw)).toBe(before + 5);          // different event, same capture: still once
  });
  it("PayPal: a refunded capture lowers capacity; subscription events reconcile state and renewals from the API", async () => {
    const h = { "paypal-transmission-id": "a", "paypal-transmission-sig": "b", "paypal-transmission-time": "t", "paypal-cert-url": "u", "paypal-auth-algo": "x" };
    const orderId = `ORD-${run}`; const before = await cap(tw);
    order = { id: orderId, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CAP-${run}`, status: "REFUNDED", amount: { currency_code: "USD", value: "3.75" } }] } }] };
    await post(paypalPost, { id: `WH-R-${run}`, event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { supplementary_data: { related_ids: { order_id: orderId } } } }, h);
    expect(await cap(tw)).toBe(before - 5);
    await admin.from("trainer_subscriptions").update({ status: "payment_required", current_period_end: null, provider_subscription_id: `I-${run}` }).eq("trainer_id", tw);
    ppSub = { id: `I-${run}`, status: "ACTIVE", custom_id: tw, billing_info: { failed_payments_count: 0 } };
    ppTx = { transactions: [{ id: `SALE-${run}`, status: "COMPLETED", time: "2026-10-19T00:00:00Z", amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "10.00" } } }] };
    const ev = { id: `WH-S-${run}`, event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: `I-${run}` } };
    expect((await post(paypalPost, ev, h)).status).toBe(200);
    const s = (await admin.from("trainer_subscriptions").select("status,current_period_end,provider").eq("trainer_id", tw).single()).data!; expect(s.status).toBe("active"); expect(s.provider).toBe("paypal");
    const end1 = s.current_period_end; await post(paypalPost, { ...ev, id: `WH-S2-${run}`, event_type: "PAYMENT.SALE.COMPLETED", resource: { billing_agreement_id: `I-${run}` } }, h);
    expect((await admin.from("trainer_subscriptions").select("current_period_end").eq("trainer_id", tw).single()).data?.current_period_end).toBe(end1);   // same sale never extends twice
    ppSub = { ...(ppSub as object), custom_id: "00000000-0000-0000-0000-000000000000" };       // foreign/forged subscription
    await post(paypalPost, { ...ev, id: `WH-S3-${run}` }, h);
    expect((await admin.from("subscription_payments").select("id", { count: "exact", head: true }).eq("provider", "paypal").eq("trainer_id", tw)).count).toBe(1);
  });
  it("cron endpoint requires the secret and runs the expiry job", async () => {
    expect((await cronGet(new Request("http://x/api/cron/expire"))).status).toBe(401);
    expect((await cronGet(new Request("http://x/api/cron/expire", { headers: { authorization: "Bearer wrong-secret-xxx" } }))).status).toBe(401);
    const ok = await cronGet(new Request("http://x/api/cron/expire", { headers: { authorization: "Bearer cron-secret-123" } })); expect(ok.status).toBe(200); expect((await ok.json()).ok).toBe(true);
  });
});
