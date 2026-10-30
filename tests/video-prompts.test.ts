import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildPrompt, MANNEQUIN } from "../scripts/build-video-prompts.mjs";

const { items } = JSON.parse(readFileSync("data/exercises.generated.json", "utf8")) as { items: Record<string, unknown>[] };

describe("prompts de video de ejercicios", () => {
  const all = items.map((it) => ({ it, ...(buildPrompt(it) as { prompt: string }) }));
  it("hay un prompt distinto por cada ejercicio", () => { expect(all.length).toBeGreaterThan(640); expect(new Set(all.map((a) => a.prompt)).size).toBe(all.length); });
  it("todos describen el mismo maniquí gris sin rostro, cámara fija, 5 s y sin texto", () => {
    for (const { prompt, it } of all) {
      expect(prompt.toLowerCase(), String(it.slug)).toContain(MANNEQUIN.toLowerCase()); expect(prompt).toMatch(/faceless/); expect(prompt).toMatch(/matte-gray/); expect(prompt).toMatch(/5 seconds/); expect(prompt).toMatch(/Fixed locked-off camera/); expect(prompt).toMatch(/no text/);
      expect(prompt.length).toBeLessThan(1500);
    }
  });
  it("menciona el equipo real y la inclinación del banco", () => {
    const p = (slug: string) => all.find((a) => a.it.slug === slug)!.prompt;
    expect(p("press-de-banca-inclinado-con-barra")).toMatch(/30–45 degrees/); expect(p("press-de-banca-declinado-con-barra")).toMatch(/decline bench/);
    expect(p("press-plano-con-mancuernas")).toMatch(/horizontal bench/); expect(p("press-plano-con-mancuernas")).toMatch(/dumbbell/);
    expect(p("flexiones-estandar")).toMatch(/No equipment/);
  });
});
