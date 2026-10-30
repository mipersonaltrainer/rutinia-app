import { describe, it, expect } from "vitest";
import { describeAccess, type SubInput } from "@/lib/billing/access-status";

const NOW = new Date("2026-10-20T12:00:00Z");
const at = (days: number, hours = 0) => new Date(NOW.getTime() + days * 86400e3 + hours * 3600e3).toISOString();
const sub = (o: Partial<SubInput>): SubInput => ({ status: "trialing", trial_ends_at: at(7), current_period_end: null, ...o });

describe("describeAccess", () => {
  it("no subscription blocks", () => { const r = describeAccess(null, NOW); expect(r.allowed).toBe(false); expect(r.tone).toBe("danger"); });
  it("fresh trial: info, no CTA, progress ~0", () => {
    const r = describeAccess(sub({}), NOW); expect(r).toMatchObject({ allowed: true, tone: "info", daysLeft: 7, cta: false }); expect(r.trialProgress).toBeCloseTo(0, 2); expect(r.headline).toMatch(/7 días/);
  });
  it("singular and midpoint", () => { expect(describeAccess(sub({ trial_ends_at: at(1, 12) }), NOW).headline).toMatch(/2 días/); const r = describeAccess(sub({ trial_ends_at: at(3, 12) }), NOW); expect(r.trialProgress).toBeCloseTo(0.5, 2); });
  it("3 days left shows the CTA, 2 days turns warning", () => {
    expect(describeAccess(sub({ trial_ends_at: at(3) }), NOW)).toMatchObject({ cta: true, tone: "info" });
    expect(describeAccess(sub({ trial_ends_at: at(2) }), NOW)).toMatchObject({ cta: true, tone: "warn" });
  });
  it("last day: 'mañana' and then hours", () => {
    expect(describeAccess(sub({ trial_ends_at: at(1) }), NOW).headline).toBe("Tu prueba termina mañana");
    expect(describeAccess(sub({ trial_ends_at: at(0, 5) }), NOW).headline).toBe("Tu prueba termina en 5 horas");
    expect(describeAccess(sub({ trial_ends_at: at(0, 0.2) }), NOW).headline).toBe("Tu prueba termina en 1 hora");
  });
  it("expired trial blocks with data-kept message", () => { const r = describeAccess(sub({ trial_ends_at: at(0, -1) }), NOW); expect(r).toMatchObject({ allowed: false, tone: "danger", cta: true }); expect(r.headline).toMatch(/terminó/); expect(r.detail).toMatch(/intactos/); });
  it("active paid: allowed, quiet (ok)", () => expect(describeAccess(sub({ status: "active", current_period_end: at(20) }), NOW)).toMatchObject({ allowed: true, tone: "ok", cta: false, daysLeft: 20 }));
  it("active but period lapsed blocks (matches the SQL gate)", () => expect(describeAccess(sub({ status: "active", current_period_end: at(-1) }), NOW).allowed).toBe(false));
  it("active without a period end blocks", () => expect(describeAccess(sub({ status: "active", current_period_end: null }), NOW).allowed).toBe(false));
  it("past_due inside the paid window keeps access but shouts", () => expect(describeAccess(sub({ status: "past_due", current_period_end: at(3) }), NOW)).toMatchObject({ allowed: true, tone: "danger", cta: true }));
  it("canceled keeps access until the end, CTA only near the end", () => {
    expect(describeAccess(sub({ status: "canceled", current_period_end: at(20) }), NOW)).toMatchObject({ allowed: true, tone: "warn", cta: false });
    expect(describeAccess(sub({ status: "canceled", current_period_end: at(5) }), NOW).cta).toBe(true);
  });
  it.each(["payment_required", "suspended", "expired"])("%s blocks even with a future trial/period date", (status) => {
    expect(describeAccess(sub({ status, trial_ends_at: at(5), current_period_end: at(5) }), NOW).allowed).toBe(false);
  });
  it("a trialing status never grants access once the trial date has passed, even with a stale period end", () => expect(describeAccess(sub({ trial_ends_at: at(-1), current_period_end: at(10) }), NOW).allowed).toBe(false));
});
