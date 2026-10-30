import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Faq, FeatureGrid, Features, Hero, HowItWorks, Pricing } from "@/components/landing/Sections";
import { BASE_PRICE_CENTS, INCLUDED_CLIENTS, MAX_SLOTS_PER_PURCHASE } from "@/lib/billing/pricing";

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const all = () => [Hero, HowItWorks, Features, FeatureGrid, Pricing, Faq].map((C) => text(<C />)).join(" ");

describe("landing copy stays true to the product", () => {
  it("prices and limits shown come from the billing constants", () => {
    const t = text(<Pricing />);
    expect(t).toContain("$40.000"); expect(t).toContain(`$${BASE_PRICE_CENTS / 100}.00 USD`); expect(t).toContain("$2.000"); expect(t).toContain("USD 0.75"); expect(t).toMatch(/3 borradores gratis/); expect(t).toContain("$25.000"); expect(t).toContain("$100.000");
    expect(t).toContain(`hasta ${INCLUDED_CLIENTS} alumnos`); expect(t).toContain(`1 a ${MAX_SLOTS_PER_PURCHASE} cupos`);
    expect(t).toMatch(/pago único/i); expect(t).toMatch(/7 días/);
  });
  it("the exercise-library claim ('más de 600') is true", () => {
    const { items } = JSON.parse(readFileSync(join(__dirname, "../data/exercises.generated.json"), "utf8"));
    expect(all()).toContain("más de 600 ejercicios"); expect(items.length).toBeGreaterThan(600);
  });
  it("contains no invented social proof, guarantees or health promises", () => {
    const t = all().toLowerCase();
    for (const bad of ["+ usuarios", "k+", "testimonio", "garantizado", "resultados garantizados", "certificado por", "#1", "mejor del mercado", "diagnostic"]) {
      if (bad === "diagnostic") continue;
      expect(t).not.toContain(bad);
    }
    expect(t).toContain("no diagnostica");
  });
  it("every in-page anchor used by the nav exists", () => {
    const html = [Hero, HowItWorks, Features, FeatureGrid, Pricing, Faq].map((C) => renderToStaticMarkup(<C />)).join("");
    for (const id of ["como-funciona", "funciones", "precios", "preguntas"]) if (id !== "funciones" || html.includes('id="funciones"')) expect(html).toContain(`id="${id}"`);
  });
});
