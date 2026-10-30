import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { integritySignature, centavosToPesos, buildButtonParams, verifyWebhookSignature, mapBoldStatus, fetchPayment } from "@/lib/billing/providers/bold";
import type { BillingConfig } from "@/lib/billing/config";

const cfg = { baseUrl: "https://app.test", bold: { enabled: true, identityKey: "ID_KEY", secretKey: "SECRET_KEY" } } as BillingConfig;

describe("Bold integrity signature", () => {
  it("is the SHA256 of order id + amount + currency + secret (example from Bold's guide, hash computed independently)", () => {
    expect(integritySignature({ orderId: "inv0334", amountPesos: 39400, currency: "COP", secretKey: "kgfq2nN0o52XqnuXZWIN2F" }))
      .toBe("620a64c6eab8858d0f96d4f818a1d77be5e9b9eb9dc681f527de1af54fc1b739");
  });
  it("builds the button params in whole pesos, signs them and never exposes the secret", () => {
    const p = buildButtonParams(cfg, { orderId: "SP-1", amountCents: 1_100_000, description: "d", email: "a@b.co", redirectPath: "/billing/bold/return", originPath: "/trainer/billing?pago=cancelado" });
    expect(p).toMatchObject({ apiKey: "ID_KEY", orderId: "SP-1", amount: 11000, currency: "COP", redirectionUrl: "https://app.test/billing/bold/return" });
    expect(p.integritySignature).toBe(integritySignature({ orderId: "SP-1", amountPesos: 11000, currency: "COP", secretKey: "SECRET_KEY" }));
    expect(JSON.stringify(p)).not.toContain("SECRET_KEY");
  });
  it("only accepts whole pesos at or above Bold's minimum", () => {
    expect(centavosToPesos(4_000_000)).toBe(40000);
    for (const c of [150, 99_900, 0, -100, 1.5]) expect(() => centavosToPesos(c)).toThrow();
  });
});

describe("Bold webhook signature", () => {
  const body = JSON.stringify({ id: "e1", type: "SALE_APPROVED", data: { metadata: { reference: "SP-1" } } });
  const sign = (b: string, key: string) => createHmac("sha256", key).update(Buffer.from(b).toString("base64")).digest("hex");
  it("accepts the HMAC-SHA256 of the Base64 body", () => {
    expect(verifyWebhookSignature(body, sign(body, "SECRET_KEY"), "SECRET_KEY")).toBe(true);
    expect(verifyWebhookSignature(body, sign(body, "SECRET_KEY").toUpperCase(), "SECRET_KEY")).toBe(true);
  });
  it("rejects a missing, malformed, tampered or wrongly keyed signature", () => {
    expect(verifyWebhookSignature(body, null, "SECRET_KEY")).toBe(false);
    expect(verifyWebhookSignature(body, "abc", "SECRET_KEY")).toBe(false);
    expect(verifyWebhookSignature(body + " ", sign(body, "SECRET_KEY"), "SECRET_KEY")).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, "OTHER"), "SECRET_KEY")).toBe(false);
  });
});

describe("Bold payment lookup", () => {
  it("maps final states only; in-flight and unknown stay pending", () => {
    expect(mapBoldStatus("APPROVED")).toBe("approved");
    expect(mapBoldStatus("VOIDED")).toBe("voided");
    for (const s of ["REJECTED", "FAILED"]) expect(mapBoldStatus(s)).toBe("declined");
    for (const s of ["PROCESSING", "PENDING", "NO_TRANSACTION_FOUND", "???"]) expect(mapBoldStatus(s)).toBe("pending");
  });
  it("reads the payment by order id with the identity key and returns centavos", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ transaction_id: "TX1", total: 11000, payment_status: "APPROVED", reference_id: "SP-1" }), { status: 200 }));
    const pay = await fetchPayment(cfg, "SP-1", f as unknown as typeof fetch);
    expect(pay).toEqual({ orderId: "SP-1", transactionId: "TX1", status: "APPROVED", amountCents: 1_100_000, currency: "COP" });
    expect(f).toHaveBeenCalledWith("https://payments.api.bold.co/v2/payment-voucher/SP-1", expect.objectContaining({ headers: { Authorization: "x-api-key ID_KEY" } }));
  });
  it("returns null when Bold has nothing, and throws on API errors so the webhook is retried", async () => {
    expect(await fetchPayment(cfg, "x", (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).toBeNull();
    await expect(fetchPayment(cfg, "x", (async () => new Response("", { status: 401 })) as unknown as typeof fetch)).rejects.toThrow("401");
  });
});
