import { describe, it, expect } from "vitest";
import { subscriptionBucket, countBuckets, summarizePayments, groupCount, daysSince } from "@/lib/staff/summary";

const now = new Date("2026-10-28T12:00:00Z");
const in2d = new Date(now.getTime() + 2 * 86400000).toISOString(), ago2d = new Date(now.getTime() - 2 * 86400000).toISOString();

describe("support panel: subscription buckets (same rule as trainer_has_access)", () => {
  it("a paid status with time left is paid; a trial that has not ended is a trial", () => {
    expect(subscriptionBucket({ status: "active", trial_ends_at: null, current_period_end: in2d }, now)).toBe("paid");
    expect(subscriptionBucket({ status: "canceled", trial_ends_at: null, current_period_end: in2d }, now)).toBe("paid");   // keeps access until the paid period ends
    expect(subscriptionBucket({ status: "trialing", trial_ends_at: in2d, current_period_end: null }, now)).toBe("trial");
  });
  it("an expired period, an ended trial or a state that never grants access is blocked; no row is 'none'", () => {
    expect(subscriptionBucket({ status: "active", trial_ends_at: null, current_period_end: ago2d }, now)).toBe("blocked");
    expect(subscriptionBucket({ status: "trialing", trial_ends_at: ago2d, current_period_end: null }, now)).toBe("blocked");
    expect(subscriptionBucket({ status: "payment_required", trial_ends_at: ago2d, current_period_end: null }, now)).toBe("blocked");
    expect(subscriptionBucket({ status: "active", trial_ends_at: null, current_period_end: null }, now)).toBe("blocked");
    expect(subscriptionBucket(null, now)).toBe("none");
  });
  it("counts every account in exactly one bucket", () => {
    const c = countBuckets([{ status: "trialing", trial_ends_at: in2d, current_period_end: null }, { status: "active", trial_ends_at: null, current_period_end: in2d }, null, { status: "payment_required", trial_ends_at: ago2d, current_period_end: null }], now);
    expect(c).toEqual({ trial: 1, paid: 1, blocked: 1, none: 1 });
  });
});

describe("support panel: payment summary", () => {
  const row = (status: string, cents: number, cur: string, ageH = 0) => ({ status, provider: "bold", charged_amount_cents: cents, charged_currency: cur, created_at: new Date(now.getTime() - ageH * 3600_000).toISOString() });
  it("adds approved money per currency (minor units) and separates stale pending checkouts", () => {
    const s = summarizePayments([row("approved", 250000, "COP"), row("approved", 4000000, "COP"), row("approved", 1000, "USD"), row("pending", 250000, "COP", 0.2), row("pending", 250000, "COP", 3), row("declined", 1, "COP"), row("voided", 1, "COP")], now);
    expect(s).toEqual({ approved: { count: 3, COP: 4250000, USD: 1000 }, pending: 2, stalePending: 1, declined: 1, voided: 1 });
  });
  it("an empty month is all zeros", () => { expect(summarizePayments([], now)).toEqual({ approved: { count: 0, COP: 0, USD: 0 }, pending: 0, stalePending: 0, declined: 0, voided: 0 }); });
});

describe("support panel: helpers", () => {
  it("groups and counts, and measures whole days without going negative", () => {
    expect(groupCount([{ k: "a" }, { k: "b" }, { k: "a" }], (r) => r.k)).toEqual({ a: 2, b: 1 });
    expect(daysSince(ago2d, now)).toBe(2); expect(daysSince(in2d, now)).toBe(0);
  });
});
