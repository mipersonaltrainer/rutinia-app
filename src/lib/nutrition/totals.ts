export interface FoodPer100 { kcal_100: number; protein_100: number; carbs_100: number; fat_100: number }
export interface Totals { kcal: number; protein: number; carbs: number; fat: number }
export const ZERO: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const r1 = (n: number) => Math.round(n * 10) / 10;

export function itemTotals(f: FoodPer100, grams: number): Totals {
  const k = grams / 100;
  return { kcal: r1(f.kcal_100 * k), protein: r1(f.protein_100 * k), carbs: r1(f.carbs_100 * k), fat: r1(f.fat_100 * k) };
}
export function sumTotals(list: Totals[]): Totals {
  const t = list.reduce((a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }), ZERO);
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat) };
}
/** How far the plan is from its targets, in %, so the trainer sees at a glance whether a draft is on target. */
export function deviationPct(total: number, target: number | null): number | null { return target ? Math.round(((total - target) / target) * 100) : null; }
