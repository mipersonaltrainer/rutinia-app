import { describe, it, expect } from "vitest";
import nextConfig, { securityHeaders } from "../next.config";

describe("security headers", () => {
  const h = Object.fromEntries(securityHeaders.map((x) => [x.key, x.value]));
  it("blocks framing, sniffing and unneeded device APIs", () => {
    expect(h["X-Frame-Options"]).toBe("DENY"); expect(h["Content-Security-Policy"]).toBeUndefined();   // per-request, set by the proxy
    expect(h["X-Content-Type-Options"]).toBe("nosniff"); expect(h["Permissions-Policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}/); expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
  it("is applied to every route, and the worker keeps its own cache rules", async () => {
    const rules = await nextConfig.headers!();
    expect(rules.find((r) => r.source === "/:path*")!.headers).toEqual(securityHeaders);
    expect(rules.find((r) => r.source === "/sw.js")!.headers.some((x) => x.key === "Cache-Control" && /no-cache/.test(x.value))).toBe(true);
  });
});
