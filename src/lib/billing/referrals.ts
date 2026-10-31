/** Referral codes: 7 characters from an alphabet without look-alikes (no 0/O, 1/I). Mirrors referral_terms() / the check in 0049_referrals.sql. */
export const REFERRAL_TRIAL_DAYS = 10;
export const REFERRAL_CAP = 10;
export const REFERRAL_REWARDS = {
  slots: { label: "3 cupos de alumnos extra", short: "3 cupos de alumnos extra", amount: 3 },
  ai: { label: "10 borradores de IA", short: "10 borradores de IA", amount: 10 },
  days: { label: "7 días más de tu plan", short: "7 días más de tu plan", amount: 7 },
} as const;
export type ReferralReward = keyof typeof REFERRAL_REWARDS;

export function normalizeReferralCode(raw: string | null | undefined): string | undefined {
  const c = (raw ?? "").trim().toUpperCase();
  return /^[A-Z2-9]{7}$/.test(c) && !/[IO]/.test(c) ? c : undefined;
}
export const referralLink = (origin: string, code: string) => `${origin.replace(/\/$/, "")}/signup?ref=${code}`;
/** A code can be entered during the first 3 days of the trial (mirrors redeem_referral_code in 0049). */
export const canStillRedeem = (createdAt: string, now = Date.now()) => now - new Date(createdAt).getTime() < 3 * 86_400_000;
