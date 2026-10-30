import { describe, it, expect, vi } from "vitest";
import { usdCentsToCopCents, decimalToMinor, minorToDecimal, formatCop } from "@/lib/billing/fx";
import { integritySignature, verifyEventChecksum, computeEventChecksum, buildCheckoutUrl, mapWompiStatus, fetchTransaction, type WompiEvent } from "@/lib/billing/providers/wompi";
import { createPayPalClient, mapCaptureStatus, capturedAmount } from "@/lib/billing/providers/paypal";
import { settleWompiTransaction, settlePayPalOrder, reconcilePayPalSubscription, claimWebhookEvent } from "@/lib/billing/settle";
import { getBillingConfig, type BillingConfig } from "@/lib/billing/config";
import { slotPurchaseTotalCents, BASE_PRICE_CENTS } from "@/lib/billing/pricing";

const cfg: BillingConfig = {
  baseUrl: "https://app.test",
  bold: { enabled: true, identityKey: "BOLD_ID_KEY", secretKey: "BOLD_SECRET" },
  wompi: { enabled: true, env: "sandbox", publicKey: "pub_test_X", privateKey: "prv_test_SECRET", eventsSecret: "test_events_S", integritySecret: "test_integrity_S", apiBase: "https://sandbox.wompi.co/v1" },
  paypal: { enabled: true, env: "sandbox", clientId: "cid", clientSecret: "csecret", webhookId: "WH-1", planId: "P-1", apiBase: "https://api-m.sandbox.paypal.com" },
};

describe("FX and money math (integers only)", () => {
  it("converts USD cents to COP centavos, rounding to whole pesos half-up", () => {
    expect(usdCentsToCopCents(75, "4000")).toBe(300000);            // $0.75 -> 3.000 COP
    expect(usdCentsToCopCents(1000, "4000.0000")).toBe(4000000);
    expect(usdCentsToCopCents(75, "3950.5")).toBe(296300);          // 2962.875 pesos -> 2.963
    expect(usdCentsToCopCents(1, "3999.5")).toBe(4000);             // 39.995 pesos -> 40 pesos (half-up)
  });
  it("rejects invalid inputs", () => {
    for (const r of ["0", "-1", "abc", "1.23456", ""]) expect(() => usdCentsToCopCents(75, r)).toThrow();
    for (const c of [0, -5, 1.5]) expect(() => usdCentsToCopCents(c, "4000")).toThrow();
  });
  it("parses and formats decimals exactly", () => {
    expect(decimalToMinor("0.75")).toBe(75); expect(decimalToMinor("10")).toBe(1000); expect(decimalToMinor("10.5")).toBe(1050);
    for (const bad of ["0.755", "-1", "1,5", "abc", ""]) expect(() => decimalToMinor(bad)).toThrow();
    expect(minorToDecimal(75)).toBe("0.75"); expect(minorToDecimal(1000)).toBe("10.00"); expect(minorToDecimal(5)).toBe("0.05");
    expect(formatCop(300000)).toMatch(/3\.000 COP/);
  });
  it("slot totals are always quantity x 75 and base price is untouched", () => {
    for (let q = 1; q <= 10; q++) expect(slotPurchaseTotalCents(q)).toBe(75 * q);
    expect(BASE_PRICE_CENTS).toBe(1000);
  });
});

describe("Wompi signatures", () => {
  it("integrity signature matches the documented example (docs vector reproduces exactly)", () => {
    expect(integritySignature({ reference: "sk8-438k4-xmxm392-sn2m", amountInCents: 2490000, currency: "COP", integritySecret: "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6" }))
      .toBe("37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5");
  });
  const SECRET = "prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z";
  const ev = (): WompiEvent => ({ event: "transaction.updated", environment: "prod", timestamp: 1530291411,
    data: { transaction: { id: "1234-1610641025-49201", amount_in_cents: 4490000, reference: "MZQ3X2DE2SMX", currency: "COP", status: "APPROVED" } },
    // NOTE: the checksum printed in Wompi's events page (3476DDA5...) is NOT the SHA256 of the inputs that same page lists.
    // This value was computed independently with Python hashlib over the documented concatenation:
    //   "1234-1610641025-49201APPROVED4490000" + "1530291411" + secret
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "5A18EC5E8FDB7DF463E9F94774CBA8F583BA21BD04A09CEFF2EA68A4BC0AEFBE" } });
  it("accepts a correctly signed event and rejects any tampering", () => {
    expect(computeEventChecksum(ev() as never, SECRET).toUpperCase()).toBe("5A18EC5E8FDB7DF463E9F94774CBA8F583BA21BD04A09CEFF2EA68A4BC0AEFBE");
    expect(verifyEventChecksum(ev(), SECRET)).toBe(true);
    expect(verifyEventChecksum(ev(), SECRET, "5a18ec5e8fdb7df463e9f94774cba8f583ba21bd04a09ceff2ea68a4bc0aefbe")).toBe(true);
    const t = ev(); (t.data as { transaction: { amount_in_cents: number } }).transaction.amount_in_cents = 100; expect(verifyEventChecksum(t, SECRET)).toBe(false);
    const s = ev(); (s.data as { transaction: { status: string } }).transaction.status = "DECLINED"; expect(verifyEventChecksum(s, SECRET)).toBe(false);
    expect(verifyEventChecksum(ev(), "wrong")).toBe(false);
    expect(verifyEventChecksum(ev(), SECRET, "deadbeef")).toBe(false);
    expect(verifyEventChecksum({ ...ev(), signature: undefined } as never, SECRET)).toBe(false);
    expect(verifyEventChecksum({ ...ev(), timestamp: 1 }, SECRET)).toBe(false);
    expect(verifyEventChecksum(ev(), "")).toBe(false);
  });
  it("builds a signed checkout URL with COP and our redirect", () => {
    const u = new URL(buildCheckoutUrl(cfg, { reference: "SP-1", amountInCents: 300000, redirectPath: "/billing/wompi/return" }));
    expect(u.origin + u.pathname).toBe("https://checkout.wompi.co/p/");
    expect(u.searchParams.get("currency")).toBe("COP"); expect(u.searchParams.get("amount-in-cents")).toBe("300000");
    expect(u.searchParams.get("signature:integrity")).toBe(integritySignature({ reference: "SP-1", amountInCents: 300000, currency: "COP", integritySecret: "test_integrity_S" }));
    expect(u.searchParams.get("redirect-url")).toBe("https://app.test/billing/wompi/return");
    expect(u.toString()).not.toContain("prv_test"); expect(u.toString()).not.toContain("test_integrity_S"); expect(u.toString()).not.toContain("test_events_S");
  });
  it("maps statuses conservatively and reads transactions with the private key only", async () => {
    expect([mapWompiStatus("APPROVED"), mapWompiStatus("DECLINED"), mapWompiStatus("ERROR"), mapWompiStatus("VOIDED"), mapWompiStatus("PENDING"), mapWompiStatus("???")]).toEqual(["approved", "declined", "declined", "voided", "pending", "pending"]);
    const f = vi.fn(async () => new Response(JSON.stringify({ data: { id: "t1", status: "APPROVED", reference: "SP-1", amount_in_cents: 300000, currency: "COP" } }), { status: 200 }));
    const tx = await fetchTransaction(cfg, "t1", f as never);
    expect(tx?.status).toBe("APPROVED");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.wompi.co/v1/transactions/t1"); expect((init.headers as Record<string, string>).Authorization).toBe("Bearer prv_test_SECRET");
    expect(await fetchTransaction(cfg, "x", (async () => new Response("{}", { status: 404 })) as never)).toBeNull();
    await expect(fetchTransaction(cfg, "x", (async () => new Response("{}", { status: 500 })) as never)).rejects.toThrow();
  });
});

describe("PayPal client (mocked HTTP)", () => {
  const mk = (handler: (url: string, init: RequestInit) => unknown) => {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      const out = handler(url, init); return new Response(JSON.stringify(out ?? {}), { status: 200 });
    });
    return { f, client: createPayPalClient(cfg, f as never) };
  };
  it("creates an order in USD with exact decimal amount and idempotency key", async () => {
    const { f, client } = mk(() => ({ id: "ORD1", status: "CREATED", links: [{ rel: "self", href: "x" }, { rel: "payer-action", href: "https://paypal.test/approve" }] }));
    const o = await client.createOrder({ usdCents: 375, purchaseId: "PID", description: "d", returnUrl: "https://app.test/r", cancelUrl: "https://app.test/c" });
    expect(o).toEqual({ id: "ORD1", approveUrl: "https://paypal.test/approve" });
    const call = f.mock.calls.find((c) => String(c[0]).endsWith("/v2/checkout/orders"))!; const body = JSON.parse(String(call[1].body));
    expect(body.intent).toBe("CAPTURE"); expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "3.75" });
    expect(body.purchase_units[0].custom_id).toBe("PID"); expect(body.payment_source.paypal.experience_context.return_url).toBe("https://app.test/r");
    expect((call[1].headers as Record<string, string>)["PayPal-Request-Id"]).toBe("PID"); expect((call[1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const tokenCall = f.mock.calls[0]; expect((tokenCall[1].headers as Record<string, string>).Authorization).toMatch(/^Basic /); expect(String(tokenCall[1].body)).toBe("grant_type=client_credentials");
  });
  it("caches the access token and creates subscriptions with the trainer as custom_id", async () => {
    const { f, client } = mk(() => ({ id: "I-SUB", status: "APPROVAL_PENDING", links: [{ rel: "approve", href: "https://paypal.test/sub" }] }));
    await client.createSubscription({ planId: "P-1", trainerId: "T1", returnUrl: "https://app.test/r", cancelUrl: "https://app.test/c" });
    await client.getSubscription("I-SUB");
    expect(f.mock.calls.filter((c) => String(c[0]).endsWith("/oauth2/token")).length).toBe(1);
    const body = JSON.parse(String(f.mock.calls[1][1].body)); expect(body.plan_id).toBe("P-1"); expect(body.custom_id).toBe("T1"); expect(body.application_context.user_action).toBe("SUBSCRIBE_NOW");
  });
  it("verifies webhooks through the official endpoint and fails closed", async () => {
    const headers = new Headers({ "paypal-transmission-id": "tid", "paypal-transmission-sig": "sig", "paypal-transmission-time": "t", "paypal-cert-url": "https://api.paypal.com/cert", "paypal-auth-algo": "SHA256withRSA" });
    const ok = mk(() => ({ verification_status: "SUCCESS" })); expect(await ok.client.verifyWebhook(headers, { id: "E1" })).toBe(true);
    const sent = JSON.parse(String(ok.f.mock.calls[1][1].body)); expect(sent).toMatchObject({ transmission_id: "tid", transmission_sig: "sig", webhook_id: "WH-1", webhook_event: { id: "E1" }, auth_algo: "SHA256withRSA" });
    expect(String(ok.f.mock.calls[1][0])).toBe("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
    expect(await mk(() => ({ verification_status: "FAILURE" })).client.verifyWebhook(headers, {})).toBe(false);
    expect(await ok.client.verifyWebhook(new Headers(), {})).toBe(false);
    const boom = createPayPalClient(cfg, (async () => { throw new Error("net"); }) as never); expect(await boom.verifyWebhook(headers, {})).toBe(false);
  });
  it("maps capture statuses and amounts", () => {
    expect(["COMPLETED", "DECLINED", "FAILED", "PENDING", "REFUNDED", "PARTIALLY_REFUNDED"].map(mapCaptureStatus)).toEqual(["approved", "declined", "declined", "pending", "voided", "pending"]);
    expect(capturedAmount({ id: "c", status: "COMPLETED", amount: { currency_code: "USD", value: "3.75" } })).toEqual({ cents: 375, currency: "USD" });
  });
});

const fakeAdmin = (opts: { subRow?: { provider_subscription_id: string } | null; insertError?: { code: string } | null; processed?: boolean } = {}) => {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => { rpcs.push({ fn, args }); return { data: { result: "updated", status: args.p_status }, error: null }; },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.subRow ?? null }), eq: () => ({ single: async () => ({ data: { processed_at: opts.processed ? "x" : null } }) }) }) }),
      insert: async () => ({ error: opts.insertError ?? null }), update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
    }),
  };
  return { admin: admin as never, rpcs };
};

describe("settlement orchestration", () => {
  it("routes Wompi transactions by our reference prefix and passes provider-verified values", async () => {
    const a = fakeAdmin();
    await settleWompiTransaction(a.admin, { id: "t1", status: "APPROVED", reference: "SP-abc", amount_in_cents: 300000, currency: "COP" });
    await settleWompiTransaction(a.admin, { id: "t2", status: "DECLINED", reference: "SUB-abc", amount_in_cents: 4000000, currency: "COP" });
    expect((await settleWompiTransaction(a.admin, { id: "t3", status: "APPROVED", reference: "OTHER", amount_in_cents: 1, currency: "COP" })).result).toBe("ignored");
    expect(a.rpcs.map((r) => r.fn)).toEqual(["settle_slot_purchase", "settle_subscription_payment"]);
    expect(a.rpcs[0].args).toMatchObject({ p_provider: "wompi", p_reference: "SP-abc", p_status: "approved", p_amount: 300000, p_currency: "COP" });
    expect(a.rpcs[1].args.p_status).toBe("declined");
  });
  it("PayPal orders without a capture never grant; captures settle with exact cents", async () => {
    const a = fakeAdmin();
    expect((await settlePayPalOrder(a.admin, { id: "O1", status: "APPROVED" })).status).toBe("pending"); expect(a.rpcs.length).toBe(0);
    await settlePayPalOrder(a.admin, { id: "O1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "C1", status: "COMPLETED", amount: { currency_code: "USD", value: "0.75" } }] } }] });
    expect(a.rpcs[0].args).toMatchObject({ p_provider: "paypal", p_reference: "O1", p_txn_id: "C1", p_status: "approved", p_amount: 75, p_currency: "USD" });
  });
  it("reconciles a PayPal subscription: ignores foreign subscriptions, settles payments then state", async () => {
    const sub = { id: "I-1", status: "ACTIVE", custom_id: "T1", billing_info: { failed_payments_count: 0 } };
    const pp = { getSubscription: async () => sub, listSubscriptionTransactions: async () => ({ transactions: [{ id: "TX1", status: "COMPLETED", time: "t", amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "10.00" } } }, { id: "TX2", status: "DECLINED", time: "t", amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "10.00" } } }] }) } as never;
    const foreign = fakeAdmin({ subRow: { provider_subscription_id: "I-OTHER" } });
    expect((await reconcilePayPalSubscription(foreign.admin, pp, "I-1")).result).toBe("unknown_subscription"); expect(foreign.rpcs.length).toBe(0);
    const none = fakeAdmin({ subRow: null }); expect((await reconcilePayPalSubscription(none.admin, pp, "I-1")).result).toBe("unknown_subscription");
    const mine = fakeAdmin({ subRow: { provider_subscription_id: "I-1" } });
    await reconcilePayPalSubscription(mine.admin, pp, "I-1");
    expect(mine.rpcs.map((r) => r.fn)).toEqual(["settle_subscription_payment", "settle_subscription_payment", "apply_provider_subscription_state"]);
    expect(mine.rpcs[0].args).toMatchObject({ p_reference: "TX1", p_status: "approved", p_amount: 1000, p_currency: "USD", p_trainer: "T1" });
    expect(mine.rpcs[1].args.p_status).toBe("declined"); expect(mine.rpcs[2].args).toMatchObject({ p_state: "ACTIVE", p_failed_count: 0 });
    const noCustom = fakeAdmin(); expect((await reconcilePayPalSubscription(noCustom.admin, { getSubscription: async () => ({ id: "x", status: "ACTIVE" }) } as never, "x")).result).toBe("ignored");
  });
  it("webhook ledger: first delivery processes, repeats do not, unfinished ones retry", async () => {
    expect(await claimWebhookEvent(fakeAdmin().admin, "wompi", "e1", {})).toBe(true);
    expect(await claimWebhookEvent(fakeAdmin({ insertError: { code: "23505" }, processed: true }).admin, "wompi", "e1", {})).toBe(false);
    expect(await claimWebhookEvent(fakeAdmin({ insertError: { code: "23505" }, processed: false }).admin, "wompi", "e1", {})).toBe(true);
    await expect(claimWebhookEvent(fakeAdmin({ insertError: { code: "XX000" } }).admin, "wompi", "e1", {})).rejects.toThrow();
  });
  it("config reports providers as disabled until every credential exists, and never defaults to production", () => {
    const keys = ["WOMPI_PUBLIC_KEY", "WOMPI_PRIVATE_KEY", "WOMPI_EVENTS_SECRET", "WOMPI_INTEGRITY_SECRET", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "WOMPI_ENVIRONMENT", "PAYPAL_ENVIRONMENT"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]])); keys.forEach((k) => delete process.env[k]);
    try { const c = getBillingConfig(); expect(c.wompi.enabled).toBe(false); expect(c.paypal.enabled).toBe(false); expect(c.wompi.apiBase).toContain("sandbox"); expect(c.paypal.apiBase).toContain("sandbox");
      process.env.WOMPI_PUBLIC_KEY = "a"; process.env.WOMPI_PRIVATE_KEY = "b"; process.env.WOMPI_EVENTS_SECRET = "c"; expect(getBillingConfig().wompi.enabled).toBe(false); process.env.WOMPI_INTEGRITY_SECRET = "d"; expect(getBillingConfig().wompi.enabled).toBe(true);
    } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
  });
});
