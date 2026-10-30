import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markAllRead } from "@/app/notifications-actions";

export async function NotificationsList({ supabase, userId, path }: { supabase: SupabaseClient; userId: string; path: string }) {
  const { data } = await supabase.from("notifications").select("id,title,body,link,created_at,read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <section className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Notificaciones</h1>{unread > 0 && <form action={markAllRead.bind(null, path)}><button className="text-sm text-[var(--accent)]">Marcar todas como leídas</button></form>}</div>
      {(data ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">No tienes notificaciones.</p> : (
        <ul className="space-y-2">{(data ?? []).map((n) => (
          <li key={n.id} className={`rounded-xl border p-4 text-sm ${n.read_at ? "border-[var(--border)]" : "border-[var(--accent)]/50"} bg-[var(--surface)]`}>
            <p className="font-semibold">{n.title}{!n.read_at && <span className="ml-2 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-black">nueva</span>}</p>
            {n.body && <p className="mt-1 text-[var(--muted)]">{n.body}</p>}
            <p className="mt-1 text-xs text-[var(--muted)]">{new Date(n.created_at).toLocaleString("es-CO")}{n.link && <> · <Link className="underline" href={n.link}>Abrir</Link></>}</p></li>))}</ul>)}</section>
  );
}
