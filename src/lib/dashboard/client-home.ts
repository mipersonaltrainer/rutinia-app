import { detectPRs, localDate, weekBounds, type HistorySession } from "@/lib/training/metrics";

// Pure view-model rules for the client's home. Everything shown is derived from rows the client already owns: nothing is invented,
// nothing compares them with other people, and the wording never blames (a missed day is not a failure).
const DAY = 86400000;

export interface HSession { id: string; name: string; weekday: number | null; position: number; exercises: { name: string; sets: number }[] }
export interface HLog { id: string; session_id: string; status: string; started_at: string; finished_at: string | null; session_rpe: number | null; pain_level: number | null }

const isDone = (l: HLog): l is HLog & { finished_at: string } => l.status === "completed" && !!l.finished_at;
/** Monday = 1 … Sunday = 7, in Colombia. */
const dow = (now: Date) => { const d = new Date(`${localDate(now.toISOString())}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };

// ─── today's workout ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Today =
  | { kind: "none" }
  | { kind: "in_progress"; logId: string; session: HSession | null }
  | { kind: "ready"; session: HSession; why: "scheduled" | "next" }
  | { kind: "rest"; next: HSession }
  | { kind: "done_today"; next: HSession | null };

/** Next scheduled session strictly after `afterDow` (wrapping to the start of next week). */
function nextByWeekday(sessions: HSession[], afterDow: number): HSession | null {
  const dated = sessions.filter((s) => s.weekday != null).sort((a, b) => a.weekday! - b.weekday! || a.position - b.position);
  return dated.find((s) => s.weekday! > afterDow) ?? dated[0] ?? null;
}
const nextInRotation = (sessions: HSession[], afterId: string | null): HSession => {
  const i = afterId ? sessions.findIndex((s) => s.id === afterId) : -1;
  return sessions[(i + 1) % sessions.length];
};

export function pickToday(sessionsIn: HSession[], logs: HLog[], now: Date): Today {
  const sessions = [...sessionsIn].sort((a, b) => a.position - b.position);
  const open = logs.find((l) => l.status === "in_progress");
  if (open) return { kind: "in_progress", logId: open.id, session: sessions.find((s) => s.id === open.session_id) ?? null };
  if (sessions.length === 0) return { kind: "none" };
  const today = localDate(now.toISOString()), todayDow = dow(now);
  const finished = logs.filter(isDone).sort((a, b) => b.finished_at.localeCompare(a.finished_at));
  const weekdayMode = sessions.some((s) => s.weekday != null);
  if (finished.some((l) => localDate(l.finished_at) === today)) {
    return { kind: "done_today", next: weekdayMode ? nextByWeekday(sessions, todayDow) : nextInRotation(sessions, finished[0].session_id) };
  }
  if (weekdayMode) {
    const mine = sessions.filter((s) => s.weekday === todayDow);
    if (mine.length) {
      const { start, end } = weekBounds(now);
      const doneThisWeek = new Set(finished.filter((l) => new Date(l.finished_at) >= start && new Date(l.finished_at) < end).map((l) => l.session_id));
      return { kind: "ready", why: "scheduled", session: mine.find((s) => !doneThisWeek.has(s.id)) ?? mine[0] };
    }
    return { kind: "rest", next: nextByWeekday(sessions, todayDow)! };
  }
  return { kind: "ready", why: "next", session: nextInRotation(sessions, finished[0]?.session_id ?? null) };
}

// ─── the week ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface StripDay { label: string; date: string; trained: boolean; today: boolean; future: boolean }
export function weekStrip(logs: HLog[], now: Date): StripDay[] {
  const { start } = weekBounds(now); const today = localDate(now.toISOString());
  const trainedOn = new Set(logs.filter(isDone).map((l) => localDate(l.finished_at)));
  return ["L", "M", "M", "J", "V", "S", "D"].map((label, i) => {
    const date = localDate(new Date(start.getTime() + i * DAY).toISOString());
    return { label, date, trained: trainedOn.has(date), today: date === today, future: date > today };
  });
}

/** Consecutive weeks (Monday–Sunday) with at least one finished workout. A current week with none yet does not break it: the week is not over. */
export function streakWeeks(logs: HLog[], now: Date): number {
  const weeks = new Set(logs.filter(isDone).map((l) => weekBounds(new Date(l.finished_at)).start.getTime()));
  let k = weekBounds(now).start.getTime();
  if (!weeks.has(k)) k -= 7 * DAY;
  let n = 0;
  while (weeks.has(k) && n < 520) { n++; k -= 7 * DAY; }
  return n;
}

// ─── challenges and achievements (derived, never stored) ─────────────────────────────────────────────────────────────────────────
export interface Challenge { id: "sessions" | "measure" | "streak" | "record"; title: string; detail: string; done: boolean; progress: { value: number; target: number } | null; href?: string }
const STREAK_MILESTONES = [2, 4, 8, 12, 26, 52, 104, 208];

export function buildChallenges(i: { now: Date; sessionsPerWeek: number; completedThisWeek: number; measuredThisWeek: boolean; streak: number; recordsThisMonth: { exercise: string; detail: string }[] }): Challenge[] {
  const out: Challenge[] = [];
  if (i.sessionsPerWeek > 0) {
    const target = i.sessionsPerWeek, value = Math.min(i.completedThisWeek, target);
    out.push({ id: "sessions", title: target === 1 ? "Completa tu entrenamiento de la semana" : `Completa tus ${target} entrenamientos de la semana`, detail: value >= target ? "¡Semana cumplida!" : `${value} de ${target}`, done: value >= target, progress: { value, target }, href: "/client/plan" });
  }
  out.push({ id: "measure", title: "Registra tus medidas esta semana", detail: i.measuredThisWeek ? "Hecho: ya quedó registrado." : "Pesarte y medirte te ayuda a ver tu avance real.", done: i.measuredThisWeek, progress: null, href: "/client/measurements" });
  const target = STREAK_MILESTONES.find((m) => m > i.streak) ?? i.streak + 52;
  out.push({ id: "streak", title: `Llega a ${target} semanas seguidas`, detail: `Llevas ${i.streak}`, done: false, progress: { value: i.streak, target } });
  const rec = i.recordsThisMonth[0];
  out.push({ id: "record", title: "Supera una marca personal este mes", detail: rec ? `${rec.exercise}: ${rec.detail}` : "Sube un poco el peso o las repeticiones en un ejercicio.", done: !!rec, progress: null, href: "/client/progress" });
  return out;
}

export const ACHIEVEMENT_STEPS = { workouts: [1, 5, 10, 25, 50], streak: [2, 4, 8], records: [1] } as const;
export interface Achievement { id: string; title: string; unlocked: boolean; progress: { value: number; target: number } }
export function achievements(t: { completed: number; streak: number; records: number }): Achievement[] {
  const mk = (id: string, title: string, value: number, target: number): Achievement => ({ id, title, unlocked: value >= target, progress: { value: Math.min(value, target), target } });
  return [
    ...ACHIEVEMENT_STEPS.workouts.map((n) => mk(`w${n}`, n === 1 ? "Primer entrenamiento" : `${n} entrenamientos`, t.completed, n)),
    ...ACHIEVEMENT_STEPS.streak.map((n) => mk(`s${n}`, `${n} semanas seguidas`, t.streak, n)),
    ...ACHIEVEMENT_STEPS.records.map((n) => mk(`pr${n}`, "Primera marca personal", t.records, n)),
  ];
}

// ─── progress ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface SetOf { log_id: string; exercise_id: string; name: string; date: string; kind: "warmup" | "work"; reps: number | null; load_kg: number | null }
export interface RecentRecord { exercise: string; date: string; detail: string }
/** Records set inside the window. Needs an earlier best to beat: the first time an exercise is logged is a baseline, not a record. */
export function recentRecords(rows: SetOf[], now: Date, days: number): RecentRecord[] {
  const cutoff = localDate(new Date(now.getTime() - days * DAY).toISOString());
  const byExercise = new Map<string, { name: string; logs: Map<string, HistorySession> }>();
  for (const r of rows) {
    const e = byExercise.get(r.exercise_id) ?? { name: r.name, logs: new Map<string, HistorySession>() }; byExercise.set(r.exercise_id, e);
    const s = e.logs.get(r.log_id) ?? { date: r.date, sets: [] }; e.logs.set(r.log_id, s);
    s.sets.push({ kind: r.kind, reps: r.reps, load_kg: r.load_kg });
  }
  const out: RecentRecord[] = [];
  for (const { name, logs } of byExercise.values()) {
    const recent = detectPRs([...logs.values()]).filter((p) => p.date >= cutoff);
    const best = recent.filter((p) => p.type === "max_load").pop() ?? recent.pop();
    if (best) out.push({ exercise: name, date: best.date, detail: best.detail });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** First and latest recorded weight and the difference. Reported as numbers only: whether a change is good depends on the person's goal. */
export function weightTrend(rows: { measured_on: string; weight_kg: number | null }[]): { first: number; last: number; delta: number | null; count: number } | null {
  const w = rows.filter((r) => r.weight_kg != null).sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  if (w.length === 0) return null;
  const first = w[0].weight_kg!, last = w[w.length - 1].weight_kg!;
  return { first, last, delta: w.length >= 2 ? Math.round((last - first) * 10) / 10 : null, count: w.length };
}

// ─── the message of the day ──────────────────────────────────────────────────────────────────────────────────────────────────────
const LINES = [
  "Lo que haces hoy es lo que tu cuerpo recuerda mañana.",
  "No necesitas un día perfecto: necesitas empezar.",
  "La constancia le gana a la motivación.",
  "Una serie más bien hecha vale más que tres apuradas.",
  "Tu progreso es tuyo: compárate con quien fuiste la semana pasada.",
  "Dormir bien también es entrenar.",
  "Los días de descanso son parte del plan, no una pausa.",
  "La técnica primero; el peso llega solo.",
  "Cada repetición registrada es una prueba de tu avance.",
  "Hidrátate: tu rendimiento te lo va a agradecer.",
  "Empieza con lo que tengas hoy; mañana empiezas desde ahí.",
  "Pequeños pasos repetidos construyen grandes cambios.",
];
export function dailyMessage(i: { now: Date; state: Today["kind"]; streak: number }): string {
  if (i.state === "in_progress") return "Tienes un entrenamiento empezado. Retómalo cuando puedas: lo que registraste está guardado.";
  if (i.state === "done_today") return "Hoy ya cumpliste. Descansar y comer bien también es parte del entrenamiento.";
  if (i.streak >= 2) return `Llevas ${i.streak} semanas seguidas entrenando. Eso es constancia.`;
  const day = Math.floor(new Date(`${localDate(i.now.toISOString())}T00:00:00Z`).getTime() / DAY);
  return LINES[day % LINES.length];
}

// ─── no plan yet ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Step { id: "assessment" | "measure" | "message"; title: string; detail: string; href: string; done: boolean }
export function onboardingSteps(i: { hasAssessment: boolean; hasMeasurement: boolean; hasMessage: boolean }): Step[] {
  return [
    { id: "assessment", title: "Completa tu evaluación inicial", detail: "Así tu entrenador prepara un plan hecho para ti.", href: "/client/assessment", done: i.hasAssessment },
    { id: "measure", title: "Registra tus medidas de partida", detail: "Será tu punto de comparación para ver tu avance.", href: "/client/measurements", done: i.hasMeasurement },
    { id: "message", title: "Salúdalo y cuéntale tus objetivos", detail: "Un mensaje corto ayuda a empezar con buen pie.", href: "/client/messages", done: i.hasMessage },
  ];
}
