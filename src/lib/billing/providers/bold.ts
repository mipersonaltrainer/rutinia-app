import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { BillingConfig } from "../config";
import type { PaymentStatus } from "../slots";
import { BOLD_SCRIPT_URL, type BoldButtonParams } from "../bold-shared";

export { BOLD_SCRIPT_URL, type BoldButtonParams };

export const BOLD_API_BASE = "https://payments.api.bold.co/v2";
/** Bold's documented minimum for a sale, in pesos. */
export const BOLD_MIN_PESOS = 1000;

/** Docs: SHA256 hex of "<order id><amount in pesos><currency><secret key>" (plain concatenation, not an HMAC). */
export function integritySignature(p: { orderId: string; amountPesos: number; currency: string; secretKey: string }) {
  return createHash("sha256").update(`${p.orderId}${p.amountPesos}${p.currency}${p.secretKey}`).digest("hex");
}

/** Money is stored in centavos (pesos × 100); Bold takes whole pesos. Rejects amounts that are not whole pesos or below Bold's minimum. */
export function centavosToPesos(cents: number): number {
  if (!Number.isInteger(cents) || cents % 100 !== 0) throw new RangeError("Bold needs whole pesos");
  const pesos = cents / 100;
  if (pesos < BOLD_MIN_PESOS) throw new RangeError(`Bold minimum is ${BOLD_MIN_PESOS} pesos`);
  return pesos;
}

export function buildButtonParams(cfg: BillingConfig, p: { orderId: string; amountCents: number; description: string; email?: string; redirectPath: string; originPath: string }): BoldButtonParams {
  const amount = centavosToPesos(p.amountCents);
  return {
    apiKey: cfg.bold.identityKey, orderId: p.orderId, amount, currency: "COP",
    integritySignature: integritySignature({ orderId: p.orderId, amountPesos: amount, currency: "COP", secretKey: cfg.bold.secretKey }),
    redirectionUrl: `${cfg.baseUrl}${p.redirectPath}`, originUrl: `${cfg.baseUrl}${p.originPath}`, description: p.description,
    ...(p.email ? { customerData: JSON.stringify({ email: p.email }) } : {}),
  };
}

export interface BoldWebhookEvent { id: string; type: string; subject?: string; data?: { payment_id?: string; amount?: { currency?: string; total?: number }; metadata?: { reference?: string | null } } }

/** Docs: x-bold-signature = hex HMAC-SHA256, keyed with the secret key, over the Base64 of the raw body. Compare in constant time. */
export function verifyWebhookSignature(rawBody: string, header: string | null, secretKey: string): boolean {
  if (!header) return false;
  const mine = Buffer.from(createHmac("sha256", secretKey).update(Buffer.from(rawBody, "utf8").toString("base64")).digest("hex"));
  const theirs = Buffer.from(header.trim().toLowerCase());
  return mine.length === theirs.length && timingSafeEqual(mine, theirs);
}

/** Only the final states move money; anything in flight (including "not found yet") stays pending. */
export function mapBoldStatus(s: string): PaymentStatus {
  switch (s) { case "APPROVED": return "approved"; case "VOIDED": return "voided"; case "REJECTED": case "FAILED": return "declined"; default: return "pending"; }
}

export interface BoldPayment { orderId: string; transactionId: string | null; status: string; amountCents: number; currency: "COP" }
interface Voucher { transaction_id?: string; total?: number; payment_status?: string; reference_id?: string }

/** Authoritative lookup by our order id, with the identity key (server side). The browser redirect and the webhook body are never trusted for the status. */
export async function fetchPayment(cfg: BillingConfig, orderId: string, fetchImpl: typeof fetch = fetch): Promise<BoldPayment | null> {
  const res = await fetchImpl(`${BOLD_API_BASE}/payment-voucher/${encodeURIComponent(orderId)}`, { headers: { Authorization: `x-api-key ${cfg.bold.identityKey}` }, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Bold API ${res.status}`);
  const v = (await res.json()) as Voucher;
  if (!v.payment_status) return null;
  return { orderId, transactionId: v.transaction_id ?? null, status: v.payment_status, amountCents: Math.round((v.total ?? 0) * 100), currency: "COP" };
}
