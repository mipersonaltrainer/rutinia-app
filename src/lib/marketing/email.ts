export type EmailConfig = { apiKey: string; from: string };
export type EmailMessage = { to: string; subject: string; text: string; link?: string; unsubscribeUrl?: string; footer?: string };

/** Resend is the provider the project documents (docs/EMAIL.md). Without these three variables the e-mail channel is simply off. */
export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim(), from = env.EMAIL_FROM?.trim();
  return env.EMAIL_PROVIDER?.trim() === "resend" && apiKey && from && /<?[^\s<>@]+@[^\s<>@]+>?$/.test(from) ? { apiKey, from } : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Plain, safe HTML: the text is escaped and line breaks kept. No images or tracking pixels. */
export function renderEmail(m: EmailMessage, baseUrl: string): { html: string; text: string } {
  const href = m.link ? (m.link.startsWith("/") ? `${baseUrl.replace(/\/+$/, "")}${m.link}` : m.link) : null;
  const text = m.footer !== undefined ? `${m.text}${href ? `\n\n${href}` : ""}\n\n—\n${m.footer}` : `${m.text}${href ? `\n\n${href}` : ""}\n\n—\nRutinia. Puedes dejar de recibir novedades en Mi cuenta${m.unsubscribeUrl ? `: ${m.unsubscribeUrl}` : "."}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111"><p style="white-space:pre-wrap;font-size:16px;line-height:1.5">${esc(m.text).replace(/\r?\n/g, "<br>")}</p>${href ? `<p><a href="${esc(href)}" style="display:inline-block;background:#8cff2e;color:#0d0d0d;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Abrir en Rutinia</a></p>` : ""}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>${m.footer !== undefined ? `<p style="font-size:12px;color:#666">${esc(m.footer)}</p>` : `<p style="font-size:12px;color:#666">Rutinia. Puedes dejar de recibir novedades en <a href="${esc(m.unsubscribeUrl ?? baseUrl)}">Mi cuenta</a>.</p>`}</div>`;
  return { html, text };
}

export async function sendEmail(cfg: EmailConfig, m: EmailMessage, baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status?: number }> {
  const { html, text } = renderEmail(m, baseUrl);
  try {
    const res = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: cfg.from, to: [m.to], subject: m.subject, html, text }), signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status };
  } catch { return { ok: false }; }
}
