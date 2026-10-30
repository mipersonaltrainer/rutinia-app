import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentStatus } from "./slots";
import { mapWompiStatus, type WompiTransaction } from "./providers/wompi";
import { capturedAmount, mapCaptureStatus, type PayPalOrder, type PayPalSubscription, type PayPalSubTx, createPayPalClient } from "./providers/paypal";
import { mapBoldStatus, type BoldPayment } from "./providers/bold";
import { decimalToMinor } from "./fx";

export type SettleResult = { result: string; status?: string; granted?: boolean; trainer_id?: string };
type Admin = SupabaseClient;
const rpc = async (admin: Admin, fn: string, args: Record<string, unknown>): Promise<SettleResult> => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as SettleResult;
};

/** Settles a Wompi transaction that was fetched from the Wompi API with our private key (never trusted from the browser). */
export async function settleWompiTransaction(admin: Admin, tx: WompiTransaction): Promise<SettleResult> {
  const base = { p_provider: "wompi", p_reference: tx.reference, p_txn_id: tx.id, p_status: mapWompiStatus(tx.status) as PaymentStatus, p_amount: tx.amount_in_cents, p_currency: tx.currency };
  if (tx.reference.startsWith("SP-")) return rpc(admin, "settle_slot_purchase", base);
  if (tx.reference.startsWith("AC-")) return rpc(admin, "settle_ai_credit_purchase", base);
  if (tx.reference.startsWith("SUB-")) return rpc(admin, "settle_subscription_payment", base);
  return { result: "ignored" };
}

/** Settles a Bold payment read from the Bold API by our order id. The order id is our reference (SP-/AC-/SUB- + uuid). */
export async function settleBoldPayment(admin: Admin, pay: BoldPayment): Promise<SettleResult> {
  const base = { p_provider: "bold", p_reference: pay.orderId, p_txn_id: pay.transactionId, p_status: mapBoldStatus(pay.status) as PaymentStatus, p_amount: pay.amountCents, p_currency: pay.currency };
  if (pay.orderId.startsWith("SP-")) return rpc(admin, "settle_slot_purchase", base);
  if (pay.orderId.startsWith("AC-")) return rpc(admin, "settle_ai_credit_purchase", base);
  if (pay.orderId.startsWith("SUB-")) return rpc(admin, "settle_subscription_payment", base);
  return { result: "ignored" };
}

/** Settles a one-time PayPal order (student slots or AI credits) from the order as returned by the PayPal API. */
export async function settlePayPalOrder(admin: Admin, order: PayPalOrder): Promise<SettleResult> {
  const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!cap) return { result: "pending", status: "pending" };            // approved but not captured yet
  const a = capturedAmount(cap);
  const args = { p_provider: "paypal", p_reference: order.id, p_txn_id: cap.id, p_status: mapCaptureStatus(cap.status), p_amount: a.cents, p_currency: a.currency };
  const slots = await rpc(admin, "settle_slot_purchase", args);
  return slots.result === "unknown_reference" ? rpc(admin, "settle_ai_credit_purchase", args) : slots;      // the order belongs to one of the two one-time products
}

/**
 * Reconciles local state with PayPal for a subscription: payments first (each by its own transaction id, idempotent),
 * then the provider state. The trainer is identified by the custom_id we set at creation and must have started this subscription.
 */
export async function reconcilePayPalSubscription(admin: Admin, client: ReturnType<typeof createPayPalClient>, subscriptionId: string, now: Date = new Date()): Promise<SettleResult> {
  const sub: PayPalSubscription = await client.getSubscription(subscriptionId);
  const trainerId = sub.custom_id;
  if (!trainerId) return { result: "ignored" };
  const { data: ts } = await admin.from("trainer_subscriptions").select("provider_subscription_id").eq("trainer_id", trainerId).maybeSingle();
  if (!ts || ts.provider_subscription_id !== subscriptionId) return { result: "unknown_subscription" };

  const start = new Date(now.getTime() - 40 * 86400000).toISOString(); const end = new Date(now.getTime() + 86400000).toISOString();
  const { transactions = [] } = await client.listSubscriptionTransactions(subscriptionId, start, end);
  for (const t of transactions as PayPalSubTx[]) {
    const gross = t.amount_with_breakdown?.gross_amount; if (!gross) continue;
    const status: PaymentStatus = t.status === "COMPLETED" ? "approved" : t.status === "REFUNDED" ? "voided" : t.status === "DECLINED" || t.status === "FAILED" ? "declined" : "pending";
    await rpc(admin, "settle_subscription_payment", { p_provider: "paypal", p_reference: t.id, p_txn_id: t.id, p_status: status, p_amount: decimalToMinor(gross.value), p_currency: gross.currency_code, p_trainer: trainerId });
  }
  return rpc(admin, "apply_provider_subscription_state", { p_trainer: trainerId, p_provider: "paypal", p_provider_sub_id: subscriptionId, p_state: sub.status, p_failed_count: sub.billing_info?.failed_payments_count ?? 0 });
}

/** Idempotent webhook ledger. Returns false when the event was already fully processed. */
export async function claimWebhookEvent(admin: Admin, provider: "paypal" | "wompi" | "bold", eventId: string, payload: unknown): Promise<boolean> {
  const ins = await admin.from("provider_webhook_events").insert({ provider, event_id: eventId, payload });
  if (!ins.error) return true;
  if (ins.error.code !== "23505") throw new Error(`webhook ledger: ${ins.error.message}`);
  const { data } = await admin.from("provider_webhook_events").select("processed_at").eq("provider", provider).eq("event_id", eventId).single();
  return !data?.processed_at;   // seen but never finished (earlier failure) → process again
}
export async function markWebhookProcessed(admin: Admin, provider: "paypal" | "wompi" | "bold", eventId: string) {
  await admin.from("provider_webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", provider).eq("event_id", eventId);
}
