import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

// Read at request time: the public address is runtime configuration, not something to bake into the build.
export const dynamic = "force-dynamic";

// Crawling is allowed for the public pages only. The signed-in areas and technical routes are closed to crawlers; the
// sign-in/recovery screens stay crawlable on purpose so their `noindex` can be seen (a blocked page can still be indexed by URL).
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin().origin;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/trainer/", "/client/", "/api/", "/auth/", "/invite/", "/staff/", "/billing/", "/offline"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
