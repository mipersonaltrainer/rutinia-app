import { COL_OFFSET_H } from "@/lib/staff/sales";

/** Today's date in Colombia (UTC-5, no daylight saving), as numbers. */
export function colombiaToday(now: Date) { const l = new Date(now.getTime() - COL_OFFSET_H * 3600_000); return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate() }; }
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The day this year on which a birth date is celebrated. Someone born on 29 February is celebrated on 28 February in years without one. */
export function celebrationDay(birth: string, year: number): { m: number; d: number } | null {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth); if (!x) return null;
  const m = Number(x[2]), d = Number(x[3]);
  if (m === 2 && d === 29 && !isLeap(year)) return { m: 2, d: 28 };
  return { m, d };
}
export function isBirthdayToday(birth: string | null | undefined, now: Date): boolean {
  if (!birth) return false; const t = colombiaToday(now), c = celebrationDay(birth, t.y);
  return !!c && c.m === t.m && c.d === t.d;
}

/** Days from today (Colombia) to the next celebration: 0 today, up to 365. */
export function daysUntilBirthday(birth: string, now: Date): number | null {
  const t = colombiaToday(now); const today = Date.UTC(t.y, t.m - 1, t.d);
  for (const year of [t.y, t.y + 1]) { const c = celebrationDay(birth, year); if (!c) return null; const at = Date.UTC(year, c.m - 1, c.d); if (at >= today) return Math.round((at - today) / 86400000); }
  return null;
}
export const ageOn = (birth: string, now: Date): number | null => { const x = /^(\d{4})-/.exec(birth); return x ? colombiaToday(now).y - Number(x[1]) : null; };
