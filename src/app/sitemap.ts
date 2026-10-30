import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

// Only pages that exist, are public and are meant to be found. No `lastModified`: nothing here tracks real edit dates, and an
// invented date teaches crawlers to ignore the field.
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin().origin;
  return PUBLIC_PAGES.map((p) => ({ url: `${origin}${p}` }));
}
