import { BASE_PRICE_COP_CENTS, INCLUDED_CLIENTS } from "@/lib/billing/pricing";
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/site";

/**
 * schema.org SoftwareApplication for the landing page. Only facts that the page itself states: name, what it is, the price
 * and the trial. No ratings or reviews (there are none), no invented features.
 */
export function softwareApplicationLd(env: Record<string, string | undefined> = process.env): Record<string, unknown> {
  const origin = siteOrigin(env).origin;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: origin,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "es-CO",
    offers: {
      "@type": "Offer",
      price: (BASE_PRICE_COP_CENTS / 100).toFixed(2),
      priceCurrency: "COP",
      description: `Suscripción mensual con hasta ${INCLUDED_CLIENTS} alumnos activos incluidos y 7 días de prueba gratis.`,
      url: `${origin}/signup`,
    },
  };
}
