import { checkFreeText } from "./sanitize";
import type { PlanDraft } from "./schemas";

export interface Candidate { code: string; id: string; name: string; primary_muscle: string; equipment: string; difficulty: "beginner" | "intermediate" | "advanced"; exercise_type: string; joint_stress: string[]; movement_pattern: string }
export interface PlanConstraints { frequency: number; minutes: number; level: "beginner" | "intermediate" | "advanced"; avoidJoints: string[]; equipment: string[]; excludedNames: string[] }
export interface Violation { rule: string; detail: string; severity: "dropped" | "warning" | "rejected" }
export interface ValidExercise { exercise_id: string; name: string; sets: number; reps_min: number; reps_max: number; rest_sec: number; rir: number | null; client_notes: string | null }
export interface ValidSession { name: string; weekday: number | null; warmup_notes: string | null; exercises: ValidExercise[]; estimatedMinutes: number }
export interface ValidatedPlan { title: string; rationale: string; sessions: ValidSession[]; assumptions: string[]; questions: string[]; weeklySetsByMuscle: Record<string, number> }

const RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const MAX_SETS = { beginner: 4, intermediate: 6, advanced: 8 } as const;
export const SECONDS_PER_SET_WORK = 40;
export const WEEKLY_SETS_WARNING = 20;

/**
 * The model PROPOSES; this function DECIDES. Every exercise must be one of the pre-filtered candidates and must satisfy the
 * trainer's constraints on its own merits. Anything that does not is dropped and reported — never repaired silently.
 */
export function validatePlanDraft(draft: PlanDraft, candidates: Candidate[], c: PlanConstraints): { plan: ValidatedPlan | null; violations: Violation[] } {
  const v: Violation[] = []; const byCode = new Map(candidates.map((x) => [x.code, x]));
  const excluded = c.excludedNames.map(norm).filter((x) => x.length >= 3);
  const text = (s: string | null, max: number, where: string) => { if (!s) return ""; const bad = checkFreeText(s, max); if (bad.length) { v.push({ rule: "texto", detail: `${where}: ${bad.join("; ")}`, severity: "dropped" }); return ""; } return s.trim(); };
  const sessions: ValidSession[] = []; const weekly: Record<string, number> = {};

  draft.sessions.forEach((s, si) => {
    if (sessions.length >= c.frequency) { v.push({ rule: "frecuencia", detail: `Sesión "${s.name}" descartada: se pidieron ${c.frequency} días por semana`, severity: "dropped" }); return; }
    const ex: ValidExercise[] = []; const seen = new Set<string>();
    for (const e of s.exercises) {
      const cand = byCode.get(e.code);
      if (!cand) { v.push({ rule: "biblioteca", detail: `Código de ejercicio inexistente "${e.code}" (sesión ${si + 1})`, severity: "dropped" }); continue; }
      if (seen.has(cand.id)) { v.push({ rule: "duplicado", detail: `${cand.name} repetido en la misma sesión`, severity: "dropped" }); continue; }
      if (RANK[cand.difficulty] > RANK[c.level]) { v.push({ rule: "nivel", detail: `${cand.name} es de nivel ${cand.difficulty} y el alumno es ${c.level}`, severity: "dropped" }); continue; }
      if (!c.equipment.includes(cand.equipment)) { v.push({ rule: "equipamiento", detail: `${cand.name} requiere ${cand.equipment}, no disponible`, severity: "dropped" }); continue; }
      const joint = cand.joint_stress.find((j) => c.avoidJoints.includes(j));
      if (joint) { v.push({ rule: "restricción", detail: `${cand.name} carga ${joint}, que debe evitarse`, severity: "dropped" }); continue; }
      if (excluded.some((n) => norm(cand.name).includes(n) || n.includes(norm(cand.name)))) { v.push({ rule: "excluido", detail: `${cand.name} está en la lista de ejercicios a evitar`, severity: "dropped" }); continue; }
      const bad = !Number.isInteger(e.sets) || e.sets < 1 || e.sets > MAX_SETS[c.level] || e.reps_min < 1 || e.reps_max < e.reps_min || e.reps_max > 30 || e.rest_sec < 0 || e.rest_sec > 300 || (e.rir !== null && (e.rir < 0 || e.rir > 5));
      if (bad) { v.push({ rule: "prescripción", detail: `Prescripción fuera de rango para ${cand.name} (series ${e.sets}, reps ${e.reps_min}-${e.reps_max}, descanso ${e.rest_sec}s, RIR ${e.rir})`, severity: "dropped" }); continue; }
      seen.add(cand.id);
      ex.push({ exercise_id: cand.id, name: cand.name, sets: e.sets, reps_min: e.reps_min, reps_max: e.reps_max, rest_sec: e.rest_sec, rir: e.rir, client_notes: text(e.client_notes, 300, `nota de ${cand.name}`) || null });
    }
    // time budget: trim from the end until the session fits (+10 %)
    const minutes = (list: ValidExercise[]) => Math.round(list.reduce((a, x) => a + x.sets * (SECONDS_PER_SET_WORK + x.rest_sec), 0) / 60);
    while (ex.length > 1 && minutes(ex) > c.minutes * 1.1) { const out = ex.pop()!; v.push({ rule: "tiempo", detail: `${out.name} quitado de "${s.name}": la sesión superaba ${c.minutes} min`, severity: "dropped" }); }
    if (ex.length === 0) { v.push({ rule: "sesión vacía", detail: `"${s.name}" no tiene ejercicios válidos y se descartó`, severity: "dropped" }); return; }
    if (minutes(ex) > c.minutes * 1.1) v.push({ rule: "tiempo", detail: `"${s.name}" dura ~${minutes(ex)} min (> ${c.minutes})`, severity: "warning" });
    const name = text(s.name, 60, `nombre de sesión ${si + 1}`) || `Sesión ${sessions.length + 1}`;
    const weekday = s.weekday !== null && Number.isInteger(s.weekday) && s.weekday >= 1 && s.weekday <= 7 ? s.weekday : null;
    for (const e of ex) { const m = candidates.find((x) => x.id === e.exercise_id)!.primary_muscle; weekly[m] = (weekly[m] ?? 0) + e.sets; }
    sessions.push({ name, weekday, warmup_notes: text(s.warmup_notes, 300, `calentamiento de ${name}`) || null, exercises: ex, estimatedMinutes: minutes(ex) });
  });
  for (const [m, n] of Object.entries(weekly)) if (n > WEEKLY_SETS_WARNING) v.push({ rule: "volumen", detail: `${n} series semanales para ${m}: revisa si es adecuado`, severity: "warning" });
  if (sessions.length < Math.min(c.frequency, 1)) { v.push({ rule: "plan vacío", detail: "No quedó ninguna sesión válida", severity: "rejected" }); return { plan: null, violations: v }; }
  if (sessions.length < c.frequency) v.push({ rule: "frecuencia", detail: `Solo ${sessions.length} de ${c.frequency} sesiones son válidas`, severity: "warning" });
  const title = text(draft.title, 80, "título") || "Borrador de plan (IA)";
  const clean = (arr: string[], max: number, where: string) => arr.slice(0, 8).map((x) => text(x, max, where)).filter(Boolean);
  return { plan: { title, rationale: text(draft.rationale, 800, "justificación"), sessions, assumptions: clean(draft.assumptions, 300, "supuesto"), questions: clean(draft.questions_for_trainer, 300, "pregunta"), weeklySetsByMuscle: weekly }, violations: v };
}
