import type { AssessmentData } from "@/lib/assessment/schema";
import { ageFromBirthDate } from "@/lib/units";

export interface AnalysisInput { data: AssessmentData; hasMeasurement: boolean; hasHeightWeight: boolean; today?: Date }
export interface Analysis { summary: string[]; missing: string[]; inconsistencies: string[]; questions: string[] }
const GOAL: Record<string, string> = { hypertrophy: "hipertrofia", strength: "fuerza", fat_loss: "pérdida de grasa", endurance: "resistencia", recomposition: "recomposición", mobility: "movilidad", general_health: "salud general", sport: "preparación deportiva", return_to_training: "retorno progresivo" };
const LOC: Record<string, string> = { gym: "gimnasio", home: "casa", outdoor: "exterior", mixed: "modalidad mixta" };

/** Deterministic: no model involved, no data leaves the platform. Only states what is recorded; gaps are reported as gaps. */
export function analyzeAssessment({ data: d, hasMeasurement, hasHeightWeight, today }: AnalysisInput): Analysis {
  const summary: string[] = [], missing: string[] = [], bad: string[] = [], q: string[] = [];
  let age: number | null = null; try { age = ageFromBirthDate(d.personal.birthDate, today); } catch { missing.push("Fecha de nacimiento válida"); }
  summary.push(`${age !== null ? `${age} años` : "Edad no disponible"}; trabajo ${{ sedentary: "sedentario", mixed: "mixto", active: "físicamente activo" }[d.personal.workType]}, ${d.personal.sittingHours} h sentado/día.`);
  summary.push(`Objetivos: ${d.goals.goals.map((g) => GOAL[g] ?? g).join(", ")}${d.goals.timeframe ? ` (plazo: ${d.goals.timeframe})` : ""}.`);
  summary.push(`Entrenamiento actual: ${d.training.weeklyFrequency} día(s)/sem de ~${d.training.sessionMinutes} min en ${LOC[d.training.location]}; ${d.training.experienceYears} año(s) de experiencia.`);
  summary.push(`Sueño ${d.habits.sleepHours} h (calidad ${d.personal.sleepQuality}/5), estrés ${d.personal.stress}/5, recuperación ${d.habits.recovery}/5.`);
  summary.push(`Dolor actual ${d.health.currentPain}/10${d.health.injuries ? `; lesiones declaradas: ${d.health.injuries.slice(0, 160)}` : "; sin lesiones declaradas"}.`);

  if (!d.goals.timeframe.trim()) missing.push("Plazo deseado para los objetivos");
  if (!d.goals.motivation.trim()) missing.push("Motivación");
  if (["home", "mixed"].includes(d.training.location) && !d.training.equipment.trim()) missing.push("Equipamiento disponible (entrena en casa/mixto)");
  if (!d.training.avoidExercises.trim()) missing.push("Ejercicios que prefiere evitar (confirma si no hay ninguno)");
  if (!d.habits.barriers.trim()) missing.push("Barreras de adherencia");
  if (!hasMeasurement) missing.push("Ninguna medición corporal registrada");
  else if (!hasHeightWeight) missing.push("Peso y/o estatura en las mediciones");
  if (d.personal.sexForFormulas === "unspecified") missing.push("Categoría para fórmulas metabólicas: no se puede estimar el metabolismo basal");
  if (d.health.conditions.trim() && !d.health.medicalClearance) missing.push("Autorización médica para las condiciones declaradas");
  if (d.health.injuries.trim() && d.health.currentPain === 0) missing.push("Estado actual de las lesiones (no reporta dolor)");

  if (d.habits.sleepHours < 5 && d.personal.sleepQuality >= 4) bad.push(`Duerme ${d.habits.sleepHours} h pero califica su sueño ${d.personal.sleepQuality}/5.`);
  if (d.habits.sleepHours >= 9 && d.personal.sleepQuality <= 1) bad.push(`Duerme ${d.habits.sleepHours} h pero califica su sueño ${d.personal.sleepQuality}/5.`);
  if (d.personal.stress >= 5 && d.habits.recovery >= 5) bad.push("Reporta estrés máximo y recuperación máxima a la vez.");
  if (d.health.currentPain >= 4 && !d.health.injuries.trim()) bad.push(`Dolor actual ${d.health.currentPain}/10 sin lesión descrita.`);
  if (d.personal.workType === "sedentary" && d.personal.activityLevel === "veryHigh") bad.push("Trabajo sedentario con actividad diaria 'muy alta'.");
  if (d.personal.workType === "active" && d.personal.sittingHours >= 9) bad.push(`Trabajo físicamente activo pero ${d.personal.sittingHours} h sentado al día.`);
  if (age !== null && d.training.experienceYears > Math.max(0, age - 10)) bad.push(`${d.training.experienceYears} años de experiencia con ${age} años de edad.`);
  if (d.training.weeklyFrequency * d.training.sessionMinutes > 900) bad.push(`${d.training.weeklyFrequency} días × ${d.training.sessionMinutes} min suman más de 15 h semanales de entrenamiento.`);
  if (d.training.experienceYears >= 3 && d.training.weeklyFrequency === 0 && !d.goals.goals.includes("return_to_training")) bad.push("Mucha experiencia pero no entrena actualmente, sin marcar 'retorno progresivo'.");
  if (d.goals.goals.includes("fat_loss") && (d.goals.goals.includes("hypertrophy") || d.goals.goals.includes("strength"))) bad.push("Objetivos parcialmente competidores (pérdida de grasa con fuerza/hipertrofia): conviene definir prioridad.");
  if (d.health.eatingDisorderHistory && d.goals.goals.includes("fat_loss")) bad.push("Antecedente de trastorno alimentario con objetivo de pérdida de grasa: no usar objetivos calóricos sin profesional.");

  for (const m of missing.slice(0, 4)) q.push(`¿Puedes completar: ${m.toLowerCase()}?`);
  for (const b of bad.slice(0, 4)) q.push(`Aclarar con el alumno: ${b.replace(/\.$/, "")}.`);
  if (d.health.currentPain > 0) q.push("¿Dónde y cuándo aparece el dolor? ¿Empeora con algún movimiento?");
  q.push("¿Qué resultado concreto le haría sentir que el plan funcionó en 8 semanas?");
  return { summary, missing, inconsistencies: bad, questions: [...new Set(q)] };
}
