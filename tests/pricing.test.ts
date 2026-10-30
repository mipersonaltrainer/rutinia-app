import { describe, it, expect } from "vitest";
import { slotPurchaseTotalCents, capacitySummary, canAddClient, maxActiveClients, BASE_PRICE_CENTS } from "@/lib/billing/pricing";
import { applyVerifiedPayment, type SlotPurchase } from "@/lib/billing/slots";

const p = (q: number): SlotPurchase => ({ id: "1", providerReference: "tx1", quantity: q, status: "pending", slotsGranted: false });

describe("slot pricing", () => {
  it("total is quantity x 75 cents for 1..10", () => {
    for (let q = 1; q <= 10; q++) expect(slotPurchaseTotalCents(q)).toBe(q * 75);
  });
  it("rejects 0, 11, fractions", () => {
    for (const q of [0, 11, 1.5, -1]) expect(() => slotPurchaseTotalCents(q)).toThrow();
  });
  it("base price unchanged by slot purchase", () => {
    slotPurchaseTotalCents(5);
    expect(BASE_PRICE_CENTS).toBe(1000);
  });
});

describe("capacity", () => {
  it("max = 20 + slots; unused slots remain", () => {
    expect(maxActiveClients(5)).toBe(25);
    expect(capacitySummary(2, 5).remaining).toBe(23);
  });
  it("cannot exceed capacity", () => {
    expect(canAddClient(20, 0)).toBe(false);
    expect(canAddClient(20, 1)).toBe(true);
    expect(canAddClient(25, 5)).toBe(false);
  });
});

describe("verified payment grants", () => {
  it("pending/declined grant nothing", () => {
    expect(applyVerifiedPayment(p(3), "pending", 0).slots).toBe(0);
    expect(applyVerifiedPayment(p(3), "declined", 0).slots).toBe(0);
  });
  it("approved grants once; duplicate webhook is idempotent", () => {
    const a = applyVerifiedPayment(p(3), "approved", 0);
    expect(a.slots).toBe(3);
    const b = applyVerifiedPayment(a.purchase, "approved", a.slots);
    expect(b.slots).toBe(3);
  });
  it("multiple purchases accumulate", () => {
    const a = applyVerifiedPayment(p(3), "approved", 0);
    const b = applyVerifiedPayment({ ...p(4), id: "2", providerReference: "tx2" }, "approved", a.slots);
    expect(b.slots).toBe(7);
  });
});

describe("prices by currency: pesos for Wompi, dollars for PayPal", () => {
  it("the platform costs 40.000 COP a month with Wompi and 10 USD with PayPal", async () => {
    const { basePriceCents, currencyForProvider } = await import("@/lib/billing/pricing");
    expect(basePriceCents("COP")).toBe(4_000_000); expect(basePriceCents("USD")).toBe(1000);
    expect(currencyForProvider("wompi")).toBe("COP"); expect(currencyForProvider("paypal")).toBe("USD");
  });
  it("extra students in pesos get cheaper per student the more are bought at once: 1-2 at 2.500, 3-4 at 2.400, 5-9 at 2.200, 10 at 2.000", async () => {
    const { slotUnitCents, slotPurchaseTotalCents } = await import("@/lib/billing/pricing");
    const unit = (q: number) => slotUnitCents(q, "COP") / 100;
    expect([1, 2, 3, 4, 5, 9, 10].map(unit)).toEqual([2500, 2500, 2400, 2400, 2200, 2200, 2000]);
    expect(slotPurchaseTotalCents(10, "COP")).toBe(2_000_000); expect(slotPurchaseTotalCents(3, "COP")).toBe(720_000);
    for (let q = 2; q <= 10; q++) expect(slotUnitCents(q, "COP")).toBeLessThanOrEqual(slotUnitCents(q - 1, "COP"));      // never more expensive per student
    for (let q = 2; q <= 10; q++) expect(slotPurchaseTotalCents(q, "COP")).toBeGreaterThan(slotPurchaseTotalCents(q - 1, "COP"));   // and a bigger purchase never costs less in total
  });
  it("dollars keep the flat 0.75 per student, and bad quantities are rejected in both currencies", async () => {
    const { slotPurchaseTotalCents } = await import("@/lib/billing/pricing");
    expect(slotPurchaseTotalCents(4, "USD")).toBe(300); expect(slotPurchaseTotalCents(4)).toBe(300);
    for (const q of [0, 11, 1.5, -1]) { expect(() => slotPurchaseTotalCents(q, "COP")).toThrow(); expect(() => slotPurchaseTotalCents(q, "USD")).toThrow(); }
  });
  it("money is formatted the way people read it", async () => {
    const { formatMoney } = await import("@/lib/billing/pricing");
    expect(formatMoney(4_000_000, "COP")).toBe("$40.000 COP"); expect(formatMoney(2_500_000, "COP")).toBe("$25.000 COP");
    expect(formatMoney(1000, "USD")).toBe("$10.00 USD"); expect(formatMoney(600, "USD")).toBe("$6.00 USD");
  });
});

describe("AI credit packs", () => {
  it("20 drafts cost 25.000 COP and 100 cost 100.000 COP; in dollars 6 and 20", async () => {
    const { AI_PACKS, aiPackTotalCents, FREE_MONTHLY_DRAFTS, BILLABLE_AI_KINDS } = await import("@/lib/billing/pricing");
    expect(AI_PACKS.p20).toMatchObject({ credits: 20 }); expect(AI_PACKS.p100).toMatchObject({ credits: 100 });
    expect(aiPackTotalCents("p20", "COP")).toBe(2_500_000); expect(aiPackTotalCents("p100", "COP")).toBe(10_000_000);
    expect(aiPackTotalCents("p20", "USD")).toBe(600); expect(aiPackTotalCents("p100", "USD")).toBe(2000);
    expect(FREE_MONTHLY_DRAFTS).toBe(3); expect([...BILLABLE_AI_KINDS].sort()).toEqual(["diet_draft", "plan_draft"]);
  });
  it("the larger pack is cheaper per draft in both currencies, and an unknown pack is rejected", async () => {
    const { AI_PACKS, aiPackTotalCents } = await import("@/lib/billing/pricing");
    for (const cur of ["COP", "USD"] as const) expect(aiPackTotalCents("p100", cur) / AI_PACKS.p100.credits).toBeLessThan(aiPackTotalCents("p20", cur) / AI_PACKS.p20.credits);
    expect(() => aiPackTotalCents("p5" as never)).toThrow();
  });
});
