import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeSets, weekBounds, weeklyAdherence, localDate } from "@/lib/training/metrics";
import { achievements, buildChallenges, dailyMessage, onboardingSteps, pickToday, recentRecords, streakWeeks, weekStrip, weightTrend, type HLog, type HSession, type SetOf } from "./client-home";

const DAY = 86400000;
type Row = Record<string, unknown>;

/** Everything the client's home shows, read with the client's own session (RLS applies). Bounded: 120 days of workouts, 90 days of sets. */
export async function loadClientHome(supabase: SupabaseClient, me: { id: string; full_name: string }, now: Date = new Date()) {
  const since = new Date(now.getTime() - 120 * DAY).toISOString();
  const [plans, logsQ, doneCount, measures, assessments, rel, unreadMsgs, sentMsgs, unreadNotes] = await Promise.all([
    supabase.from("training_plans").select("id,title,current_version_id").eq("client_id", me.id).not("current_version_id", "is", null).order("created_at", { ascending: false }).limit(1),
    supabase.from("workout_logs").select("id,session_id,status,started_at,finished_at,session_rpe,pain_level").eq("client_id", me.id).gte("started_at", since).order("started_at", { ascending: false }).limit(300),
    supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("client_id", me.id).eq("status", "completed"),
    supabase.from("anthropometric_measurements").select("measured_on,weight_kg").eq("client_id", me.id).order("measured_on", { ascending: false }).limit(60),
    supabase.from("assessments").select("id", { count: "exact", head: true }).eq("client_id", me.id).eq("status", "submitted"),
    supabase.from("trainer_client_relationships").select("nutrition_enabled, trainer:profiles!trainer_client_relationships_trainer_id_fkey(full_name)").eq("client_id", me.id).eq("status", "active").maybeSingle(),
    supabase.from("messages").select("id,body,created_at").eq("client_id", me.id).neq("sender_id", me.id).is("read_at", null).order("created_at", { ascending: false }).limit(1),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("client_id", me.id).eq("sender_id", me.id),
    supabase.from("notifications").select("id,title,link,created_at").eq("user_id", me.id).is("read_at", null).order("created_at", { ascending: false }).limit(3),
  ]);
  const logs = (logsQ.data ?? []) as HLog[];
  const plan = plans.data?.[0] ?? null;

  let sessions: HSession[] = [];
  if (plan) {
    const { data } = await supabase.from("plan_sessions").select("id,name,weekday,position, prescribed_exercises(position,sets, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es))").eq("version_id", plan.current_version_id).order("position");
    sessions = ((data ?? []) as unknown as { id: string; name: string; weekday: number | null; position: number; prescribed_exercises: { position: number; sets: number; exercise: { name_es: string } }[] }[]).map((s) => ({
      id: s.id, name: s.name, weekday: s.weekday, position: s.position,
      exercises: [...s.prescribed_exercises].sort((a, b) => a.position - b.position).map((e) => ({ name: e.exercise.name_es, sets: e.sets })),
    }));
  }

  // Sets of the last 90 days, for personal records and weekly volume.
  const recentDone = logs.filter((l) => l.status === "completed" && l.started_at >= new Date(now.getTime() - 90 * DAY).toISOString());
  let setRows: SetOf[] = []; let weekVolume = { this: 0, last: 0 };
  if (recentDone.length) {
    const ids = recentDone.map((l) => l.id);
    const { data: sets } = await supabase.from("logged_sets").select("log_id,exercise_id,kind,reps,load_kg").in("log_id", ids);
    const exIds = [...new Set((sets ?? []).map((s: Row) => s.exercise_id as string))];
    const { data: ex } = exIds.length ? await supabase.from("exercises").select("id,name_es").in("id", exIds) : { data: [] };
    const nameOf = new Map((ex ?? []).map((e: Row) => [e.id as string, e.name_es as string]));
    const dateOf = new Map(recentDone.map((l) => [l.id, localDate(l.started_at)]));
    setRows = (sets ?? []).map((s: Row) => ({ log_id: s.log_id as string, exercise_id: s.exercise_id as string, name: nameOf.get(s.exercise_id as string) ?? "Ejercicio", date: dateOf.get(s.log_id as string)!, kind: s.kind as "warmup" | "work", reps: s.reps as number | null, load_kg: s.load_kg as number | null }));
    const { start } = weekBounds(now); const prevStart = new Date(start.getTime() - 7 * DAY);
    const volOf = (from: Date, to: Date) => summarizeSets(setRows.filter((r) => { const l = recentDone.find((x) => x.id === r.log_id)!; const t = new Date(l.started_at); return t >= from && t < to; })).volumeKg;
    weekVolume = { this: volOf(start, new Date(start.getTime() + 7 * DAY)), last: volOf(prevStart, start) };
  }

  const today = pickToday(sessions, logs, now);
  const strip = weekStrip(logs, now); const streak = streakWeeks(logs, now);
  const adherence = weeklyAdherence(sessions.length, logs, now);
  const records = recentRecords(setRows, now, 30);
  const weekDates = new Set(strip.map((d) => d.date));
  const measuredThisWeek = (measures.data ?? []).some((m) => weekDates.has(m.measured_on as string));
  const completed = doneCount.count ?? 0;
  const trainer = (rel.data?.trainer as unknown as { full_name: string } | null)?.full_name ?? null;
  const first = (me.full_name.trim().split(/\s+/)[0]) || me.full_name;

  return {
    firstName: first, dateLabel: ((d) => d.charAt(0).toUpperCase() + d.slice(1))(new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" }).format(now)),
    hasPlan: !!plan, planTitle: plan?.title ?? null, today, strip, streak, adherence,
    challenges: buildChallenges({ now, sessionsPerWeek: sessions.length, completedThisWeek: adherence.completed, measuredThisWeek, streak, recordsThisMonth: records }),
    achievements: achievements({ completed, streak, records: records.length }), completed, records: records.slice(0, 3), weekVolume,
    weight: weightTrend((measures.data ?? []) as { measured_on: string; weight_kg: number | null }[]),
    message: dailyMessage({ now, state: today.kind, streak }),
    onboarding: onboardingSteps({ hasAssessment: (assessments.count ?? 0) > 0, hasMeasurement: (measures.data ?? []).length > 0, hasMessage: (sentMsgs.count ?? 0) > 0 }),
    needsAssessment: !assessments.count,
    trainer, nutritionEnabled: !!rel.data?.nutrition_enabled,
    unreadMessage: unreadMsgs.data?.[0] ? { body: unreadMsgs.data[0].body as string } : null,
    notifications: (unreadNotes.data ?? []) as { id: string; title: string; link: string | null }[],
  };
}
export type ClientHomeData = Awaited<ReturnType<typeof loadClientHome>>;
