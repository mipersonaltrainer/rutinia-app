// Household measures ⇄ grams. Grams are the stored quantity; household units are a friendlier way to say the same amount.
export const UNIT_LABEL: Record<string, { one: string; many: string; hint: string }> = {
  cucharadita: { one: "cucharadita", many: "cucharaditas", hint: "cuchara de té" },
  cucharada: { one: "cucharada", many: "cucharadas", hint: "cuchara sopera" },
  cucharon: { one: "cucharón", many: "cucharones", hint: "servido con cucharón" },
  pocillo: { one: "pocillo", many: "pocillos", hint: "pocillo de tinto (~120 ml)" },
  taza: { one: "taza", many: "tazas", hint: "taza (~240 ml)" },
  vaso: { one: "vaso", many: "vasos", hint: "vaso (~240 ml)" },
  unidad: { one: "unidad", many: "unidades", hint: "una pieza mediana" },
  rebanada: { one: "rebanada", many: "rebanadas", hint: "rebanada o tajada" },
  "puñado": { one: "puñado", many: "puñados", hint: "lo que cabe en una mano" },
  porcion: { one: "porción", many: "porciones", hint: "del tamaño de la palma de la mano" },
};
export type Measures = Record<string, number>;

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));
const FRACTIONS: [number, string][] = [[0.25, "¼"], [0.5, "½"], [0.75, "¾"]];
const pretty = (q: number) => { const whole = Math.floor(q); const frac = q - whole; const f = FRACTIONS.find(([v]) => Math.abs(v - frac) < 1e-9)?.[1]; return f ? (whole ? `${whole} ${f}` : f) : num(q); };

export function formatMl(ml: number): string { return ml >= 1000 ? `${num(Math.round(ml) / 1000)} L` : `${num(Math.round(ml * 10) / 10)} ml`; }

/** "1,5 kg" / "250 g" — the exact weight, for people who use a kitchen scale. */
export function formatGrams(g: number): string { return g >= 1000 ? `${num(Math.round(g) / 1000)} kg` : `${num(Math.round(g * 10) / 10)} g`; }

/**
 * The household expression closest to `grams` (quarters allowed, within 15 % of the real amount), preferring the most natural unit.
 * Returns null when no unit describes the amount well — the caller then shows grams only. Never rounds to 0.
 */
export function householdFor(grams: number, measures: Measures): { qty: number; unit: string; text: string } | null {
  let best: { qty: number; unit: string; err: number; order: number } | null = null;
  for (const [unit, per] of Object.entries(measures)) {
    if (!UNIT_LABEL[unit] || per <= 0) continue;
    const qty = Math.round((grams / per) * 4) / 4;
    if (qty < 0.25 || qty > 12) continue;
    const err = Math.abs(qty * per - grams) / grams;
    if (err > 0.15) continue;
    const order = Object.keys(UNIT_LABEL).indexOf(unit);
    const frac = Math.round((qty % 1) * 100); const score = err + (frac === 25 || frac === 75 ? 0.05 : 0) + (qty < 1 ? 0.03 : 0) + (qty > 6 ? 0.1 : 0) + qty * 0.001;   // smaller error first, then whole/half amounts, then 1–6 of something, then the larger unit (1 cucharada, not 3 cucharaditas)
    if (!best || score < best.err || (score === best.err && order < best.order)) best = { qty, unit, err: score, order };
  }
  if (!best) return null;
  const L = UNIT_LABEL[best.unit]; return { qty: best.qty, unit: best.unit, text: `${pretty(best.qty)} ${best.qty > 1 ? L.many : L.one}` };
}

/** Both ways to say it: "2 cucharadas · 30 g". */
export function describeAmount(grams: number, measures: Measures, isLiquid = false): string {
  const h = householdFor(grams, measures);
  const exact = isLiquid ? formatMl(grams) : formatGrams(grams);
  return h ? `${h.text} · ${exact}` : exact;
}

/** Household quantity typed by the trainer → grams for that specific food. */
export function gramsFromHousehold(unit: string, qty: number, measures: Measures): number | null {
  const per = measures[unit]; if (!per || !(qty > 0)) return null;
  return Math.round(per * qty * 10) / 10;
}
