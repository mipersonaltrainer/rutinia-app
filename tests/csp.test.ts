import { describe, it, expect } from "vitest";
import { buildCsp, newNonce, FORM_ACTION_HOSTS, BOLD_HOSTS } from "@/lib/csp";

const SUPA = "https://abcdefgh.supabase.co";
const dir = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(name + " "))?.split(" ").slice(1) ?? [];

describe("buildCsp", () => {
  const csp = buildCsp({ nonce: "NONCE123", dev: false, supabaseUrl: SUPA });
  it("scripts need the request nonce; no unsafe-inline or unsafe-eval in production", () => {
    expect(dir(csp, "script-src")).toEqual(["'self'", "'nonce-NONCE123'", "'strict-dynamic'", "https://challenges.cloudflare.com"]);   // Cloudflare Turnstile (CAPTCHA) only
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  });
  it("dev adds unsafe-eval only", () => { const d = buildCsp({ nonce: "n", dev: true, supabaseUrl: SUPA }); expect(dir(d, "script-src")).toContain("'unsafe-eval'"); expect(d).not.toContain("upgrade-insecure-requests"); });
  it("connections and images reach only self and the project's Supabase (API + realtime websocket)", () => {
    expect(dir(csp, "connect-src")).toEqual(["'self'", SUPA, "wss://abcdefgh.supabase.co"]);
    expect(dir(csp, "img-src")).toEqual(["'self'", "data:", "blob:", SUPA]);
    expect(buildCsp({ nonce: "n", dev: true, supabaseUrl: "http://127.0.0.1:54321" })).toContain("ws://127.0.0.1:54321");
  });
  it("no frames, objects, media or foreign base URIs; cannot be framed", () => {
    expect(dir(csp, "object-src")).toEqual(["'none'"]);
    expect(dir(csp, "frame-src")).toEqual([...BOLD_HOSTS, "https://challenges.cloudflare.com"]);   // Bold checkout + the Turnstile challenge, nothing else
    expect(dir(csp, "media-src")).toEqual(["'self'", new URL(SUPA).origin]);          // exercise demo videos only from our own storage
    expect(dir(csp, "frame-ancestors")).toEqual(["'none'"]); expect(dir(csp, "base-uri")).toEqual(["'self'"]);
  });
  it("forms may post to self and to the payment providers' hosted pages, nowhere else", () => {
    expect(dir(csp, "form-action")).toEqual(["'self'", ...FORM_ACTION_HOSTS]);
    expect(FORM_ACTION_HOSTS.every((h) => h.startsWith("https://"))).toBe(true);
  });
  it("a bad Supabase URL never widens the policy", () => { const c = buildCsp({ nonce: "n", dev: false, supabaseUrl: "" }); expect(dir(c, "connect-src")).toEqual(["'self'"]); expect(c).not.toContain("*"); });
  it("production with an https backend upgrades insecure requests; a local http backend is left alone", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "n", dev: false, supabaseUrl: "http://127.0.0.1:54321" })).not.toContain("upgrade-insecure-requests");
  });
});

describe("newNonce", () => {
  it("is base64, 128 bits, and different every time", () => {
    const a = newNonce(), b = newNonce(); expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/); expect(a).not.toBe(b);
    expect(atob(a).length).toBe(16);
  });
  it("is safe inside a header value (no quotes or semicolons)", () => expect(newNonce()).not.toMatch(/['";\s]/));
});
