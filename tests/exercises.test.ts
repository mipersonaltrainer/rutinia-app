import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, build, inventory, normalize } from "../scripts/exercise-lib.mjs";
import { parseFilters, applyFilters, PAGE_SIZE } from "@/lib/exercises/filters";
import { slugify } from "@/lib/exercises/slug";

const dir = join(__dirname, "../data/exercises");
const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort().map((f) => [f, readFileSync(join(dir, f), "utf8")]);
const { rows, errors: pe } = parse(files);
const { items, relations, errors: be } = build(rows);

describe("exercise library data", () => {
  it("has no parse/build errors and at least 500 unique exercises", () => {
    expect(pe).toEqual([]); expect(be).toEqual([]);
    expect(items.length).toBeGreaterThanOrEqual(500);
  });
  it("names and slugs are unique after normalization", () => {
    expect(new Set(items.map((i: { name_es: string }) => normalize(i.name_es))).size).toBe(items.length);
    expect(new Set(items.map((i: { slug: string }) => i.slug)).size).toBe(items.length);
  });
  it("covers every required muscle group and equipment family", () => {
    const inv = inventory(items);
    for (const m of ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quadriceps", "hamstrings", "glutes", "calves", "core"]) expect(inv.by_primary_muscle[m]).toBeGreaterThan(5);
    for (const e of ["bodyweight", "band", "dumbbell", "barbell", "cable", "machine", "kettlebell"]) expect(inv.by_equipment[e]).toBeGreaterThan(10);
  });
  it("every item has the required fields and no empty guidance", () => {
    for (const e of items) {
      expect(e.instructions.length).toBeGreaterThanOrEqual(3); expect(e.common_errors.length).toBeGreaterThan(0); expect(e.safety_notes.length).toBeGreaterThan(0);
      expect(e.review_status).toBe("draft"); expect(e.media_status).toBe("pending"); expect(e.source).toBeTruthy();
    }
  });
  it("relations never self-reference, are unique, and respect difficulty ordering", () => {
    const by = new Map(items.map((i: { slug: string; difficulty: string }) => [i.slug, i.difficulty]));
    const rank: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
    const keys = new Set<string>();
    for (const r of relations) {
      expect(r.from).not.toBe(r.to);
      const k = `${r.from}|${r.to}|${r.kind}`; expect(keys.has(k)).toBe(false); keys.add(k);
      if (r.kind === "regression") expect(rank[by.get(r.to) as string]).toBeLessThan(rank[by.get(r.from) as string]);
      if (r.kind === "progression") expect(rank[by.get(r.to) as string]).toBeGreaterThan(rank[by.get(r.from) as string]);
    }
  });
  it("build is deterministic", () => { expect(JSON.stringify(build(rows))).toBe(JSON.stringify(build(parse(files).rows))); });
  it("detects duplicates and invalid rows", () => {
    const bad = parse([["x.txt", "@muscle=chest @pattern=push_horizontal @type=strength\nPress A | bb | i | triceps\npress á | bb | i |\nMalo | zz | i |\n"]]);
    expect(bad.errors.length).toBe(1);
    expect(build(bad.rows).errors.join()).toMatch(/duplicado/);
  });
});

describe("filters", () => {
  it("parses accents/injection characters and bad joints safely", () => {
    const f = parseFilters({ q: "  Sentadilla,(*)% ÁÉ ", avoid: ["knee", "x;drop"], page: "-4" });
    expect(f.q.split(/\s+/)).toEqual(["sentadilla", "ae"]);
    expect(f.avoid).toEqual(["knee"]); expect(f.page).toBe(1);
  });
  it("applies every filter and pagination", () => {
    const calls: unknown[][] = []; // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = new Proxy({}, { get: (_, m) => (...a: unknown[]) => { calls.push([m, ...a]); return q; } });
    applyFilters(q, parseFilters({ q: "press banca", muscle: "chest", equipment: "barbell", level: "beginner", pattern: "push_horizontal", goal: "strength", home: "1", mine: "1", avoid: ["shoulder", "elbow"], page: "3" }), "u1");
    const has = (m: string, ...a: unknown[]) => calls.some((c) => c[0] === m && a.every((x, i) => JSON.stringify(c[i + 1]) === JSON.stringify(x)));
    expect(has("ilike", "search_text", "%press%")).toBe(true); expect(has("ilike", "search_text", "%banca%")).toBe(true);
    expect(has("eq", "primary_muscle", "chest")).toBe(true); expect(has("eq", "owner_id", "u1")).toBe(true);
    expect(has("not", "joint_stress", "ov", "{shoulder,elbow}")).toBe(true); expect(has("contains", "goals", ["strength"])).toBe(true);
    expect(has("range", 2 * PAGE_SIZE, 3 * PAGE_SIZE - 1)).toBe(true);
  });
  it("slugify strips accents", () => expect(slugify("Sentadilla búlgara con mancuernas")).toBe("sentadilla-bulgara-con-mancuernas"));
});
