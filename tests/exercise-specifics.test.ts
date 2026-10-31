import { describe, it, expect } from "vitest";
import { SPECIFICS } from "../data/exercises/specifics.mjs";
import generated from "../data/exercises.generated.json";

const items = generated.items as { slug: string; instructions: string[]; common_errors: string[]; safety_notes: string[]; source: string }[];
const bySlug = new Map(items.map((e) => [e.slug, e]));

describe("technique written for the most used exercises", () => {
  it("every one exists in the library and carries its own text, not the pattern's general guide", () => {
    for (const [slug, [steps, errors]] of Object.entries(SPECIFICS) as [string, [string[], string[], string[]]][]) {
      const e = bySlug.get(slug); expect(e, slug).toBeDefined();
      expect(e!.instructions, slug).toEqual(steps); expect(e!.common_errors, slug).toEqual(errors);
      expect(e!.source, slug).toMatch(/técnica específica/);
    }
  });
  it("has real content: 3+ steps, 2+ mistakes, and no two exercises share the same list of steps", () => {
    const seen = new Map<string, string>();
    for (const [slug, [steps, errors]] of Object.entries(SPECIFICS) as [string, [string[], string[], string[]]][]) {
      expect(steps.length, slug).toBeGreaterThanOrEqual(3); expect(errors.length, slug).toBeGreaterThanOrEqual(2);
      for (const s of steps) expect(s.length, `${slug}: "${s}"`).toBeGreaterThan(25);
      const key = JSON.stringify(steps); expect(seen.get(key), `${slug} has the same steps as ${seen.get(key)}`).toBeUndefined(); seen.set(key, slug);
    }
  });
});
