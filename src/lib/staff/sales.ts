// Sales per day for the support panel. Pure: month arithmetic, Colombia-time bucketing and the daily series are unit-tested.
// Colombia is UTC-5 all year (no daylight saving), so a local day runs from 05:00Z to 05:00Z of the next day.
export const COL_OFFSET_H = 5;
export type Month = { y: number; m: number };          // m: 1-12
export const daysInMonth = ({ y, m }: Month) => new Date(Date.UTC(y, m, 0)).getUTCDate();      // 28 / 29 (leap years) / 30 / 31
export const monthKey = ({ y, m }: Month) => `${y}-${String(m).padStart(2, "0")}`;

export function currentMonth(now: Date): Month { const l = new Date(now.getTime() - COL_OFFSET_H * 3600_000); return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1 }; }

/** `YYYY-MM` from the query string; anything else (or a month in the far past/future) falls back to the current month. */
export function parseMonth(raw: string | undefined, now: Date): Month {
  const cur = currentMonth(now); const x = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw ?? "");
  if (!x) return cur; const mo = { y: Number(x[1]), m: Number(x[2]) };
  return mo.y < 2024 || mo.y > cur.y + 1 ? cur : mo;
}
export function shiftMonth({ y, m }: Month, delta: number): Month { const i = y * 12 + (m - 1) + delta; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; }

/** Instants (UTC ISO) that bound the Colombian month: [from, to). */
export function monthBounds(mo: Month): { from: string; to: string } {
  const next = shiftMonth(mo, 1);
  return { from: new Date(Date.UTC(mo.y, mo.m - 1, 1, COL_OFFSET_H)).toISOString(), to: new Date(Date.UTC(next.y, next.m - 1, 1, COL_OFFSET_H)).toISOString() };
}

export type SaleRow = { when: string; cents: number; currency: string };
export type DayPoint = { day: number; count: number; cents: number };

/** One point per calendar day of the month (days without sales count 0, so the line always spans the whole month). */
export function buildDaily(rows: SaleRow[], mo: Month, currency: "COP" | "USD"): DayPoint[] {
  const out: DayPoint[] = Array.from({ length: daysInMonth(mo) }, (_, i) => ({ day: i + 1, count: 0, cents: 0 }));
  for (const r of rows) {
    if (r.currency !== currency) continue;
    const l = new Date(new Date(r.when).getTime() - COL_OFFSET_H * 3600_000);
    if (l.getUTCFullYear() !== mo.y || l.getUTCMonth() + 1 !== mo.m) continue;
    const p = out[l.getUTCDate() - 1]; p.count++; p.cents += r.cents;
  }
  return out;
}

export function salesStats(days: DayPoint[]) {
  const count = days.reduce((n, d) => n + d.count, 0), cents = days.reduce((n, d) => n + d.cents, 0);
  const best = days.reduce((b, d) => (d.cents > b.cents ? d : b), days[0]);
  return { count, cents, avgCents: days.length ? Math.round(cents / days.length) : 0, activeDays: days.filter((d) => d.count > 0).length, bestDay: best && best.cents > 0 ? best : null };
}

/** A round upper bound and gridlines for the money axis (minor units in, minor units out). */
export function niceAxis(maxCents: number, steps = 3): { max: number; ticks: number[] } {
  if (maxCents <= 0) return { max: 100_00, ticks: [0, 50_00, 100_00] };
  const raw = maxCents / steps, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(maxCents / step) * step;
  return { max: top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}
