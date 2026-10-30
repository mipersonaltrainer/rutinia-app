import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { toCm, toKg } from "@/lib/units";
import { ageFromBirthDate } from "@/lib/units";
import { computeIndicators } from "@/lib/calculations/indicators";
import type { AssessmentData } from "@/lib/assessment/schema";
import { createAdminClient } from "@/lib/supabase/admin";

const num = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().positive().optional());
export const measurementForm = z.object({
  measured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  weightUnit: z.enum(["kg", "lb"]), lengthUnit: z.enum(["cm", "in"]),
  weight: num, height: num, waist: num, hip: num, neck: num, arm: num, thigh: num, calf: num,
  method: z.enum(["tape", "scale", "bioimpedance", "other"]),
  notes: z.string().max(500).optional(),
});

export async function recordMeasurement(supabase: SupabaseClient, p: { clientId: string; enteredBy: string; takenBy: "self" | "trainer" | "device"; form: FormData }) {
  const parsed = measurementForm.safeParse(Object.fromEntries(p.form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const f = parsed.data;
  if (new Date(f.measured_on) > new Date(Date.now() + 86400000)) return { error: "La fecha no puede ser futura" };
  const w = f.weight !== undefined ? toKg(f.weight, f.weightUnit) : null;
  const L = (v?: number) => (v !== undefined ? toCm(v, f.lengthUnit) : null);
  const row = { weight_kg: w, height_cm: L(f.height), waist_cm: L(f.waist), hip_cm: L(f.hip), neck_cm: L(f.neck), arm_cm: L(f.arm), thigh_cm: L(f.thigh), calf_cm: L(f.calf) };
  if (Object.values(row).every((v) => v === null)) return { error: "Ingresa al menos una medida" };

  const { data: m, error } = await supabase.from("anthropometric_measurements").insert({
    client_id: p.clientId, entered_by: p.enteredBy, taken_by: p.takenBy, measured_on: f.measured_on, method: f.method, notes: f.notes || null, ...row,
  }).select().single();
  if (error || !m) return { error: error?.message.includes("check") ? "Un valor está fuera del rango permitido" : "No se pudo guardar la medición" };

  // Context for formulas comes from the client's latest submitted assessment (declared data).
  const { data: a } = await supabase.from("assessments").select("data").eq("client_id", p.clientId).eq("status", "submitted").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const personal = (a?.data as AssessmentData | undefined)?.personal;
  let age: number | null = null;
  try { age = personal ? ageFromBirthDate(personal.birthDate) : null; } catch { age = null; }
  let height = row.height_cm;
  if (height === null) {
    const { data: h } = await supabase.from("anthropometric_measurements").select("height_cm").eq("client_id", p.clientId).not("height_cm", "is", null).order("measured_on", { ascending: false }).limit(1).maybeSingle();
    height = h?.height_cm ?? null;   // most recent recorded height, noted in `inputs`
  }
  const { results } = computeIndicators({ ...row, height_cm: height }, { ageYears: age, sex: personal?.sexForFormulas ?? "unspecified", activityLevel: personal?.activityLevel ?? null, adult: age !== null && age >= 18 });
  if (results.length) {
    await createAdminClient().from("calculation_results").insert(     // indicators are the platform's own output: not writable by users (SEC-003)
      results.map((r) => ({
      client_id: p.clientId, measurement_id: m.id, indicator: r.indicator, value: r.value, unit: r.unit, formula: r.formula, formula_version: r.formulaVersion, provenance: r.provenance, inputs: r.inputs,
    })));
  }
  return { ok: `Medición guardada (${results.length} indicadores calculados)` };
}
