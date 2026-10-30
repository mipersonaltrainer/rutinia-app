export interface Ex { id: string; name_es: string; primary_muscle: string; movement_pattern: string; equipment: string; difficulty: "beginner" | "intermediate" | "advanced"; joint_stress: string[]; exercise_type: string }
export interface SubConstraints { equipment: string[]; avoidJoints: string[]; maxDifficulty: "beginner" | "intermediate" | "advanced"; excludeIds?: string[] }
export interface Suggestion { exercise: Ex; reasons: string[]; score: number }
const RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const EQ: Record<string, string> = { bodyweight: "peso corporal", dumbbell: "mancuernas", barbell: "barra", cable: "polea", machine: "máquina", kettlebell: "kettlebell", band: "banda", suspension: "suspensión", medicine_ball: "balón medicinal", plate: "disco", cardio_machine: "máquina de cardio", other: "otro" };

/** Deterministic library search: same muscle and movement pattern, only what the client can actually do. No model, no invention. */
export function suggestSubstitutes(target: Ex, pool: Ex[], related: { id: string; kind: string }[], c: SubConstraints, limit = 6): Suggestion[] {
  const rel = new Map(related.map((r) => [r.id, r.kind])); const out: Suggestion[] = [];
  for (const e of pool) {
    if (e.id === target.id || c.excludeIds?.includes(e.id)) continue;
    if (e.primary_muscle !== target.primary_muscle || e.movement_pattern !== target.movement_pattern) continue;
    if (!c.equipment.includes(e.equipment) || RANK[e.difficulty] > RANK[c.maxDifficulty]) continue;
    if (e.joint_stress.some((j) => c.avoidJoints.includes(j))) continue;
    const reasons = [`Mismo músculo principal y patrón de movimiento que ${target.name_es}`, `Usa ${EQ[e.equipment] ?? e.equipment}, disponible para el alumno`];
    let score = 1;
    const k = rel.get(e.id);
    if (k === "alternative") { score += 3; reasons.push("Figura como alternativa en la biblioteca"); }
    else if (k === "variant") { score += 2.5; reasons.push("Figura como variante en la biblioteca"); }
    else if (k === "regression") { score += 2; reasons.push("Es una regresión (más fácil)"); }
    else if (k === "progression") { score += 1.5; reasons.push("Es una progresión (más difícil)"); }
    if (e.equipment === target.equipment) { score += 0.5; reasons.push("Mismo equipamiento"); }
    if (e.difficulty === target.difficulty) score += 0.5;
    if (target.joint_stress.some((j) => !e.joint_stress.includes(j))) { score += 0.25; reasons.push("Carga menos articulaciones que el original"); }
    out.push({ exercise: e, reasons, score });
  }
  return out.sort((a, b) => b.score - a.score || a.exercise.name_es.localeCompare(b.exercise.name_es)).slice(0, limit);
}
