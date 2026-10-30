import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { softwareApplicationLd } from "@/lib/seo-data";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/session";
import { Nav } from "@/components/landing/Nav";
import { RevealObserver } from "@/components/landing/RevealObserver";
import { Compare, Faq, FeatureGrid, Features, FinalCta, Footer, Hero, HowItWorks, Pricing, Principles } from "@/components/landing/Sections";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const { cuenta } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    redirect(homeFor(p?.role));
  }
  return (
    <div className="lp">
      <JsonLd data={softwareApplicationLd()} />
      <RevealObserver />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-black">Saltar al contenido</a>
      <Nav />
      {(cuenta === "eliminada" || cuenta === "cerrada") && <p role="status" className="fixed inset-x-0 top-[72px] z-40 mx-auto w-fit max-w-[90vw] rounded-full border border-[var(--accent)]/50 bg-black/80 px-5 py-2 text-sm backdrop-blur md:top-[84px]">{cuenta === "eliminada" ? "Tu cuenta y tus datos fueron eliminados." : "Tu cuenta fue cerrada. Se conserva solo el historial de pagos exigido por ley contable."}</p>}
      <main id="contenido">
        <Hero /><HowItWorks /><Features /><FeatureGrid /><Compare /><Principles /><Pricing /><Faq /><FinalCta />
      </main>
      <Footer />
    </div>
  );
}
