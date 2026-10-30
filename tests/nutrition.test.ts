import { describe, it, expect } from "vitest";
import { FOODS as RAW, HOUSEHOLD_UNITS } from "../data/foods.source.mjs";
import { describeAmount, formatGrams, gramsFromHousehold, householdFor, UNIT_LABEL } from "@/lib/nutrition/amounts";
import { deviationPct, itemTotals, sumTotals } from "@/lib/nutrition/totals";

type Food = [string, string, string, number, number, number, number, number | null, number, Record<string, number>];
const FOODS = RAW as unknown as Food[];

describe("biblioteca de alimentos", () => {
  it("no hay slugs repetidos y todos son válidos", () => {
    const slugs = FOODS.map((f) => f[0]); expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]{2,80}$/);
  });
  it("las calorías son coherentes con los macronutrientes (4·P + 4·C + 9·G), para detectar errores de digitación", () => {
    const FIBER_RICH = ["cacao-en-polvo"];   // reference kcal use a lower energy factor for their very high fiber content
    const bad = FOODS.filter(([slug, , , kcal, p, c, f]) => { if (FIBER_RICH.includes(slug)) return false; const est = 4 * p + 4 * c + 9 * f; return Math.abs(est - kcal) > Math.max(25, kcal * 0.18); }).map((f) => `${f[0]} (${f[3]} kcal vs ${4 * f[4] + 4 * f[5] + 9 * f[6]})`);
    expect(bad).toEqual([]);
  });
  it("macros dentro de rango físico (100 g no pueden sumar más de 100 g)", () => {
    for (const [slug, , , , p, c, f] of FOODS) expect(p + c + f, slug).toBeLessThanOrEqual(100.5);
  });
  it("las medidas caseras usan solo unidades conocidas y gramos positivos", () => {
    for (const [slug, , , , , , , , , m] of FOODS) { expect(Object.keys(m).length, slug).toBeGreaterThan(0); for (const [u, g] of Object.entries(m)) { expect(HOUSEHOLD_UNITS, `${slug}:${u}`).toContain(u); expect(g as number, `${slug}:${u}`).toBeGreaterThan(0); } }
    expect(Object.keys(UNIT_LABEL).sort()).toEqual([...HOUSEHOLD_UNITS].sort());
  });
  it("cubre las medidas pedidas: cucharadita, cucharada, cucharón, pocillo y vaso", () => {
    const used = new Set(FOODS.flatMap((f) => Object.keys(f[9]))); for (const u of ["cucharadita", "cucharada", "cucharon", "pocillo", "vaso"]) expect(used.has(u), u).toBe(true);
  });
});

describe("medidas caseras y gramos", () => {
  const arroz = { cucharada: 20, cucharon: 90, pocillo: 100, taza: 160 };
  it("expresa la cantidad en la unidad más natural y también en gramos", () => {
    expect(householdFor(180, arroz)?.text).toBe("2 cucharones"); expect(describeAmount(180, arroz)).toBe("2 cucharones · 180 g");
    expect(householdFor(40, arroz)?.text).toBe("2 cucharadas");
    expect(householdFor(45, arroz)?.text).toBe("½ cucharón");
  });
  it("prefiere la unidad más grande cuando dos describen lo mismo", () => { expect(householdFor(13.5, { cucharadita: 4.5, cucharada: 13.5 })?.text).toBe("1 cucharada"); });
  it("acepta cuartos y medios", () => { expect(householdFor(135, arroz)?.text).toBe("1 ½ cucharones"); });
  it("si ninguna medida describe bien la cantidad, muestra solo gramos", () => { expect(describeAmount(5, { cucharon: 90 })).toBe("5 g"); });
  it("líquidos en ml", () => { expect(describeAmount(240, { vaso: 240 }, true)).toBe("1 vaso · 240 ml"); expect(describeAmount(1000, {}, true)).toBe("1 L"); });
  it("gramos exactos y kilos", () => { expect(formatGrams(5)).toBe("5 g"); expect(formatGrams(10)).toBe("10 g"); expect(formatGrams(1000)).toBe("1 kg"); expect(formatGrams(1500)).toBe("1,5 kg"); });
  it("de cantidad casera a gramos para ese alimento", () => { expect(gramsFromHousehold("cucharada", 2, arroz)).toBe(40); expect(gramsFromHousehold("vaso", 1, arroz)).toBeNull(); expect(gramsFromHousehold("cucharada", 0, arroz)).toBeNull(); });
});

describe("totales", () => {
  const arroz = { kcal_100: 130, protein_100: 2.7, carbs_100: 28, fat_100: 0.3 };
  it("calcula por ítem y suma por comida", () => {
    const a = itemTotals(arroz, 180); expect(a).toEqual({ kcal: 234, protein: 4.9, carbs: 50.4, fat: 0.5 });
    expect(sumTotals([a, a]).kcal).toBe(468);
  });
  it("la desviación respecto al objetivo", () => { expect(deviationPct(2100, 2000)).toBe(5); expect(deviationPct(100, null)).toBeNull(); });
});
