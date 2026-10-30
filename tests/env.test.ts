import { describe, it, expect } from "vitest";
import { checkEnv } from "@/lib/env";

const GOOD = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_realvalue", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_realvalue",
  APPLICATION_BASE_URL: "https://app.rutinia.co", CRON_SECRET: "k3j2h4g5f6d7s8a9p0o1i2u3y4t5r6e7w8q9",
  WOMPI_ENVIRONMENT: "production", WOMPI_PUBLIC_KEY: "pub_prod_abc", WOMPI_PRIVATE_KEY: "prv_prod_abc", WOMPI_EVENTS_SECRET: "prod_events_abc", WOMPI_INTEGRITY_SECRET: "prod_integrity_abc", ADMIN_ALERT_WEBHOOK_URL: "https://hooks.example.com/services/T000/B000/XXXX",
} as Record<string, string>;
const with_ = (o: Record<string, string | undefined>) => checkEnv({ ...GOOD, ...o });

describe("checkEnv auth abuse settings", () => {
  const base = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_real", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_real", APPLICATION_BASE_URL: "https://app.rutinia.co", CRON_SECRET: "k3j2h4g5f6d7s8a9p0o1i2u3y4t5r6e7w8q9", WOMPI_ENVIRONMENT: "production", WOMPI_PUBLIC_KEY: "pub_prod_abc", WOMPI_PRIVATE_KEY: "prv_prod_abc", WOMPI_EVENTS_SECRET: "prod_events_abc", WOMPI_INTEGRITY_SECRET: "prod_integrity_abc", ADMIN_ALERT_WEBHOOK_URL: "https://hooks.example.com/services/T000/B000/XXXX" };
  it("valid limits are silent; garbage warns instead of silently weakening the defaults", () => {
    expect(checkEnv({ ...base, AUTH_LIMIT_LOGIN_PAIR: "5", AUTH_MIN_FILL_MS: "3000" })).toEqual({ errors: [], warnings: [] });
    expect(checkEnv({ ...base, AUTH_LIMIT_SIGNUP_IP: "0" }).warnings.join()).toMatch(/AUTH_LIMIT_SIGNUP_IP/);
    expect(checkEnv({ ...base, AUTH_LIMIT_RESET_EMAIL: "many" }).warnings.join()).toMatch(/AUTH_LIMIT_RESET_EMAIL/);
    expect(checkEnv({ ...base, AUTH_MIN_FILL_MS: "50" }).warnings.join()).toMatch(/AUTH_MIN_FILL_MS/);
  });
});

describe("checkEnv", () => {
  it("a complete production config has no errors", () => expect(checkEnv(GOOD)).toEqual({ errors: [], warnings: [] }));
  it("the shipped .env.example is rejected as a whole (every placeholder is caught)", async () => {
    const txt = (await import("node:fs")).readFileSync(".env.example", "utf8");
    const env = Object.fromEntries(txt.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const [k, ...v] = l.split("="); return [k, v.join("=").replace(/\s+#.*$/, "").trim()]; }));
    const r = checkEnv(env); expect(r.errors.length).toBeGreaterThanOrEqual(5);
    expect(r.errors.join("|")).toMatch(/NEXT_PUBLIC_SUPABASE_URL/); expect(r.errors.join("|")).toMatch(/CRON_SECRET/); expect(r.errors.join("|")).toMatch(/APPLICATION_BASE_URL/);
  });
  it("missing required variables are named, values never echoed", () => {
    const r = with_({ SUPABASE_SERVICE_ROLE_KEY: "", CRON_SECRET: "" }); expect(r.errors).toEqual(expect.arrayContaining(["SUPABASE_SERVICE_ROLE_KEY falta", expect.stringContaining("CRON_SECRET falta")]));
    expect(JSON.stringify(with_({ SUPABASE_SERVICE_ROLE_KEY: "super-secret-value-123", WOMPI_PRIVATE_KEY: "" }))).not.toContain("super-secret-value-123");
  });
  it("localhost and plain http are errors unless explicitly allowed for a local production run", () => {
    expect(with_({ APPLICATION_BASE_URL: "http://localhost:3000" }).errors.join()).toMatch(/localhost/);
    expect(with_({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).errors.join()).toMatch(/localhost/);
    expect(with_({ APPLICATION_BASE_URL: "http://app.rutinia.co" }).errors.join()).toMatch(/https/);
    expect(with_({ APPLICATION_BASE_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", ALLOW_LOCAL_PRODUCTION: "1" }).errors).toEqual([]);
  });
  it("CRON_SECRET must be long and not a placeholder", () => {
    expect(with_({ CRON_SECRET: "short" }).errors.join()).toMatch(/32/); expect(with_({ CRON_SECRET: "long-random-string-for-/api/cron/expire" }).errors.length).toBeGreaterThan(0);
  });
  it("a half-configured provider is an error; no provider at all is an error", () => {
    expect(with_({ WOMPI_EVENTS_SECRET: "" }).errors.join()).toMatch(/Wompi: configuración incompleta/);
    expect(with_({ WOMPI_PUBLIC_KEY: "", WOMPI_PRIVATE_KEY: "", WOMPI_EVENTS_SECRET: "", WOMPI_INTEGRITY_SECRET: "" }).errors.join()).toMatch(/Ningún proveedor/);
    expect(with_({ PAYPAL_CLIENT_ID: "abc", PAYPAL_CLIENT_SECRET: "def", PAYPAL_WEBHOOK_ID: "ghi" }).warnings.join()).toMatch(/PAYPAL_PLAN_ID|sandbox/);
  });
  it("sandbox providers warn, and production Wompi with test keys errors", () => {
    expect(with_({ WOMPI_ENVIRONMENT: "sandbox" }).warnings.join()).toMatch(/sandbox/);
    expect(with_({ WOMPI_PUBLIC_KEY: "pub_prod_real", WOMPI_PRIVATE_KEY: "prv_prod_real" }).errors).toEqual([]);
  });
  it("AI: provider without key errors; the local fake-server URL is refused; sensitive mode warns", () => {
    expect(with_({ AI_PROVIDER: "anthropic" }).errors.join()).toMatch(/ANTHROPIC_API_KEY/);
    expect(with_({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-real", ANTHROPIC_BASE_URL: "http://127.0.0.1:4010" }).errors.join()).toMatch(/ANTHROPIC_BASE_URL/);
    expect(with_({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-real", AI_ALLOW_SENSITIVE: "true" }).warnings.join()).toMatch(/DPA/);
    expect(with_({ ANTHROPIC_API_KEY: "sk-real" }).warnings.join()).toMatch(/apagada/);
  });
});
