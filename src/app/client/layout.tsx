import { NavLink } from "@/components/NavLink";
import { AppBar } from "@/components/shell/AppBar";
import { Logo } from "@/components/landing/Logo";
import { requireUser } from "@/lib/session";
import { signOut } from "@/app/actions";
import { RealtimeSync } from "@/components/messaging/RealtimeSync";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { NOINDEX } from "@/lib/site";

export const metadata = { ...NOINDEX };   // signed-in areas never appear in search results

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireUser("client");
  const [{ data: { session } }, { count: unread }, { count: msgUnread }, { data: nutRel }] = await Promise.all([   // independent reads, issued together
    supabase.auth.getSession(),   // identity was just verified by requireUser; only the short-lived access token is read, for the Realtime channel
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", profile.id).is("read_at", null),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("client_id", profile.id).neq("sender_id", profile.id).is("read_at", null),
    supabase.from("trainer_client_relationships").select("nutrition_enabled").eq("client_id", profile.id).eq("status", "active").maybeSingle(),
  ]);
  const token = session?.access_token ?? null;
  const links = (<><NavLink href="/client">Inicio</NavLink><NavLink href="/client/plan">Mi plan</NavLink><NavLink href="/client/progress">Progreso</NavLink>{nutRel?.nutrition_enabled && <NavLink href="/client/nutrition">Nutrición</NavLink>}<NavLink href="/client/assessment">Evaluación</NavLink><NavLink href="/client/measurements">Medidas</NavLink><NavLink href="/client/photos">Fotos</NavLink><NavLink href="/client/messages">Mensajes{(msgUnread ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{msgUnread}</span>}</NavLink><NavLink href="/client/assistant">Asistente</NavLink><NavLink href="/client/privacy">Privacidad</NavLink><NavLink href="/client/notifications">Avisos{(unread ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{unread}</span>}</NavLink></>);
  return (
    <div className="min-h-dvh">
      <RealtimeSync role="client" userId={profile.id} token={token} />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-black">Saltar al contenido</a>
      <AppBar bell={{ href: "/client/notifications", unread: unread ?? 0 }}>
        <nav aria-label="Menú principal" className="flex flex-col gap-1 text-base">{links}</nav>
        <InstallPrompt />
        <form action={signOut} className="mt-6"><button className="min-h-11 text-[var(--muted)]">Cerrar sesión</button></form>
      </AppBar>
      <header className="hidden flex-wrap items-center gap-5 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm md:flex">
        <Logo className="h-6 w-auto" />
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-5">{links}</nav>
        <InstallPrompt />
        <form action={signOut} className="ml-auto"><button className="text-[var(--muted)]">Cerrar sesión</button></form>
      </header>
      <main id="contenido" className="mx-auto max-w-3xl p-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-5">{children}</main>
    </div>
  );
}
