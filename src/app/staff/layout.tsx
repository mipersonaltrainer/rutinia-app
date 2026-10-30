import { LayoutDashboard, LifeBuoy, LineChart, Megaphone, ServerCog, Users } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { NavLink } from "@/components/NavLink";
import { AppBar } from "@/components/shell/AppBar";
import { requireStaff } from "@/lib/support/staff";
import { signOut } from "@/app/actions";
import { RealtimeSync } from "@/components/messaging/RealtimeSync";
import { SupportAttention } from "@/components/staff/SupportAttention";
import { NOINDEX } from "@/lib/site";

export const metadata = { ...NOINDEX };   // the team's area never appears in search results

const NAV = [["/staff", "Resumen", LayoutDashboard], ["/staff/soporte", "Soporte", LifeBuoy], ["/staff/entrenadores", "Entrenadores", Users], ["/staff/ventas", "Ventas", LineChart], ["/staff/marketing", "Marketing", Megaphone], ["/staff/sistema", "Sistema", ServerCog]] as const;

/** The support panel: its own look (cool accent, wider sidebar) so nobody mistakes it for a trainer's workspace. Every page also checks access itself. */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId, name } = await requireStaff();
  const [{ data: { session } }, { data: rows }] = await Promise.all([
    supabase.auth.getSession(),   // identity verified by requireStaff; only the short-lived token is read, for the Realtime channel
    supabase.from("support_threads").select("staff_unread").gt("staff_unread", 0),
  ]);
  const waiting = (rows ?? []).length;
  const links = (<>{NAV.map(([href, label, Icon]) => (
    <NavLink key={href} href={href} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-2 text-white/80 transition-colors hover:bg-white/5 hover:text-white">
      <Icon size={16} aria-hidden className="shrink-0 text-[var(--accent)]" />{label}
      {href === "/staff/soporte" && waiting > 0 && <span className="ml-auto rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{waiting}</span>}
    </NavLink>))}</>);
  return (
    <div className="staff-theme min-h-dvh md:grid md:grid-cols-[250px_1fr]" style={{ ["--accent" as string]: "#5cc8ff" }}>
      <RealtimeSync role="staff" userId={userId} token={session?.access_token ?? null} />
      <SupportAttention waiting={waiting} />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-black">Saltar al contenido</a>
      <AppBar label="Panel de soporte">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--accent)]"><LifeBuoy size={13} aria-hidden /> Panel de soporte</p>
        <nav aria-label="Menú principal" className="flex flex-col gap-1 text-base">{links}</nav>
        <div className="mt-8 text-sm"><p className="truncate font-medium">{name}</p><p className="text-xs text-[var(--muted)]">Equipo de Rutinia</p><form action={signOut} className="mt-3"><button className="min-h-11 text-[var(--muted)] underline">Cerrar sesión</button></form></div>
      </AppBar>
      <aside className="hidden flex-col border-r border-[var(--border)] bg-[#080d12] p-5 md:flex md:min-h-dvh">
        <Logo className="h-7 w-auto self-start" />
        <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--accent)]"><LifeBuoy size={13} aria-hidden /> Panel de soporte</p>
        <nav aria-label="Principal" className="mt-6 flex flex-col gap-1 text-sm">{links}</nav>
        <div className="mt-auto pt-8 text-sm"><p className="truncate font-medium">{name}</p><p className="text-xs text-[var(--muted)]">Equipo de Rutinia</p>
          <form action={signOut} className="mt-3"><button className="text-[var(--muted)] underline">Cerrar sesión</button></form></div>
      </aside>
      <main id="contenido" className="p-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6 md:p-10"><div className="page-in">{children}</div></main>
    </div>
  );
}
