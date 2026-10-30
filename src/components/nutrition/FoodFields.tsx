"use client";
import { useMemo, useState } from "react";
import { fieldCls } from "@/components/ActionForm";
import { UNIT_LABEL } from "@/lib/nutrition/amounts";

export interface FoodOption { id: string; name_es: string; category: string; is_liquid: boolean; measures: Record<string, number>; kcal_100: number }
const CATEGORY: Record<string, string> = { cereales_tuberculos: "Cereales, tubérculos y plátano", verduras: "Verduras", frutas: "Frutas", lacteos: "Lácteos", carnes_huevos_pescado: "Carnes, huevos y pescado", leguminosas: "Leguminosas", grasas_frutos_secos: "Grasas y frutos secos", azucares_dulces: "Azúcares y dulces", bebidas: "Bebidas", preparados: "Preparados", otros: "Otros" };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Food picker + quantity in grams or in the household measures that exist for that specific food (cucharada, pocillo, vaso…). */
export function FoodFields({ foods }: { foods: FoodOption[] }) {
  const [q, setQ] = useState(""); const [id, setId] = useState(foods[0]?.id ?? "");
  const shown = useMemo(() => { const w = norm(q).split(/\s+/).filter(Boolean); return foods.filter((f) => w.every((x) => norm(f.name_es).includes(x))); }, [foods, q]);
  const food = shown.find((f) => f.id === id) ?? shown[0];    // searching moves the selection to the first match
  const groups = useMemo(() => { const m = new Map<string, FoodOption[]>(); for (const f of shown) m.set(f.category, [...(m.get(f.category) ?? []), f]); return [...m.entries()]; }, [shown]);
  const units = food ? [food.is_liquid ? ["ml", "mililitros (ml)"] : ["g", "gramos (g)"], food.is_liquid ? ["l", "litros (L)"] : ["kg", "kilogramos (kg)"], ...Object.keys(food.measures).filter((u) => UNIT_LABEL[u]).map((u) => [u, `${UNIT_LABEL[u].many} · ${UNIT_LABEL[u].hint}`])] : [];
  return (
    <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
      <div className="space-y-1">
        <label className="block text-xs">Buscar alimento<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="arroz, pollo, aguacate…" className={fieldCls} /></label>
        <label className="block text-xs">Alimento<select name="foodId" value={food?.id ?? ""} onChange={(e) => setId(e.target.value)} className={fieldCls} size={1}>
          {groups.map(([c, list]) => <optgroup key={c} label={CATEGORY[c] ?? c}>{list.map((f) => <option key={f.id} value={f.id}>{f.name_es}</option>)}</optgroup>)}</select></label>
        {shown.length === 0 && <p className="text-xs text-[var(--warn)]">Sin resultados. Prueba otra palabra.</p>}
      </div>
      <label className="text-xs">Medida<select name="unit" key={food?.id} defaultValue={units[0]?.[0]} className={fieldCls}>{units.map(([u, l]) => <option key={u} value={u}>{l}</option>)}</select></label>
      <label className="text-xs">Cantidad<input name="qty" type="number" step="0.25" min="0.25" defaultValue={1} required className={fieldCls} /></label>
    </div>
  );
}
