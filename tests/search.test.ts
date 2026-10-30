import { describe, it, expect } from "vitest";
import { parseFilters, stem } from "@/lib/exercises/filters";
import { relevance } from "@/lib/exercises/search";

describe("buscador de ejercicios: tolerancia", () => {
  it("el plural encuentra el singular, y «press» conserva su doble s", () => {
    expect(stem("mancuernas")).toBe("mancuerna"); expect(stem("sentadillas")).toBe("sentadilla"); expect(stem("press")).toBe("press"); expect(stem("pecho")).toBe("pecho");
  });
  it("la inclinación del banco solo acepta valores conocidos", () => {
    expect(parseFilters({ angle: "incline" }).angle).toBe("incline"); expect(parseFilters({ angle: "x;drop" }).angle).toBeUndefined();
  });
  it("ordena por relevancia: el nombre que empieza por la búsqueda va antes que el que solo la contiene", () => {
    const names = ["Remo con barra y press", "Press de banca plano con barra", "Press militar con barra"];
    const sorted = [...names].sort((a, b) => relevance(a, "press") - relevance(b, "press"));
    expect(sorted[2]).toBe("Remo con barra y press"); expect(sorted.slice(0, 2)).toContain("Press militar con barra");
  });
  it("sin acentos y sin importar mayúsculas", () => { expect(relevance("Sentadilla búlgara", "bulgara")).toBeLessThan(relevance("Zancada", "bulgara")); });
});
