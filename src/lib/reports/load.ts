import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "@/lib/training/metrics";
import type { ReportInput } from "./data";

const GOAL: Record<string, string> = { hypertrophy: "Hipertrofia muscular", strength: "Ganancia de fuerza", fat_loss: "Pérdida de grasa", endurance: "Resistencia", recomposition: "Recomposición corporal", mobility: "Movilidad", general_health: "Salud general", sport: "Preparación deportiva", return_to_training: "Retorno progresivo al entrenamiento" };

/** Reads everything a report needs through the caller's own session: RLS decides what is visible, so a report can never show more than the user may see. */
export async function loadReportInput(supabase: SupabaseClient, o: { clientId: string; from: string; to: string; trainerName: string | null; observations: string | null; nextGoals: string | null; now?: Date }): Promise<ReportInput | null> {
  const { clientId, from, to } = o;
  const [prof, ass, meas, res, logs, plans] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", clientId).single(),
    supabase.from("assessments").select("data,submitted_at").eq("client_id", clientId).eq("status", "submitted").order("created_at").limit(1).maybeSingle(),
    supabase.from("anthropometric_measurements").select("*").eq("client_id", clientId),
    supabase.from("calculation_results").select("indicator,value,unit,formula, m:anthropometric_measurements(measured_on)").eq("client_id", clientId),
    supabase.from("workout_logs").select("id,session_id,status,started_at,finished_at,session_rpe,pain_level,planned_sets,logged_work_sets").eq("client_id", clientId).gte("started_at", new Date(new Date(from).getTime() - 2 * 86400000).toISOString()).lte("started_at", new Date(new Date(to).getTime() + 3 * 86400000).toISOString()),
    supabase.from("training_plans").select("id,title,current_version_id, plan_versions!plan_versions_plan_id_fkey(version_no,status,change_note,published_at)").eq("client_id", clientId),
  ]);
  if (!prof.data) return null;
  const logIds = (logs.data ?? []).map((l) => l.id);
  const sets = logIds.length ? await supabase.from("logged_sets").select("log_id,exercise_id,kind,reps,load_kg, exercise:exercises(name_es)").in("log_id", logIds) : { data: [] };
  const currentIds = (plans.data ?? []).map((p) => p.current_version_id).filter(Boolean) as string[];
  const { count: perWeek } = currentIds.length ? await supabase.from("plan_sessions").select("id", { count: "exact", head: true }).in("version_id", currentIds) : { count: 0 };
  const a = (ass.data?.data ?? {}) as { goals?: { goals?: string[] } };
  return {
    clientName: prof.data.full_name, trainerName: o.trainerName, period: { from, to }, generatedAt: o.now ?? new Date(),
    goals: (a.goals?.goals ?? []).map((g) => GOAL[g] ?? g), initialAssessmentDate: ass.data?.submitted_at ? localDate(ass.data.submitted_at) : null,
    measurements: (meas.data ?? []) as never,
    indicators: ((res.data ?? []) as unknown as { indicator: string; value: number; unit: string; formula: string; m: { measured_on: string } | null }[]).filter((r) => r.m).map((r) => ({ measurement_date: r.m!.measured_on, indicator: r.indicator, value: r.value, unit: r.unit, formula: r.formula })),
    logs: logs.data ?? [],
    sets: ((sets.data ?? []) as unknown as { log_id: string; exercise_id: string; kind: string; reps: number | null; load_kg: number | null; exercise: { name_es: string } }[]).map((s) => ({ log_id: s.log_id, exercise_id: s.exercise_id, exercise_name: s.exercise.name_es, kind: s.kind, reps: s.reps, load_kg: s.load_kg })),
    sessionsPerWeek: perWeek ?? 0,
    planVersions: (plans.data ?? []).flatMap((p) => ((p.plan_versions ?? []) as { version_no: number; status: string; change_note: string | null; published_at: string | null }[]).filter((v) => v.status === "published" && v.published_at).map((v) => ({ plan_title: p.title, version_no: v.version_no, published_at: v.published_at as string, change_note: v.change_note }))),
    observations: o.observations, nextGoals: o.nextGoals,
  };
}
