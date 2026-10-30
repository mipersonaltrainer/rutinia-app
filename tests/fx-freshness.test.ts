import { describe, it, expect } from "vitest";
import { fxMaxAgeHours, fxRateStatus, DEFAULT_FX_MAX_AGE_HOURS, MAX_FX_MAX_AGE_HOURS } from "@/lib/billing/fx";
import { checkEnv } from "@/lib/env";

const NOW = new Date("2026-10-20T12:00:00Z");
const ago = (h: number) => ({ effective_at: new Date(NOW.getTime() - h * 3_600_000).toISOString() });

describe("fxMaxAgeHours", () => {
  it("defaults to 7 days", () => { expect(DEFAULT_FX_MAX_AGE_HOURS).toBe(168); expect(fxMaxAgeHours(undefined)).toBe(168); expect(fxMaxAgeHours("")).toBe(168); });
  it("accepts whole hours in range", () => { expect(fxMaxAgeHours("24")).toBe(24); expect(fxMaxAgeHours(" 48 ")).toBe(48); expect(fxMaxAgeHours("1")).toBe(1); expect(fxMaxAgeHours(String(MAX_FX_MAX_AGE_HOURS))).toBe(1440); });
  it("falls back to the default instead of disabling the guard on bad input", () => {
    for (const bad of ["0", "-5", "1441", "abc", "1.5", "12h", "Infinity", "NaN", "1e3", "0x10"]) expect([bad, fxMaxAgeHours(bad)]).toEqual([bad, 168]);
  });
});

describe("fxRateStatus", () => {
  it("no rate → missing, not usable", () => { const s = fxRateStatus(null, NOW, 168); expect(s).toMatchObject({ usable: false, state: "missing" }); expect((s as { message: string }).message).toMatch(/No hay una tasa/); });
  it("a fresh rate is usable", () => expect(fxRateStatus(ago(2), NOW, 168)).toEqual({ usable: true, state: "fresh", ageHours: 2 }));
  it("exactly at the limit is still usable; one millisecond past it is not", () => {
    expect(fxRateStatus(ago(168), NOW, 168).usable).toBe(true);
    const past = { effective_at: new Date(NOW.getTime() - 168 * 3_600_000 - 1).toISOString() };
    expect(fxRateStatus(past, NOW, 168)).toMatchObject({ usable: false, state: "stale" });
  });
  it("stale: says how old, the limit, and offers PayPal", () => {
    const s = fxRateStatus(ago(24 * 10), NOW, 168); expect(s.usable).toBe(false);
    expect((s as { message: string }).message).toMatch(/10 días/); expect((s as { message: string }).message).toMatch(/máximo permitido: 7 días/); expect((s as { message: string }).message).toMatch(/PayPal/);
    expect(fxRateStatus(ago(30), NOW, 24)).toMatchObject({ usable: false, ageHours: 30 });
    expect((fxRateStatus(ago(30), NOW, 24) as { message: string }).message).toMatch(/30 h/);
  });
  it("a future-dated rate (clock skew or typo) is refused rather than trusted", () => expect(fxRateStatus({ effective_at: new Date(NOW.getTime() + 3_600_000).toISOString() }, NOW, 168)).toMatchObject({ usable: false, state: "future" }));
  it("an unparseable date is refused", () => expect(fxRateStatus({ effective_at: "not a date" }, NOW, 168)).toMatchObject({ usable: false, state: "missing" }));
  it("a tighter limit applies immediately", () => { expect(fxRateStatus(ago(30), NOW, 48).usable).toBe(true); expect(fxRateStatus(ago(30), NOW, 24).usable).toBe(false); });
});

describe("env check for FX_MAX_AGE_HOURS", () => {
  const GOOD = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_real", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_real", APPLICATION_BASE_URL: "https://app.rutinia.co", CRON_SECRET: "k3j2h4g5f6d7s8a9p0o1i2u3y4t5r6e7w8q9", WOMPI_ENVIRONMENT: "production", WOMPI_PUBLIC_KEY: "pub_prod_abc", WOMPI_PRIVATE_KEY: "prv_prod_abc", WOMPI_EVENTS_SECRET: "prod_events_abc", WOMPI_INTEGRITY_SECRET: "prod_integrity_abc", ADMIN_ALERT_WEBHOOK_URL: "https://hooks.example.com/services/T000/B000/XXXX" };
  it("a valid value is silent; garbage warns; a very loose value warns", () => {
    expect(checkEnv({ ...GOOD, FX_MAX_AGE_HOURS: "72" })).toEqual({ errors: [], warnings: [] });
    expect(checkEnv({ ...GOOD, FX_MAX_AGE_HOURS: "abc" }).warnings.join()).toMatch(/FX_MAX_AGE_HOURS/);
    expect(checkEnv({ ...GOOD, FX_MAX_AGE_HOURS: "9999" }).warnings.join()).toMatch(/fuera de 1–1440/);
    expect(checkEnv({ ...GOOD, FX_MAX_AGE_HOURS: "500" }).warnings.join()).toMatch(/más de 7 días/);
  });
});
