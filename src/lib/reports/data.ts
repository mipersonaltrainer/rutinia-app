import { compareMeasurements } from "@/lib/calculations/compare";
import { completionPct, localDate, summarizeSets, weekBounds, weeklyAdherence, type SetRow } from "@/lib/training/metrics";

export interface ReportInput {
  clientName: string; trainerName: string | null; period: { from: string; to: string }; generatedAt: Date;
  goals: string[]; initialAssessmentDate: string | null;
  measurements: { measured_on: string; method: string; taken_by: string; weight_kg: number | null; waist_cm: number | null; hip_cm: number | null; neck_cm: number | null; arm_cm: number | null; thigh_cm: number | null; calf_cm: number | null }[];
  indicators: { measurement_date: string; indicator: string; value: number; unit: string; formula: string }[];
  logs: { id: string; session_id: string; status: string; started_at: string; finished_at: string | null; session_rpe: number | null; pain_level: number | null; planned_sets: number | null; logged_work_sets: number | null }[];
  sets: { log_id: string; exercise_id: string; exercise_name: string; kind: string; reps: number | null; load_kg: number | null }[];
  sessionsPerWeek: number;
  planVersions: { plan_title: string; version_no: number; published_at: string; change_note: string | null }[];
  observations: string | null; nextGoals: string | null;
}
export interface ReportData {
  title: string; clientName: string; trainerName: string | null; period: { from: string; to: string }; generatedAt: string; goals: string[]; initialAssessmentDate: string | null;
  sessions: { completed: number; abandoned: number; plannedSets: number; loggedSets: number; completionPct: number; avgSessionRpe: number | null; maxPain: number | null };
  adherence: { weekStart: string; scheduled: number; completed: number; pct: number | null }[]; overallAdherencePct: number | null;
  measurements: { first: ReportInput["measurements"][number] | null; last: ReportInput["measurements"][number] | null; deltas: Record<string, number>; warnings: string[]; series: { date: string; kg: number }[]; count: number };
  indicators: { label: string; value: string; formula: string }[];
  performance: { exercise: string; sessions: number; first: string; last: string; deltaLoad: number | null; volumeKg: number }[];
  planChanges: ReportInput["planVersions"]; observations: string | null; nextGoals: string | null; notes: string[];
}
const IND: Record<string, string> = { bmi: "IMC", bmr: "Metabolismo basal (Mifflin-St Jeor)", tdee: "Gasto energético diario estimado", body_fat_navy: "% de grasa (US Navy)", waist_to_height: "Cintura/estatura", waist_to_hip: "Cintura/cadera" };
const inPeriod = (iso: string, p: { from: string; to: string }) => { const d = localDate(iso); return d >= p.from && d <= p.to; };

/** Pure: every figure in the report is derived from recorded data; anything missing is reported as missing, never filled in. */
export function buildReportData(i: ReportInput): ReportData {
  const logs = i.logs.filter((l) => l.status !== "in_progress" && inPeriod(l.started_at, i.period));
  const done = logs.filter((l) => l.status === "completed");
  const rpes = done.map((l) => l.session_rpe).filter((x): x is number => x !== null);
  const pains = done.map((l) => l.pain_level).filter((x): x is number => x !== null);
  const plannedSets = done.reduce((a, l) => a + (l.planned_sets ?? 0), 0), loggedSets = done.reduce((a, l) => a + (l.logged_work_sets ?? 0), 0);

  // week-by-week adherence over the period (Mon–Sun, Colombia time)
  const weeks: ReportData["adherence"] = []; const seen = new Set<number>();
  for (let t = new Date(i.period.from + "T12:00:00-05:00").getTime(); t <= new Date(i.period.to + "T12:00:00-05:00").getTime() + 6 * 86400000; t += 7 * 86400000) {
    const w = weekBounds(new Date(t)); if (seen.has(w.start.getTime()) || w.start > new Date(i.period.to + "T23:59:59-05:00")) continue; seen.add(w.start.getTime());
    const a = weeklyAdherence(i.sessionsPerWeek, done.map((l) => ({ session_id: l.session_id, status: l.status, finished_at: l.finished_at })), new Date(w.start.getTime() + 3600000));
    weeks.push({ weekStart: localDate(w.start.toISOString()), ...a });
  }
  const sched = weeks.reduce((a, w) => a + w.scheduled, 0), comp = weeks.reduce((a, w) => a + w.completed, 0);

  const ms = [...i.measurements].filter((m) => m.measured_on >= i.period.from && m.measured_on <= i.period.to).sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const first = ms[0] ?? null, last = ms.length > 1 ? ms[ms.length - 1] : null;
  const cmp = first && last ? compareMeasurements(first as never, last as never) : { deltas: {}, warnings: [] as string[] };
  const lastDate = (last ?? first)?.measured_on;
  const indicators = i.indicators.filter((x) => x.measurement_date === lastDate).map((x) => ({ label: IND[x.indicator] ?? x.indicator, value: `${x.value} ${x.unit}`, formula: x.formula }));

  const doneIds = new Set(done.map((l) => l.id)); const byLog = new Map(done.map((l) => [l.id, l]));
  const perEx = new Map<string, { name: string; sessions: { date: string; sets: SetRow[] }[] }>();
  for (const l of done) {
    const mine = i.sets.filter((s) => s.log_id === l.id && doneIds.has(s.log_id)); const names = [...new Set(mine.map((s) => s.exercise_id))];
    for (const id of names) { const rows = mine.filter((s) => s.exercise_id === id); const e = perEx.get(id) ?? perEx.set(id, { name: rows[0].exercise_name, sessions: [] }).get(id)!; e.sessions.push({ date: localDate(byLog.get(l.id)!.started_at), sets: rows.map((r) => ({ kind: r.kind as "work" | "warmup", reps: r.reps, load_kg: r.load_kg })) }); }
  }
  const performance = [...perEx.values()].map((e) => {
    const s = e.sessions.sort((a, b) => a.date.localeCompare(b.date)); const f = summarizeSets(s[0].sets), l = summarizeSets(s[s.length - 1].sets);
    const fmt = (x: ReturnType<typeof summarizeSets>) => (x.topSet ? `${x.topSet.reps}×${x.topSet.load_kg} kg` : "sin carga");
    return { exercise: e.name, sessions: s.length, first: fmt(f), last: fmt(l), deltaLoad: f.topSet && l.topSet ? Math.round((l.topSet.load_kg - f.topSet.load_kg) * 10) / 10 : null, volumeKg: Math.round(s.reduce((a, x) => a + summarizeSets(x.sets).volumeKg, 0)) };
  }).sort((a, b) => b.sessions - a.sessions || a.exercise.localeCompare(b.exercise));

  const notes = ["Las medidas e indicadores calculados son estimaciones antropométricas, no mediciones clínicas.", "Un cambio de peso no equivale a un cambio confirmado de grasa corporal.", "Este informe resume únicamente datos registrados en la plataforma; no constituye diagnóstico médico."];
  if (!ms.length) notes.push("No hay medidas corporales registradas en este periodo.");
  if (ms.length === 1) notes.push("Solo hay una medición en el periodo: no se pueden calcular cambios.");
  if (!done.length) notes.push("No hay entrenamientos completados en este periodo.");
  return {
    title: "Informe de progreso", clientName: i.clientName, trainerName: i.trainerName, period: i.period, generatedAt: i.generatedAt.toISOString(), goals: i.goals, initialAssessmentDate: i.initialAssessmentDate,
    sessions: { completed: done.length, abandoned: logs.filter((l) => l.status === "abandoned").length, plannedSets, loggedSets, completionPct: completionPct(plannedSets, loggedSets), avgSessionRpe: rpes.length ? Math.round((rpes.reduce((a, x) => a + x, 0) / rpes.length) * 10) / 10 : null, maxPain: pains.length ? Math.max(...pains) : null },
    adherence: weeks, overallAdherencePct: sched > 0 ? Math.min(100, Math.round((comp / sched) * 100)) : null,
    measurements: { first, last, deltas: cmp.deltas, warnings: cmp.warnings, count: ms.length, series: ms.filter((m) => m.weight_kg !== null).map((m) => ({ date: m.measured_on, kg: m.weight_kg as number })) },
    indicators, performance, planChanges: i.planVersions.filter((v) => inPeriod(v.published_at, i.period)), observations: i.observations, nextGoals: i.nextGoals, notes,
  };
}
