import Link from "next/link";
import { requireUser } from "@/lib/session";
import { capacitySummary } from "@/lib/billing/pricing";
import { agoEs, buildSummary, type DLog, type Status } from "@/lib/dashboard/summary";
import { WeeklyChart } from "@/components/dashboard/WeeklyChart";
import { CountUp } from "@/components/CountUp";

const card = "lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5";
const CHIP: Record<Status, { label: string; cls: string }> = {
  ok: { label: "Al día", cls: "bg-[var(--accent)]/15 text-[var(--accent)]" }, review: { label: "Revisar", cls: "bg-[var(--warn)]/20 text-[var(--warn)]" },
  inactive: { label: "Sin entrenar", cls: "bg-white/10 text-[var(--muted)]" }, no_plan: { label: "Sin plan", cls: "bg-white/10 text-[var(--muted)]" },
};
const SHORTCUTS = [{ href: "/trainer/clients", label: "Invitar alumno" }, { href: "/trainer/plans/new", label: "Nuevo plan" }, { href: "/trainer/exercises", label: "Ejercicios" }, { href: "/trainer/notifications", label: "Notificaciones" }];

export default async function TrainerHome() {
  const { supabase, profile } = await requireUser("trainer");
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 86400000).toISOString();
  const [{ data: rels }, { data: cap }, { data: plans }, { data: pend }, { data: notes }, { data: unread }] = await Promise.all([
    supabase.from("trainer_client_relationships").select("client_id, client:profiles!trainer_client_relationships_client_id_fkey(full_name)").eq("trainer_id", profile.id).eq("status", "active"),
    supabase.rpc("trainer_capacity", { t: profile.id }),
    supabase.from("training_plans").select("client_id, current_version_id").eq("trainer_id", profile.id).eq("is_template", false).not("current_version_id", "is", null).is("archived_at", null),
    supabase.from("coach_recommendations").select("client_id, severity").eq("status", "pending"),
    supabase.from("notifications").select("id,title,body,link,created_at").eq("user_id", profile.id).is("read_at", null).order("created_at", { ascending: false }).limit(4),
    supabase.from("messages").select("client_id").eq("trainer_id", profile.id).neq("sender_id", profile.id).is("read_at", null),
  ]);
  const clients = (rels ?? []).map((r) => ({ id: r.client_id as string, name: (r.client as unknown as { full_name: string } | null)?.full_name ?? "Alumno" }));
  const ids = clients.map((c) => c.id); const versionIds = (plans ?? []).map((p) => p.current_version_id as string);
  const [{ data: sess }, { data: logRows }] = await Promise.all([
    versionIds.length ? supabase.from("plan_sessions").select("version_id").in("version_id", versionIds) : Promise.resolve({ data: [] as { version_id: string }[] }),
    ids.length ? supabase.from("workout_logs").select("client_id,session_id,finished_at,pain_level,session_rpe, session:plan_sessions!workout_logs_session_id_fkey(name)").in("client_id", ids).eq("status", "completed").gte("finished_at", since).order("finished_at", { ascending: false }).limit(1500) : Promise.resolve({ data: [] }),
  ]);
  const sessionsPerVersion: Record<string, number> = {}; for (const s of sess ?? []) sessionsPerVersion[s.version_id] = (sessionsPerVersion[s.version_id] ?? 0) + 1;
  const logs: DLog[] = ((logRows ?? []) as unknown as { client_id: string; session_id: string; finished_at: string; pain_level: number | null; session_rpe: number | null; session: { name: string } | null }[]).map((l) => ({ client_id: l.client_id, session_id: l.session_id, session_name: l.session?.name ?? "Sesión", finished_at: l.finished_at, pain_level: l.pain_level, session_rpe: l.session_rpe }));
  const proClients = new Set((pend ?? []).filter((p) => p.severity === "professional").map((p) => p.client_id as string));
  const sum = buildSummary({ now, clients, plans: (plans ?? []).filter((p) => p.client_id).map((p) => ({ client_id: p.client_id as string, version_id: p.current_version_id as string })), sessionsPerVersion, logs, proRecommendationClients: proClients });
  const c = capacitySummary(clients.length, (cap ?? 20) - 20);
  const unreadBy = new Map<string, number>(); for (const m of unread ?? []) unreadBy.set(m.client_id as string, (unreadBy.get(m.client_id as string) ?? 0) + 1);
  const nameOf = new Map(clients.map((x) => [x.id, x.name])); const totalUnread = [...unreadBy.values()].reduce((a, b) => a + b, 0);
  const proCount = (pend ?? []).filter((p) => p.severity === "professional").length, pendCount = new Set((pend ?? []).map((p) => p.client_id)).size;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-3xl font-semibold">Hola, {profile.full_name}</h1><p className="text-sm text-[var(--muted)]"><CountUp value={c.activeClients} /> de <CountUp value={c.totalCapacity} /> cupos en uso · <CountUp value={c.remaining} /> libres</p></div>

      <div className="stagger grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div className={`${card} bg-black`}>
          <p className="text-xs text-[var(--muted)]">Hoy</p>
          <p className="mt-1 text-xl font-semibold">{sum.today.count === 0 ? "Aún nadie ha entrenado hoy" : `${sum.today.count} ${sum.today.count === 1 ? "sesión completada" : "sesiones completadas"} hoy`}</p>
          {sum.today.recent.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Cuando tus alumnos terminen entrenamientos, los verás aquí.</p> : (
            <ul className="stagger mt-3 space-y-2 text-sm">{sum.today.recent.map((r, i) => <li key={i} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate"><b>{r.client}</b> <span className="text-[var(--muted)]">{r.session}</span></span><span className="shrink-0 text-xs text-[var(--accent)]">{agoEs(r.at, now)}</span></li>)}</ul>)}
        </div>
        <div className={card}>
          <h2 className="sr-only">Atajos</h2>
          <div className="grid h-full grid-cols-2 gap-3">{SHORTCUTS.map((s) => <Link key={s.href} href={s.href} className="grid min-h-16 place-items-center rounded-xl bg-[var(--surface-2)] px-2 py-3 text-center text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] border border-transparent">{s.label}</Link>)}</div>
        </div>
        <div className={card}>
          <h2 className="font-semibold">Adherencia semanal</h2>
          {sum.adherence.pct === null ? <p className="mt-3 text-sm text-[var(--muted)]">Aparece cuando tus alumnos tengan un plan publicado.</p> : (<>
            <p className="mt-2 text-5xl font-semibold tracking-tight"><CountUp value={sum.adherence.pct} suffix="%" /></p>
            <p className="text-sm text-[var(--muted)]">{sum.adherence.completed} de {sum.adherence.planned} sesiones de esta semana</p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={sum.adherence.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Adherencia semanal"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${sum.adherence.pct}%` }} /></div></>)}
        </div>
      </div>

      <div className="stagger grid gap-4 lg:grid-cols-[1.1fr_1.2fr_1fr]">
        <div className={card}>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Alumnos</h2><Link href="/trainer/clients" className="text-xs text-[var(--accent)]">Ver todos</Link></div>
          {sum.clients.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Aún no tienes alumnos activos. <Link className="underline" href="/trainer/clients">Invita al primero</Link>.</p> : (
            <ul className="stagger mt-3 divide-y divide-[var(--border)] text-sm">{sum.clients.slice(0, 8).map((cl) => <li key={cl.id}><Link href={`/trainer/clients/${cl.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-[var(--accent)]"><span className="min-w-0"><span className="block truncate">{cl.name}</span>{cl.planned > 0 && <span className="text-xs text-[var(--muted)]">{cl.done}/{cl.planned} esta semana</span>}</span><span title={cl.reason} className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${CHIP[cl.status].cls}`}>{CHIP[cl.status].label}</span></Link></li>)}</ul>)}
          {sum.clients.length > 8 && <p className="mt-2 text-xs text-[var(--muted)]">y {sum.clients.length - 8} más</p>}
        </div>
        <div className={card}>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Sesiones completadas</h2><span className="text-xs text-[var(--muted)]">últimas 8 semanas</span></div>
          <div className="mt-3"><WeeklyChart data={sum.weekly} /></div>
        </div>
        <div className="space-y-4">
          <div className={card}>
            <h2 className="font-semibold">Alertas</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {proCount > 0 && <li className="rounded-xl bg-[var(--warn)]/15 p-3 text-[var(--warn)]">{proCount} propuesta{proCount === 1 ? "" : "s"} de progresión requiere{proCount === 1 ? "" : "n"} atención profesional</li>}
              {pendCount > 0 && <li className="rounded-xl bg-[var(--surface-2)] p-3">{pendCount} alumno{pendCount === 1 ? " tiene" : "s tienen"} propuestas de progresión pendientes</li>}
              {(notes ?? []).map((n) => <li key={n.id}><Link href={n.link ?? "/trainer/notifications"} className="block rounded-xl bg-[var(--surface-2)] p-3 hover:text-[var(--accent)]"><span className="font-medium">{n.title}</span>{n.body && <span className="block text-xs text-[var(--muted)]">{n.body}</span>}</Link></li>)}
              {proCount === 0 && pendCount === 0 && (notes ?? []).length === 0 && <li className="text-[var(--muted)]">Sin alertas. Todo en orden.</li>}
            </ul>
          </div>
          <div className={card}>
            <h2 className="font-semibold">Mensajes sin leer {totalUnread > 0 && <span className="ml-1 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{totalUnread}</span>}</h2>
            {totalUnread === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">Nada pendiente.</p> : <ul className="mt-2 space-y-1.5 text-sm">{[...unreadBy.entries()].slice(0, 5).map(([cid, n]) => <li key={cid}><Link className="flex justify-between hover:text-[var(--accent)]" href={`/trainer/clients/${cid}/messages`}><span>{nameOf.get(cid) ?? "Alumno"}</span><span className="text-[var(--muted)]">{n}</span></Link></li>)}</ul>}
          </div>
        </div>
      </div>
    </section>
  );
}
