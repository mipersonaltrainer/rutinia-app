import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate, weekBounds, weeklyAdherence } from "@/lib/training/metrics";
import type { ClientContext, ExerciseInput, SessionObs } from "./engine";

type Row = Record<string, unknown>;
/** Reads everything the engine needs through the trainer's own session (RLS applies). Returns null if the plan has nothing to evaluate. */
export async function loadPlanInputs(supabase: SupabaseClient, planId: string, now: Date = new Date()): Promise<{ exercises: ExerciseInput[]; ctx: ClientContext; clientId: string } | null> {
  const { data: plan } = await supabase.from("training_plans").select("id,client_id,level,current_version_id").eq("id", planId).single();
  if (!plan?.client_id || !plan.current_version_id) return null;
  const { data: sessions } = await supabase.from("plan_sessions").select("id, prescribed_exercises(id,exercise_id,sets,reps_min,reps_max,duration_sec,load_kg,rpe,progression, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es,equipment))").eq("version_id", plan.current_version_id);
  const pes = (sessions ?? []).flatMap((s) => ((s as unknown as { prescribed_exercises: Row[] }).prescribed_exercises ?? []));
  if (pes.length === 0) return null;
  const exIds = [...new Set(pes.map((p) => p.exercise_id as string))];

  const { data: rel } = await supabase.from("exercise_relations").select("exercise_id, related:exercises!exercise_relations_related_id_fkey(id,name_es)").eq("kind", "alternative").in("exercise_id", exIds);
  const alts = new Map<string, { id: string; name: string }[]>();
  for (const r of (rel ?? []) as unknown as { exercise_id: string; related: { id: string; name_es: string } }[]) (alts.get(r.exercise_id) ?? alts.set(r.exercise_id, []).get(r.exercise_id)!).push({ id: r.related.id, name: r.related.name_es });
  for (const l of alts.values()) l.sort((a, b) => a.name.localeCompare(b.name));

  const since = new Date(now.getTime() - 70 * 86400000).toISOString();
  const { data: logs } = await supabase.from("workout_logs").select("id,session_id,started_at,finished_at,status,session_rpe,pain_level,recovery_rating,planned_sets").eq("client_id", plan.client_id).eq("status", "completed").gte("started_at", since).order("started_at", { ascending: false }).limit(60);
  const logIds = (logs ?? []).map((l) => l.id);
  const [{ data: sets }, { data: disc }] = logIds.length ? await Promise.all([
    supabase.from("logged_sets").select("log_id,prescribed_exercise_id,exercise_id,kind,reps,load_kg,rpe").in("log_id", logIds).eq("kind", "work").in("exercise_id", exIds),
    supabase.from("exercise_discomforts").select("log_id,exercise_id,severity").in("log_id", logIds),
  ]) : [{ data: [] }, { data: [] }];
  const usedPe = [...new Set((sets ?? []).map((s) => s.prescribed_exercise_id as string))];
  const { data: planned } = usedPe.length ? await supabase.from("prescribed_exercises").select("id,sets").in("id", usedPe) : { data: [] };
  const plannedBy = new Map((planned ?? []).map((p) => [p.id as string, p.sets as number]));

  const exercises: ExerciseInput[] = pes.map((p) => {
    const sessionsObs: SessionObs[] = [];
    for (const l of logs ?? []) {
      const mine = (sets ?? []).filter((s) => s.log_id === l.id && s.exercise_id === p.exercise_id);
      if (mine.length === 0) continue;
      sessionsObs.push({
        date: localDate(l.started_at), plannedSets: plannedBy.get(mine[0].prescribed_exercise_id as string) ?? (p.sets as number),
        sets: mine.map((m) => ({ reps: m.reps as number | null, load_kg: m.load_kg as number | null, rpe: m.rpe as number | null })),
        sessionRpe: l.session_rpe, pain: l.pain_level, recovery: l.recovery_rating,
        discomfort: (disc ?? []).find((d) => d.log_id === l.id && d.exercise_id === p.exercise_id)?.severity ?? null,
      });
    }
    const ex = p.exercise as { name_es: string; equipment: string };
    return {
      prescribedId: p.id as string, exerciseId: p.exercise_id as string, name: ex.name_es, equipment: ex.equipment, durationBased: !p.reps_min && !!p.duration_sec,
      sets: p.sets as number, repsMin: p.reps_min as number | null, repsMax: p.reps_max as number | null, loadKg: p.load_kg as number | null, rpeTarget: p.rpe as number | null,
      rule: p.progression as ExerciseInput["rule"], alternatives: (alts.get(p.exercise_id as string) ?? []).slice(0, 3), sessions: sessionsObs,
    };
  });

  const perWeek = (sessions ?? []).length;
  const thisWeek = weeklyAdherence(perWeek, (logs ?? []).map((l) => ({ session_id: l.session_id, status: l.status, finished_at: l.finished_at })), now);
  const lastWeek = weeklyAdherence(perWeek, (logs ?? []).map((l) => ({ session_id: l.session_id, status: l.status, finished_at: l.finished_at })), new Date(weekBounds(now).start.getTime() - 3600000));
  const ctx: ClientContext = {
    level: (plan.level as ClientContext["level"]) ?? "intermediate",
    adherence: perWeek > 0 ? { scheduled: lastWeek.scheduled + thisWeek.scheduled, completed: lastWeek.completed + thisWeek.completed } : null,
    recentSessions: (logs ?? []).slice(0, 4).map((l) => ({ date: localDate(l.started_at), sessionRpe: l.session_rpe, pain: l.pain_level, recovery: l.recovery_rating, maxDiscomfort: Math.max(0, ...(disc ?? []).filter((d) => d.log_id === l.id).map((d) => d.severity as number)) })),
  };
  return { exercises, ctx, clientId: plan.client_id };
}
