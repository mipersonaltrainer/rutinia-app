import { describe, it, expect } from "vitest";
import { normalizeReferralCode, referralLink, canStillRedeem, REFERRAL_REWARDS } from "@/lib/billing/referrals";

describe("referral helpers", () => {
  it("accepts 7 characters without look-alikes, in any case and with spaces", () => expect(normalizeReferralCode("  abcd234 ")).toBe("ABCD234"));
  it("rejects wrong length, symbols and look-alike letters/digits", () => {
    for (const bad of ["", "ABC", "ABCDEFGH", "ABCD-23", "ABCD0E2", "ABCD1E2", "ABCDIE2", "ABCDOE2", null, undefined]) expect(normalizeReferralCode(bad as never)).toBeUndefined();
  });
  it("builds the sign-up link", () => expect(referralLink("https://www.rutinia.company/", "ABCD234")).toBe("https://www.rutinia.company/signup?ref=ABCD234"));
  it("the redeem window is 3 days", () => { const now = Date.parse("2026-11-04T00:00:00Z"); expect(canStillRedeem("2026-11-02T00:00:00Z", now)).toBe(true); expect(canStillRedeem("2026-11-01T00:00:00Z", now)).toBe(false); });
  it("the rewards match the SQL terms", () => expect([REFERRAL_REWARDS.slots.amount, REFERRAL_REWARDS.ai.amount, REFERRAL_REWARDS.days.amount]).toEqual([3, 10, 7]));
});
