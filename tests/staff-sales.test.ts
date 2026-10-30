import { describe, it, expect } from "vitest";
import { buildDaily, currentMonth, daysInMonth, monthBounds, monthKey, niceAxis, parseMonth, salesStats, shiftMonth } from "@/lib/staff/sales";

describe("sales by day: the month has exactly the days it should", () => {
  it("28 in a normal February, 29 in a leap year, 30 and 31 in the other months", () => {
    expect(daysInMonth({ y: 2026, m: 2 })).toBe(28); expect(daysInMonth({ y: 2027, m: 2 })).toBe(28);
    expect(daysInMonth({ y: 2028, m: 2 })).toBe(29); expect(daysInMonth({ y: 2100, m: 2 })).toBe(28);      // 2100 is not a leap year
    for (const m of [4, 6, 9, 11]) expect(daysInMonth({ y: 2026, m }), `month ${m}`).toBe(30);
    for (const m of [1, 3, 5, 7, 8, 10, 12]) expect(daysInMonth({ y: 2026, m }), `month ${m}`).toBe(31);
  });
  it("the daily series always spans the whole month, with zeros where nothing sold", () => {
    expect(buildDaily([], { y: 2026, m: 2 }, "COP")).toHaveLength(28);
    expect(buildDaily([], { y: 2026, m: 10 }, "COP").map((d) => d.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe("sales by day: Colombian days (UTC-5, no daylight saving)", () => {
  const mo = { y: 2026, m: 10 };
  it("a sale belongs to the Colombian day, not the UTC one", () => {
    const d = buildDaily([
      { when: "2026-10-01T04:59:59Z", cents: 100, currency: "COP" },   // still 30 September in Colombia: outside October
      { when: "2026-10-01T05:00:00Z", cents: 250000, currency: "COP" }, // 1 October 00:00 in Colombia
      { when: "2026-10-02T04:59:59Z", cents: 100000, currency: "COP" }, // 1 October 23:59 in Colombia
      { when: "2026-11-01T04:59:59Z", cents: 400000, currency: "COP" }, // 31 October 23:59 in Colombia
      { when: "2026-11-01T05:00:00Z", cents: 999, currency: "COP" },    // 1 November: outside
    ], mo, "COP");
    expect(d[0]).toEqual({ day: 1, count: 2, cents: 350000 }); expect(d[30]).toEqual({ day: 31, count: 1, cents: 400000 });
    expect(d.reduce((n, x) => n + x.count, 0)).toBe(3);
  });
  it("only the chosen currency is counted", () => {
    const rows = [{ when: "2026-10-05T15:00:00Z", cents: 250000, currency: "COP" }, { when: "2026-10-05T16:00:00Z", cents: 600, currency: "USD" }];
    expect(buildDaily(rows, mo, "COP")[4]).toEqual({ day: 5, count: 1, cents: 250000 }); expect(buildDaily(rows, mo, "USD")[4]).toEqual({ day: 5, count: 1, cents: 600 });
  });
  it("the month bounds are Colombian midnights (05:00Z), including December into January", () => {
    expect(monthBounds({ y: 2026, m: 10 })).toEqual({ from: "2026-10-01T05:00:00.000Z", to: "2026-11-01T05:00:00.000Z" });
    expect(monthBounds({ y: 2026, m: 12 })).toEqual({ from: "2026-12-01T05:00:00.000Z", to: "2027-01-01T05:00:00.000Z" });
  });
  it("the current month is the Colombian one", () => {
    expect(currentMonth(new Date("2026-11-01T04:30:00Z"))).toEqual({ y: 2026, m: 10 }); expect(currentMonth(new Date("2026-11-01T05:00:00Z"))).toEqual({ y: 2026, m: 11 });
  });
});

describe("sales by day: month navigation and totals", () => {
  const now = new Date("2026-10-28T17:00:00Z");
  it("shifts across years and validates the query string", () => {
    expect(shiftMonth({ y: 2026, m: 1 }, -1)).toEqual({ y: 2025, m: 12 }); expect(shiftMonth({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 }); expect(shiftMonth({ y: 2026, m: 3 }, -14)).toEqual({ y: 2025, m: 1 });
    expect(monthKey({ y: 2026, m: 3 })).toBe("2026-03");
    expect(parseMonth("2027-02", now)).toEqual({ y: 2027, m: 2 }); expect(parseMonth("2028-02", now)).toEqual({ y: 2026, m: 10 });   // too far ahead: current month expect(parseMonth("2026-13", now)).toEqual({ y: 2026, m: 10 });
    expect(parseMonth("hola", now)).toEqual({ y: 2026, m: 10 }); expect(parseMonth(undefined, now)).toEqual({ y: 2026, m: 10 }); expect(parseMonth("1999-05", now)).toEqual({ y: 2026, m: 10 });
  });
  it("totals, average per calendar day and best day", () => {
    const days = buildDaily([{ when: "2026-10-03T15:00:00Z", cents: 100000, currency: "COP" }, { when: "2026-10-10T15:00:00Z", cents: 300000, currency: "COP" }, { when: "2026-10-10T18:00:00Z", cents: 200000, currency: "COP" }], { y: 2026, m: 10 }, "COP");
    const s = salesStats(days); expect(s).toMatchObject({ count: 3, cents: 600000, activeDays: 2, avgCents: Math.round(600000 / 31) }); expect(s.bestDay).toEqual({ day: 10, count: 2, cents: 500000 });
    expect(salesStats(buildDaily([], { y: 2026, m: 2 }, "COP"))).toMatchObject({ count: 0, cents: 0, bestDay: null });
  });
  it("the money axis gets round gridlines that contain the maximum", () => {
    expect(niceAxis(26050000)).toEqual({ max: 30000000, ticks: [0, 10000000, 20000000, 30000000] });        // 260.500 pesos → axis to 300.000
    expect(niceAxis(0).max).toBeGreaterThan(0); const a = niceAxis(12345); expect(a.max).toBeGreaterThanOrEqual(12345); expect(a.ticks[0]).toBe(0);
  });
});
