import { describe, it, expect } from "vitest";
import { renewalEmail, trialEndingEmail } from "@/lib/billing/lifecycle-email";

const ends = new Date("2026-11-10T15:00:00Z");

describe("subscription e-mails (wording)", () => {
  it("the trial notice greets by first name, says how long is left, the date, the price and that nothing is charged automatically", () => {
    const m = trialEndingEmail("Camila", ends);
    expect(m.subject).toBe("Tu prueba gratuita de Rutinia termina en 2 días");
    expect(m.text).toContain("Hola Camila,");
    expect(m.text).toContain("Esperamos que estés disfrutando de nuestra plataforma");
    expect(m.text).toMatch(/10 de noviembre de 2026/); expect(m.text).toContain("$40.000 COP"); expect(m.text).toContain("ningún cobro automático");
    expect(m.link).toBe("/trainer/billing"); expect(m.footer).toContain("support@rutinia.company");
  });
  it("without a name it still reads naturally", () => expect(trialEndingEmail("", ends).text.startsWith("Hola,\n")).toBe(true));
  it("a manual-payment plan (Bold) says to renew before the date and that nothing is charged by itself", () => {
    const m = renewalEmail("Ana", ends, { provider: "wompi", status: "active" });
    expect(m.subject).toBe("Tu plan de Rutinia termina en 5 días"); expect(m.text).toContain("Renuévalo antes de esa fecha"); expect(m.text).toContain("No hay cobro automático");
  });
  it("a PayPal subscription says it renews by itself and how to stop it", () => {
    const m = renewalEmail("Ana", ends, { provider: "paypal", status: "active" });
    expect(m.subject).toBe("Tu plan de Rutinia se renueva en 5 días"); expect(m.text).toContain("se renovará automáticamente"); expect(m.text).toContain("cancélala desde Facturación");
  });
  it("a cancelled plan says it ends and will not renew", () => {
    const m = renewalEmail("Ana", ends, { provider: "paypal", status: "canceled" });
    expect(m.text).toContain("no se renovará"); expect(m.subject).toContain("termina");
  });
});
