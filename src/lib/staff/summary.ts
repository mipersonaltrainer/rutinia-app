// Pure summaries for the support panel: no I/O, so the rules are unit-tested. They mirror the access rules of src/lib/session.ts (trainerAccess).
export type SubRow = { status: string; trial_ends_at: string | null; current_period_end: string | null };
export type Bucket = "trial" | "paid" | "blocked" | "none";

/** Same rule as the database function trainer_has_access: a paid status with time left, or a trial that has not ended. */
export function subscriptionBucket(s: SubRow | null | undefined, now: Date): Bucket {
  if (!s) return "none";
  const paid = ["active", "past_due", "canceled"].includes(s.status) && !!s.current_period_end && new Date(s.current_period_end) > now;
  if (paid) return "paid";
  if (s.status === "trialing" && !!s.trial_ends_at && new Date(s.trial_ends_at) > now) return "trial";
  return "blocked";
}
export const BUCKET_LABEL: Record<Bucket, string> = { trial: "En prueba", paid: "Pagando", blocked: "Bloqueado", none: "Sin suscripción" };

export function countBuckets(rows: (SubRow | null | undefined)[], now: Date): Record<Bucket, number> {
  const out: Record<Bucket, number> = { trial: 0, paid: 0, blocked: 0, none: 0 };
  for (const r of rows) out[subscriptionBucket(r, now)]++;
  return out;
}

export type PayRow = { status: string; provider: string; charged_amount_cents: number; charged_currency: string; created_at: string };
export type PaySummary = { approved: { count: number; COP: number; USD: number }; pending: number; stalePending: number; declined: number; voided: number };

/** `stalePending`: still pending after an hour, i.e. probably an abandoned checkout or a payment the webhook never settled. Amounts are in minor units. */
export function summarizePayments(rows: PayRow[], now: Date): PaySummary {
  const out: PaySummary = { approved: { count: 0, COP: 0, USD: 0 }, pending: 0, stalePending: 0, declined: 0, voided: 0 };
  for (const r of rows) {
    if (r.status === "approved") { out.approved.count++; if (r.charged_currency === "COP") out.approved.COP += r.charged_amount_cents; else if (r.charged_currency === "USD") out.approved.USD += r.charged_amount_cents; }
    else if (r.status === "pending") { out.pending++; if (now.getTime() - new Date(r.created_at).getTime() > 3600_000) out.stalePending++; }
    else if (r.status === "declined") out.declined++;
    else if (r.status === "voided") out.voided++;
  }
  return out;
}

export function groupCount<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) { const k = key(r); out[k] = (out[k] ?? 0) + 1; }
  return out;
}

/** Whole days between two instants, rounded down, never negative. */
export const daysSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000));
