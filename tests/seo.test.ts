import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { siteOrigin, PUBLIC_PAGES } from "@/lib/site";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { softwareApplicationLd } from "@/lib/seo-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { BASE_PRICE_COP_CENTS, INCLUDED_CLIENTS } from "@/lib/billing/pricing";
import { hardenCookie } from "@/lib/supabase/cookies";
import { isNetworkError, guardAction, guardForm, NETWORK_ERROR } from "@/lib/client/guard-action";

afterEach(() => vi.unstubAllEnvs());

describe("site origin", () => {
  it("uses the configured public address and normalises it", () => { expect(siteOrigin({ APPLICATION_BASE_URL: "https://app.rutinia.co/" }).origin).toBe("https://app.rutinia.co"); });
  it("falls back to localhost for a missing or invalid value instead of throwing", () => { for (const v of [undefined, "", "not a url", "   "]) expect(siteOrigin({ APPLICATION_BASE_URL: v }).origin).toBe("http://localhost:3000"); });
});

describe("sitemap and robots", () => {
  it("lists exactly the public pages, absolute, on the configured origin, with no invented dates", () => {
    vi.stubEnv("APPLICATION_BASE_URL", "https://app.rutinia.co");
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual(PUBLIC_PAGES.map((p) => `https://app.rutinia.co${p}`));
    expect(sitemap().every((e) => e.lastModified === undefined)).toBe(true);
  });
  it("never lists private, technical or auth-token pages", () => {
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    for (const bad of ["/trainer", "/client", "/api", "/auth", "/invite", "/login", "/reset-password", "/forgot-password", "/offline"]) expect(urls.some((u) => u.startsWith(bad)), bad).toBe(false);
  });
  it("robots allows the site, closes the signed-in and technical areas, and points to the sitemap on the right host", () => {
    vi.stubEnv("APPLICATION_BASE_URL", "https://app.rutinia.co");
    const r = robots(); const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules) as { allow?: string | string[]; disallow?: string | string[] };
    expect(rule.allow).toBe("/");
    for (const p of ["/trainer/", "/client/", "/api/", "/auth/", "/invite/", "/billing/"]) expect(rule.disallow).toContain(p);
    expect(r.sitemap).toBe("https://app.rutinia.co/sitemap.xml");
  });
  it("does not block the sign-in and recovery screens in robots.txt (their noindex must stay visible to crawlers)", () => {
    const rules = robots().rules; const rule = (Array.isArray(rules) ? rules[0] : rules) as { disallow?: string | string[] };
    for (const p of ["/login", "/forgot-password", "/reset-password"]) expect(rule.disallow).not.toContain(p);
  });
});

describe("structured data", () => {
  const ld = softwareApplicationLd({ APPLICATION_BASE_URL: "https://app.rutinia.co" }) as { offers: Record<string, string>; [k: string]: unknown };
  it("is a valid SoftwareApplication whose price and limits come from the same constants the pricing page shows", () => {
    expect(ld["@context"]).toBe("https://schema.org"); expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.offers.price).toBe((BASE_PRICE_COP_CENTS / 100).toFixed(2)); expect(ld.offers.price).toBe("40000.00"); expect(ld.offers.priceCurrency).toBe("COP");
    expect(ld.offers.description).toContain(String(INCLUDED_CLIENTS)); expect(ld.url).toBe("https://app.rutinia.co");
  });
  it("claims nothing that does not exist: no ratings, reviews or fake counts", () => {
    const text = JSON.stringify(ld); for (const k of ["aggregateRating", "review", "ratingValue", "reviewCount"]) expect(text).not.toContain(k);
  });
  it("cannot break out of the script element, whatever the data contains", () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data: { name: "</script><script>alert(1)</script>" } }));
    expect(html.match(/<script/g)).toHaveLength(1); expect(html).toContain("\\u003c/script>"); expect(html).not.toContain("</script><script>");
  });
});

describe("session cookies", () => {
  it("are httpOnly, SameSite=Lax and, on an https site, Secure", () => {
    const c = hardenCookie({ maxAge: 100, httpOnly: false, sameSite: "none", secure: false, path: "/x" }, new URL("https://app.rutinia.co"));
    expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", maxAge: 100, path: "/x" });
  });
  it("stay usable over http only for local development", () => {
    expect(hardenCookie({}, new URL("http://localhost:3000"))).toMatchObject({ httpOnly: true, secure: false, sameSite: "lax", path: "/" });
    expect(hardenCookie(undefined, new URL("https://a.co")).secure).toBe(true);
  });
});

describe("connection failures in forms", () => {
  it("recognises dropped connections and nothing else", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"), true)).toBe(true);           // Safari
    expect(isNetworkError(new TypeError("anything"), false)).toBe(true);             // offline browser + a TypeError from fetch
    expect(isNetworkError(new Error("boom"), true)).toBe(false); expect(isNetworkError(new TypeError("x is not a function"), true)).toBe(false);
    expect(isNetworkError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }), false)).toBe(false);   // redirects must pass through
    const abort = new Error("aborted"); abort.name = "AbortError"; expect(isNetworkError(abort, false)).toBe(false);
    expect(isNetworkError("string", false)).toBe(false);
  });
  it("turns a failed request into the form's error state and leaves everything else alone", async () => {
    const down = guardForm(async () => { throw new TypeError("Failed to fetch"); });
    expect(await (down as () => Promise<unknown>)()).toEqual({ error: NETWORK_ERROR });
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    await expect((guardForm(async () => { throw redirect; }) as () => Promise<unknown>)()).rejects.toBe(redirect);
    await expect((guardForm(async () => { throw new RangeError("bug"); }) as () => Promise<unknown>)()).rejects.toThrow("bug");
    expect(await (guardAction(async () => ({ ok: "hecho" }), () => ({ ok: "x" })) as () => Promise<unknown>)()).toEqual({ ok: "hecho" });
  });
  it("supports other result shapes and forwards the arguments", async () => {
    const a = guardAction(async (x: number, y: number) => ({ ok: true as const, n: x + y }) as { ok: boolean; n?: number; message?: string }, () => ({ ok: false, message: NETWORK_ERROR }));
    expect(await a(2, 3)).toEqual({ ok: true, n: 5 });
    const b = guardAction(async (n: number) => { void n; throw new TypeError("network error"); }, () => ({ ok: false, message: NETWORK_ERROR }));
    expect(await b(1)).toEqual({ ok: false, message: NETWORK_ERROR });
  });
  it("the message tells the person their input is still there", () => { expect(NETWORK_ERROR).toMatch(/conexión/); expect(NETWORK_ERROR).toMatch(/sigue ahí/); });
});
