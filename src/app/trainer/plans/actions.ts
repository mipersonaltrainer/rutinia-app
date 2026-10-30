"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prescriptionSchema } from "@/lib/plans/prescription";

type State = { error?: string; ok?: string } | undefined;
const friendly = (m: string) =>
  /immutable/.test(m) ? "Esta versión ya está publicada y no se puede modificar. Crea una nueva versión." :
  /professional evaluation/.test(m) ? "El cribado del alumno exige valoración profesional. Para publicar debes documentar el motivo (mín. 15 caracteres)." :
  /no exercises/.test(m) ? "Añade al menos un ejercicio antes de publicar." :
  /publish the template/.test(m) ? "Publica la plantilla antes de asignarla." :
  /draft already exists/.test(m) ? "Ya existe un borrador." : "No se pudo completar la acción (¿suscripción activa y alumno activo?).";

const planSchema = z.object({ title: z.string().min(2, "Título requerido").max(120), goal: z.string().max(200).optional(), level: z.enum(["beginner", "intermediate", "advanced"]), clientId: z.string().optional() });

export async function createPlan(_: State, fd: FormData): Promise<State> {
  const p = planSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_plan", { p_title: p.data.title, p_goal: p.data.goal || null, p_level: p.data.level, p_client: p.data.clientId || null });
  if (error) return { error: friendly(error.message) };
  redirect(`/trainer/plans/${data}`);
}

export async function assignTemplate(_: State, fd: FormData): Promise<State> {
  const p = z.object({ template: z.uuid("Elige una plantilla"), client: z.uuid("Elige un alumno") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_template", { p_template: p.data.template, p_client: p.data.client });
  if (error) return { error: friendly(error.message) };
  redirect(`/trainer/plans/${data}`);
}

export async function newDraft(planId: string, _: State, fd: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("new_draft_version", { p_plan: planId, p_note: String(fd.get("note") ?? "").slice(0, 300) || null });
  if (error) return { error: friendly(error.message) };
  redirect(`/trainer/plans/${planId}`);
}

export async function publish(versionId: string, planId: string, _: State, fd: FormData): Promise<State> {
  const supabase = await createClient();
  const note = String(fd.get("note") ?? "").trim();
  const override = String(fd.get("override") ?? "").trim() || null;
  if (note) await supabase.from("plan_versions").update({ change_note: note.slice(0, 300) }).eq("id", versionId);
  const { error } = await supabase.rpc("publish_version", { p_version: versionId, p_override: override });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/trainer/plans/${planId}`);
  redirect(`/trainer/plans/${planId}`);
}

const touch = (planId: string) => revalidatePath(`/trainer/plans/${planId}`);

export async function addSession(versionId: string, planId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("plan_sessions").select("position").eq("version_id", versionId).order("position", { ascending: false }).limit(1);
  const n = (data?.[0]?.position ?? 0) + 1;
  await supabase.from("plan_sessions").insert({ version_id: versionId, position: n, name: `Sesión ${n}` });
  touch(planId);
}
export async function updateSession(id: string, planId: string, _: State, fd: FormData): Promise<State> {
  const p = z.object({ name: z.string().min(1).max(80), weekday: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(1).max(7).nullable()), warmup_notes: z.string().max(500).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Nombre de sesión inválido" };
  const supabase = await createClient();
  const { error } = await supabase.from("plan_sessions").update({ name: p.data.name, weekday: p.data.weekday, warmup_notes: p.data.warmup_notes || null }).eq("id", id);
  if (error) return { error: friendly(error.message) };
  touch(planId); return { ok: "Guardado" };
}
export async function deleteSession(id: string, planId: string) { const s = await createClient(); await s.from("plan_sessions").delete().eq("id", id); touch(planId); }
export async function duplicateSession(id: string, planId: string) { const s = await createClient(); await s.rpc("duplicate_session", { p_id: id }); touch(planId); }
export async function moveSession(id: string, dir: number, planId: string) { const s = await createClient(); await s.rpc("move_session", { p_id: id, p_dir: dir }); touch(planId); }

export async function addExercise(sessionId: string, exerciseId: string, planId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("prescribed_exercises").select("position").eq("session_id", sessionId).order("position", { ascending: false }).limit(1);
  await supabase.from("prescribed_exercises").insert({ session_id: sessionId, exercise_id: exerciseId, position: (data?.[0]?.position ?? 0) + 1, sets: 3, reps_min: 10, reps_max: 12, rest_sec: 90 });
  touch(planId);
}
export async function deleteExercise(id: string, planId: string) { const s = await createClient(); await s.from("prescribed_exercises").delete().eq("id", id); touch(planId); }
export async function moveExercise(id: string, dir: number, planId: string) { const s = await createClient(); await s.rpc("move_exercise", { p_id: id, p_dir: dir }); touch(planId); }

export async function updatePrescription(id: string, planId: string, _: State, fd: FormData): Promise<State> {
  const p = prescriptionSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { private_note, ...row } = p.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("prescribed_exercises").update(row).eq("id", id);
  if (error) return { error: friendly(error.message) };
  if (private_note.trim()) await supabase.from("prescribed_private_notes").upsert({ prescribed_id: id, trainer_id: user!.id, note: private_note.trim() });
  else await supabase.from("prescribed_private_notes").delete().eq("prescribed_id", id);
  touch(planId); return { ok: "Guardado" };
}
