// Delivery of operator alerts through a webhook the operator owns (ADMIN_ALERT_WEBHOOK_URL).
// The payload carries the text under both `text` (Slack-style) and `content` (Discord-style); other receivers can read either.
// Never include secrets or personal data in an alert: it leaves the platform.

/** https only (loopback may use http for local tests); no embedded credentials. Returns null when unusable. */
export function parseAlertUrl(raw: string | undefined | null): URL | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let u: URL; try { u = new URL(s); } catch { return null; }
  if (u.username || u.password) return null;
  const loopback = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol === "https:" || (u.protocol === "http:" && loopback)) return u;
  return null;
}

export type DeliveryResult = { ok: true } | { ok: false; reason: "no_webhook" | "http_error" | "network_error" | "timeout"; status?: number };

export async function postAlert(url: URL | null, text: string, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<DeliveryResult> {
  if (!url) return { ok: false, reason: "no_webhook" };
  const f = opts.fetchImpl ?? fetch;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await f(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: ctl.signal, redirect: "error" });
    return res.ok ? { ok: true } : { ok: false, reason: "http_error", status: res.status };
  } catch (e) {
    return { ok: false, reason: (e as Error).name === "AbortError" ? "timeout" : "network_error" };
  } finally { clearTimeout(timer); }
}
