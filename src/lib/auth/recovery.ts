import { createHmac, timingSafeEqual } from "node:crypto";

// ── Where a confirmation link may send the user afterwards ───────────────────────────────────────────────────────
// `next` arrives in a URL anyone can craft, so only these internal paths are honored; anything else becomes the default.
const ALLOWED_NEXT = ["/reset-password", "/trainer", "/client", "/login"];
export function safeNext(raw: string | null | undefined, fallback = "/login"): string {
  if (!raw || raw.length > 200) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return fallback;
  let path: string; try { path = new URL(raw, "http://x").pathname; } catch { return fallback; }
  return ALLOWED_NEXT.includes(path) ? path : fallback;          // query strings and fragments are dropped on purpose
}

// ── Proof that this browser just came through a password-recovery link ───────────────────────────────────────────
// A recovery link signs the user in. Without this marker anybody holding an ordinary session (a stolen cookie, a shared
// computer) could open /reset-password and set a new password without knowing the old one. The marker is an HMAC bound to the
// user id and valid for 15 minutes; /auth/confirm sets it only after Supabase accepted a recovery token.
export const RECOVERY_COOKIE = "rutinia_recovery";
export const RECOVERY_TTL_MS = 15 * 60 * 1000;
const mac = (secret: string, uid: string, t: string) => createHmac("sha256", secret).update(`recovery:v1:${uid}:${t}`).digest("hex");

export function signRecoveryMarker(secret: string, userId: string, now: number = Date.now()): string {
  return `${now}.${mac(secret, userId, String(now))}`;
}
export function verifyRecoveryMarker(secret: string, userId: string, marker: unknown, now: number = Date.now()): boolean {
  if (typeof marker !== "string") return false;
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(marker); if (!m || !userId) return false;
  const a = Buffer.from(mac(secret, userId, m[1]), "hex"), b = Buffer.from(m[2], "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const age = now - Number(m[1]);
  return age >= 0 && age <= RECOVERY_TTL_MS;
}
