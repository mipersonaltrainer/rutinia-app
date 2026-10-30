import { siteOrigin } from "@/lib/site";

/**
 * Session cookie policy, applied wherever the server writes the Supabase auth cookies (server client and proxy).
 *  • httpOnly — page scripts can never read the session: an XSS can no longer exfiltrate the refresh token (the part that
 *    outlives the tab). The browser's Realtime connection gets only a short-lived access token handed over by the server.
 *  • secure   — sent only over HTTPS whenever the site is served over HTTPS (HTTP is allowed solely for local development).
 *  • sameSite=lax — sent on top-level navigations (so links from e-mail work) but not on cross-site subrequests (CSRF).
 */
export function hardenCookie<T extends Record<string, unknown>>(options: T | undefined, origin: URL = siteOrigin()): T & { httpOnly: true; secure: boolean; sameSite: "lax"; path: string } {
  return { ...(options ?? ({} as T)), httpOnly: true, secure: origin.protocol === "https:", sameSite: "lax", path: (options?.path as string | undefined) ?? "/" };
}
