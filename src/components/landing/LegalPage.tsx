import Link from "next/link";
import { Logo } from "./Logo";
import { LEGAL, LEGAL_DOCS } from "@/lib/legal";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="lp min-h-dvh">
      <header className="mx-auto flex h-[80px] max-w-[1108px] items-center justify-between px-5"><Link href="/" aria-label="Rutinia, inicio"><Logo /></Link><Link href="/signup" className="btn btn-primary">Empezar gratis</Link></header>
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-10">
        <h1 className="lp-h2">{title}</h1>
        <p className="lp-muted mt-2 text-[14px]">Versión {LEGAL.version} · Última actualización: {updated}</p>
        <div className="mt-8 space-y-8 text-[16px] leading-7 text-white/80 [&_h2]:mb-2 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.03em] [&_h2]:text-white [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:underline [&_table]:w-full [&_table]:text-[14px] [&_td]:border-t [&_td]:border-white/15 [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-left [&_th]:text-white">{children}</div>
        <nav aria-label="Otros documentos legales" className="mt-12 border-t border-white/15 pt-6 text-[14px]">
          <p className="lp-muted">¿Dudas sobre este documento? Escríbenos a <a className="inline-flex min-h-11 items-center underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p>
          <ul className="mt-1 flex flex-wrap gap-x-6">{LEGAL_DOCS.map((d) => <li key={d.href}><Link className="inline-flex min-h-11 items-center underline" href={d.href}>{d.label}</Link></li>)}</ul>
        </nav>
      </main>
    </div>
  );
}
