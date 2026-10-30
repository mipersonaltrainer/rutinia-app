import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { startWorkout } from "@/app/client/workout/actions";
import { describePrescription } from "@/lib/plans/prescription";
import { EQUIPMENT_LABEL } from "@/lib/exercises/labels";

const DAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
type Ex = { id: string; position: number; sets: number; warmup_sets: number; reps_min: number | null; reps_max: number | null; duration_sec: number | null; load_kg: number | null; rpe: number | null; rir: number | null; rest_sec: number | null; tempo: string | null; superset_group: string | null; client_notes: string | null; exercise: { name_es: string; equipment: string; instructions: string[]; safety_notes: string[] }; alt: { name_es: string } | null };

export default async function ClientPlan() {
  const { supabase, profile } = await requireUser("client");
  const { data: plans } = await supabase.from("training_plans").select("id,title,goal,current_version_id").eq("client_id", profile.id).not("current_version_id", "is", null);
  if (!plans || plans.length === 0) return (
    <section><h1 className="text-2xl font-semibold">Mi plan</h1><p className="mt-3 text-[var(--muted)]">Todavía no tienes un plan publicado. Si tu entrenador ya te asignó uno y no lo ves, es posible que su espacio de trabajo esté temporalmente no disponible; contáctalo directamente.</p></section>);
  const { data: active } = await supabase.from("workout_logs").select("id,session_id").eq("client_id", profile.id).eq("status", "in_progress").maybeSingle();
  const out = [];
  for (const p of plans) {
    const { data: v } = await supabase.from("plan_versions").select("version_no,published_at,change_note").eq("id", p.current_version_id).single();
    const { data: sessions } = await supabase.from("plan_sessions").select("id,name,weekday,warmup_notes,prescribed_exercises(id,position,sets,warmup_sets,reps_min,reps_max,duration_sec,load_kg,rpe,rir,rest_sec,tempo,superset_group,client_notes, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es,equipment,instructions,safety_notes), alt:exercises!prescribed_exercises_alternative_exercise_id_fkey(name_es))").eq("version_id", p.current_version_id).order("position").order("position", { referencedTable: "prescribed_exercises" });
    out.push({ p, v, sessions: (sessions ?? []) as unknown as { id: string; name: string; weekday: number | null; warmup_notes: string | null; prescribed_exercises: Ex[] }[] });
  }
  return (
    <section className="space-y-8"><h1 className="text-2xl font-semibold">Mi plan</h1>
      {out.map(({ p, v, sessions }) => (
        <div key={p.id} className="space-y-4"><div><h2 className="text-xl font-semibold">{p.title}</h2><p className="text-xs text-[var(--muted)]">Versión {v?.version_no} · publicada el {v?.published_at ? new Date(v.published_at).toLocaleDateString("es-CO") : ""}{p.goal ? ` · ${p.goal}` : ""}</p></div>
          {sessions.map((s) => (
            <div key={s.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{s.name}{s.weekday ? ` · ${DAYS[s.weekday]}` : ""}</h3>
                {active?.session_id === s.id ? <Link href={`/client/workout/${active.id}`} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-black">Continuar entrenamiento</Link> : !active && (
                  <ActionForm action={startWorkout.bind(null, s.id)} submitLabel="Entrenar" className="flex flex-wrap items-end gap-2 border-0 bg-transparent p-0"><label className="text-xs">¿Cómo te sientes hoy? (1–5)<select name="recovery" defaultValue="" className={fieldCls}><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label></ActionForm>)}</div>
              {s.warmup_notes && <p className="mt-1 text-sm text-[var(--muted)]">Calentamiento: {s.warmup_notes}</p>}
              <ol className="mt-3 space-y-3">{s.prescribed_exercises.map((e) => (
                <li key={e.id} className="text-sm"><div className="flex flex-wrap justify-between gap-2"><b>{e.superset_group ? `[${e.superset_group}] ` : ""}{e.exercise.name_es}</b><span className="text-[var(--accent)]">{describePrescription(e)}{e.load_kg ? ` @ ${e.load_kg} kg` : ""}{e.rpe ? ` · RPE ${e.rpe}` : e.rir !== null ? ` · RIR ${e.rir}` : ""}{e.rest_sec ? ` · descanso ${e.rest_sec}s` : ""}{e.tempo ? ` · tempo ${e.tempo}` : ""}</span></div>
                  <p className="text-xs text-[var(--muted)]">{EQUIPMENT_LABEL[e.exercise.equipment]}{e.warmup_sets ? ` · ${e.warmup_sets} serie(s) de aproximación` : ""}{e.alt ? ` · alternativa: ${e.alt.name_es}` : ""}</p>
                  {e.client_notes && <p className="mt-1">{e.client_notes}</p>}
                  <details className="mt-1"><summary className="cursor-pointer text-xs text-[var(--accent)]">Cómo se hace</summary><ol className="mt-1 list-decimal pl-5 text-xs">{e.exercise.instructions.map((i) => <li key={i}>{i}</li>)}</ol><ul className="mt-1 list-disc pl-5 text-xs text-[var(--muted)]">{e.exercise.safety_notes.map((i) => <li key={i}>{i}</li>)}</ul></details>
                </li>))}</ol>
            </div>))}
        </div>))}
    </section>
  );
}
