// Usage: node scripts/build-exercises.mjs [--check]
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse, build, inventory } from "./exercise-lib.mjs";

const dir = new URL("../data/exercises/", import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort().map((f) => [f, readFileSync(join(dir, f), "utf8")]);
const { rows, errors: pe } = parse(files);
const { items, relations, errors: be } = build(rows);
const errors = [...pe, ...be];
const out = JSON.stringify({ items, relations }, null, 1) + "\n";
const target = new URL("../data/exercises.generated.json", import.meta.url).pathname;
const inv = inventory(items);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
if (process.argv.includes("--check")) {
  if (inv.total < 500) { console.error(`Solo ${inv.total} ejercicios (<500)`); process.exit(1); }
  if (!existsSync(target) || readFileSync(target, "utf8") !== out) { console.error("data/exercises.generated.json está desactualizado: ejecuta npm run exercises:build"); process.exit(1); }
  console.log(`OK: ${inv.total} ejercicios únicos, JSON reproducible`);
} else {
  writeFileSync(target, out);
  console.log(JSON.stringify(inv, null, 1));
  console.log(`relaciones: ${relations.length}`);
}
