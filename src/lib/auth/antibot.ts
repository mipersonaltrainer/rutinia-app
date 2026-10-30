import { createHmac, timingSafeEqual } from "node:crypto";

// Cheap, stateless friction against scripted sign-ups. It stops naive bots, not a determined human: the real limits are the
// database throttle (migration 0025) and, if abuse appears, a CAPTCHA (docs/SECURITY.md).
//   • the form carries an HMAC-signed issue time: posting without having loaded the form, too fast, or hours later is refused
//   • a hidden "website" field that people never see and bots fill in
// A refused attempt gets the same neutral answer as a successful one, so a bot learns nothing.

export const MIN_FILL_MS = 3000;
export const MAX_FILL_MS = 2 * 60 * 60 * 1000;

const sign = (secret: string, t: string) => createHmac("sha256", secret).update(`antibot:v1:${t}`).digest("hex");

export function issueFormToken(secret: string, now: number = Date.now()): string {
  const t = String(now);
  return `${t}.${sign(secret, t)}`;
}

export type FormTokenResult = { ok: true } | { ok: false; reason: "missing" | "malformed" | "forged" | "too_fast" | "expired" };

export function verifyFormToken(secret: string, token: unknown, now: number = Date.now(), opts: { minMs?: number; maxMs?: number } = {}): FormTokenResult {
  if (typeof token !== "string" || !token) return { ok: false, reason: "missing" };
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return { ok: false, reason: "malformed" };
  const expected = Buffer.from(sign(secret, m[1]), "hex"), got = Buffer.from(m[2], "hex");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reason: "forged" };
  const age = now - Number(m[1]);
  if (age < (opts.minMs ?? MIN_FILL_MS)) return { ok: false, reason: "too_fast" };
  if (age > (opts.maxMs ?? MAX_FILL_MS)) return { ok: false, reason: "expired" };
  return { ok: true };
}

/**
 * The two ways a real person trips the token: sending too soon after the page loaded (a password manager or autofill plus a quick tap on a
 * phone) and leaving the page open for hours (switching to the mail app and back). They get a visible message to try again instead of the
 * neutral answer reserved for scripts: otherwise they would believe the e-mail was on its way when nothing had been sent.
 */
export function retryMessage(r: FormTokenResult): string | null {
  if (r.ok) return null;
  if (r.reason === "too_fast") return "Un momento: vuelve a pulsar el botón en un par de segundos.";
  if (r.reason === "expired") return "Esta página lleva mucho tiempo abierta. Recárgala e inténtalo de nuevo.";
  return null;      // missing, malformed or forged tokens never come from a person: those keep the neutral answer
}

export const honeypotFilled = (v: unknown) => typeof v === "string" && v.trim() !== "";
