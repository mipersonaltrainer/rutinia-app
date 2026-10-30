// Deterministic, explainable progression engine. It only PROPOSES: nothing here touches a plan.
// Every proposal carries: what changes, why, the data behind it, the uncertainty and what the trainer must check.
import { createHash } from "node:crypto";

export const ENGINE_VERSION = "2026.1";

export type ProposalType = "maintain" | "increase_reps" | "increase_load" | "reduce_load" | "reduce_volume" | "substitute_exercise" | "review_technique" | "deload" | "request_reassessment";
export type Severity = "info" | "caution" | "professional";
export type ProgressionRule = "none" | "double_progression" | "linear_load" | "rpe_based";

export interface SetObs { reps: number | null; load_kg: number | null; rpe: number | null }
export interface SessionObs { date: string; sets: SetObs[]; plannedSets: number; sessionRpe: number | null; pain: number | null; recovery: number | null; discomfort: number | null }
export interface ExerciseInput {
  prescribedId: string; exerciseId: string; name: string; equipment: string; durationBased: boolean;
  sets: number; repsMin: number | null; repsMax: number | null; loadKg: number | null; rpeTarget: number | null; rule: ProgressionRule;
  alternatives: { id: string; name: string }[];
  sessions: SessionObs[]; // completed sessions that included this exercise, newest first
}
export interface ClientContext {
  level: "beginner" | "intermediate" | "advanced";
  adherence: { scheduled: number; completed: number } | null;       // last two weeks
  recentSessions: { date: string; sessionRpe: number | null; pain: number | null; recovery: number | null; maxDiscomfort: number | null }[]; // newest first
  increments?: Record<string, number>;
}
export interface Change { field: string; label: string; from: number | string | null; to: number | string | null }
export interface DataPoint { label: string; value: string }
export interface Proposal {
  type: ProposalType; scope: "exercise" | "client"; prescribedId: string | null; exerciseName: string | null;
  severity: Severity; confidence: "low" | "medium" | "high"; title: string;
  changes: Change[]; rationale: string[]; data: DataPoint[]; uncertainty: string[]; checks: string[];
  engineVersion: string; fingerprint: string; substituteExerciseId?: string;
}

export const DEFAULT_INCREMENTS: Record<string, number> = { barbell: 2.5, dumbbell: 2, kettlebell: 4, machine: 2.5, cable: 2.5, plate: 2.5 };
const UNLOADED = new Set(["bodyweight", "band", "suspension", "medicine_ball", "other", "cardio_machine"]);
export const DISCOMFORT_STOP = 6, DISCOMFORT_CAUTION = 4, PAIN_STOP = 6, MIN_SESSIONS = 2, LOW_ADHERENCE_PCT = 50;

const round05 = (n: number) => Math.round(n * 2) / 2;
const work = (s: SessionObs) => s.sets.filter((x) => (x.reps ?? 0) > 0);
const volume = (s: SessionObs) => work(s).reduce((a, x) => a + (x.reps ?? 0) * (x.load_kg ?? 0), 0);
const topLoad = (s: SessionObs) => Math.max(0, ...work(s).map((x) => x.load_kg ?? 0));
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const nz = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;

function sessionTop(ex: ExerciseInput) { return ex.repsMax ?? ex.repsMin; }
/** A session counts as a success when every planned set was done at/above the top of the rep range with acceptable effort. */
function isSuccess(ex: ExerciseInput, s: SessionObs) {
  const top = sessionTop(ex); const w = work(s);
  if (!top || w.length < ex.sets) return { ok: false, effortKnown: false };
  if (!w.every((x) => (x.reps ?? 0) >= top)) return { ok: false, effortKnown: false };
  const rpes = w.map((x) => x.rpe).filter(nz);
  const limit = ex.rpeTarget ?? 8.5;
  const effortOk = rpes.every((r) => r <= limit);
  return { ok: effortOk, effortKnown: rpes.length > 0 };
}
const isFailure = (ex: ExerciseInput, s: SessionObs) => { const lo = ex.repsMin ?? ex.repsMax; if (!lo) return false; const w = work(s); return w.length < ex.sets || w.filter((x) => (x.reps ?? 0) < lo).length >= Math.ceil(ex.sets / 2); };
const sameLoad = (ss: SessionObs[]) => ss.length > 0 && ss.every((s) => Math.abs(topLoad(s) - topLoad(ss[0])) < 0.01);

function finish(p: Omit<Proposal, "engineVersion" | "fingerprint">): Proposal {
  const core = { v: ENGINE_VERSION, t: p.type, sc: p.scope, id: p.prescribedId, ch: p.changes, d: p.data, sub: (p as Proposal).substituteExerciseId ?? null };
  return { ...p, engineVersion: ENGINE_VERSION, fingerprint: createHash("sha256").update(JSON.stringify(core)).digest("hex").slice(0, 32) };
}

function dataFor(ex: ExerciseInput, n = 3): DataPoint[] {
  return ex.sessions.slice(0, n).map((s) => { const w = work(s); return { label: s.date, value: `${w.length}/${s.plannedSets} series · ${w.map((x) => `${x.reps}×${x.load_kg ?? 0}`).join(", ")} kg${s.discomfort ? ` · molestia ${s.discomfort}/10` : ""}${s.sessionRpe ? ` · esfuerzo sesión ${s.sessionRpe}` : ""}` }; });
}
const baseUncertainty = (n: number) => [`Se basa en ${n} sesión(es) registrada(s); no refleja sueño, nutrición ni estrés fuera del entrenamiento.`, "El esfuerzo (RPE) lo reporta el alumno y puede ser impreciso."];

/** Evaluate one prescribed exercise. Returns null when there is nothing worth proposing (including insufficient data). */
export function evaluateExercise(ex: ExerciseInput, ctx: ClientContext): Proposal | null {
  const s = ex.sessions; const n = s.length;
  if (n === 0 || ex.durationBased) return null;
  const increments = { ...DEFAULT_INCREMENTS, ...ctx.increments };
  const latest = s[0];
  const disc0 = latest.discomfort ?? 0, disc1 = s[1]?.discomfort ?? 0;
  const common = { scope: "exercise" as const, prescribedId: ex.prescribedId, exerciseName: ex.name };

  // 1) SAFETY FIRST — never suggest more load when discomfort is significant.
  if (disc0 >= DISCOMFORT_STOP) {
    const recurring = disc1 >= DISCOMFORT_CAUTION;
    const alt = recurring ? ex.alternatives[0] : undefined;
    if (alt) return finish({ ...common, type: "substitute_exercise", severity: "professional", confidence: "medium", title: `Sustituir ${ex.name} por ${alt.name}`, substituteExerciseId: alt.id,
      changes: [{ field: "exercise_id", label: "Ejercicio", from: ex.name, to: alt.name }],
      rationale: [`El alumno reportó molestia de ${disc0}/10 en ${ex.name}, y ya había reportado ${disc1}/10 en la sesión anterior.`, "Una molestia repetida o intensa no debe tratarse subiendo carga."],
      data: dataFor(ex), uncertainty: ["No sabemos la causa de la molestia; la alternativa es una sugerencia de la biblioteca, no un diagnóstico.", ...baseUncertainty(n)],
      checks: ["Pregunta al alumno dónde, cuándo y cómo se presenta la molestia.", "Valora si requiere evaluación de un profesional de la salud.", "Confirma que la alternativa no carga la misma zona."] });
    return finish({ ...common, type: "review_technique", severity: "professional", confidence: "medium", title: `Revisar la técnica de ${ex.name} y la molestia reportada`,
      changes: [{ field: "notes", label: "Acción", from: null, to: "Observar la ejecución y mantener la carga sin aumentar hasta aclarar la molestia" }],
      rationale: [`El alumno reportó molestia de ${disc0}/10 durante ${ex.name}.`, "Hasta aclarar el origen no se recomienda aumentar carga ni volumen."],
      data: dataFor(ex), uncertainty: ["La causa puede ser técnica, de carga, de fatiga o ajena al ejercicio.", ...baseUncertainty(n)],
      checks: ["Revisa la técnica en persona o por video.", "Considera reducir temporalmente la carga o el rango.", "Si la molestia persiste, deriva a un profesional de la salud."] });
  }

  const blocks: string[] = [];
  const recentMax = Math.max(0, ...s.slice(0, 3).map((x) => x.discomfort ?? 0));
  if (recentMax >= DISCOMFORT_STOP) blocks.push(`molestia significativa (${recentMax}/10) en alguna de las últimas 3 sesiones`);   // do not push load right after a painful episode
  else if (disc0 >= DISCOMFORT_CAUTION) blocks.push(`molestia ${disc0}/10 en la última sesión`);
  if (ctx.adherence && ctx.adherence.scheduled > 0 && (ctx.adherence.completed / ctx.adherence.scheduled) * 100 < LOW_ADHERENCE_PCT)
    blocks.push(`adherencia baja (${ctx.adherence.completed} de ${ctx.adherence.scheduled} sesiones en 2 semanas)`);
  const lastRecovery = ctx.recentSessions.slice(0, 2).map((r) => r.recovery).filter(nz);
  if (lastRecovery.length === 2 && lastRecovery.every((r) => r <= 2)) blocks.push("recuperación baja reportada en las dos últimas sesiones");

  if (n < MIN_SESSIONS) return null;

  // 2) Unexpected performance drop (two consecutive declines >= 10% in volume)
  if (n >= 3 && sameSets(s[0], s[1], s[2])) {
    const v0 = volume(s[0]), v1 = volume(s[1]), v2 = volume(s[2]);
    if (v1 > 0 && v2 > 0 && v0 <= v1 * 0.9 && v1 <= v2 * 0.9)
      return finish({ ...common, type: "reduce_volume", severity: "caution", confidence: "medium", title: `Reducir temporalmente el volumen de ${ex.name}`,
        changes: [{ field: "sets", label: "Series", from: ex.sets, to: Math.max(1, ex.sets - 1) }],
        rationale: ["El rendimiento bajó dos sesiones seguidas (≥10% de volumen cada vez), algo inusual si el plan es el mismo.", "Una reducción corta permite distinguir fatiga acumulada de un problema técnico."],
        data: [{ label: "Volumen (kg)", value: `${fmt(v2)} → ${fmt(v1)} → ${fmt(v0)}` }, ...dataFor(ex)],
        uncertainty: ["La caída puede deberse a sueño, estrés, enfermedad o a sesiones incompletas, no solo al plan.", ...baseUncertainty(n)],
        checks: ["Pregunta por sueño, estrés y molestias recientes.", "Revisa si las series se completaron o se recortaron por tiempo.", "Vuelve a evaluar tras 1–2 semanas."] });
  }

  // 3) Repeated failure to reach the lower end of the range at the same load
  if (n >= 2 && isFailure(ex, s[0]) && isFailure(ex, s[1]) && sameLoad(s.slice(0, 2)) && topLoad(s[0]) > 0.5 && !UNLOADED.has(ex.equipment)) {
    const cur = topLoad(s[0]); const inc = increments[ex.equipment] ?? 0;
    const step = Math.ceil(Math.max(inc, cur * 0.05, 0.5) / 0.5) * 0.5;   // at least one rounding step, so the load really goes down
    const to = round05(Math.max(0, cur - step));
    return finish({ ...common, type: "reduce_load", severity: "caution", confidence: "medium", title: `Bajar la carga de ${ex.name}`,
      changes: [{ field: "load_kg", label: "Carga (kg)", from: cur, to }],
      rationale: [`En las dos últimas sesiones no se alcanzó el mínimo de ${ex.repsMin ?? ex.repsMax} repeticiones en la mitad o más de las series con ${fmt(cur)} kg.`, "Bajar un escalón permite recuperar la calidad técnica y volver a progresar."],
      data: dataFor(ex), uncertainty: ["Puede ser un mal día o fatiga puntual, no necesariamente una carga excesiva.", ...baseUncertainty(n)],
      checks: ["Confirma que la técnica y el rango de movimiento fueron correctos.", "Pregunta por descanso y sueño de esos días."] });
  }

  // 4) Progress paths
  const need = ex.rule === "linear_load" && ctx.level === "beginner" ? 1 : 2;
  const window = s.slice(0, need);
  const wins = window.map((x) => isSuccess(ex, x));
  const allSuccess = window.length === need && wins.every((w) => w.ok);
  const increment = increments[ex.equipment] ?? 0;
  const unloaded = UNLOADED.has(ex.equipment) || (!topLoad(latest) && !ex.loadKg);

  if (allSuccess && sameLoad(window) && blocks.length === 0) {
    const knownEffort = wins.every((w) => w.effortKnown);
    if (!unloaded && increment > 0) {
      const cur = topLoad(latest) || (ex.loadKg ?? 0); const to = round05(cur + increment);
      return finish({ ...common, type: "increase_load", severity: "info", confidence: knownEffort ? "high" : "medium", title: `Subir la carga de ${ex.name} a ${fmt(to)} kg`,
        changes: [{ field: "load_kg", label: "Carga (kg)", from: cur, to }],
        rationale: [`Se completaron todas las series en el máximo del rango (${sessionTop(ex)} reps) con ${fmt(cur)} kg en ${need} sesión(es) seguida(s).`, ex.rule === "rpe_based" ? "El esfuerzo reportado estuvo por debajo del objetivo." : "El esfuerzo reportado fue aceptable.", `Es el menor salto razonable para ${ex.equipment}: +${fmt(increment)} kg.`],
        data: dataFor(ex), uncertainty: [knownEffort ? "" : "No se registró RPE en todas las series; la confianza es menor.", `El salto real depende de los discos/mancuernas disponibles (${fmt(increment)} kg es una referencia).`, "Tras subir carga es normal bajar repeticiones durante 1–2 sesiones.", ...baseUncertainty(n)].filter(Boolean),
        checks: ["Confirma el incremento mínimo que tiene el alumno en su equipo.", "Verifica que la técnica se mantuvo en las últimas series.", "Comprueba que no haya molestias nuevas."] });
    }
    const top = ex.repsMax ?? ex.repsMin ?? 0; const lo = ex.repsMin ?? top;
    return finish({ ...common, type: "increase_reps", severity: "info", confidence: knownEffort ? "medium" : "low", title: `Ampliar el rango de repeticiones de ${ex.name}`,
      changes: [{ field: "reps_min", label: "Reps mín", from: lo, to: top }, { field: "reps_max", label: "Reps máx", from: top, to: top + 2 }],
      rationale: [`Se alcanzó el máximo del rango (${top}) en todas las series durante ${need} sesión(es) y el ejercicio no admite un salto de carga pequeño (${ex.equipment}).`, "Subir repeticiones es la progresión más segura cuando no se puede subir carga."],
      data: dataFor(ex), uncertainty: ["Si el alumno puede, una variante más difícil sería otra opción de progresión.", ...baseUncertainty(n)],
      checks: ["Valora si conviene una variante más exigente en lugar de más repeticiones."] });
  }

  // 5) Plateau: >=4 sessions, same load, no rep improvement, acceptable effort, no blocks
  if (n >= 4 && blocks.length === 0 && sameLoad(s.slice(0, 4))) {
    const reps = s.slice(0, 4).map((x) => avg(work(x).map((y) => y.reps ?? 0))).reverse();
    if (reps[3] <= reps[0] && ex.alternatives.length > 0) {
      const alt = ex.alternatives[0];
      return finish({ ...common, type: "substitute_exercise", severity: "info", confidence: "low", title: `Probar ${alt.name} en lugar de ${ex.name}`, substituteExerciseId: alt.id,
        changes: [{ field: "exercise_id", label: "Ejercicio", from: ex.name, to: alt.name }],
        rationale: ["Cuatro sesiones con la misma carga sin aumentar repeticiones sugieren un estancamiento con este estímulo.", "Cambiar de variante puede reactivar el progreso."],
        data: [{ label: "Reps promedio (4 sesiones)", value: reps.map((r) => fmt(Math.round(r * 10) / 10)).join(" → ") }, ...dataFor(ex)],
        uncertainty: ["Un estancamiento puede deberse a fatiga, sueño o nutrición, no solo al ejercicio.", "La alternativa es una sugerencia de la biblioteca; verifica que encaje con las restricciones del alumno.", ...baseUncertainty(n)],
        checks: ["Descarta fatiga o falta de recuperación antes de cambiar el ejercicio.", "Revisa restricciones y equipamiento disponible para la alternativa."] });
    }
  }

  // 6) Something worth saying but no increase: blocked progression
  if (blocks.length > 0 && allSuccess && sameLoad(window))
    return finish({ ...common, type: "maintain", severity: "caution", confidence: "medium", title: `Mantener la carga de ${ex.name}`,
      changes: [{ field: "load_kg", label: "Carga (kg)", from: topLoad(latest), to: topLoad(latest) }],
      rationale: ["El alumno cumplió el objetivo y normalmente se subiría la carga, pero hay factores que aconsejan esperar:", ...blocks.map((b) => `• ${b}`)],
      data: dataFor(ex), uncertainty: baseUncertainty(n), checks: ["Resuelve primero el factor señalado y vuelve a evaluar en 1–2 semanas."] });
  return null;
}

function sameSets(...ss: SessionObs[]) { return ss.every((x) => x.plannedSets === ss[0].plannedSets && work(x).length >= x.plannedSets); }

/** Client-level safety and fatigue evaluation (reassessment, deload). */
export function evaluateClient(ctx: ClientContext, planned: { sets: number }[]): Proposal[] {
  const out: Proposal[] = []; const r = ctx.recentSessions; if (r.length === 0) return out;
  const l = r[0];
  const base = { scope: "client" as const, prescribedId: null, exerciseName: null };
  if ((l.pain ?? 0) >= PAIN_STOP || (l.maxDiscomfort ?? 0) >= DISCOMFORT_STOP) {
    out.push(finish({ ...base, type: "request_reassessment", severity: "professional", confidence: "high", title: "Solicitar una evaluación adicional",
      changes: [{ field: "action", label: "Acción", from: null, to: "Reevaluar al alumno antes de aumentar la exigencia" }],
      rationale: [`En la última sesión (${l.date}) el alumno reportó ${(l.pain ?? 0) >= PAIN_STOP ? `dolor general de ${l.pain}/10` : `una molestia de ${l.maxDiscomfort}/10`}.`, "No se recomienda aumentar intensidad mientras no se aclare el origen."],
      data: r.slice(0, 3).map((x) => ({ label: x.date, value: `dolor ${x.pain ?? "—"}/10 · molestia máx. ${x.maxDiscomfort ?? "—"}/10 · esfuerzo ${x.sessionRpe ?? "—"}` })),
      uncertainty: ["El sistema no diagnostica: solo señala que hay un reporte que merece revisión humana."], checks: ["Contacta al alumno.", "Valora derivar a un profesional de la salud si el dolor persiste.", "Documenta tu decisión."] }));
  }
  const last3 = r.slice(0, 3);
  const signals: string[] = [];
  if (last3.length === 3) {
    const rpes = last3.map((x) => x.sessionRpe).filter(nz);
    if (rpes.length === 3 && avg(rpes) >= 8.5) signals.push(`esfuerzo medio de sesión ${fmt(Math.round(avg(rpes) * 10) / 10)}/10 en las últimas 3 sesiones`);
    const lowRec = last3.filter((x) => (x.recovery ?? 5) <= 2).length;
    if (lowRec >= 2) signals.push(`recuperación baja en ${lowRec} de las últimas 3 sesiones`);
    const pains = last3.map((x) => x.pain).filter(nz);
    if (pains.length === 3 && pains[0] - pains[2] >= 2) signals.push(`el dolor reportado subió de ${pains[2]} a ${pains[0]}`);
  }
  if (signals.length >= 2 && planned.length > 0)
    out.push(finish({ ...base, type: "deload", severity: "caution", confidence: "medium", title: "Introducir una semana de descarga",
      changes: [{ field: "sets_reduction_pct", label: "Reducción de series (%, mínimo 1 serie)", from: 0, to: 40 }, { field: "load_reduction_pct", label: "Reducción de carga (%)", from: 0, to: 10 }],
      rationale: ["Varias señales de fatiga coinciden:", ...signals.map((s) => `• ${s}`), "Una semana de descarga reduce el volumen y la carga para recuperar antes de seguir progresando."],
      data: last3.map((x) => ({ label: x.date, value: `esfuerzo ${x.sessionRpe ?? "—"} · recuperación ${x.recovery ?? "—"}/5 · dolor ${x.pain ?? "—"}/10` })),
      uncertainty: ["Los datos son autorreportados y solo cubren 3 sesiones.", "Se aplica a todo el plan: puedes modificar los porcentajes antes de aceptar."], checks: ["Confirma con el alumno cómo se siente.", "Decide cuándo retomar la progresión normal (normalmente tras 1 semana)."] }));
  return out;
}

export function evaluatePlan(exercises: ExerciseInput[], ctx: ClientContext): Proposal[] {
  const list: Proposal[] = [];
  for (const e of exercises) { const p = evaluateExercise(e, ctx); if (p) list.push(p); }
  const client = evaluateClient(ctx, exercises);
  const hasDeload = client.some((c) => c.type === "deload");
  // A plan-wide deload supersedes per-exercise increases; safety items always stay.
  const filtered = hasDeload ? list.filter((p) => !["increase_load", "increase_reps", "maintain"].includes(p.type)) : list;
  return [...client, ...filtered].sort((a, b) => ({ professional: 0, caution: 1, info: 2 })[a.severity] - ({ professional: 0, caution: 1, info: 2 })[b.severity]);
}
