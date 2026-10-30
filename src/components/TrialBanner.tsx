import Link from "next/link";
import type { AccessStatus } from "@/lib/billing/access-status";

const TONE = { info: "border-[var(--accent)]/40", ok: "border-[var(--accent)]/40", warn: "border-[var(--warn)]", danger: "border-[var(--warn)] bg-[var(--warn)]/10" } as const;

/** Shown on every trainer page. Quiet while healthy ("ok" renders nothing), loud when action is needed. */
export function TrialBanner({ status, onBillingPage }: { status: AccessStatus; onBillingPage: boolean }) {
  if (status.tone === "ok" || onBillingPage) return null;   // the billing page shows the same status in its own card
  return (
    <div role={status.tone === "danger" ? "alert" : "status"} className={`mb-6 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${TONE[status.tone]}`}>
      <div className="min-w-0 flex-1"><p className="font-semibold">{status.headline}</p><p className="text-[var(--muted)]">{status.detail}</p></div>
      {status.cta && <Link href="/trainer/billing" className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-semibold text-black">{status.allowed ? "Ver planes" : "Reactivar"}</Link>}
    </div>
  );
}
