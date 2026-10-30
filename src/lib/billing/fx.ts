// Integer-only FX math. rate is "COP per 1 USD" (e.g. "3950.5000"); never floats for money.
export const FX_POLICY_TEXT = "Tasa administrada por el equipo (no es una tasa de mercado en vivo); se fija al iniciar el pago y se conserva en la factura. Redondeo al peso más cercano (mitad hacia arriba).";

function rateToScaled(rate: string | number): number {
  const s = String(rate).trim();
  if (!/^\d+(\.\d{1,4})?$/.test(s)) throw new RangeError("invalid FX rate");
  const [i, f = ""] = s.split(".");
  const scaled = Number(i + f.padEnd(4, "0"));
  if (!Number.isSafeInteger(scaled) || scaled <= 0) throw new RangeError("FX rate must be positive");
  return scaled;
}

/** USD minor units (cents) → COP "cents" (centavos, as Wompi expects), rounded to whole pesos. */
export function usdCentsToCopCents(usdCents: number, rate: string | number): number {
  if (!Number.isInteger(usdCents) || usdCents <= 0) throw new RangeError("usdCents must be a positive integer");
  const scaledRate = rateToScaled(rate);
  const product = usdCents * scaledRate;                      // cents × rate × 1e4 (safe integer for sane inputs)
  if (!Number.isSafeInteger(product)) throw new RangeError("amount out of range");
  const pesos = Math.floor((product + 500000) / 1000000);   // half-up to whole pesos
  return pesos * 100;
}

/** "0.75" → 75. Rejects more than two decimals or non-numeric text. */
export function decimalToMinor(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new RangeError(`invalid decimal amount: ${value}`);
  const [i, f = ""] = value.split(".");
  return Number(i) * 100 + Number(f.padEnd(2, "0"));
}
export const minorToDecimal = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;

export const formatCop = (copCents: number) => `$${new Intl.NumberFormat("es-CO").format(copCents / 100)} COP`;

// ---- Rate freshness policy --------------------------------------------------------------------------------------
// The rate is set by an administrator (never fetched live), so nothing refreshes it by itself. A forgotten rate would
// quietly over- or under-charge every Wompi payment, so a rate older than the limit blocks *new* Wompi charges.
// Payments already started keep the rate they were created with (it is stored on the payment row), and PayPal (USD) is unaffected.
export const DEFAULT_FX_MAX_AGE_HOURS = 168;                 // 7 days
export const MAX_FX_MAX_AGE_HOURS = 24 * 60;                 // configuration ceiling: 60 days

/** FX_MAX_AGE_HOURS as a whole number of hours in [1, 1440]; anything else falls back to the default. */
export function fxMaxAgeHours(raw: string | undefined | null): number {
  const s = (raw ?? "").trim();
  if (!/^\d+$/.test(s)) return DEFAULT_FX_MAX_AGE_HOURS;
  const n = Number(s);
  return n >= 1 && n <= MAX_FX_MAX_AGE_HOURS ? n : DEFAULT_FX_MAX_AGE_HOURS;
}

export type FxRateStatus =
  | { usable: true; state: "fresh"; ageHours: number }
  | { usable: false; state: "missing" | "stale" | "future"; ageHours: number | null; message: string };

const ageText = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} días` : `${h} h`);

export function fxRateStatus(rate: { effective_at: string } | null, now: Date, maxAgeHours: number): FxRateStatus {
  if (!rate) return { usable: false, state: "missing", ageHours: null, message: "No hay una tasa USD→COP configurada: los pagos en pesos (Wompi) no están disponibles." };
  const at = new Date(rate.effective_at).getTime();
  if (!Number.isFinite(at)) return { usable: false, state: "missing", ageHours: null, message: "La tasa USD→COP no tiene una fecha válida: los pagos en pesos (Wompi) no están disponibles." };
  const ms = now.getTime() - at;
  if (ms < 0) return { usable: false, state: "future", ageHours: null, message: "La tasa USD→COP tiene una fecha futura: los pagos en pesos (Wompi) están pausados hasta revisarla." };
  const ageHours = Math.floor(ms / 3_600_000);
  if (ms > maxAgeHours * 3_600_000) return { usable: false, state: "stale", ageHours, message: `La tasa USD→COP tiene ${ageText(ageHours)} de antigüedad (máximo permitido: ${ageText(maxAgeHours)}). Los pagos en pesos (Wompi) están pausados hasta que se actualice; puedes pagar con PayPal.` };
  return { usable: true, state: "fresh", ageHours };
}

// ---- Early warning for the operator --------------------------------------------------------------------------------
// Wompi charges pause when the rate passes FX_MAX_AGE_HOURS. The operator (nobody else can set the rate) is warned
// FX_WARN_HOURS before that moment so the pause never reaches a customer.
export const DEFAULT_FX_WARN_HOURS = 24;

/** Hours of remaining validity at which the warning starts. Must leave room below the limit; anything else → default (capped to the limit). */
export function fxWarnHours(raw: string | undefined | null, maxAgeHours: number): number {
  const s = (raw ?? "").trim();
  const n = /^\d+$/.test(s) ? Number(s) : DEFAULT_FX_WARN_HOURS;
  const v = n >= 1 ? n : DEFAULT_FX_WARN_HOURS;
  return Math.min(v, Math.max(1, maxAgeHours - 1));
}

export type FxAlertState = "ok" | "expiring" | "expired" | "missing" | "future";
export type FxAlertEvaluation = { state: FxAlertState; hoursLeft: number | null; message: string | null };

/** What the operator should hear about the rate right now (null message = nothing to say). */
export function fxAlertEvaluation(rate: { effective_at: string } | null, now: Date, maxAgeHours: number, warnHours: number): FxAlertEvaluation {
  const st = fxRateStatus(rate, now, maxAgeHours);
  if (!st.usable) {
    const hoursLeft = st.state === "stale" ? 0 : null;
    const state: FxAlertState = st.state === "stale" ? "expired" : st.state;
    return { state, hoursLeft, message: `🔴 Rutinia: ${st.message} Registra una tasa nueva: node --env-file=.env.cloud scripts/set-fx-rate.mjs <tasa> "<fuente>".` };
  }
  const at = new Date(rate!.effective_at).getTime();
  const hoursLeft = Math.max(0, Math.floor((at + maxAgeHours * 3_600_000 - now.getTime()) / 3_600_000));
  if (hoursLeft <= warnHours) {
    return { state: "expiring", hoursLeft, message: `🟠 Rutinia: la tasa USD→COP vence en ~${hoursLeft} h (límite de ${maxAgeHours} h). Cuando venza, los cobros nuevos con Wompi se pausan. Registra una tasa nueva: node --env-file=.env.cloud scripts/set-fx-rate.mjs <tasa> "<fuente>".` };
  }
  return { state: "ok", hoursLeft, message: null };
}
