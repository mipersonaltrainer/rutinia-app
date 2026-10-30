import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { ExerciseSets, type Saved } from "@/components/workout/ExerciseSets";
import { RestTimer } from "@/components/workout/RestTimer";
import { ExerciseVideo } from "@/components/ExerciseVideo";
import { describePrescription } from "@/lib/plans/prescription";
import { completionPct, summarizeSets, workoutAlerts } from "@/lib/training/metrics";
import { JOINT_LABEL } from "@/lib/exercises/labels";
import { abandonWorkout, finishWorkout, saveDiscomfort } from "../actions";

type PE = { id: string; position: number; exercise_id: string; sets: number; warmup_sets: number; reps_min: number | null; reps_max: number | null; duration_sec: number | null; load_kg: number | null; rest_sec: number | null; rpe: number | null; rir: number | null; tempo: string | null; client_notes: string | null; exercise: { name_es: string; instructions: string[]; safety_notes: string[]; video_path: string | null } };

export default async function Workout({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser("client");
  const { data: log } = await supabase.from("workout_logs").select("*, session:plan_sessions!workout_logs_session_id_fkey(name, warmup_notes, prescribed_exercises(id,position,exercise_id,sets,warmup_sets,reps_min,reps_max,duration_sec,load_kg,rest_sec,rpe,rir,tempo,client_notes, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es,instructions,safety_notes,video_path)))").eq("id", id).eq("client_id", profile.id).maybeSingle();
  if (!log) notFound();
  const pes = ([...(log.session.prescribed_exercises as PE[])]).sort((a, b) => a.position - b.position);
  const exIds = pes.map((p) => p.exercise_id);
  const [{ data: sets }, { data: disc }, { data: prevLogs }] = await Promise.all([
    supabase.from("logged_sets").select("prescribed_exercise_id,exercise_id,kind,set_number,reps,load_kg,duration_sec,rpe").eq("log_id", id),
    supabase.from("exercise_discomforts").select("exercise_id,severity,area,note").eq("log_id", id),
    supabase.from("workout_logs").select("id,started_at,session_rpe,pain_level").eq("client_id", profile.id).eq("status", "completed").neq("id", id).order("started_at", { ascending: false }).limit(30),
  ]);
  const prevIds = (prevLogs ?? []).map((l) => l.id);
  const { data: prevSets } = prevIds.length ? await supabase.from("logged_sets").select("log_id,exercise_id,kind,reps,load_kg").in("exercise_id", exIds).in("log_id", prevIds) : { data: [] };
  const lastFor = (exId: string) => { const l = (prevLogs ?? []).find((x) => (prevSets ?? []).some((s) => s.log_id === x.id && s.exercise_id === exId)); return l ? { log: l, sets: (prevSets ?? []).filter((s) => s.log_id === l.id && s.exercise_id === exId) } : null; };
  const open = log.status === "in_progress";
  const workDone = (sets ?? []).filter((s) => s.kind === "work").length;
  const planned = log.planned_sets ?? 0;

  if (!open) {
    const all = (sets ?? []).map((s) => ({ kind: s.kind as "work" | "warmup", reps: s.reps, load_kg: s.load_kg }));
    const sum = summarizeSets(all);
    const alerts = workoutAlerts({ pain_level: log.pain_level, session_rpe: log.session_rpe }, disc ?? []);
    return (
      <section className="space-y-4"><h1 className="text-2xl font-semibold">{log.session.name}</h1>
        <p className="text-sm text-[var(--muted)]">{log.status === "completed" ? "Completado" : "Abandonado"} · {new Date(log.started_at).toLocaleString("es-CO")}</p>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm space-y-1">
          <p>Series realizadas: <b>{log.logged_work_sets}</b> de {planned} planeadas ({completionPct(planned, log.logged_work_sets ?? 0)}%)</p>
          <p>Repeticiones: {sum.totalReps} · Volumen: {sum.volumeKg} kg · Esfuerzo de la sesión: {log.session_rpe ?? "—"}/10 · Dolor: {log.pain_level ?? "—"}/10</p>
          {log.pain_notes && <p>Dolor: {log.pain_notes}</p>}{log.notes && <p>Notas: {log.notes}</p>}
          {planned > (log.logged_work_sets ?? 0) && log.status === "completed" && <p className="text-[var(--muted)]">Sesión incompleta: se guardó con lo realizado.</p>}
        </div>
        {alerts.professional.length > 0 && <p role="alert" className="rounded-lg border border-[var(--warn)] p-3 text-sm">Reportaste molestias importantes. Tu entrenador lo verá; si el dolor persiste, consulta a un profesional de la salud.</p>}
        <Link href="/client/progress" className="inline-block rounded-lg border border-[var(--accent)] px-4 py-2 text-[var(--accent)]">Ver mi progreso</Link>
      </section>);
  }

  return (
    <section className="space-y-6 pb-24">
      <div><h1 className="text-2xl font-semibold">{log.session.name}</h1><p className="text-sm text-[var(--muted)]">{workDone} de {planned} series guardadas · se guarda al instante: puedes cerrar y continuar después.</p>
        {log.session.warmup_notes && <p className="mt-1 text-sm">Calentamiento: {log.session.warmup_notes}</p>}</div>
      {pes.map((pe) => {
        const saved = (sets ?? []).filter((s) => s.prescribed_exercise_id === pe.id) as unknown as Saved[];
        const last = lastFor(pe.exercise_id); const d = (disc ?? []).find((x) => x.exercise_id === pe.exercise_id);
        const lastText = last ? last.sets.filter((s) => s.kind === "work").map((s) => `${s.reps ?? "–"}×${s.load_kg ?? 0}kg`).join(" · ") : null;
        return (
          <div key={pe.id} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div><h2 className="font-semibold">{pe.exercise.name_es}</h2>
              <p className="text-sm text-[var(--accent)]">Objetivo: {describePrescription(pe)}{pe.load_kg ? ` @ ${pe.load_kg} kg` : ""}{pe.rpe ? ` · RPE ${pe.rpe}` : pe.rir !== null ? ` · RIR ${pe.rir}` : ""}{pe.rest_sec ? ` · descanso ${pe.rest_sec}s` : ""}{pe.tempo ? ` · tempo ${pe.tempo}` : ""}</p>
              {pe.client_notes && <p className="text-sm">{pe.client_notes}</p>}
              <p className="text-xs text-[var(--muted)]">{lastText ? `Última vez (${new Date(last!.log.started_at).toLocaleDateString("es-CO")}): ${lastText}` : "Primera vez que registras este ejercicio."}</p>
              <details className="mt-1"><summary className="cursor-pointer text-xs text-[var(--accent)]">Cómo se hace{pe.exercise.video_path ? " (con video)" : ""}</summary><div className="mt-2 max-w-md"><ExerciseVideo path={pe.exercise.video_path} name={pe.exercise.name_es} /></div><ol className="mt-1 list-decimal pl-5 text-xs">{pe.exercise.instructions.map((i) => <li key={i}>{i}</li>)}</ol></details></div>
            <ExerciseSets logId={id} prescribedId={pe.id} exerciseId={pe.exercise_id} planned={pe.sets} warmups={pe.warmup_sets} restSec={pe.rest_sec} durationBased={!pe.reps_min && !!pe.duration_sec} defaults={{ load: last?.sets.find((s) => s.kind === "work")?.load_kg ?? pe.load_kg, reps: pe.reps_min }} saved={saved} locked={false} />
            <details className="text-sm"><summary className="cursor-pointer text-xs text-[var(--muted)]">{d ? `Molestia registrada: ${d.severity}/10` : "¿Sentiste alguna molestia?"}</summary>
              <ActionForm action={saveDiscomfort.bind(null, id, pe.exercise_id)} submitLabel="Guardar molestia" className="mt-2 border-0 bg-transparent p-0">
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs">Intensidad (0 = ninguna)<input name="severity" type="number" min="0" max="10" defaultValue={d?.severity ?? 0} className={fieldCls} /></label>
                  <label className="text-xs">Zona<select name="area" defaultValue={d?.area ?? "other"} className={fieldCls}>{Object.entries({ ...JOINT_LABEL, other: "Otra" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="text-xs">Nota<input name="note" maxLength={300} defaultValue={d?.note ?? ""} className={fieldCls} /></label>
                </div>
                <p className="text-xs text-[var(--muted)]">Si el dolor es fuerte, detente. Si es de 6/10 o más y compartes tu información con tu entrenador, recibe un aviso (sin detalles) y puede ver la molestia en tu historial.</p>
              </ActionForm></details>
          </div>);
      })}
      <ActionForm action={finishWorkout.bind(null, id)} submitLabel="Finalizar entrenamiento">
        <h2 className="font-semibold">Finalizar</h2>
        {workDone < planned && <p className="text-sm text-[var(--muted)]">Llevas {workDone} de {planned} series. Puedes finalizar ahora: se guardará como sesión incompleta.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Esfuerzo de la sesión (1 = muy fácil, 10 = máximo)<input name="rpe" type="number" min="1" max="10" required className={fieldCls} /></label>
          <label className="text-sm">Dolor general (0 a 10)<input name="pain" type="number" min="0" max="10" defaultValue="0" required className={fieldCls} /></label>
        </div>
        <label className="block text-sm">¿Dónde duele? (si aplica)<input name="pain_notes" maxLength={500} className={fieldCls} /></label>
        <label className="block text-sm">Comentarios para tu entrenador<textarea name="notes" rows={2} maxLength={1000} className={fieldCls} /></label>
      </ActionForm>
      <form action={abandonWorkout.bind(null, id)}><button className="text-sm text-[var(--warn)]">Abandonar este entrenamiento</button></form>
      <RestTimer />
    </section>
  );
}
