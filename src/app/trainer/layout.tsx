import { NavLink } from "@/components/NavLink";
import { AppBar } from "@/components/shell/AppBar";
import { Logo } from "@/components/landing/Logo";
import { requireUser, trainerAccess } from "@/lib/session";
import { signOut } from "@/app/actions";
import { describeAccess } from "@/lib/billing/access-status";
import { TrialBanner } from "@/components/TrialBanner";
import { RealtimeSync } from "@/components/messaging/RealtimeSync";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NOINDEX } from "@/lib/site";

export const metadata = { ...NOINDEX };   // signed-in areas never appear in search results

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireUser("trainer");
  // Independent reads, issued together: they used to run one after another, each paying a round trip to the database on every navigation.
  const [{ data: { session } }, { allowed, sub }, { data: supportRows }, { count: unread }, hdrs] = await Promise.all([
    supabase.auth.getSession(),   // identity was just verified by requireUser; only the short-lived access token is read, for the Realtime channel
    trainerAccess(supabase, profile.id),
    supabase.from("support_threads").select("trainer_unread").eq("trainer_id", profile.id).gt("trainer_unread", 0),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", profile.id).is("read_at", null),
    headers(),
  ]);
  const token = session?.access_token ?? null;
  const supportUnread = (supportRows ?? []).reduce((n, r) => n + (r.trainer_unread as number), 0);
  const path = hdrs.get("x-pathname") ?? "";
  if (!allowed && !path.startsWith("/trainer/billing") && !path.startsWith("/trainer/support")) redirect("/trainer/billing");   // support stays reachable: a blocked workspace is when it is needed
  const links = (<><NavLink href="/trainer">Panel</NavLink>
          <NavLink href="/trainer/clients">Alumnos</NavLink>
          <NavLink href="/trainer/exercises">Ejercicios</NavLink>
          <NavLink href="/trainer/plans">Planes</NavLink>
          <NavLink href="/trainer/billing">Facturación</NavLink>
          <NavLink href="/trainer/notifications">Notificaciones{(unread ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{unread}</span>}</NavLink>
          <NavLink href="/trainer/support">Soporte{supportUnread > 0 && <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{supportUnread}</span>}</NavLink>
          <NavLink href="/trainer/account">Mi cuenta</NavLink></>);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <RealtimeSync role="trainer" userId={profile.id} token={token} />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-black">Saltar al contenido</a>
      <AppBar bell={{ href: "/trainer/notifications", unread: unread ?? 0 }}>
        <nav aria-label="Menú principal" className="flex flex-col gap-1 text-base">{links}</nav>
        <InstallPrompt />
        <form action={signOut} className="mt-6"><button className="min-h-11 text-[var(--muted)]">Cerrar sesión</button></form>
      </AppBar>
      <aside className="hidden border-r border-[var(--border)] bg-[var(--surface)] p-5 md:block">
        <p className="mb-6"><Logo className="h-7 w-auto" /></p>
        <nav aria-label="Principal" className="flex flex-col gap-4 text-sm">{links}</nav>
        <InstallPrompt />
        <form action={signOut} className="mt-6"><button className="text-sm text-[var(--muted)]">Cerrar sesión</button></form>
      </aside>
      <main id="contenido" className="p-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6 md:p-10">
        <TrialBanner status={describeAccess(sub)} onBillingPage={path.startsWith("/trainer/billing")} />
        {children}
      </main>
    </div>
  );
}
