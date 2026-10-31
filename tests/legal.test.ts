import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AI_PACKS, BASE_PRICE_COP_CENTS, BASE_PRICE_CENTS, COP_SLOT_TIERS, INCLUDED_CLIENTS, SLOT_UNIT_PRICE_CENTS } from "@/lib/billing/pricing";
import { LEGAL } from "@/lib/legal";

const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const pages = { terminos: read("src/app/terminos/page.tsx"), privacidad: read("src/app/privacidad/page.tsx"), cookies: read("src/app/cookies/page.tsx") };
const cop = (cents: number) => `$${(cents / 100).toLocaleString("es-CO")}`.replace(/,/g, ".");

describe("legal pages", () => {
  it("have no drafts, placeholders or personal identifiers left in them", () => {
    for (const [name, text] of Object.entries(pages)) {
      expect(text, name).not.toMatch(/por completar|por definir|\[Completar|\[Cl[aá]usulas|\[Pol[ií]tica|\[Raz[oó]n|\[Canal|borrador informativo|asesor[ií]a legal/i);
      expect(text, name).not.toMatch(/\bNIT\b|\bc[eé]dula\b|\bC\.?C\.?\s?\d/i);
    }
  });
  it("name the brand and the contact e-mail, and the e-mail is the one the platform really uses", () => {
    expect(LEGAL.brand).toBe("Rutinia");
    expect(LEGAL.email).toBe("support@rutinia.company");
    for (const [name, text] of Object.entries(pages)) expect(text, name).toContain("LEGAL.email");
  });
  it("the privacy policy covers what Colombian law asks of it", () => {
    const t = pages.privacidad;
    for (const must of ["Ley 1581 de 2012", "Decreto 1074 de 2015", "Superintendencia de Industria y Comercio", "10 días hábiles", "15 días hábiles", "datos sensibles", "No estás obligado", "Estados Unidos", "No vendemos", "Revocar la autorización"]) expect(t, must).toContain(must);
  });
  it("the terms state the prices the code really charges", () => {
    const t = pages.terminos;
    expect(t).toContain(cop(BASE_PRICE_COP_CENTS));                                           // $40.000
    expect(t).toContain(`USD ${(BASE_PRICE_CENTS / 100).toFixed(2)}`);                            // USD 10.00
    expect(t).toContain(`hasta ${INCLUDED_CLIENTS} alumnos`);
    expect(t).toContain(`USD ${(SLOT_UNIT_PRICE_CENTS / 100).toFixed(2)}`);                       // USD 0.75
    for (const tier of COP_SLOT_TIERS) expect(t, `tier ${tier.upTo}`).toContain(cop(tier.unitCents));
    for (const pack of Object.values(AI_PACKS)) { expect(t, pack.id).toContain(`de ${pack.credits}`); expect(t, pack.id).toContain(cop(pack.cents.COP)); expect(t, pack.id).toContain(`USD ${(pack.cents.USD / 100).toFixed(2)}`); }
  });
  it("every legal document links to the other two", () => {
    expect(read("src/lib/legal.ts")).toMatch(/\/terminos[\s\S]*\/privacidad[\s\S]*\/cookies/);
  });
});
