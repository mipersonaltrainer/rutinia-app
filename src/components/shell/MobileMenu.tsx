"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * The phone navigation of the signed-in areas: a button in the top bar that opens a side drawer. The links are server-rendered and
 * passed in as children. A navigation closes it with no effect needed (it is "open at this path"); Escape and the backdrop close it too;
 * the page behind does not scroll while it is open.
 */
export function MobileMenu({ label = "Menú", children }: { label?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenAt(null); button.current?.focus(); } };
    window.addEventListener("keydown", onKey); panel.current?.focus();
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <>
      <button ref={button} type="button" aria-expanded={open} aria-controls="menu-movil-app" aria-label={open ? "Cerrar menú" : label} onClick={() => setOpenAt(open ? null : pathname)} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)]">
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <button type="button" tabIndex={-1} aria-label="Cerrar menú" onClick={() => setOpenAt(null)} className="absolute inset-0 bg-black/60" />
          <div id="menu-movil-app" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
            onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpenAt(null); }}
            className="app-drawer absolute inset-y-0 right-0 w-[min(88vw,22rem)] overflow-y-auto overscroll-contain bg-[var(--surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] shadow-2xl outline-none">
            <div className="mb-4 flex items-center justify-between"><p className="text-sm font-semibold text-[var(--muted)]">{label}</p><button type="button" onClick={() => setOpenAt(null)} aria-label="Cerrar menú" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)]"><X size={20} aria-hidden /></button></div>
            {children}
          </div>
        </div>)}
    </>
  );
}
