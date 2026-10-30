import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });

describe("PostgREST embeds that are ambiguous because of mutual foreign keys", () => {
  // training_plans <-> plan_versions has TWO relationships (plan_id and current_version_id): an unqualified embed fails at runtime with PGRST201.
  it("training_plans queries always name the plan_versions relationship", () => {
    const bad: string[] = [];
    for (const f of walk(join(__dirname, "../src"))) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/from\("training_plans"\)\.select\(([\s\S]*?)\)(?:\.|;|\s*\))/g)) if (/(?<![!\w])plan_versions\(/.test(m[1])) bad.push(`${f}: ${m[1].slice(0, 60)}`);
    }
    expect(bad).toEqual([]);
  });
});
