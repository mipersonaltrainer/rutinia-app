// Video calls are links to an external provider; we host no media. Only allowlisted providers are accepted
// so a (compromised or malicious) account cannot push arbitrary links to a client.
// Mirror of is_allowed_call_url() in migration 0019 — tests/integration/messaging.test.ts keeps both in agreement.
export const CALL_HOSTS = ["meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com", "meet.jit.si", "whereby.com"] as const;

export function isAllowedCallUrl(raw: string): boolean {
  if (typeof raw !== "string" || raw.length > 500 || /\s/.test(raw)) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  if (raw.includes("@") || raw.includes("\\")) return false;
  const h = u.hostname.toLowerCase();
  return CALL_HOSTS.some((d) => h === d || h.endsWith("." + d));
}

// A fresh, unguessable Jitsi room. Public Jitsi needs no account, but anyone with the link can join:
// the room name carries 128 random bits and the link is shown only to the two parties.
export function newJitsiLink(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const id = Array.from(rand(16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `https://meet.jit.si/rutinia-${id}`;
}

export function cleanMessage(body: string): { ok: true; body: string } | { ok: false; error: string } {
  const b = body.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "").trim();
  if (!b) return { ok: false, error: "Escribe un mensaje." };
  if (b.length > 2000) return { ok: false, error: "Máximo 2000 caracteres." };
  return { ok: true, body: b };
}
