import type { BillingConfig } from "../config";
import { decimalToMinor, minorToDecimal } from "../fx";
import type { PaymentStatus } from "../slots";

type F = typeof fetch;
export class PayPalError extends Error { constructor(public status: number, public body: unknown, msg: string) { super(msg); } }

export function createPayPalClient(cfg: BillingConfig, fetchImpl: F = fetch) {
  const { apiBase, clientId, clientSecret } = cfg.paypal;
  let cached: { token: string; exp: number } | null = null;

  async function token() {
    if (cached && cached.exp > Date.now() + 30_000) return cached.token;
    const res = await fetchImpl(`${apiBase}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store" });
    if (!res.ok) throw new PayPalError(res.status, null, "PayPal auth failed");
    const j = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return cached.token;
  }
  async function call<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const res = await fetchImpl(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    const text = await res.text(); const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new PayPalError(res.status, json, `PayPal ${method} ${path} -> ${res.status}`);
    return json as T;
  }
  const approveLink = (links: { rel: string; href: string }[]) => links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;

  return {
    /** One-time order (slots). `requestId` makes the call idempotent on PayPal's side. */
    async createOrder(p: { usdCents: number; purchaseId: string; description: string; returnUrl: string; cancelUrl: string }) {
      const o = await call<{ id: string; status: string; links: { rel: string; href: string }[] }>("POST", "/v2/checkout/orders", {
        intent: "CAPTURE",
        purchase_units: [{ reference_id: p.purchaseId, custom_id: p.purchaseId, description: p.description, amount: { currency_code: "USD", value: minorToDecimal(p.usdCents) } }],
        payment_source: { paypal: { experience_context: { return_url: p.returnUrl, cancel_url: p.cancelUrl, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" } } },
      }, { "PayPal-Request-Id": p.purchaseId });
      const href = approveLink(o.links); if (!href) throw new Error("PayPal order has no approval link");
      return { id: o.id, approveUrl: href };
    },
    captureOrder: (id: string) => call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, undefined, { "PayPal-Request-Id": `capture-${id}` }),
    getOrder: (id: string) => call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`),

    async createSubscription(p: { planId: string; trainerId: string; returnUrl: string; cancelUrl: string }) {
      const s = await call<{ id: string; status: string; links: { rel: string; href: string }[] }>("POST", "/v1/billing/subscriptions", {
        plan_id: p.planId, custom_id: p.trainerId,
        application_context: { brand_name: "Rutinia", user_action: "SUBSCRIBE_NOW", shipping_preference: "NO_SHIPPING", return_url: p.returnUrl, cancel_url: p.cancelUrl },
      }, { "PayPal-Request-Id": `sub-${p.trainerId}-${Date.now()}` });
      const href = approveLink(s.links); if (!href) throw new Error("PayPal subscription has no approval link");
      return { id: s.id, approveUrl: href };
    },
    getSubscription: (id: string) => call<PayPalSubscription>("GET", `/v1/billing/subscriptions/${encodeURIComponent(id)}`),
    listSubscriptionTransactions: (id: string, startIso: string, endIso: string) => call<{ transactions?: PayPalSubTx[] }>("GET", `/v1/billing/subscriptions/${encodeURIComponent(id)}/transactions?start_time=${encodeURIComponent(startIso)}&end_time=${encodeURIComponent(endIso)}`),
    cancelSubscription: (id: string, reason: string) => call<unknown>("POST", `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason: reason.slice(0, 128) }),

    /** Official verification endpoint: POST /v1/notifications/verify-webhook-signature. */
    async verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
      const h = (n: string) => headers.get(n) ?? "";
      if (!h("paypal-transmission-id") || !h("paypal-transmission-sig") || !cfg.paypal.webhookId) return false;
      try {
        const r = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
          auth_algo: h("paypal-auth-algo"), cert_url: h("paypal-cert-url"), transmission_id: h("paypal-transmission-id"), transmission_sig: h("paypal-transmission-sig"), transmission_time: h("paypal-transmission-time"),
          webhook_id: cfg.paypal.webhookId, webhook_event: event,
        });
        return r.verification_status === "SUCCESS";
      } catch { return false; }
    },
  };
}

export interface PayPalCapture { id: string; status: string; amount: { currency_code: string; value: string } }
export interface PayPalOrder { id: string; status: string; purchase_units?: { custom_id?: string; payments?: { captures?: PayPalCapture[] } }[] }
export interface PayPalSubscription { id: string; status: string; custom_id?: string; billing_info?: { next_billing_time?: string; failed_payments_count?: number } }
export interface PayPalSubTx { id: string; status: string; time: string; amount_with_breakdown?: { gross_amount?: { currency_code: string; value: string } } }

export function mapCaptureStatus(s: string): PaymentStatus {
  switch (s) { case "COMPLETED": return "approved"; case "DECLINED": case "FAILED": return "declined"; case "REFUNDED": return "voided"; default: return "pending"; }
}
export const capturedAmount = (c: PayPalCapture) => ({ cents: decimalToMinor(c.amount.value), currency: c.amount.currency_code });
