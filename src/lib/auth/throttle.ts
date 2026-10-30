import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Attempt limits kept in the database (auth_throttle, migration 0025) so they hold across server instances. Keys are
// HMACs: the table never stores an e-mail address or an IP address.

export type Rule = { name: string; parts: string[]; limit: number; windowSeconds: number };
export type ThrottleResult = { allowed: true } | { allowed: false; retryAfterSeconds: number; unavailable?: true };

/** The platform's own header first (Vercel sets x-vercel-forwarded-for / x-real-ip itself), then the first hop of X-Forwarded-For. Without any, everything shares one 'unknown' bucket. */
export function clientIp(h: { get(name: string): string | null }): string {
  const raw = (h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(raw) ? raw.toLowerCase() : "unknown";
}

export function throttleKey(secret: string, kind: string, parts: string[]): string {
  return createHmac("sha256", secret).update(`throttle:v1:${kind}:${parts.map((p) => p.trim().toLowerCase()).join("\u0000")}`).digest("hex");
}

/** Limits are tunable per deployment (AUTH_LIMIT_<NAME>, a positive integer); invalid values fall back to the default, never to "unlimited". */
export function limitFromEnv(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const v = env[`AUTH_LIMIT_${name}`]; return v && /^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : fallback;
}

export const HOUR = 3600, DAY = 86400;

// Per-ADDRESS limits are generous on purpose: phones on a mobile network (CGNAT) and a gym or event Wi-Fi put many real people behind one IP.
// The strict limits are per e-mail and per account/IP pair, which is what actually stops abuse.
export function rulesFor(kind: "signup" | "reset" | "login" | "change", ctx: { ip: string; email: string; userId?: string }, env: Record<string, string | undefined> = process.env): Rule[] {
  const L = (n: string, d: number) => limitFromEnv(env, n, d);
  // A request with no usable IP shares one bucket, so it gets a much larger allowance than a real address.
  const ipScale = ctx.ip === "unknown" ? 10 : 1;
  switch (kind) {
    case "signup": return [{ name: "signup:ip", parts: [ctx.ip], limit: L("SIGNUP_IP", 30) * ipScale, windowSeconds: HOUR }, { name: "signup:email", parts: [ctx.email], limit: L("SIGNUP_EMAIL", 3), windowSeconds: DAY }];
    case "reset": return [{ name: "reset:ip", parts: [ctx.ip], limit: L("RESET_IP", 30) * ipScale, windowSeconds: HOUR }, { name: "reset:email", parts: [ctx.email], limit: L("RESET_EMAIL", 3), windowSeconds: HOUR }];
    case "login": return [{ name: "login:pair", parts: [ctx.ip, ctx.email], limit: L("LOGIN_PAIR", 10), windowSeconds: 900 }, { name: "login:ip", parts: [ctx.ip], limit: L("LOGIN_IP", 200) * ipScale, windowSeconds: 900 }];
    case "change": return [{ name: "change:user", parts: [ctx.userId ?? ctx.email], limit: L("CHANGE_USER", 6), windowSeconds: 900 }];
  }
}

/** Counts one attempt against every rule and refuses if any is over its limit. Fails CLOSED for the sensitive paths' callers to decide: it returns an error result instead of throwing. */
export async function hit(admin: SupabaseClient, secret: string, rules: Rule[]): Promise<ThrottleResult> {
  let worst = 0;
  for (const r of rules) {
    const { data, error } = await admin.rpc("auth_throttle_hit", { p_key: throttleKey(secret, r.name, r.parts), p_limit: r.limit, p_window_seconds: r.windowSeconds });
    if (error || !data) { console.warn("[auth] attempt limiter unavailable, refusing the attempt:", error?.code ?? "", error?.message ?? "no data"); return { allowed: false, retryAfterSeconds: 60, unavailable: true }; }   // if the limiter itself is down, do not let the attempt through
    if (!(data as { allowed: boolean }).allowed) worst = Math.max(worst, (data as { retry_after: number }).retry_after);
  }
  return worst > 0 ? { allowed: false, retryAfterSeconds: worst } : { allowed: true };
}

export async function clear(admin: SupabaseClient, secret: string, rules: Rule[]): Promise<void> {
  for (const r of rules) await admin.rpc("auth_throttle_clear", { p_key: throttleKey(secret, r.name, r.parts) });
}

export const tooMany = (s: number) => `Demasiados intentos. Inténtalo de nuevo en ${s >= 3600 ? `${Math.ceil(s / 3600)} h` : `${Math.max(1, Math.ceil(s / 60))} min`}.`;

/** What to tell the person: a real limit says how long to wait; a limiter outage must not masquerade as one. */
export const blockedMessage = (r: { retryAfterSeconds: number; unavailable?: boolean }) => r.unavailable ? "No pudimos comprobar tu intento ahora mismo. Inténtalo de nuevo en un minuto." : tooMany(r.retryAfterSeconds);
