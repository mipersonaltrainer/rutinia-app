// All money is integer minor units: USD cents, or COP "centavos" (pesos × 100, as Wompi expects). Never use floats for money.
// Two price lists, no conversion between them: Wompi charges pesos (Colombia), PayPal charges dollars (everyone else).
export type Currency = "COP" | "USD";
export const currencyForProvider = (provider: "bold" | "wompi" | "paypal"): Currency => (provider === "paypal" ? "USD" : "COP");

export const BASE_PRICE_CENTS = 1000; // USD 10.00 / month (PayPal)
export const BASE_PRICE_COP_CENTS = 4_000_000; // COP 40.000 / month (Wompi)
export const basePriceCents = (currency: Currency): number => (currency === "COP" ? BASE_PRICE_COP_CENTS : BASE_PRICE_CENTS);

export const INCLUDED_CLIENTS = 20;
export const SLOT_UNIT_PRICE_CENTS = 75; // USD 0.75, one-time, prepaid, flat
export const MIN_SLOTS_PER_PURCHASE = 1;
export const MAX_SLOTS_PER_PURCHASE = 10;
/** Pesos: the more students are bought at once, the less each one costs. `upTo` is inclusive. Mirrored by slot_unit_cop() in the database. */
export const COP_SLOT_TIERS = [
  { upTo: 2, unitCents: 250_000 }, { upTo: 4, unitCents: 240_000 }, { upTo: 9, unitCents: 220_000 }, { upTo: 10, unitCents: 200_000 },
] as const;

export function slotUnitCents(quantity: number, currency: Currency = "USD"): number {
  if (!Number.isInteger(quantity) || quantity < MIN_SLOTS_PER_PURCHASE || quantity > MAX_SLOTS_PER_PURCHASE) {
    throw new RangeError(`quantity must be an integer between ${MIN_SLOTS_PER_PURCHASE} and ${MAX_SLOTS_PER_PURCHASE}`);
  }
  return currency === "COP" ? COP_SLOT_TIERS.find((t) => quantity <= t.upTo)!.unitCents : SLOT_UNIT_PRICE_CENTS;
}

export function slotPurchaseTotalCents(quantity: number, currency: Currency = "USD"): number {
  return quantity * slotUnitCents(quantity, currency);      // slotUnitCents rejects a bad quantity first
}

export function maxActiveClients(verifiedAdditionalSlots: number): number {
  if (!Number.isInteger(verifiedAdditionalSlots) || verifiedAdditionalSlots < 0) {
    throw new RangeError("verifiedAdditionalSlots must be a non-negative integer");
  }
  return INCLUDED_CLIENTS + verifiedAdditionalSlots;
}

export interface CapacitySummary {
  included: number;
  additionalSlots: number;
  totalCapacity: number;
  activeClients: number;
  remaining: number;
}

export function capacitySummary(activeClients: number, verifiedAdditionalSlots: number): CapacitySummary {
  const totalCapacity = maxActiveClients(verifiedAdditionalSlots);
  return {
    included: INCLUDED_CLIENTS,
    additionalSlots: verifiedAdditionalSlots,
    totalCapacity,
    activeClients,
    remaining: Math.max(0, totalCapacity - activeClients),
  };
}

export function canAddClient(activeClients: number, verifiedAdditionalSlots: number): boolean {
  return activeClients < maxActiveClients(verifiedAdditionalSlots);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// AI credits: a draft (diet or training plan) costs one credit. Every trainer gets a few free ones each month; more come in prepaid packs.
export const FREE_MONTHLY_DRAFTS = 3;
export const BILLABLE_AI_KINDS = ["diet_draft", "plan_draft"] as const;
export const AI_PACKS = {
  p20: { id: "p20", credits: 20, cents: { USD: 600, COP: 2_500_000 }, label: "20 borradores" },
  p100: { id: "p100", credits: 100, cents: { USD: 2000, COP: 10_000_000 }, label: "100 borradores" },
} as const;
export type AiPackId = keyof typeof AI_PACKS;
export const AI_PACK_IDS = Object.keys(AI_PACKS) as AiPackId[];

export function aiPackTotalCents(pack: AiPackId, currency: Currency = "USD"): number {
  const p = AI_PACKS[pack];
  if (!p) throw new RangeError(`unknown AI pack: ${String(pack)}`);
  return p.cents[currency];
}

/** "$40.000 COP" / "$10.00 USD". */
export function formatMoney(cents: number, currency: Currency): string {
  return currency === "COP" ? `$${new Intl.NumberFormat("es-CO").format(Math.round(cents / 100))} COP` : `$${(cents / 100).toFixed(2)} USD`;
}
