"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAiConfig } from "@/lib/ai/provider";
import { analyzeAssessment, type Analysis } from "@/lib/ai/assessment-analysis";
import { loadCandidates, loadLatestAssessment } from "@/lib/ai/loaders";
import { buildPlanPrompt, buildReportPrompt } from "@/lib/ai/prompts";
import { PlanDraftSchema, ReportTextSchema, type ReportText } from "@/lib/ai/schemas";
import { validatePlanDraft, type ValidatedPlan, type Violation, type PlanConstraints } from "@/lib/ai/validate-plan";
import { checkFreeText, ungroundedNumbers } from "@/lib/ai/sanitize";
import { runLlm } from "@/lib/ai/run";
import { suggestSubstitutes, type Ex, type Suggestion } from "@/lib/ai/substitutes";
import { loadReportInput } from "@/lib/reports/load";
import { buildReportData } from "@/lib/reports/data";

const EQUIPMENT = ["bodyweight", "dumbbell", "barbell", "cable", "machine", "kettlebell", "band", "suspension", "medicine_ball", "plate", "other"] as const;
const JOINTS = ["shoulder", "elbow", "wrist", "knee", "hip", "ankle", "lower_back", "neck"] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;

export type AiStatus = { available: boolean; sensitiveAllowed: boolean; model: string };
export async function aiStatus(): Promise<AiStatus> { const c = getAiConfig(); return { available: c.enabled, sensitiveAllowed: c.allowSensitive, model: c.model }; }

export type Res<T> = { ok: true; data: T; notes?: string[] } | { ok: false; message: string };

export async function analyzeAssessmentAction(clientId: string): Promise<Res<Analysis>> {
  const supabase = await createClient();
  const a = await loadLatestAssessment(supabase, clientId);
  if (!a) return { ok: false, message: "El alumno no tiene una evaluación enviada visible (o retiró el consentimiento)." };
  const { data: m } = await supabase.from("anthropometric_measurements").select("weight_kg,height_cm").eq("client_id", clientId);
  return { ok: true, data: analyzeAssessment({ data: a.data, hasMeasurement: (m ?? []).length > 0, hasHeightWeight: (m ?? []).some((x) => x.weight_kg) && (m ?? []).some((x) => x.height_cm) }) };
}

const subSchema = z.object({ prescribedId: z.uuid("Elige un ejercicio"), maxDifficulty: z.enum(LEVELS) });
export async function substitutesAction(clientId: string, _: unknown, fd: FormData): Promise<Res<Suggestion[]>> {
  const p = subSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const equipment = fd.getAll("equipment").map(String).filter((e): e is (typeof EQUIPMENT)[number] => (EQUIPMENT as readonly string[]).includes(e));
  const avoid = fd.getAll("avoid").map(String).filter((e): e is (typeof JOINTS)[number] => (JOINTS as readonly string[]).includes(e));
  if (!equipment.length) return { ok: false, message: "Marca al menos un equipamiento disponible." };
  const supabase = await createClient();
  const { data: pe } = await supabase.from("prescribed_exercises").select("exercise_id").eq("id", p.data.prescribedId).maybeSingle();   // RLS: only exercises of plans the trainer owns
  if (!pe) return { ok: false, message: "Ejercicio no encontrado." };
  const { data: target } = await supabase.from("exercises").select("id,name_es,primary_muscle,movement_pattern,equipment,difficulty,joint_stress,exercise_type").eq("id", pe.exercise_id).single();
  if (!target) return { ok: false, message: "Ejercicio no encontrado." };
  const [{ data: pool }, { data: rel }] = await Promise.all([
    supabase.from("exercises").select("id,name_es,primary_muscle,movement_pattern,equipment,difficulty,joint_stress,exercise_type").eq("primary_muscle", target.primary_muscle).eq("movement_pattern", target.movement_pattern).limit(300),
    supabase.from("exercise_relations").select("related_id,kind").eq("exercise_id", target.id),
  ]);
  void clientId;
  return { ok: true, data: suggestSubstitutes(target as Ex, (pool ?? []) as Ex[], (rel ?? []).map((r) => ({ id: r.related_id, kind: r.kind })), { equipment, avoidJoints: avoid, maxDifficulty: p.data.maxDifficulty }) };
}

const planSchema = z.object({ frequency: z.coerce.number().int().min(1).max(7), minutes: z.coerce.number().int().min(20).max(180), level: z.enum(LEVELS), excluded: z.string().max(300).optional() });
export interface PlanDraftResult { interactionId: string; plan: ValidatedPlan; violations: Violation[]; flags: string[]; remainingDay: number | null; model: string }
export async function planDraftAction(clientId: string, _: unknown, fd: FormData): Promise<Res<PlanDraftResult>> {
  const p = planSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const equipment = fd.getAll("equipment").map(String).filter((e) => (EQUIPMENT as readonly string[]).includes(e)); const avoidJoints = fd.getAll("avoid").map(String).filter((e) => (JOINTS as readonly string[]).includes(e));
  if (!equipment.length) return { ok: false, message: "Marca al menos un equipamiento disponible." };
  const supabase = await createClient();
  const a = await loadLatestAssessment(supabase, clientId);
  if (!a) return { ok: false, message: "Se necesita una evaluación enviada y visible del alumno." };
  // Deterministic safety gate BEFORE any model: no automatic standard plan when the screening asks for professional evaluation.
  if (a.risk === "professional_evaluation") return { ok: false, message: "El cribado de este alumno requiere valoración profesional: no se genera un plan estándar automáticamente." };
  const constraints: PlanConstraints = { frequency: p.data.frequency, minutes: p.data.minutes, level: p.data.level, avoidJoints, equipment, excludedNames: (p.data.excluded ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12) };
  const candidates = await loadCandidates(supabase, constraints);
  if (candidates.length < 6) return { ok: false, message: "Hay muy pocos ejercicios que cumplan las restricciones; relájalas o amplía el equipamiento." };
  const built = buildPlanPrompt(a.data, a.risk, constraints, candidates);
  const r = await runLlm<z.infer<typeof PlanDraftSchema>, { plan: ValidatedPlan; constraints: PlanConstraints }>({
    supabase, kind: "plan_draft", clientId, sensitive: true, system: built.system, user: built.user, flags: built.flags, digest: built.digest, schema: PlanDraftSchema, effort: "medium",
    post: (d) => { const v = validatePlanDraft(d, candidates, constraints); return { data: v.plan ? { plan: v.plan, constraints } : null, violations: v.violations, reject: v.plan ? undefined : "no quedó ninguna sesión válida" }; },
  });
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, data: { interactionId: r.interactionId, plan: r.data.plan, violations: r.violations, flags: r.flags, remainingDay: r.remainingDay, model: r.model } };
}

/** Creating the draft re-reads the validated output from the audit table (never from the browser) and re-checks that every exercise is still visible. */
export async function applyPlanDraftAction(clientId: string, interactionId: string) {
  const supabase = await createClient();
  const { data: it } = await supabase.from("ai_interactions").select("output,status,kind,client_id").eq("id", interactionId).maybeSingle();
  if (!it || it.kind !== "plan_draft" || it.status !== "ok" || it.client_id !== clientId || !it.output) return;
  const plan = (it.output as { plan: ValidatedPlan; constraints: PlanConstraints }).plan;
  const ids = [...new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exercise_id)))];
  const { data: visible } = await supabase.from("exercises").select("id").in("id", ids);
  if ((visible ?? []).length !== ids.length) return;
  const { data: pid, error } = await supabase.rpc("create_plan", { p_title: `${plan.title} (borrador IA)`.slice(0, 120), p_goal: "Borrador generado con IA: requiere revisión del entrenador", p_level: (it.output as { constraints: PlanConstraints }).constraints.level, p_client: clientId });
  if (error || !pid) return;
  const { data: v } = await supabase.from("plan_versions").select("id").eq("plan_id", pid).eq("status", "draft").single();
  if (!v) return;
  await supabase.from("plan_versions").update({ change_note: "Borrador generado con IA — revísalo antes de publicar" }).eq("id", v.id);
  for (const [si, s] of plan.sessions.entries()) {
    const { data: row } = await supabase.from("plan_sessions").insert({ version_id: v.id, position: si + 1, name: s.name.slice(0, 80), weekday: s.weekday, warmup_notes: s.warmup_notes }).select("id").single();
    if (!row) continue;
    await supabase.from("prescribed_exercises").insert(s.exercises.map((e, i) => ({ session_id: row.id, position: i + 1, exercise_id: e.exercise_id, sets: e.sets, reps_min: e.reps_min, reps_max: e.reps_max, rest_sec: e.rest_sec, rir: e.rir, client_notes: e.client_notes })));
  }
  redirect(`/trainer/plans/${pid}`);
}

const periodSchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).refine((d) => d.from <= d.to, "Periodo inválido");
export async function reportTextAction(clientId: string, _: unknown, fd: FormData): Promise<Res<ReportText & { interactionId: string; flags: string[] }>> {
  const p = periodSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const supabase = await createClient();
  const input = await loadReportInput(supabase, { clientId, from: p.data.from, to: p.data.to, trainerName: null, observations: null, nextGoals: null });
  if (!input) return { ok: false, message: "No se pudo leer el alumno." };
  const data = buildReportData(input);
  if (!data.sessions.completed && !data.measurements.count) return { ok: false, message: "No hay datos en ese periodo para redactar un informe." };
  const built = buildReportPrompt(data);
  const r = await runLlm<ReportText, ReportText>({
    supabase, kind: "report_text", clientId, sensitive: true, system: built.system, user: built.user, flags: built.flags, digest: built.digest, schema: ReportTextSchema, effort: "low", maxTokens: 1500,
    post: (t) => {
      const v: Violation[] = []; const bad = [...checkFreeText(t.observations, 1400), ...checkFreeText(t.next_goals, 800), ...t.caveats.flatMap((c) => checkFreeText(c, 300))];
      const ug = ungroundedNumbers(`${t.observations} ${t.next_goals}`, built.numbers);
      if (ug.length) v.push({ rule: "cifras", detail: `Cifras que no están en los datos: ${ug.join(", ")}`, severity: "rejected" });
      for (const b of bad) v.push({ rule: "texto", detail: b, severity: "rejected" });
      return { data: t, violations: v, reject: v.length ? v.map((x) => x.detail).join(" · ") : undefined };
    },
  });
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, data: { ...r.data, interactionId: r.interactionId, flags: r.flags } };
}
