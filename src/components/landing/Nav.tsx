"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "./Logo";

const LINKS = [["Cómo funciona", "#como-funciona"], ["Funciones", "#funciones"], ["Precios", "#precios"], ["Preguntas", "#preguntas"]] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 24); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${scrolled || open ? "bg-black/70 backdrop-blur-xl" : "bg-transparent"}`}>
      <nav aria-label="Principal" className="mx-auto flex h-[72px] w-full max-w-[1108px] items-center justify-between px-5 md:h-[80px]">
        <Link href="/" aria-label="Rutinia, inicio"><Logo /></Link>
        <ul className="hidden items-center gap-9 md:flex">
          {LINKS.map(([l, h]) => <li key={h}><a href={h} className="text-[16px] font-medium tracking-[-0.02em] text-white/90 transition-colors hover:text-[var(--accent)]">{l}</a></li>)}
        </ul>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="btn btn-secondary">Iniciar sesión <ArrowUpRight size={16} aria-hidden /></Link>
          <Link href="/signup" className="btn btn-primary">Empezar gratis <ArrowUpRight size={16} aria-hidden /></Link>
        </div>
        <button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] md:hidden" aria-expanded={open} aria-controls="menu-movil" aria-label={open ? "Cerrar menú" : "Abrir menú"} onClick={() => setOpen((o) => !o)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      {open && (
        <div id="menu-movil" className="mx-auto flex h-[calc(100dvh-72px)] max-w-[1108px] flex-col gap-2 px-5 pb-10 md:hidden">
          {LINKS.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)} className="border-b border-[var(--border)]/60 py-4 text-[24px] font-medium tracking-[-0.03em]">{l}</a>)}
          <div className="mt-6 flex flex-col gap-3"><Link href="/signup" className="btn btn-primary w-full">Empezar gratis <ArrowUpRight size={16} aria-hidden /></Link><Link href="/login" className="btn btn-secondary w-full">Iniciar sesión</Link></div>
        </div>)}
    </header>
  );
}
