// Content-Security-Policy built per request. Scripts are allowed only when they carry the request's nonce
// ('strict-dynamic' lets those trusted scripts load their own chunks); everything else is limited to what the app
// actually uses. Pure, so every directive is unit-tested.
export const FORM_ACTION_HOSTS = ["https://checkout.wompi.co", "https://www.paypal.com", "https://www.sandbox.paypal.com"];

import { TURNSTILE_ORIGIN } from "@/lib/auth/turnstile";
export const BOLD_HOSTS = ["https://checkout.bold.co"];

export function newNonce(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return btoa(String.fromCharCode(...rand(16)));
}

export function buildCsp({ nonce, dev, supabaseUrl }: { nonce: string; dev: boolean; supabaseUrl: string }): string {
  let supaOrigin = "", supaWs = "";
  try { const u = new URL(supabaseUrl); supaOrigin = u.origin; supaWs = `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`; } catch { /* env validated elsewhere */ }
  const d: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-eval' only in `next dev` (React's dev tooling needs it); never in production.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE_ORIGIN, ...(dev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes (progress bars, charts) cannot carry a nonce; style injection is a much smaller risk than script.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(supaOrigin ? [supaOrigin] : [])],      // signed progress-photo URLs come from Supabase Storage
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(supaOrigin ? [supaOrigin, supaWs] : [])],               // API, Realtime websocket
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'", ...(supaOrigin ? [supaOrigin] : [])],                          // exercise demo videos (public Supabase Storage bucket)
    "frame-src": [...BOLD_HOSTS, TURNSTILE_ORIGIN],                                                         // only Bold's embedded checkout; video calls stay new-tab links
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...FORM_ACTION_HOSTS],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ") + (!dev && supaOrigin.startsWith("https:") ? "; upgrade-insecure-requests" : "");   // a local http Supabase (laptop `next start`) must not be upgraded to https/wss
}
