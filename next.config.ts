import type { NextConfig } from "next";

// Baseline hardening for every response. The Content-Security-Policy (script-src with a per-request nonce) is built in
// src/proxy.ts / src/lib/csp.ts because it must change on every request.
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The worker must always be revalidated so a fix ships immediately, and may control the whole origin.
      // Static brand assets keep their names (no content hash), so a day of browser cache plus a week of stale-while-revalidate:
      // repeat visits and the installed app stop re-fetching icons on every page, and a redesign still propagates within a day.
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/og.png", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/favicon.ico", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      // Public marketing pages carry no user data. `private, no-cache` (instead of Next's default `no-store` for dynamic pages) keeps
      // them out of shared caches, forces revalidation, and lets the browser restore them instantly with the back button (bfcache).
      { source: "/", headers: [{ key: "Cache-Control", value: "private, no-cache" }] },
      { source: "/(privacidad|terminos|signup)", headers: [{ key: "Cache-Control", value: "private, no-cache" }] },
      { source: "/(robots.txt|sitemap.xml)", headers: [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
