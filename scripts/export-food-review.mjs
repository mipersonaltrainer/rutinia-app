// Exports the food library as a spreadsheet for a nutrition professional to review (values per 100 g/ml and household measures in grams).
// Usage: node scripts/export-food-review.mjs      → docs/nutricion/REVISION_ALIMENTOS.csv  (add --check to verify it is up to date)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { FOODS } from "../data/foods.source.mjs";

const esc = (s) => `"${String(s).replace(/"/g, '""')}"`; const num = (n) => String(n).replace(".", ",");
const header = ["slug", "alimento", "categoria", "kcal_por_100", "proteina_g", "carbohidratos_g", "grasa_g", "fibra_g", "liquido", "medidas_caseras (gramos o ml por unidad)", "FUENTE_QUE_USARON_(ICBF/USDA/etiqueta)", "kcal_correcta", "proteina_correcta", "carbohidratos_correcto", "grasa_correcta", "medidas_correctas", "aprobado (SI/NO)", "observaciones"];
const rows = FOODS.map(([slug, name, cat, kcal, p, c, f, fib, liq, m]) => [slug, name, cat, num(kcal), num(p), num(c), num(f), fib === null ? "" : num(fib), liq ? "sí" : "no", Object.entries(m).map(([u, g]) => `${u}=${num(g)}`).join("; "), "", "", "", "", "", "", "", ""]);
const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n") + "\n";   // BOM + «;» so Excel in Spanish opens accents and columns correctly
const out = new URL("../docs/nutricion/REVISION_ALIMENTOS.csv", import.meta.url).pathname;
if (process.argv.includes("--check")) { if (!existsSync(out) || readFileSync(out, "utf8") !== csv) { console.error("docs/nutricion/REVISION_ALIMENTOS.csv está desactualizado: ejecuta npm run foods:review"); process.exit(1); } console.log(`OK: ${rows.length} alimentos`); }
else { writeFileSync(out, csv); console.log(`${rows.length} alimentos → docs/nutricion/REVISION_ALIMENTOS.csv`); }
