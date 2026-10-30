import { describe, it, expect } from "vitest";
import { captchaTokenOf, isCaptchaError, turnstileSiteKey, TURNSTILE_ORIGIN } from "@/lib/auth/turnstile";
import { buildCsp } from "@/lib/csp";

describe("Turnstile", () => {
  it("shows a widget only in Vercel production, or when a key is configured explicitly", () => {
    expect(turnstileSiteKey({})).toBeUndefined();
    expect(turnstileSiteKey({ VERCEL_ENV: "preview" })).toBeUndefined();
    expect(turnstileSiteKey({ VERCEL_ENV: "production" })).toMatch(/^0x4/);
    expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: "0xCUSTOM" })).toBe("0xCUSTOM");
  });
  it("reads the token from the form, ignoring empty or oversized values", () => {
    const f = (v?: string) => { const fd = new FormData(); if (v !== undefined) fd.set("cf-turnstile-response", v); return fd; };
    expect(captchaTokenOf(f("abc"))).toBe("abc");
    expect(captchaTokenOf(f(""))).toBeUndefined(); expect(captchaTokenOf(f())).toBeUndefined(); expect(captchaTokenOf(f("x".repeat(5000)))).toBeUndefined();
  });
  it("recognises Supabase's captcha_failed error and nothing else", () => {
    expect(isCaptchaError({ code: "captcha_failed" })).toBe(true); expect(isCaptchaError({ code: "invalid_credentials" })).toBe(false); expect(isCaptchaError(null)).toBe(false);
  });
  it("the CSP lets only Cloudflare's challenge host in, as a script and a frame, and nowhere else", () => {
    const csp = buildCsp({ nonce: "n", dev: false, supabaseUrl: "https://x.supabase.co" });
    const d = (k: string) => csp.split("; ").find((x) => x.startsWith(k + " "))!;
    expect(d("script-src")).toContain(TURNSTILE_ORIGIN); expect(d("frame-src")).toContain(TURNSTILE_ORIGIN);
    for (const k of ["connect-src", "img-src", "form-action", "default-src"]) expect(d(k)).not.toContain(TURNSTILE_ORIGIN);
  });
});
