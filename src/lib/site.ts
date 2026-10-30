// Public identity of the site. One place, so the sitemap, robots, canonical URLs, Open Graph and structured data cannot disagree.
export const SITE_NAME = "Rutinia";
export const SITE_TAGLINE = "Evolución en cada repetición";
export const SITE_TITLE = "Rutinia — Software para entrenadores personales";
export const SITE_DESCRIPTION = "Evolución en cada repetición. Evalúa, planifica, registra y mide el progreso de tus alumnos en un solo lugar. Prueba gratis 7 días.";
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Rutinia: software para entrenadores personales" } as const;

/** Public origin (configured by the operator; docs/DEPLOY.md). Falls back to localhost only outside production. */
export function siteOrigin(env: Record<string, string | undefined> = process.env): URL {
  const raw = env.APPLICATION_BASE_URL?.trim();
  try { if (raw) return new URL(raw); } catch { /* fall through to the default */ }
  return new URL("http://localhost:3000");
}

/** Pages that belong in search results (and the sitemap): public, indexable, no user data. */
export const PUBLIC_PAGES = ["/", "/signup", "/privacidad", "/terminos"] as const;

/** Where trainers write for help (also answered inside the platform: /trainer/support). */
export const SUPPORT_EMAIL = "support@rutinia.company";

export const NOINDEX = { robots: { index: false, follow: false } } as const;
