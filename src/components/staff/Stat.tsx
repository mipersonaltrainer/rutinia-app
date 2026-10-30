import { CountUp } from "@/components/CountUp";

/** A number card for the panel. `tone` colours the figure when something needs attention. */
export function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "warn" | "ok" }) {
  return (
    <div className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight ${tone === "warn" && value > 0 ? "text-[var(--warn-text)]" : tone === "ok" ? "text-[var(--accent)]" : ""}`}><CountUp value={value} /></p>
      {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}
