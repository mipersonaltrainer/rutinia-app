import type { Page } from "@playwright/test";

// Reads e-mail from the catcher the Supabase stack sends to: Mailpit in CI, or scripts/dev/mail-sink.mjs on a laptop (same API subset).
const MAIL = process.env.MAIL_API ?? "http://127.0.0.1:54324";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Mail = { id: string; subject: string; to: string[]; html: string; text: string };

async function list(): Promise<{ ID: string; Subject: string; To: { Address: string }[] }[]> {
  let res: Response;
  try { res = await fetch(`${MAIL}/api/v1/messages`); } catch { throw new Error(`The mail catcher is not reachable at ${MAIL}. Locally run scripts/dev/start-mail-sink.sh; in CI the Supabase stack must start Mailpit.`); }
  return ((await res.json()) as { messages: never[] }).messages;
}

export async function mailFor(to: string): Promise<Mail[]> {
  const out: Mail[] = [];
  for (const m of (await list()).filter((x) => x.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()))) {
    const full = (await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json()) as { HTML?: string; Text?: string };
    out.push({ id: m.ID, subject: m.Subject, to: m.To.map((t) => t.Address), html: full.HTML ?? "", text: full.Text ?? "" });
  }
  return out;
}

/** Waits until more than `before` messages exist for an address and returns the newest (catchers list newest first). */
export async function waitForMail(to: string, before = 0, timeoutMs = 15_000): Promise<Mail> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const all = await mailFor(to);
    if (all.length > before) return all[0];
    if (Date.now() > end) throw new Error(`no new e-mail for ${to} within ${timeoutMs} ms (have ${all.length})`);
    await sleep(250);
  }
}

export async function noMailFor(to: string, quietMs = 2000): Promise<boolean> { await sleep(quietMs); return (await mailFor(to)).length === 0; }

/** The Supabase verification link inside a message (HTML-escaped in the body). */
export function verifyLink(m: Mail): string {
  const raw = /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(m.html)?.[1] ?? /(https?:\/\/\S*\/auth\/v1\/verify\S*)/.exec(m.text)?.[1];
  if (!raw) throw new Error("no verification link in the e-mail");
  return raw.replace(/&amp;/g, "&");
}

/**
 * Opens a recovery link for this browser (PKCE: the code Supabase issues is bound to the verifier cookie of the browser that
 * asked for the link, and /auth/confirm — loaded by that browser — completes the exchange).
 * Supabase's verify endpoint answers with a redirect to the address we asked for, but only if the stack's allow-list includes the
 * app's origin (supabase/config.toml does; a stack started before that change keeps the old list and falls back to its
 * site_url, which nothing serves). The redirect is therefore read, not followed: when it points elsewhere the `code` it carries
 * is handed to the app by hand, so the rest of the flow is still exercised.
 */
export async function openRecoveryLink(page: Page, link: string, appOrigin: string): Promise<{ viaAllowList: boolean }> {
  const res = await page.request.get(link, { maxRedirects: 0 });
  const location = res.headers()["location"];
  if (!location) return { viaAllowList: false };
  const target = new URL(location, link);
  if (target.origin === appOrigin) { await page.goto(target.toString()); return { viaAllowList: true }; }
  const code = target.searchParams.get("code");
  if (!code) return { viaAllowList: false };                       // an expired or already-used link: Supabase sends an error instead of a code
  await page.goto(`${appOrigin}/auth/confirm?code=${encodeURIComponent(code)}&next=/reset-password`);
  return { viaAllowList: false };
}
