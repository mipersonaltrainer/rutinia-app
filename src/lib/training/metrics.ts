// Pure training metrics. Rules are explicit so trainers can audit every number.
export interface SetRow { kind: "warmup" | "work"; reps: number | null; load_kg: number | null; duration_sec?: number | null; rpe?: number | null; rir?: number | null }
export interface SessionSummary { workSets: number; totalReps: number; volumeKg: number; topSet: { load_kg: number; reps: number } | null }

/** Epley estimate: load × (1 + reps/30). Only meaningful for 1–12 reps; otherwise null (not estimated). */
export function epley1RM(load: number | null, reps: number | null): number | null {
  if (!load || !reps || reps < 1 || reps > 12) return null;
  return Math.round((reps === 1 ? load : load * (1 + reps / 30)) * 10) / 10;
}

const isWork = (s: SetRow) => s.kind === "work" && (s.reps ?? 0) > 0;

/** Volume load = Σ reps × load over work sets (bodyweight/unloaded sets count reps but add 0 kg). */
export function summarizeSets(sets: SetRow[]): SessionSummary {
  const work = sets.filter(isWork);
  let top: SessionSummary["topSet"] = null;
  for (const s of work) if (s.load_kg !== null && (!top || s.load_kg > top.load_kg || (s.load_kg === top.load_kg && s.reps! > top.reps))) top = { load_kg: s.load_kg, reps: s.reps! };
  return { workSets: work.length, totalReps: work.reduce((a, s) => a + (s.reps ?? 0), 0), volumeKg: Math.round(work.reduce((a, s) => a + (s.reps ?? 0) * (s.load_kg ?? 0), 0) * 10) / 10, topSet: top };
}

export interface HistorySession { date: string; sets: SetRow[]; discomfortSeverity?: number | null; sessionRpe?: number | null; pain?: number | null }
export interface PR { date: string; type: "max_load" | "best_e1rm"; value: number; detail: string }
export const PR_DISCOMFORT_LIMIT = 6;

/**
 * Personal records, chronological. Rules: work sets only, 1–12 reps for e1RM, loaded sets only,
 * and sessions with discomfort ≥ 6 on that exercise never produce a record. A record needs a strictly higher value.
 */
export function detectPRs(sessions: HistorySession[]): PR[] {
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  let bestLoad = 0, bestE1 = 0; const out: PR[] = [];
  for (const s of ordered) {
    if ((s.discomfortSeverity ?? 0) >= PR_DISCOMFORT_LIMIT) continue;
    const work = s.sets.filter((x) => isWork(x) && x.load_kg);
    const load = Math.max(0, ...work.map((x) => x.load_kg!));
    const e1 = Math.max(0, ...work.map((x) => epley1RM(x.load_kg, x.reps) ?? 0));
    if (load > bestLoad) { if (bestLoad > 0) out.push({ date: s.date, type: "max_load", value: load, detail: `${load} kg × ${work.find((x) => x.load_kg === load)!.reps}` }); bestLoad = load; }
    if (e1 > bestE1) { if (bestE1 > 0) out.push({ date: s.date, type: "best_e1rm", value: e1, detail: `1RM estimado ${e1} kg` }); bestE1 = e1; }
  }
  return out;
}

export interface Comparison { volumeDeltaPct: number | null; topLoadDeltaKg: number | null; cautions: string[]; improved: boolean }
/** Higher volume is NOT reported as improvement when fatigue or pain rose with it. */
export function compareSessions(prev: HistorySession, curr: HistorySession): Comparison {
  const a = summarizeSets(prev.sets), b = summarizeSets(curr.sets);
  const volumeDeltaPct = a.volumeKg > 0 ? Math.round(((b.volumeKg - a.volumeKg) / a.volumeKg) * 1000) / 10 : null;
  const topLoadDeltaKg = a.topSet && b.topSet ? Math.round((b.topSet.load_kg - a.topSet.load_kg) * 10) / 10 : null;
  const cautions: string[] = [];
  if (curr.sessionRpe != null && prev.sessionRpe != null && curr.sessionRpe - prev.sessionRpe >= 2) cautions.push("El esfuerzo percibido de la sesión subió 2 o más puntos");
  if ((curr.pain ?? 0) - (prev.pain ?? 0) >= 2) cautions.push("El dolor reportado aumentó");
  if ((curr.discomfortSeverity ?? 0) >= 4 && (curr.discomfortSeverity ?? 0) > (prev.discomfortSeverity ?? 0)) cautions.push("Hay molestias nuevas o mayores en este ejercicio");
  const up = (volumeDeltaPct ?? 0) > 0 || (topLoadDeltaKg ?? 0) > 0;
  return { volumeDeltaPct, topLoadDeltaKg, cautions, improved: up && cautions.length === 0 };
}

// --- weeks & adherence (Colombia has no DST: fixed UTC-5) -------------------------------
const TZ_OFFSET_MS = -5 * 3600 * 1000;
/** Calendar date (YYYY-MM-DD) of an instant in America/Bogota. */
export const localDate = (iso: string) => new Date(new Date(iso).getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);

/** Monday 00:00 → next Monday 00:00 in America/Bogota, returned as UTC instants. */
export function weekBounds(d: Date): { start: Date; end: Date } {
  const local = new Date(d.getTime() + TZ_OFFSET_MS);
  const dow = (local.getUTCDay() + 6) % 7;
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow);
  return { start: new Date(startLocal - TZ_OFFSET_MS), end: new Date(startLocal + 7 * 86400000 - TZ_OFFSET_MS) };
}

/** Distinct plan sessions completed in the week ÷ sessions the plan schedules per week, capped at 100%. */
export function weeklyAdherence(sessionsPerWeek: number, logs: { session_id: string; status: string; finished_at: string | null }[], ref: Date) {
  const { start, end } = weekBounds(ref);
  const done = new Set(logs.filter((l) => l.status === "completed" && l.finished_at && new Date(l.finished_at) >= start && new Date(l.finished_at) < end).map((l) => l.session_id));
  const completed = done.size;
  return { scheduled: sessionsPerWeek, completed, pct: sessionsPerWeek > 0 ? Math.min(100, Math.round((completed / sessionsPerWeek) * 100)) : null };
}

export const completionPct = (planned: number, loggedWork: number) => (planned > 0 ? Math.min(100, Math.round((loggedWork / planned) * 100)) : 0);

/**
 * Pain or discomfort at or above this (0–10) needs the trainer's attention. The database notifies the trainer at the same
 * boundary (migration 0022, trigger trg_discomfort_attention / trg_pain_attention): tests/integration/attention.test.ts keeps both aligned.
 */
export const ATTENTION_THRESHOLD = 6;
export const needsAttention = (intensity: number | null | undefined) => (intensity ?? 0) >= ATTENTION_THRESHOLD;

/** Alerts split between professional-attention items and administrative reminders. */
export function workoutAlerts(l: { pain_level: number | null; session_rpe: number | null }, discomforts: { severity: number }[]) {
  const professional: string[] = [];
  if (needsAttention(l.pain_level)) professional.push(`Dolor reportado ${l.pain_level}/10`);
  const worst = Math.max(0, ...discomforts.map((d) => d.severity));
  if (needsAttention(worst)) professional.push(`Molestia de intensidad ${worst}/10 durante un ejercicio`);
  const admin: string[] = [];
  if (l.session_rpe !== null && l.session_rpe >= 9) admin.push("Esfuerzo de sesión muy alto (9–10): revisar carga");
  return { professional, admin };
}
