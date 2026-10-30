import Link from "next/link";
import { Logo } from "./Logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="lp min-h-dvh">
      <header className="mx-auto flex h-[80px] max-w-[1108px] items-center justify-between px-5"><Link href="/" aria-label="Rutinia, inicio"><Logo /></Link><Link href="/signup" className="btn btn-primary">Empezar gratis</Link></header>
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-10">
        <h1 className="lp-h2">{title}</h1>
        <p className="lp-muted mt-2 text-[14px]">Última actualización: {updated}</p>
        <p role="note" className="mt-6 rounded-xl border border-[var(--warn)]/60 p-4 text-[14px] leading-6">Borrador informativo: este texto describe cómo funciona el producto hoy y <b>debe ser revisado por un abogado</b> y completado con los datos del responsable antes del lanzamiento comercial.</p>
        <div className="mt-8 space-y-8 text-[16px] leading-7 text-white/80 [&_h2]:mb-2 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.03em] [&_h2]:text-white [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-6">{children}</div>
      </main>
    </div>
  );
}
