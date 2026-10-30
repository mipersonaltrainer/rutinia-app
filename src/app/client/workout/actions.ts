"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type State = { error?: string; ok?: string } | undefined;
const friendly = (m: string) =>
  /finish or abandon/.test(m) ? "Ya tienes un entrenamiento en curso. Termínalo o abandónalo primero." :
  /not part of your current plan/.test(m) ? "Esa sesión ya no forma parte de tu plan vigente." :
  /immutable/.test(m) ? "Este entrenamiento ya está finalizado y no se puede modificar." : "No se pudo completar la acción.";

export async function startWorkout(sessionId: string, _: State, fd: FormData): Promise<State> {
  const r = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(5).nullable()).safeParse(fd.get("recovery"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_workout", { p_session: sessionId, p_recovery: r.success ? r.data : null });
  if (error) return { error: friendly(error.message) };
  redirect(`/client/workout/${data}`);
}

const num = (min: number, max: number) => z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(min).max(max).nullable());
const setSchema = z.object({
  logId: z.uuid(), prescribedId: z.uuid(), exerciseId: z.uuid(), kind: z.enum(["warmup", "work"]), setNumber: z.number().int().min(1).max(30),
  reps: num(0, 200), load_kg: num(0, 1000), duration_sec: num(1, 7200), rpe: num(1, 10),
}).superRefine((d, ctx) => { if (d.reps === null && d.duration_sec === null) ctx.addIssue({ code: "custom", message: "Indica repeticiones o duración", path: ["reps"] }); });

export async function saveSet(input: unknown): Promise<State> {
  const p = setSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase.from("logged_sets").upsert({
    log_id: d.logId, prescribed_exercise_id: d.prescribedId, exercise_id: d.exerciseId, kind: d.kind, set_number: d.setNumber,
    reps: d.reps, load_kg: d.load_kg, duration_sec: d.duration_sec, rpe: d.rpe,
  }, { onConflict: "log_id,prescribed_exercise_id,kind,set_number" });
  if (error) return { error: friendly(error.message) };
  return { ok: "Guardada" };
}

export async function deleteSet(logId: string, prescribedId: string, kind: "warmup" | "work", setNumber: number): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.from("logged_sets").delete().eq("log_id", logId).eq("prescribed_exercise_id", prescribedId).eq("kind", kind).eq("set_number", setNumber);
  return error ? { error: friendly(error.message) } : { ok: "Quitada" };
}

export async function saveDiscomfort(logId: string, exerciseId: string, _: State, fd: FormData): Promise<State> {
  const p = z.object({ severity: z.coerce.number().int().min(0).max(10), area: z.enum(["shoulder", "elbow", "wrist", "knee", "hip", "ankle", "lower_back", "neck", "other"]).optional(), note: z.string().max(300).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Revisa la intensidad (0 a 10)" };
  const supabase = await createClient();
  if (p.data.severity === 0) { await supabase.from("exercise_discomforts").delete().eq("log_id", logId).eq("exercise_id", exerciseId); return { ok: "Sin molestia registrada" }; }
  const { error } = await supabase.from("exercise_discomforts").upsert({ log_id: logId, exercise_id: exerciseId, severity: p.data.severity, area: p.data.area ?? "other", note: p.data.note || null }, { onConflict: "log_id,exercise_id" });
  return error ? { error: friendly(error.message) } : { ok: "Molestia registrada" };
}

export async function finishWorkout(logId: string, _: State, fd: FormData): Promise<State> {
  const p = z.object({ rpe: z.coerce.number().int().min(1, "Indica el esfuerzo de la sesión (1 a 10)").max(10), pain: z.coerce.number().int().min(0).max(10), pain_notes: z.string().max(500).optional(), notes: z.string().max(1000).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("finish_workout", { p_log: logId, p_rpe: p.data.rpe, p_pain: p.data.pain, p_pain_notes: p.data.pain_notes ?? "", p_notes: p.data.notes ?? "" });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/client/progress");
  redirect(`/client/workout/${logId}`);
}

export async function abandonWorkout(logId: string) {
  const supabase = await createClient();
  await supabase.rpc("abandon_workout", { p_log: logId });
  redirect("/client/plan");
}
