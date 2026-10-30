import { createHash, timingSafeEqual } from "node:crypto";
import type { BillingConfig } from "../config";
import type { PaymentStatus } from "../slots";

export const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Docs: SHA256("<reference><amount-in-cents><currency>[<expiration-time>]<integrity secret>"). */
export function integritySignature(p: { reference: string; amountInCents: number; currency: string; integritySecret: string; expirationTime?: string }) {
  return sha256(`${p.reference}${p.amountInCents}${p.currency}${p.expirationTime ?? ""}${p.integritySecret}`);
}

export function buildCheckoutUrl(cfg: BillingConfig, p: { reference: string; amountInCents: number; redirectPath: string; customerEmail?: string }) {
  const u = new URL(WOMPI_CHECKOUT_URL);
  u.searchParams.set("public-key", cfg.wompi.publicKey);
  u.searchParams.set("currency", "COP");
  u.searchParams.set("amount-in-cents", String(p.amountInCents));
  u.searchParams.set("reference", p.reference);
  u.searchParams.set("signature:integrity", integritySignature({ reference: p.reference, amountInCents: p.amountInCents, currency: "COP", integritySecret: cfg.wompi.integritySecret }));
  u.searchParams.set("redirect-url", `${cfg.baseUrl}${p.redirectPath}`);
  if (p.customerEmail) u.searchParams.set("customer-data:email", p.customerEmail);
  return u.toString();
}

export interface WompiEvent { event: string; data: Record<string, unknown>; environment?: string; signature?: { properties: string[]; checksum: string }; timestamp: number }
const dig = (obj: unknown, path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

/** Docs: SHA256(values of signature.properties (taken from data, in order) + timestamp + events secret) == checksum. */
export function computeEventChecksum(ev: Pick<WompiEvent, "data" | "timestamp"> & { signature: { properties: string[] } }, eventsSecret: string) {
  const values = ev.signature.properties.map((p) => { const v = dig(ev.data, p); return v === undefined || v === null ? "" : String(v); });
  return sha256(values.join("") + String(ev.timestamp) + eventsSecret);
}
export function verifyEventChecksum(ev: WompiEvent, eventsSecret: string, headerChecksum?: string | null): boolean {
  if (!eventsSecret || !ev.signature?.checksum || !Array.isArray(ev.signature.properties) || typeof ev.timestamp !== "number") return false;
  const mine = Buffer.from(computeEventChecksum(ev as never, eventsSecret).toLowerCase());
  const theirs = Buffer.from(String(ev.signature.checksum).toLowerCase());
  if (mine.length !== theirs.length || !timingSafeEqual(mine, theirs)) return false;
  return !headerChecksum || headerChecksum.toLowerCase() === ev.signature.checksum.toLowerCase();
}

export interface WompiTransaction { id: string; status: string; reference: string; amount_in_cents: number; currency: string }
export function mapWompiStatus(s: string): PaymentStatus {
  switch (s) { case "APPROVED": return "approved"; case "VOIDED": return "voided"; case "DECLINED": case "ERROR": return "declined"; default: return "pending"; }
}

/** Authoritative lookup. Since the API change, only the private key (server-side) may read a transaction. */
export async function fetchTransaction(cfg: BillingConfig, id: string, fetchImpl: typeof fetch = fetch): Promise<WompiTransaction | null> {
  const res = await fetchImpl(`${cfg.wompi.apiBase}/transactions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${cfg.wompi.privateKey}` }, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wompi API ${res.status}`);
  const json = (await res.json()) as { data?: WompiTransaction };
  return json.data ?? null;
}
