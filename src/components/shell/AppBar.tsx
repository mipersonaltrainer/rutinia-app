import Link from "next/link";
import { Bell } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { MobileMenu } from "./MobileMenu";

/** Top bar for phones (hidden from `md` up, where each area keeps its sidebar/header). `bell` is the notifications link with its unread count. */
export function AppBar({ children, bell, label }: { children: React.ReactNode; bell?: { href: string; unread: number }; label?: string }) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
      <Logo className="h-6 w-auto" />
      <div className="flex items-center gap-2">
        {bell && <Link href={bell.href} aria-label={bell.unread > 0 ? `Notificaciones: ${bell.unread} sin leer` : "Notificaciones"} className="relative grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)]"><Bell size={19} aria-hidden />{bell.unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{bell.unread}</span>}</Link>}
        <MobileMenu label={label}>{children}</MobileMenu>
      </div>
    </header>
  );
}
