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

/** A Google Meet link must point at a room (abc-defg-hij), not at the "new meeting" page. Returns a friendly Spanish message, or null when the link is fine. */
export function callUrlProblem(raw: string): string | null {
  if (!isAllowedCallUrl(raw)) return "Usa un enlace https de Google Meet, Zoom, Teams, Jitsi o Whereby (o marca «No tengo cuenta de Google»).";
  const u = new URL(raw);
  if (u.hostname.toLowerCase() === "meet.google.com" && !/^\/(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[A-Za-z0-9_-]+)\/?$/.test(u.pathname))
    return "Ese enlace de Meet no es de una sala. Pulsa «Crear reunión en Google Meet», copia el enlace que te muestra (termina como abc-defg-hij) y pégalo aquí.";
  return null;
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
