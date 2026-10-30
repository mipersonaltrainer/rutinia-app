import type { SupabaseClient } from "@supabase/supabase-js";
import { assessmentSchema } from "@/lib/assessment/schema";
import { ageFromBirthDate } from "@/lib/units";
import type { EnergyInput, Goal } from "./energy";

/**
 * Builds the energy-calculator input from what the platform already knows: the latest submitted assessment (age, sex, activity,
 * goals, safety flags) and the most recent value of each measurement. Every read goes through the caller's session, so row-level
 * security decides what is visible (a trainer without the client's consent simply gets nothing).
 */
export async function loadEnergyInput(supabase: SupabaseClient, clientId: string): Promise<{ input: EnergyInput; hasAssessment: boolean; measuredOn: string | null }> {
  const [{ data: a }, { data: rows }, { data: plans }] = await Promise.all([
    supabase.from("assessments").select("data").eq("client_id", clientId).eq("status", "submitted").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("anthropometric_measurements").select("measured_on,weight_kg,height_cm,neck_cm,waist_cm,hip_cm").eq("client_id", clientId).order("measured_on", { ascending: false }).order("created_at", { ascending: false }).limit(12),
    supabase.from("training_plans").select("current_version_id").eq("client_id", clientId).not("current_version_id", "is", null),
  ]);
  const parsed = assessmentSchema.safeParse(a?.data);
  const d = parsed.success ? parsed.data : null;
  const latest = <K extends "weight_kg" | "height_cm" | "neck_cm" | "waist_cm" | "hip_cm">(k: K): number | null => { const r = (rows ?? []).find((x) => x[k] !== null); return r ? Number(r[k]) : null; };
  const versionIds = (plans ?? []).map((p) => p.current_version_id as string);
  let sessions: number | null = null;
  if (versionIds.length) { const { count } = await supabase.from("plan_sessions").select("id", { count: "exact", head: true }).in("version_id", versionIds); sessions = count ?? null; }
  let age: number | null = null; try { age = d ? ageFromBirthDate(d.personal.birthDate) : null; } catch { age = null; }
  return {
    hasAssessment: !!d, measuredOn: rows?.[0]?.measured_on ?? null,
    input: {
      weightKg: latest("weight_kg"), heightCm: latest("height_cm"), ageYears: age, sex: d?.personal.sexForFormulas ?? "unspecified",
      activityLevel: d?.personal.activityLevel ?? null, goals: (d?.goals.goals ?? []) as Goal[],
      neckCm: latest("neck_cm"), waistCm: latest("waist_cm"), hipCm: latest("hip_cm"), plannedSessionsPerWeek: sessions,
      pregnancyOrPostpartum: d ? d.health.pregnancyStatus !== "not_applicable" : false, eatingDisorderHistory: d?.health.eatingDisorderHistory ?? false,
    },
  };
}
