export interface Measure { measured_on: string; method: string; taken_by: string; [k: string]: unknown }
const FIELDS = ["weight_kg", "waist_cm", "hip_cm", "neck_cm", "arm_cm", "thigh_cm", "calf_cm"] as const;

export function compareMeasurements(prev: Measure, curr: Measure) {
  const deltas: Record<string, number> = {};
  for (const f of FIELDS) {
    const a = prev[f], b = curr[f];
    if (typeof a === "number" && typeof b === "number") deltas[f] = Math.round((b - a) * 10) / 10;
  }
  const warnings: string[] = [];
  if (prev.method !== curr.method) warnings.push("Las mediciones usan métodos distintos; la comparación puede no ser fiable");
  if (prev.taken_by !== curr.taken_by) warnings.push("Las mediciones fueron tomadas por personas/dispositivos distintos");
  if (deltas.weight_kg !== undefined) warnings.push("Los cambios de peso no equivalen a cambios confirmados de grasa corporal");
  return { deltas, warnings };
}
