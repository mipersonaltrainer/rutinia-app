import { z } from "zod";

const opt = (s: z.ZodType<number>) => z.preprocess((v) => (v === "" || v == null ? null : v), s.nullable());
const int = (min: number, max: number) => opt(z.coerce.number().int().min(min).max(max));

export const prescriptionSchema = z.object({
  sets: z.coerce.number().int().min(1, "Series: 1 a 20").max(20, "Series: 1 a 20"),
  warmup_sets: z.coerce.number().int().min(0).max(10).default(0),
  reps_min: int(1, 100), reps_max: int(1, 100), duration_sec: int(5, 7200),
  load_kg: opt(z.coerce.number().min(0).max(1000)),
  rpe: opt(z.coerce.number().min(1, "RPE: 1 a 10").max(10, "RPE: 1 a 10")), rir: int(0, 10), rest_sec: int(0, 1200),
  tempo: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^[0-9X]{4}$/, "Tempo: 4 caracteres (p. ej. 3010 o 20X0)").nullable()),
  superset_group: z.preprocess((v) => (v === "" ? null : v), z.string().max(3).nullable()),
  progression: z.enum(["none", "double_progression", "linear_load", "rpe_based"]).default("none"),
  alternative_exercise_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
  client_notes: z.preprocess((v) => (v === "" ? null : v), z.string().max(500).nullable()),
  private_note: z.string().max(1000).default(""),
}).superRefine((d, ctx) => {
  if (d.reps_min === null && d.duration_sec === null) ctx.addIssue({ code: "custom", message: "Indica repeticiones o duración", path: ["reps_min"] });
  if (d.reps_min !== null && d.reps_max !== null && d.reps_max < d.reps_min) ctx.addIssue({ code: "custom", message: "Las repeticiones máximas deben ser ≥ a las mínimas", path: ["reps_max"] });
  if (d.rpe !== null && d.rir !== null) ctx.addIssue({ code: "custom", message: "Usa RPE o RIR, no ambos", path: ["rpe"] });
});
export type Prescription = z.infer<typeof prescriptionSchema>;

export function describePrescription(p: { sets: number; reps_min: number | null; reps_max: number | null; duration_sec: number | null }) {
  const work = p.duration_sec && !p.reps_min ? `${p.duration_sec} s` : p.reps_max && p.reps_max !== p.reps_min ? `${p.reps_min}-${p.reps_max}` : `${p.reps_min}`;
  return `${p.sets} × ${work}`;
}
