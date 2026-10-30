import type { AssessmentData } from "./schema";
import { ageFromBirthDate } from "@/lib/units";

export type RiskLevel = "none" | "review" | "professional_evaluation";
export interface RiskResult { level: RiskLevel; reasons: string[] }

/**
 * Deterministic screening. Not a diagnosis: it only decides whether a standard plan
 * should wait for a professional evaluation. Reasons are neutral and shown to the trainer.
 */
export function screenRisk(d: AssessmentData, today: Date = new Date()): RiskResult {
  const stop: string[] = [];
  const review: string[] = [];
  const h = d.health;
  if (h.chestPainDuringExercise) stop.push("Dolor en el pecho durante la actividad física");
  if (h.dizzinessOrFainting) stop.push("Mareo o desmayo durante la actividad física");
  if (h.unusualBreathlessness) stop.push("Falta de aire inusual durante la actividad física");
  if (h.cardiovascularHistory && !h.medicalClearance) stop.push("Antecedente cardiovascular sin autorización médica");
  if (h.medicalRestriction && !h.medicalClearance) stop.push("Restricción médica declarada sin autorización vigente");
  if (h.pregnancyStatus !== "not_applicable" && !h.medicalClearance) stop.push("Embarazo o posparto sin autorización médica");
  if (h.currentPain >= 7) stop.push("Dolor actual intenso (7 o más sobre 10)");
  try { if (ageFromBirthDate(d.personal.birthDate, today) < 18) stop.push("Persona menor de edad: requiere supervisión profesional específica"); }
  catch { stop.push("Fecha de nacimiento inválida"); }

  if (h.currentPain >= 4 && h.currentPain < 7) review.push("Dolor actual moderado");
  if (h.injuries.trim()) review.push("Lesiones declaradas");
  if (h.conditions.trim()) review.push("Condiciones de salud declaradas");
  if (h.medications.trim()) review.push("Medicación declarada");
  if (h.eatingDisorderHistory) review.push("Antecedente de trastorno alimentario: no usar objetivos calóricos sin profesional");
  if (h.cardiovascularHistory && h.medicalClearance) review.push("Antecedente cardiovascular con autorización: revisar condiciones");

  if (stop.length) return { level: "professional_evaluation", reasons: [...stop, ...review] };
  if (review.length) return { level: "review", reasons: review };
  return { level: "none", reasons: [] };
}
