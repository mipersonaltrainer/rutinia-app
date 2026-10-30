import { slotPurchaseTotalCents, SLOT_UNIT_PRICE_CENTS } from "./pricing";

export type PaymentStatus = "pending" | "approved" | "declined" | "voided" | "expired";

export interface SlotPurchase {
  id: string;
  providerReference: string; // unique per provider transaction (idempotency key)
  quantity: number;
  status: PaymentStatus;
  slotsGranted: boolean;
}

/** Pure, idempotent reducer: only a verified "approved" purchase grants slots, once. */
export function applyVerifiedPayment(
  purchase: SlotPurchase,
  verifiedStatus: PaymentStatus,
  currentSlots: number,
): { purchase: SlotPurchase; slots: number } {
  const next: SlotPurchase = { ...purchase, status: verifiedStatus };
  if (verifiedStatus === "approved" && !purchase.slotsGranted) {
    next.slotsGranted = true;
    return { purchase: next, slots: currentSlots + purchase.quantity };
  }
  return { purchase: next, slots: currentSlots };
}

export function buildSlotQuote(quantity: number) {
  return { quantity, unitPriceCents: SLOT_UNIT_PRICE_CENTS, totalCents: slotPurchaseTotalCents(quantity), currency: "USD" as const, recurring: false as const };
}
