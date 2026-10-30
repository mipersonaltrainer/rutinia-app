import "server-only";
import { headers } from "next/headers";
import { clientIp } from "./throttle";

/** Server-side secret used to sign antibot tokens, recovery markers and throttle keys. Never leaves the server. */
export function authSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return s;
}

/** Public origin of the app, used to build the links Supabase puts in e-mails. Configured, never taken from the request when avoidable. */
export async function appOrigin(): Promise<string> {
  const configured = process.env.APPLICATION_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers(); const host = h.get("host") ?? "localhost:3000";
  return `${/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https"}://${host}`;
}

export async function requestIp(): Promise<string> { return clientIp(await headers()); }

export const MIN_FILL_MS_ENV = (): number => { const v = process.env.AUTH_MIN_FILL_MS; return v && /^\d+$/.test(v) ? Number(v) : 3000; };
