import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { exerciseFrames, figureFor } from "@/lib/exercises/frames";
import { FRAME_SLUGS } from "@/lib/exercises/frame-slugs";

const exercises = JSON.parse(readFileSync("data/exercises.generated.json", "utf8")).items as { slug: string }[];

describe("exercise mannequin images", () => {
  it("men get the male figure, women the female one, and anyone who did not say the male one", () => {
    expect(figureFor("male")).toBe("male"); expect(figureFor("female")).toBe("female");
    expect(figureFor("unspecified")).toBe("male"); expect(figureFor(null)).toBe("male"); expect(figureFor(undefined)).toBe("male");
  });
  it("gives start, middle and end images, per figure", () => {
    expect(exerciseFrames("curl-martillo", "female")).toEqual([1, 2, 3].map((n) => `/exercise-media/female/curl-martillo/${n}.webp`));
    expect(exerciseFrames("curl-martillo", "male")![0]).toContain("/male/");
  });
  it("an exercise without images (or no slug) returns null instead of a broken link", () => {
    expect(exerciseFrames("no-existe", "male")).toBeNull(); expect(exerciseFrames(null, "male")).toBeNull(); expect(exerciseFrames(undefined, "female")).toBeNull();
  });
  it("every listed exercise is in the library and has all six files on disk", () => {
    const lib = new Set(exercises.map((e) => e.slug));
    expect(FRAME_SLUGS.size).toBeGreaterThanOrEqual(49);
    for (const slug of FRAME_SLUGS) {
      expect(lib.has(slug), `${slug} is not in the exercise library`).toBe(true);
      for (const sex of ["male", "female"] as const) for (const u of exerciseFrames(slug, sex)!) expect(existsSync(`public${u}`), u).toBe(true);
    }
  });
});
