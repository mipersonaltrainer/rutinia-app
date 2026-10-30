import { describeAmount } from "@/lib/nutrition/amounts";
import { deviationPct, itemTotals, sumTotals } from "@/lib/nutrition/totals";

export interface ViewItem { id: string; grams: number; food: { name_es: string; kcal_100: number; protein_100: number; carbs_100: number; fat_100: number; is_liquid: boolean; measures: Record<string, number> } }
export interface ViewMeal { id: string; name: string; note: string | null; items: ViewItem[] }
export interface ViewPlan { kcal_target: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }

export const mealTotals = (m: ViewMeal) => sumTotals(m.items.map((i) => itemTotals(i.food, Number(i.grams))));
export const planTotals = (meals: ViewMeal[]) => sumTotals(meals.map(mealTotals));

/** Read-only plan: both the household amount and the exact weight, with per-meal and daily totals against the targets. */
export function PlanTotalsBar({ meals, plan, trainerView = false }: { meals: ViewMeal[]; plan: ViewPlan; trainerView?: boolean }) {
  const t = planTotals(meals); const d = deviationPct(t.kcal, plan.kcal_target);
  const cell = (label: string, v: number, target: number | null, unit: string) => <div><p className="text-xs text-[var(--muted)]">{label}</p><p className="text-lg font-semibold">{v}{unit}</p>{target !== null && <p className="text-xs text-[var(--muted)]">objetivo {target}{unit}</p>}</div>;
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-4">
      {cell("Calorías del día", t.kcal, plan.kcal_target, " kcal")}{cell("Proteína", t.protein, plan.protein_g, " g")}{cell("Carbohidratos", t.carbs, plan.carbs_g, " g")}{cell("Grasa", t.fat, plan.fat_g, " g")}
      {trainerView && d !== null && <p className={`col-span-full text-xs ${Math.abs(d) > 10 ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>{d === 0 ? "Justo en el objetivo calórico." : `${d > 0 ? "+" : ""}${d} % frente al objetivo calórico${Math.abs(d) > 10 ? ": ajusta las cantidades" : ""}.`}</p>}
    </div>
  );
}

export function MealList({ meals, renderItemActions, renderMealActions }: { meals: ViewMeal[]; renderItemActions?: (i: ViewItem) => React.ReactNode; renderMealActions?: (m: ViewMeal) => React.ReactNode }) {
  return (
    <div className="space-y-4">{meals.map((m) => { const t = mealTotals(m); return (
      <section key={m.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{m.name}</h3><p className="text-xs text-[var(--muted)]">{t.kcal} kcal · P {t.protein} g · C {t.carbs} g · G {t.fat} g</p></div>
        {m.note && <p className="mt-1 text-xs text-[var(--muted)]">{m.note}</p>}
        {m.items.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">Sin alimentos todavía.</p> : (
          <ul className="mt-2 divide-y divide-[var(--border)] text-sm">{m.items.map((i) => { const it = itemTotals(i.food, Number(i.grams)); return (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><b>{i.food.name_es}</b> <span className="text-[var(--muted)]">— {describeAmount(Number(i.grams), i.food.measures, i.food.is_liquid)}</span></span>
              <span className="flex items-center gap-3"><span className="text-xs text-[var(--muted)]">{it.kcal} kcal</span>{renderItemActions?.(i)}</span></li>); })}</ul>)}
        {renderMealActions?.(m)}
      </section>); })}</div>
  );
}
