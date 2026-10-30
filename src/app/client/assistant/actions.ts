"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAiConfig } from "@/lib/ai/provider";
import { screenClientMessage } from "@/lib/ai/safety";
import { FAQ, type Source } from "@/lib/ai/faq";
import { retrieve } from "@/lib/ai/retrieval";
import { buildClientPrompt } from "@/lib/ai/prompts";
import { ClientAnswerSchema, type ClientAnswer } from "@/lib/ai/schemas";
import { checkFreeText, ungroundedNumbers } from "@/lib/ai/sanitize";
import { runLlm } from "@/lib/ai/run";
import { describePrescription } from "@/lib/plans/prescription";
import type { Violation } from "@/lib/ai/validate-plan";

export interface AssistantReply { mode: "ia" | "sin_ia" | "seguridad"; answer: string; sources: { id: string; title: string }[]; notes: string[]; remainingDay: number | null }
export type AssistantResult = { ok: true; reply: AssistantReply } | { ok: false; message: string };

const q = z.string().trim().min(3, "Escribe tu pregunta").max(500, "Máximo 500 caracteres");

async function gatherSources(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<{ sources: Source[]; progress: Record<string, number | null> }> {
  const sources: Source[] = [];
  const { data: plans } = await supabase.from("training_plans").select("id,title,current_version_id").eq("client_id", userId).not("current_version_id", "is", null);
  let n = 0;
  for (const p of plans ?? []) {
    const { data: ss } = await supabase.from("plan_sessions").select("name,weekday,warmup_notes, prescribed_exercises(position,sets,reps_min,reps_max,duration_sec,load_kg,rest_sec,rpe,rir,tempo,client_notes, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es,instructions,safety_notes))").eq("version_id", p.current_version_id).order("position");
    for (const s of ss ?? []) {
      const pes = ([...(s.prescribed_exercises as unknown as { position: number; sets: number; reps_min: number | null; reps_max: number | null; duration_sec: number | null; load_kg: number | null; rest_sec: number | null; rpe: number | null; rir: number | null; tempo: string | null; client_notes: string | null; exercise: { name_es: string; instructions: string[]; safety_notes: string[] } }[])]).sort((a, b) => a.position - b.position);
      sources.push({ id: `plan:${p.id.slice(0, 6)}:${++n}`, kind: "plan", title: `${p.title} · ${s.name}`, text: `${s.name}: ${pes.map((e) => `${e.exercise.name_es} ${describePrescription(e)}${e.load_kg ? ` con ${e.load_kg} kg` : ""}${e.rest_sec ? `, descanso ${e.rest_sec} s` : ""}${e.rpe ? `, RPE ${e.rpe}` : e.rir !== null ? `, RIR ${e.rir}` : ""}${e.client_notes ? ` (nota del entrenador: ${e.client_notes})` : ""}`).join("; ")}.` });
      for (const e of pes) sources.push({ id: `ej:${e.exercise.name_es.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, kind: "exercise", title: e.exercise.name_es, text: `Cómo se hace ${e.exercise.name_es}: ${e.exercise.instructions.join(" ")} Seguridad: ${e.exercise.safety_notes.join(" ")}` });
    }
  }
  const since = new Date(Date.now() - 28 * 86400000).toISOString();
  const { data: logs } = await supabase.from("workout_logs").select("session_rpe,status").eq("client_id", userId).eq("status", "completed").gte("started_at", since);
  const rpes = (logs ?? []).map((l) => l.session_rpe).filter((x): x is number => x !== null);
  const progress = { sesiones_completadas_ultimos_28_dias: (logs ?? []).length, esfuerzo_medio_de_sesion: rpes.length ? Math.round((rpes.reduce((a, x) => a + x, 0) / rpes.length) * 10) / 10 : null };
  sources.push({ id: "prog:resumen", kind: "progress", title: "Tu progreso reciente", text: `En los últimos 28 días completaste ${progress.sesiones_completadas_ultimos_28_dias} entrenamiento(s)${progress.esfuerzo_medio_de_sesion !== null ? ` con un esfuerzo medio de sesión de ${progress.esfuerzo_medio_de_sesion}/10` : ""}.` });
  const uniq = new Map(sources.map((s) => [s.id, s]));
  return { sources: [...uniq.values(), ...FAQ.map(({ keywords, ...s }) => { void keywords; return s; })], progress };
}

export async function askAssistantAction(_: unknown, fd: FormData): Promise<AssistantResult> {
  const parsed = q.safeParse(String(fd.get("question") ?? "")); if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const question = parsed.data;
  const screen = screenClientMessage(question);
  if (screen.kind !== "ok") return { ok: true, reply: { mode: "seguridad", answer: screen.message, sources: [], notes: ["Este mensaje no se envió a ningún modelo."], remainingDay: null } };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { ok: false, message: "Sesión expirada" };
  const { sources, progress } = await gatherSources(supabase, user.id);
  const kw = new Map(FAQ.map((f) => [f.id, f.keywords])); const withKw = sources.map((s) => ({ ...s, keywords: kw.get(s.id) }));
  const hits = retrieve(question, withKw, 4);

  const cfg = getAiConfig(); const notes: string[] = [];
  const fallback = (why: string): AssistantResult => {
    if (why) notes.push(why);
    if (!hits.length) return { ok: true, reply: { mode: "sin_ia", answer: "No encontré información sobre eso en tu plan ni en la ayuda de la plataforma. Pregúntale directamente a tu entrenador.", sources: [], notes, remainingDay: null } };
    return { ok: true, reply: { mode: "sin_ia", answer: `Esto es lo que encontré en tu plan y en la ayuda de la plataforma:\n\n${hits.map((h) => `• ${h.title}: ${h.text}`).join("\n\n")}`, sources: hits.map((h) => ({ id: h.id, title: h.title })), notes, remainingDay: null } };
  };
  if (!hits.length) return fallback(cfg.enabled ? "" : "");
  if (!cfg.enabled) return fallback("Modo sin IA: el asistente de IA no está configurado; te muestro las fuentes tal cual.");
  if (!cfg.allowSensitive) return fallback("Modo sin IA: el envío de datos a proveedores externos no está habilitado.");

  const built = buildClientPrompt(question, hits, progress);
  const allowedIds = new Set(hits.map((h) => h.id));
  const r = await runLlm<ClientAnswer, ClientAnswer>({
    supabase, kind: "client_qa", clientId: user.id, sensitive: true, system: built.system, user: built.user, flags: built.flags, digest: built.digest, schema: ClientAnswerSchema, effort: "low", maxTokens: 900,
    post: (a) => {
      const v: Violation[] = []; const add = (d: string) => v.push({ rule: "respuesta", detail: d, severity: "rejected" });
      checkFreeText(a.answer, 1100).forEach(add);
      const bad = a.sources.filter((s) => !allowedIds.has(s)); if (bad.length) add(`Cita fuentes inexistentes: ${bad.join(", ")}`);
      if (!a.needs_trainer && a.sources.length === 0) add("No cita ninguna fuente");
      ungroundedNumbers(a.answer, built.numbers).forEach((n) => add(`Cifra sin respaldo: ${n}`));
      return { data: a, violations: v, reject: v.length ? v.map((x) => x.detail).join(" · ") : undefined };
    },
  });
  if (!r.ok) {
    if (r.code === "no_consent") return fallback("Modo sin IA: activa el asistente de IA en Privacidad para recibir respuestas redactadas.");
    if (["rate_limit_minute", "rate_limit_day", "budget_month"].includes(r.code)) return fallback(`Modo sin IA: ${r.message}`);
    return fallback(`Modo sin IA: ${r.message}`);
  }
  const a = r.data;
  return { ok: true, reply: { mode: "ia", answer: a.needs_trainer ? `${a.answer}\n\nTe recomiendo confirmarlo con tu entrenador.` : a.answer, sources: a.sources.map((id) => ({ id, title: hits.find((h) => h.id === id)?.title ?? id })), notes: ["Respuesta redactada por IA a partir de tu plan y de la ayuda de la plataforma. No es consejo médico."], remainingDay: r.remainingDay } };
}
