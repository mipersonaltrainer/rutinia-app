import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LoadChart } from "./LoadChart";
import { localDate, compareSessions, completionPct, detectPRs, epley1RM, summarizeSets, weekBounds, weeklyAdherence, workoutAlerts, type HistorySession, type SetRow } from "@/lib/training/metrics";

const currentTime = () => Date.now();

type Log = { id: string; session_id: string; status: string; started_at: string; finished_at: string | null; session_rpe: number | null; pain_level: number | null; pain_notes: string | null; planned_sets: number | null; logged_work_sets: number | null; session: { name: string } | null };

export async function ProgressPanel({ supabase, clientId, ex, basePath, audience }: { supabase: SupabaseClient; clientId: string; ex?: string; basePath: string; audience: "client" | "trainer" }) {
  const { data: plans } = await supabase.from("training_plans").select("current_version_id").eq("client_id", clientId).not("current_version_id", "is", null);
  const versionIds = (plans ?? []).map((p) => p.current_version_id as string);
  const { count: perWeek } = versionIds.length ? await supabase.from("plan_sessions").select("id", { count: "exact", head: true }).in("version_id", versionIds) : { count: 0 };
  const { data: logsRaw } = await supabase.from("workout_logs").select("id,session_id,status,started_at,finished_at,session_rpe,pain_level,pain_notes,planned_sets,logged_work_sets, session:plan_sessions!workout_logs_session_id_fkey(name)").eq("client_id", clientId).neq("status", "in_progress").order("started_at", { ascending: false }).limit(100);
  const logs = (logsRaw ?? []) as unknown as Log[];
  const logIds = logs.map((l) => l.id);
  const { data: discAll } = logIds.length ? await supabase.from("exercise_discomforts").select("log_id,exercise_id,severity,area").in("log_id", logIds.slice(0, 30)) : { data: [] };
  const weeks = Array.from({ length: 6 }, (_, i) => { const ref = new Date(currentTime() - i * 7 * 86400000); return { start: weekBounds(ref).start, ...weeklyAdherence(perWeek ?? 0, logs, ref) }; });

  const { data: logged } = logIds.length ? await supabase.from("logged_sets").select("exercise_id, exercise:exercises(name_es)").in("log_id", logIds.slice(0, 60)) : { data: [] };
  const exMap = new Map<string, string>(); for (const r of (logged ?? []) as unknown as { exercise_id: string; exercise: { name_es: string } }[]) exMap.set(r.exercise_id, r.exercise.name_es);
  const selected = ex && exMap.has(ex) ? ex : [...exMap.keys()][0];

  let sessions: HistorySession[] = []; let prs: ReturnType<typeof detectPRs> = [];
  if (selected) {
    const { data: s } = await supabase.from("logged_sets").select("log_id,kind,reps,load_kg,duration_sec,rpe").eq("exercise_id", selected).in("log_id", logIds.filter((id) => logs.find((l) => l.id === id)?.status === "completed"));
    const { data: d } = await supabase.from("exercise_discomforts").select("log_id,severity").eq("exercise_id", selected).in("log_id", logIds);
    sessions = logs.filter((l) => l.status === "completed" && (s ?? []).some((x) => x.log_id === l.id)).map((l) => ({
      date: localDate(l.started_at), sets: (s ?? []).filter((x) => x.log_id === l.id) as SetRow[], sessionRpe: l.session_rpe, pain: l.pain_level, discomfortSeverity: (d ?? []).find((x) => x.log_id === l.id)?.severity ?? null,
    })).sort((a, b) => a.date.localeCompare(b.date));
    prs = detectPRs(sessions);
  }
  const chart = sessions.map((s) => { const sm = summarizeSets(s.sets); return { date: s.date, topLoad: sm.topSet?.load_kg ?? null, e1rm: Math.max(0, ...s.sets.map((x) => epley1RM(x.load_kg, x.reps) ?? 0)) || null }; });
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  const done = logs.filter((l) => l.status === "completed");
  const avgRpe = done.filter((l) => l.session_rpe).length ? Math.round((done.reduce((a, l) => a + (l.session_rpe ?? 0), 0) / done.filter((l) => l.session_rpe).length) * 10) / 10 : null;
  const prsByDate = new Set(prs.map((p) => p.date));

  return (
    <div className="space-y-6">
      <div className={card}><h2 className="mb-3 font-semibold">Adherencia semanal</h2>
        {perWeek ? (<ul className="space-y-1 text-sm">{weeks.map((w) => <li key={w.start.toISOString()} className="flex items-center gap-3"><span className="w-28 text-[var(--muted)]">Sem. {w.start.toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" })}</span>
          <span className="h-2 flex-1 rounded bg-[var(--surface-2)]"><span className="block h-2 rounded bg-[var(--accent)]" style={{ width: `${w.pct ?? 0}%` }} /></span><span className="w-24 text-right">{w.completed}/{w.scheduled} sesiones</span></li>)}</ul>) : <p className="text-sm text-[var(--muted)]">Sin plan vigente: no hay adherencia que calcular.</p>}
        <p className="mt-3 text-xs text-[var(--muted)]">Adherencia = sesiones distintas completadas ÷ sesiones del plan por semana (semana lunes–domingo, hora de Colombia). Una sesión incompleta cuenta como completada si el alumno la finalizó.</p></div>
      <div className="grid gap-3 sm:grid-cols-3 text-sm"><div className={card}><p className="text-[var(--muted)]">Sesiones completadas</p><p className="text-3xl font-semibold">{done.length}</p></div>
        <div className={card}><p className="text-[var(--muted)]">Esfuerzo medio de sesión</p><p className="text-3xl font-semibold">{avgRpe ?? "—"}</p></div>
        <div className={card}><p className="text-[var(--muted)]">Abandonadas</p><p className="text-3xl font-semibold">{logs.filter((l) => l.status === "abandoned").length}</p></div></div>

      <div className={card}><h2 className="mb-3 font-semibold">Sesiones recientes</h2>
        {logs.length === 0 ? <p className="text-sm text-[var(--muted)]">Aún no hay entrenamientos registrados.</p> : (
          <ul className="divide-y divide-[var(--border)] text-sm">{logs.slice(0, 10).map((l) => {
            const a = workoutAlerts({ pain_level: l.pain_level, session_rpe: l.session_rpe }, (discAll ?? []).filter((d) => d.log_id === l.id));
            return (<li key={l.id} className="py-2"><div className="flex flex-wrap justify-between gap-2"><Link className="underline" href={audience === "client" ? `/client/workout/${l.id}` : "#"}>{l.session?.name} · {new Date(l.started_at).toLocaleDateString("es-CO")}</Link>
              <span className="text-[var(--muted)]">{l.status === "abandoned" ? "abandonada" : `${l.logged_work_sets}/${l.planned_sets} series (${completionPct(l.planned_sets ?? 0, l.logged_work_sets ?? 0)}%) · esfuerzo ${l.session_rpe ?? "—"} · dolor ${l.pain_level ?? "—"}`}</span></div>
              {audience === "trainer" && a.professional.map((m) => <p key={m} className="mt-1 text-xs text-[var(--warn)]">⚠ Requiere atención profesional: {m}{l.pain_notes ? ` (${l.pain_notes})` : ""}</p>)}
              {audience === "trainer" && a.admin.map((m) => <p key={m} className="mt-1 text-xs text-[var(--muted)]">Recordatorio: {m}</p>)}</li>); })}</ul>)}</div>

      <div className={card}><h2 className="mb-3 font-semibold">Historial de cargas por ejercicio</h2>
        {exMap.size === 0 ? <p className="text-sm text-[var(--muted)]">Registra series para ver tu progresión.</p> : (<>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">{[...exMap.entries()].map(([id, name]) => <Link key={id} href={`${basePath}?ex=${id}`} className={`rounded-full border px-3 py-1 ${id === selected ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"}`}>{name}</Link>)}</div>
          <LoadChart data={chart} />
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[var(--muted)]"><tr><th className="py-1">Fecha</th><th>Series</th><th>Mejor serie</th><th>Volumen</th><th>vs. anterior</th></tr></thead>
            <tbody>{[...sessions].reverse().map((s, i, arr) => { const sm = summarizeSets(s.sets); const prev = arr[i + 1]; const c = prev ? compareSessions(prev, s) : null;
              return (<tr key={s.date + i} className="border-t border-[var(--border)] align-top"><td className="py-1">{s.date}{prsByDate.has(s.date) && <span className="ml-2 rounded bg-[var(--accent)] px-1.5 text-xs font-semibold text-black">PR</span>}</td><td>{sm.workSets}</td><td>{sm.topSet ? `${sm.topSet.reps}×${sm.topSet.load_kg} kg` : "—"}</td><td>{sm.volumeKg} kg</td>
                <td className="text-xs">{c ? <>{c.volumeDeltaPct !== null ? `${c.volumeDeltaPct > 0 ? "+" : ""}${c.volumeDeltaPct}% vol.` : "—"}{c.cautions.map((m) => <span key={m} className="block text-[var(--warn)]">⚠ {m}: no se considera mejora</span>)}</> : "—"}</td></tr>); })}</tbody></table></div>
          <p className="mt-3 text-xs text-[var(--muted)]">Récords: carga máxima y 1RM estimado (Epley, 1–12 repeticiones) con series de trabajo; las sesiones con molestia ≥ 6/10 en ese ejercicio no generan récord. Más volumen no se interpreta como mejora si subieron el esfuerzo, el dolor o las molestias.</p></>)}
      </div>
    </div>
  );
}
